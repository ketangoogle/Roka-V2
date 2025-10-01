# init_db.py
import os
import asyncio
from dotenv import load_dotenv
from google.cloud.sql.connector import Connector, IPTypes
from sqlalchemy.ext.asyncio import create_async_engine

# Import the metadata object that holds your table definitions
from db_schema import metadata

# Load environment variables from .env file
load_dotenv()

async def create_tables():
    """Connects to the database and creates tables based on the defined schema."""
    print("🚀 Initializing database connection...")
    try:
        # --- Database Connection Logic (copied from your server.py) ---
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
            "postgresql+asyncpg://", async_creator=getconn
        )

        # --- Table Creation Logic ---
        print("🔄 Creating database tables if they don't exist...")
        async with engine.begin() as conn:
            # run_sync tells the async connection to run the synchronous create_all method
            await conn.run_sync(metadata.create_all)
        
        print("✅ Tables 'sessions' and 'messages' created successfully (or already exist).")

        # --- Cleanup ---
        await engine.dispose()
        await connector.close_async()

    except Exception as e:
        print(f"❌ An error occurred during database initialization: {e}")

if __name__ == "__main__":
    # Run the asynchronous create_tables function
    asyncio.run(create_tables())
