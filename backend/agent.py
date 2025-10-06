import logging
import asyncio
import os
import re

from dotenv import load_dotenv
from google.cloud.sql.connector import Connector, IPTypes

from livekit import agents
from livekit.agents import (
    AgentSession,
    Agent,
    RoomInputOptions,
    AutoSubscribe,
    ChatContext,
)
from livekit.agents.llm import ChatMessage, ChatRole
from livekit.agents import ConversationItemAddedEvent
from livekit.plugins import (
    noise_cancellation,
    google,
    silero,
)
from prompt import SYSTEM_PROMPT
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# --- THE CRITICAL LOGGING FIX: Reverted to a simpler, safer logging setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
# Suppress noisy logs from other libraries if needed, but do it safely
logging.getLogger('websockets').setLevel(logging.WARNING)
logging.getLogger('livekit').setLevel(logging.INFO) # Keep INFO for livekit to see job status
# --- END OF CRITICAL FIX ---


load_dotenv()


class Assistant(agents.Agent):
    def __init__(self, engine, session_id, chat_ctx: ChatContext | None = None) -> None:
        super().__init__(
            instructions=SYSTEM_PROMPT,
            chat_ctx=chat_ctx,
            llm=google.beta.realtime.RealtimeModel(
                model="gemini-live-2.5-flash-preview",
                voice="Puck",
                temperature=0.5,
                instructions=SYSTEM_PROMPT,
            ),
            vad=silero.VAD.load(),
        )
        self._engine = engine
        self._session_id = session_id

    async def process(self, ctx: agents.RunContext):
        return


async def entrypoint(ctx: agents.JobContext):
    await ctx.connect(auto_subscribe=AutoSubscribe.SUBSCRIBE_ALL)
    await ctx.wait_for_participant()
    session_id = ctx.room.name

    instance_connection_name = os.environ["CLOUD_SQL_CONNECTION_NAME"]
    db_user = os.environ["DB_USER"]
    db_pass = os.environ["DB_PASS"]
    db_name = os.environ["DB_NAME"]

    connector = Connector()

    async def getconn():
        conn = await connector.connect_async(
            instance_connection_name, "asyncpg", user=db_user,
            password=db_pass, db=db_name, ip_type=IPTypes.PUBLIC
        )
        return conn

    engine = create_async_engine("postgresql+asyncpg://", async_creator=getconn)

    try:
        async with engine.begin() as conn:
             res = await conn.execute(text("SELECT created_by FROM sessions WHERE id = :sid"), {"sid": session_id})
             session_row = res.mappings().one_or_none()
             if not session_row:
                 await conn.execute(
                    text("INSERT INTO sessions (id, name) VALUES (:id, :name) ON CONFLICT (id) DO NOTHING"),
                    {"id": session_id, "name": f"Session-{session_id}"},
                )
    except Exception as e:
        logger.warning("Session check/upsert failed: %s", e)

    # ADD THIS: Load prior conversation history to restore context
    history = []
    chat_ctx = None
    try:
        logger.info("Attempting to load history for session: %s", session_id)
        async with engine.begin() as conn:
            # Load prior messages deterministically by timestamp (oldest → newest).
            # Use NULLS LAST to avoid random ordering when some rows lack timestamps.
            res = await conn.execute(
                text(
                    """
                    SELECT role, text_content
                    FROM messages
                    WHERE session_id = :sid
                      AND text_content IS NOT NULL AND text_content <> ''
                    ORDER BY timestamp ASC NULLS LAST
                    LIMIT 200
                    """
                ),
                {"sid": session_id},
            )
            db_history = res.mappings().all()

        if db_history:
            for row in db_history:
                role = ChatRole.USER if row['role'] == 'user' else ChatRole.ASSISTANT
                history.append(ChatMessage(role=role, text=row['text_content']))

            chat_ctx = ChatContext(messages=history)
            logger.info("Restored %d messages from history.", len(history))
        else:
            logger.info("No prior history found for session %s", session_id)

    except Exception as e:
        logger.error("Failed to load message history: %s", e)


    session = AgentSession()
    last_idea_form: dict | None = None

    # Explicitly attach restored chat context to the session
    if chat_ctx is not None:
        try:
            session.chat_ctx = chat_ctx
            logger.info("Attached restored ChatContext to session.")
        except Exception as e:
            logger.warning("Failed to attach ChatContext to session: %s", e)

    @session.on("conversation_item_added")
    def on_conversation_item_added(event: ConversationItemAddedEvent):
        async def _persist():
            nonlocal last_idea_form

            item = event.item
            text_content = getattr(item, "text_content", None)
            if not text_content: return

            role_value = getattr(item, "role", None)
            normalized_role = "user" if role_value == "user" else "model"

            # This is your desired log for messages
            logger.info("MESSAGE SAVED TO DB: Role=%s, Content='%s'", normalized_role, text_content)
            try:
                async with engine.begin() as conn:
                    await conn.execute(
                        text("INSERT INTO messages (session_id, role, text_content) VALUES (:session_id, :role, :text)"),
                        {"session_id": session_id, "role": normalized_role, "text": text_content},
                    )
            except Exception as e:
                logger.error("Failed to persist message (role=%s): %s", normalized_role, e)

            if (
                normalized_role == "model"
                and "Idea Title:" in text_content
                and "Explanation:" in text_content
            ):
                try:
                    def extract_field(text, start_keyword, end_keywords):
                        clean_text = text.replace('**', '')
                        start_index = clean_text.find(start_keyword)
                        if start_index == -1: return None
                        start_index += len(start_keyword)
                        end_index = len(clean_text)
                        for end_keyword in end_keywords:
                            found_end = clean_text.find(end_keyword, start_index)
                            if found_end != -1:
                                end_index = min(end_index, found_end)
                        return clean_text[start_index:end_index].strip()

                    form_data = {}
                    form_data['idea_title'] = extract_field(text_content, "Idea Title:", ["Explanation:"])
                    form_data['explanation'] = extract_field(text_content, "Explanation:", ["Category:"])
                    form_data['category'] = extract_field(text_content, "Category:", ["Expected Impact:"])
                    form_data['expected_impact'] = extract_field(text_content, "Expected Impact:", ["Estimated Cost:"])
                    form_data['estimated_cost'] = extract_field(text_content, "Estimated Cost:", ["Urgency:"])
                    form_data['urgency'] = extract_field(text_content, "Urgency:", ["\n", "Does this look right", "क्या यह सही लग रहा है"])

                    if all(form_data.get(k) for k in ["idea_title", "explanation", "category", "urgency"]):
                        last_idea_form = form_data
                        logger.info("✅ FORM CAPTURED: Ready for submission. Title: '%s'", form_data.get('idea_title'))
                    else:
                        logger.warning("⚠️ FORM PARSE FAILED: Could not parse all required fields.")
                except Exception as e:
                    logger.warning("⚠️ FORM PARSE EXCEPTION: %s", e)

            # def is_user_confirmation(msg: str) -> bool:
            #     m = (msg or "").strip().lower().replace('.', '').replace('।', '')
            #     confirmation_keywords = [
            #         'submit', 'confirm', 'finalize', 'finalise', 'go ahead', 'looks good',
            #         'all good', 'correct', "that's correct", 'yes please', 'theek hai',
            #         'haan theek hai', 'ok hai', 'kar do', 'as it is', 'सबमिट', 'हाँ', 'ठीक है'
            #     ]
            #     for keyword in confirmation_keywords:
            #         if keyword in m:
            #             return True
            #     if "सबमिट कर" in m or "सबमिट कीजिए" in m:
            #         return True
            #     return False

            def is_user_confirmation(msg: str) -> bool:
                m = (msg or "").strip().lower().replace('.', '').replace('।', '')
                
                confirmation_keywords = [
                    # English
                    'submit', 'confirm', 'finalize', 'finalise', 'go ahead', 'looks good',
                    'all good', 'correct', "that's correct", 'yes please',

                    # Hindi
                    'theek hai', 'haan theek hai', 'ok hai', 'kar do', 'as it is', 
                    'सबमिट', 'हाँ', 'ठीक है',

                    # Marathi
                    'ho', 'theek aahe', 'karun taka', 'submit kara', 
                    'हो', 'ठीक आहे', 'सबमिट करा'
                ]

                for keyword in confirmation_keywords:
                    if keyword in m:
                        return True
                # Handle multi-word phrases in Hindi/Marathi
                if "सबमिट कर" in m or "सबमिट कीजिए" in m:
                    return True
                return False

            if normalized_role == "user" and is_user_confirmation(text_content):
                if last_idea_form:
                    logger.info("USER CONFIRMED: Attempting to save idea '%s'.", last_idea_form.get('idea_title'))
                    try:
                        async with engine.begin() as conn:
                            res = await conn.execute(text("SELECT created_by FROM sessions WHERE id = :sid"), {"sid": session_id})
                            row = res.mappings().one_or_none()
                            created_by = row.get("created_by") if row else None

                            await conn.execute(
                                text("""
                                    INSERT INTO curated_ideas (session_id, created_by, idea_title, explanation, category, expected_impact, estimated_cost, urgency, approved)
                                    VALUES (:session_id, :created_by, :idea_title, :explanation, :category, :expected_impact, :estimated_cost, :urgency, :approved)
                                """),
                                {
                                    "session_id": session_id, "created_by": created_by,
                                    "idea_title": last_idea_form.get("idea_title",""), "explanation": last_idea_form.get("explanation",""),
                                    "category": last_idea_form.get("category",""), "expected_impact": last_idea_form.get("expected_impact", ""),
                                    "estimated_cost": last_idea_form.get("estimated_cost", ""), "urgency": last_idea_form.get("urgency",""),
                                    "approved": None,
                                },
                            )
                        # This is your desired log for curated ideas
                        # logger.info("✅ CURATED IDEA SAVED TO DB: Title='%s'", last_idea_form.get('idea_title'))

                        # async def _notify_user():
                        #     await asyncio.sleep(0.5)
                        #     await session.generate_reply(instructions="Confirm to the user in their language that their idea has been successfully submitted and thank them.")

                        # asyncio.create_task(_notify_user())

                        # last_idea_form = None
                        logger.info("✅ CURATED IDEA SAVED TO DB: Title='%s'", last_idea_form.get('idea_title'))

                        async def _notify_user():
                            await asyncio.sleep(0.5)
                            # HIGHLIGHTED CHANGE: This new instruction is very specific and points to our prompt.
                            await session.generate_reply(
                                instructions="The idea has been saved. Your ONLY task is to deliver the 'Final Submission Confirmation' message in the user's chosen language."
                            )

                        asyncio.create_task(_notify_user())

                        last_idea_form = None
                    except Exception as e:
                        logger.error("❌ DB SUBMISSION FAILED: %s", e)
                else:
                    logger.warning("⚠️ USER CONFIRMED, BUT NO FORM CAPTURED RECENTLY.")

        asyncio.create_task(_persist())

    await session.start(
        room=ctx.room,
        agent=Assistant(engine=engine, session_id=session_id, chat_ctx=chat_ctx),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
            close_on_disconnect=False,
        ),
    )

    @session.on("participant_joined")
    def _on_participant_joined(_):
        async def _greet():
            await asyncio.sleep(0.2)
            await session.generate_reply(
                instructions="You're reconnected to the same session. I'll pick up from our previous context. How would you like to continue?"
            )
        asyncio.create_task(_greet())

    if not history:
        await session.generate_reply(
            instructions="""Your ONLY task is to say the following phrase verbatim, with no extra words or translation: "नमस्ते! Welcome to the ROKA Voice Idea Agent. To chat in English, please say 'English'. हिंदी में बात करने के लिए, 'हिंदी' कहिए। आणि मराठीत बोलण्यासाठी, 'मराठी' म्हणा." """
        )
    else:
        await session.generate_reply(
            instructions="You are reconnected to a previous session. Welcome the user back and ask them how they would like to continue with their idea."
        )


    @session.on("close")
    def on_close(_):
        async def _cleanup():
            if engine: await engine.dispose()
            if connector: await connector.close_async()
        asyncio.create_task(_cleanup())

if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))