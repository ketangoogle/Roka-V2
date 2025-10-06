import os
import uuid
import datetime
from quart import Quart, request, jsonify
from dotenv import load_dotenv
from quart_cors import cors
from livekit import api
from google.cloud.sql.connector import Connector, IPTypes
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from db_schema import metadata
from google.cloud import storage
import google.generativeai as genai
from functools import wraps # <-- ADDED IMPORT

load_dotenv()
app = Quart(__name__)
app = cors(app, allow_origin="*")

# --- Google Cloud Storage Setup ---
storage_client = storage.Client()
BUCKET_NAME = os.getenv("BUCKET_NAME")

# --- Global Database Engine (Initialized at startup) ---
engine = None
connector = None

HARDCODED_USERNAME = "admin"
HARDCODED_PASSWORD = "password@123"

def require_auth(func):
    """A decorator to protect routes with hardcoded basic auth."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        auth = request.authorization
        # Check if auth details are provided and match the hardcoded credentials
        if not auth or \
           auth.username != HARDCODED_USERNAME or \
           auth.password != HARDCODED_PASSWORD:
            # If they don't match, return a 401 Unauthorized error
            return (
                jsonify({"error": "Unauthorized access"}),
                401,
                {'WWW-Authenticate': 'Basic realm="Login Required"'}
            )
        # If credentials are valid, proceed to the original route function
        return await func(*args, **kwargs)
    return wrapper
# --- END NEW SECTION ---


@app.before_serving
async def startup():
    """
    Eagerly connect to the database on server startup for fast responses.
    """
    global engine, connector
    print("🚀 Server starting (eager DB connection mode)...")
    
    # Create uploads directory if it doesn't exist
    uploads_dir = os.path.join(os.getcwd(), "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    
    # Eagerly Initialize Database Connection Pool
    print("🔄 Initializing database connection pool...")
    try:
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

        engine = create_async_engine(
            "postgresql+asyncpg://", async_creator=getconn, echo=False,
            pool_size=5, max_overflow=10, pool_pre_ping=True, pool_recycle=1800,
        )
        
        # Test the connection at startup to ensure it's working & run migrations
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
            # Create tables if they do not exist
            await conn.run_sync(metadata.create_all)
            # One-time lightweight migrations for existing DBs
            # 1) Ensure sessions.created_by exists
            try:
                await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_by VARCHAR(100)"))
            except Exception:
                pass
            # 2) Ensure curated_ideas.created_by exists
            try:
                await conn.execute(text("ALTER TABLE curated_ideas ADD COLUMN IF NOT EXISTS created_by VARCHAR(100)"))
            except Exception:
                pass
            # 3) Ensure curated_ideas.approved (lowercase) exists and backfill from legacy "Approved"
            try:
                await conn.execute(text("ALTER TABLE curated_ideas ADD COLUMN IF NOT EXISTS approved boolean DEFAULT false"))
            except Exception:
                pass
            # Backfill approved from legacy column if present
            # try:
            #     await conn.execute(text("UPDATE curated_ideas SET approved = \"Approved\" WHERE \"Approved\" IS NOT NULL"))
            # except Exception:
            #     pass
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            # Seed hardcoded users (for demo only)
            try:
                # Keep ONLY these two demo users
                await conn.execute(text("DELETE FROM users WHERE id NOT IN ('ketan','shraddha')"))
                await conn.execute(
                    text(
                        """
                        INSERT INTO users (id, username, password)
                        VALUES (:id, :username, :password)
                        ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, password = EXCLUDED.password
                        """
                    ),
                    {"id": "ketan", "username": "Ketan", "password": "ketan123"},
                )
                await conn.execute(
                    text(
                        """
                        INSERT INTO users (id, username, password)
                        VALUES (:id, :username, :password)
                        ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, password = EXCLUDED.password
                        """
                    ),
                    {"id": "shraddha", "username": "shraddha", "password": "shraddha123"},
                )
                print("👤 Seeded demo users: Ketan/ketan123, Shraddha/shraddha123")
            except Exception as se:
                print(f"⚠️ Failed to seed users: {se}")
        
        print("✅ Database connection pool ready.")
    except Exception as e:
        print(f"❌ FATAL: Failed to connect to the database on startup: {e}")
        # Consider exiting if the database is critical for the app to run
        # import sys
        # sys.exit(1)

    print("✅ Server ready!")

@app.after_serving
async def shutdown():
    """Cleanup resources on shutdown."""
    global engine, connector
    print("🔌 Shutting down...")
    if engine:
        print("    - Disposing database engine.")
        await engine.dispose()
    if connector:
        print("    - Closing database connector.")
        await connector.close_async()
    print("❌ Server shutdown complete")

# --- API Routes ---

@app.route("/login", methods=["POST"])
async def login():
    """
    Validates credentials against the hardcoded admin username and password.
    This endpoint is public and does not use the @require_auth decorator.
    """
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 415

    data = await request.get_json()
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    # Check against the hardcoded admin credentials
    if username == HARDCODED_USERNAME and password == HARDCODED_PASSWORD:
        return jsonify({
            "message": "Login successful",
            "user": {
                "id": "admin",
                "username": "admin"
            }
        }), 200
    else:
        return jsonify({"error": "Invalid username or password"}), 401

@app.route("/sessions", methods=["GET"])
@require_auth  # <-- PROTECTED
async def list_sessions():
    """List sessions for a specific user (hardcoded users). Falls back if column not yet migrated."""
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400
    async with engine.connect() as conn:
        try:
            # Check if sessions.created_by exists
            chk = await conn.execute(
                text("""
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='sessions' AND column_name='created_by'
                """)
            )
            has_created_by = chk.scalar() is not None
        except Exception:
            has_created_by = False

        if has_created_by:
            result = await conn.execute(
                text("SELECT id, name FROM sessions WHERE created_by = :u ORDER BY created_at DESC"),
                {"u": user_id}
            )
        else:
            # Fallback: return all sessions until migration runs
            result = await conn.execute(text("SELECT id, name FROM sessions ORDER BY created_at DESC"))

        sessions = result.mappings().all()
        return jsonify([dict(row) for row in sessions])

@app.route("/session", methods=["POST"])
@require_auth  # <-- PROTECTED
async def create_session():
    """Create a new session scoped to a user (user_id required)."""
    data = await request.json
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400
    session_id = "Idea-" + str(uuid.uuid4())[:3]
    session_name = f"{user_id}-{session_id}"
    async with engine.begin() as conn:
        # Ensure the column exists before inserting (runtime-safe for fresh DBs)
        try:
            await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_by VARCHAR(100)"))
        except Exception:
            pass
        await conn.execute(
            text("INSERT INTO sessions (id, name, created_by) VALUES (:id, :name, :created_by)"),
            {"id": session_id, "name": session_name, "created_by": user_id}
        )
    return jsonify({"id": session_id, "name": session_name})

# --- NEW GET REQUEST ---
@app.route("/session/details/<session_id>", methods=["GET"])
@require_auth  # <-- PROTECTED
async def get_session_details(session_id):
    """Get details for a single session."""
    async with engine.connect() as conn:
        result = await conn.execute(
            text("SELECT id, name, created_at FROM sessions WHERE id = :id"),
            {"id": session_id}
        )
        session = result.mappings().one_or_none()
        if session:
            return jsonify(dict(session))
        else:
            return jsonify({"error": "Session not found"}), 404

@app.route("/session/<session_id>", methods=["GET"])
@require_auth  # <-- PROTECTED
async def get_session_history(session_id):
    """Get message history, converting GCS URIs to public URLs for previews."""
    async with engine.connect() as conn:
        result = await conn.execute(
            text("SELECT role, text_content, file_url FROM messages WHERE session_id = :id ORDER BY timestamp ASC"),
            {"id": session_id}
        )
        messages_from_db = result.mappings().all()

        processed_messages = []
        signer_email = os.getenv("SIGNER_SERVICE_ACCOUNT_EMAIL")
        if not signer_email:
            print("⚠️ SIGNER_SERVICE_ACCOUNT_EMAIL is not set. Image previews will fail.")
            return jsonify([dict(row) for row in messages_from_db])

        for row in messages_from_db:
            row_dict = dict(row)
            file_url = row_dict.get("file_url")
            
            if file_url and file_url.startswith("gs://"):
                try:
                    bucket_name = file_url.split('/')[2]
                    blob_name = '/'.join(file_url.split('/')[3:])
                    
                    bucket = storage_client.bucket(bucket_name)
                    blob = bucket.blob(blob_name)
                    
                    signed_url = blob.generate_signed_url(
                        version="v4",
                        expiration=datetime.timedelta(days=1),
                        method="GET",
                        service_account_email=signer_email
                    )
                    row_dict["file_url"] = signed_url
                except Exception as e:
                    print(f"⚠️ Failed to generate signed URL for {file_url}: {e}")
            
            processed_messages.append(row_dict)

        return jsonify(processed_messages)
        
# --- Health Check Routes ---

@app.route("/health", methods=["GET"])
async def health_check():
    """Fast health check without database."""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.datetime.now().isoformat(),
        "database_pool": "initialized" if engine else "not_initialized"
    })

@app.route("/health/db", methods=["GET"])
async def health_check_db():
    """Health check that verifies database connectivity."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return jsonify({"status": "healthy", "database": "connected"})
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 500

# --- Google Cloud Storage Routes ---

@app.route("/upload-file", methods=["POST"])
@require_auth
async def upload_file():
    """
    Handles file uploads by saving them locally first, then uploading to GCS.
    Expects a multipart/form-data request with 'file' and 'session_id'.
    """
    try:
        form = await request.form
        session_id = form.get("session_id")
        if not session_id:
            return jsonify({"error": "session_id is required"}), 400

        files = await request.files
        uploaded_file = files.get("file")
        if not uploaded_file or not uploaded_file.filename:
            return jsonify({"error": "File part is missing or empty"}), 400

        # Step 1: Ensure the local directory exists and save the file there
        session_uploads_path = os.path.join(os.getcwd(), "uploads", session_id)
        os.makedirs(session_uploads_path, exist_ok=True)
        
        local_file_path = os.path.join(session_uploads_path, uploaded_file.filename)
        await uploaded_file.save(local_file_path)
        print(f"✅ File saved locally to: {local_file_path}")

        # Step 2: Upload the file from the local path to Google Cloud Storage
        blob_name = f"uploads/{session_id}/{uuid.uuid4()}-{uploaded_file.filename}"
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(blob_name)
        
        blob.upload_from_filename(local_file_path)
        print(f"☁️ File uploaded to GCS bucket '{BUCKET_NAME}' as '{blob_name}'")
        
        # Step 3: Record the upload in the database
        file_url = f"gs://{BUCKET_NAME}/{blob_name}"
        async with engine.begin() as conn:
            await conn.execute(
                text("""
                    INSERT INTO messages (session_id, role, text_content, file_url) 
                    VALUES (:session_id, 'user', :filename, :file_url)
                """),
                {"session_id": session_id, "filename": f"📎 {uploaded_file.filename}", "file_url": file_url}
            )
        
        return jsonify({
            "message": "File uploaded successfully",
            "file_url": file_url
        }), 201

    except Exception as e:
        app.logger.error(f"❌ File upload failed: {e}")
        return jsonify({"error": "An internal server error occurred during file upload"}), 500

@app.route("/submit-idea", methods=["POST"])
@require_auth  # <-- PROTECTED
async def submit_idea():
    """Submit a curated idea to the database or update approval status."""
    data = await request.json
    session_id = data.get("session_id")
    idea_title = data.get("idea_title")
    explanation = data.get("explanation")
    category = data.get("category")
    expected_impact = data.get("expected_impact")
    estimated_cost = data.get("estimated_cost")
    urgency = data.get("urgency")
    idea_id = data.get("idea_id")
    approved = data.get("approved")
    reviewer_notes = data.get("reviewer_notes", "")
    created_by = data.get("created_by")
    
    if not engine:
        return jsonify({"error": "database_unavailable"}), 503
    
    try:
        async with engine.begin() as conn:
            # If idea_id and approved are provided, update approval status
            if idea_id is not None and approved is not None:
                await conn.execute(
                    text("""
                        UPDATE curated_ideas 
                        SET approved = :approved, 
                            reviewer_notes = :reviewer_notes,
                            reviewed_at = NOW()
                        WHERE id = :idea_id
                    """),
                    {
                        "idea_id": idea_id,
                        "approved": approved,
                        "reviewer_notes": reviewer_notes
                    }
                )
                status = "approved" if approved else "rejected"
                return jsonify({
                    "message": f"Idea {status} successfully", 
                    "status": "success",
                    "approved": approved
                })
            
            # Otherwise, submit new idea
            if not all([session_id, idea_title, explanation, category, urgency]):
                return jsonify({"error": "session_id, idea_title, explanation, category, and urgency are required"}), 400

            # If created_by not provided, infer from session
            if not created_by:
                res_user = await conn.execute(
                    text("SELECT created_by FROM sessions WHERE id = :sid"),
                    {"sid": session_id}
                )
                row = res_user.mappings().one_or_none()
                created_by = row["created_by"] if row else None
            
            # Ensure curated_ideas columns exist (runtime-safe for fresh DBs)
            try:
                await conn.execute(text("ALTER TABLE curated_ideas ADD COLUMN IF NOT EXISTS created_by VARCHAR(100)"))
            except Exception:
                pass
            try:
                await conn.execute(text("ALTER TABLE curated_ideas ADD COLUMN IF NOT EXISTS approved boolean DEFAULT false"))
            except Exception:
                pass

            result = await conn.execute(
                text("""
                    INSERT INTO curated_ideas (session_id, created_by, idea_title, explanation, category, 
                                                expected_impact, estimated_cost, urgency, approved)
                    VALUES (:session_id, :created_by, :idea_title, :explanation, :category, 
                            :expected_impact, :estimated_cost, :urgency, :approved)
                    RETURNING id
                """),
                {
                    "session_id": session_id,
                    "created_by": created_by,
                    "idea_title": idea_title,
                    "explanation": explanation,
                    "category": category,
                    "expected_impact": expected_impact,
                    "estimated_cost": estimated_cost,
                    "urgency": urgency,
                    "approved": False  # New ideas start as not approved
                }
            )
            new_idea_row = result.mappings().first()
            new_idea_id = new_idea_row["id"] if new_idea_row else None

            # Move any uploaded files for this session into an idea-specific folder in GCS
            # Local uploads path: uploads/<session_id>/
            uploads_dir = os.path.join(os.getcwd(), "uploads", session_id)
            if os.path.isdir(uploads_dir):
                try:
                    # Upload each file under gs://<bucket>/uploads/<session_id>/<idea_title>/<filename>
                    bucket = storage_client.bucket(BUCKET_NAME)
                    safe_title = idea_title.replace("/", "-").replace(" ", "_")[:120]
                    for root, _, files in os.walk(uploads_dir):
                        for fname in files:
                            local_path = os.path.join(root, fname)
                            rel_path = os.path.relpath(local_path, uploads_dir)
                            blob_path = f"uploads/{session_id}/{safe_title}/{rel_path}"
                            blob = bucket.blob(blob_path)
                            blob.upload_from_filename(local_path)
                except Exception as e:
                    # Do not fail the request if uploads copy fails; just report
                    print(f"⚠️ Failed to mirror uploads to GCS for idea '{idea_title}': {e}")
            return jsonify({"message": "Idea submitted successfully", "status": "success"})
    except Exception as e:
        return jsonify({"error": f"Failed to process idea: {str(e)}"}), 500

@app.route("/ideas/<session_id>", methods=["GET"])
@require_auth  # <-- PROTECTED
async def get_session_ideas(session_id):
    """Get curated ideas for a specific session."""
    if not engine:
        return jsonify([])
    
    async with engine.connect() as conn:
        result = await conn.execute(
            text("""
                SELECT id, idea_title, explanation, category, expected_impact, 
                       estimated_cost, urgency, status, submitted_at, approved, 
                       reviewer_notes, reviewed_at, created_by
                FROM curated_ideas 
                WHERE session_id = :id 
                ORDER BY submitted_at DESC
            """),
            {"id": session_id}
        )
        ideas = result.mappings().all()
        return jsonify([dict(row) for row in ideas])

@app.route("/ideas", methods=["GET"])
@require_auth  # <-- PROTECTED
async def get_all_ideas():
    """Get all curated ideas and efficiently attach any associated image URLs."""
    if not engine:
        return jsonify([])
    
    signer_email = os.getenv("SIGNER_SERVICE_ACCOUNT_EMAIL")
    if not signer_email:
        app.logger.warning("SIGNER_SERVICE_ACCOUNT_EMAIL is not set. Image downloads will fail.")

    try:
        async with engine.connect() as conn:
            # Step 1: Fetch all curated ideas first.
            ideas_result = await conn.execute(
                text("""
                    SELECT ci.id, ci.session_id, ci.idea_title, ci.explanation, ci.category, 
                           ci.expected_impact, ci.estimated_cost, ci.urgency, ci.status, 
                           ci.submitted_at, ci.approved, ci.reviewer_notes, ci.reviewed_at, 
                           ci.created_by, s.name as session_name
                    FROM curated_ideas ci
                    LEFT JOIN sessions s ON ci.session_id = s.id
                    ORDER BY ci.submitted_at DESC
                """)
            )
            ideas = [dict(row) for row in ideas_result.mappings().all()]

            if not ideas:
                return jsonify([])

            # Step 2: Collect all unique session IDs from the fetched ideas.
            session_ids = list(set(idea["session_id"] for idea in ideas))

            # Step 3: Fetch all relevant image messages for ALL those sessions in a SINGLE second query.
            images_by_session = {}
            if signer_email and session_ids:
                image_messages_result = await conn.execute(
                    text("""
                        SELECT session_id, file_url FROM messages
                        WHERE session_id = ANY(:sids) AND (
                            file_url LIKE 'gs://%.jpg' OR file_url LIKE 'gs://%.jpeg' OR
                            file_url LIKE 'gs://%.png' OR file_url LIKE 'gs://%.webp'
                        )
                    """),
                    {"sids": session_ids}
                )
                image_messages = image_messages_result.mappings().all()

                # Step 4: Process the image URLs and group them by session_id in a dictionary.
                for msg in image_messages:
                    session_id = msg["session_id"]
                    if session_id not in images_by_session:
                        images_by_session[session_id] = []
                    
                    file_url = msg["file_url"]
                    try:
                        bucket_name = file_url.split('/')[2]
                        blob_name = '/'.join(file_url.split('/')[3:])
                        bucket = storage_client.bucket(bucket_name)
                        blob = bucket.blob(blob_name)
                        signed_url = blob.generate_signed_url(
                            version="v4", expiration=datetime.timedelta(days=1),
                            method="GET", service_account_email=signer_email
                        )
                        images_by_session[session_id].append(signed_url)
                    except Exception as e:
                        app.logger.error(f"Failed to generate signed URL for {file_url}: {e}")

            # Step 5: Join the data together in Python (fast and safe).
            for idea in ideas:
                idea["image_urls"] = images_by_session.get(idea["session_id"], [])
            
            return jsonify(ideas)

    except Exception as e:
        app.logger.error(f"❌ SERVER CRASH in /ideas endpoint: {e}")
        return jsonify({"error": "An internal server error occurred"}), 500
    
@app.route("/compare-ideas", methods=["POST"])
@require_auth  # <-- PROTECTED
async def compare_ideas():
    """Compare two ideas using Gemini API."""
    try:
        data = await request.get_json()
        idea1 = data.get('idea1')
        idea2 = data.get('idea2')
        
        if not idea1 or not idea2:
            return jsonify({"error": "Both ideas are required"}), 400
        
        # Import Gemini here to avoid import issues if not available
        try:
            
            # Configure Gemini API
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                return jsonify({"error": "Gemini API key not configured"}), 500
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-1.5-flash')

            # Create comparison prompt
            prompt = f"""
            Please compare these two ideas in a structured format:

            Idea 1:
            Title: {idea1.get('idea_title', 'N/A')}
            Description: {idea1.get('explanation', 'N/A')}
            Category: {idea1.get('category', 'N/A')}
            Expected Impact: {idea1.get('expected_impact', 'N/A')}
            Estimated Cost: {idea1.get('estimated_cost', 'N/A')}
            Urgency: {idea1.get('urgency', 'N/A')}

            Idea 2:
            Title: {idea2.get('idea_title', 'N/A')}
            Description: {idea2.get('explanation', 'N/A')}
            Category: {idea2.get('category', 'N/A')}
            Expected Impact: {idea2.get('expected_impact', 'N/A')}
            Estimated Cost: {idea2.get('estimated_cost', 'N/A')}
            Urgency: {idea2.get('urgency', 'N/A')}

            Please provide a detailed comparison covering:
            1. Similarities and differences
            2. Feasibility analysis
            3. Impact assessment
            4. Cost-benefit analysis
            5. Implementation complexity
            6. Recommendation on which idea to prioritize

            Format the response in a clear, structured manner with headings and bullet points.
            """
            
            response = model.generate_content(prompt)
            comparison_text = response.text
            
            return jsonify({
                "comparison": comparison_text,
                "idea1_title": idea1.get('idea_title'),
                "idea2_title": idea2.get('idea_title')
            })
            
        except ImportError:
            return jsonify({"error": "Google Generative AI library not installed"}), 500
        except Exception as e:
            return jsonify({"error": f"Gemini API error: {str(e)}"}), 500
            
    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500

# --- LiveKit Token Route ---

@app.route("/getToken", methods=["GET"])
@require_auth  # <-- PROTECTED
async def get_token():
    """Get a LiveKit token."""
    session_id = request.args.get("session_id")
    participant_name = request.args.get("name", "human-user")
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400
    
    token = api.AccessToken(os.getenv("LIVEKIT_API_KEY"), os.getenv("LIVEKIT_API_SECRET")) \
        .with_identity(participant_name) \
        .with_name(participant_name) \
        .with_grants(api.VideoGrants(room_join=True, room=session_id))
        
    return jsonify({"token": token.to_jwt()})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=True, host="0.0.0.0", port=port)