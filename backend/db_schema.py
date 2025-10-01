# db_schema.py
from sqlalchemy import (
    MetaData,
    Table,
    Column,
    String,
    Integer,
    Text,
    DateTime,
    ForeignKey,
    Boolean,
    func,
)

# Define metadata
metadata = MetaData()

# Define the 'users' table
users = Table(
    'users',
    metadata,
    Column('id', String(100), primary_key=True),
    Column('username', String(100), unique=True, nullable=False),
    Column('password', String(255), nullable=False),  # for demo; use hashes in production
    Column('created_at', DateTime(timezone=True), server_default=func.now())
)

# Define the 'sessions' table
sessions = Table(
    'sessions',
    metadata,
    Column('id', String(255), primary_key=True),
    Column('name', String(255)),
    Column('created_by', String(100)),
    Column('created_at', DateTime(timezone=True), server_default=func.now())
)

# Define the 'messages' table
messages = Table(
    'messages',
    metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),
    Column('session_id', String(255), ForeignKey('sessions.id'), nullable=False),
    Column('role', String(50), nullable=False),
    Column('text_content', Text),
    Column('file_url', String(1024)),
    Column('timestamp', DateTime(timezone=True), server_default=func.now())
)

# Define the 'curated_ideas' table
curated_ideas = Table(
    'curated_ideas',
    metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),
    Column('session_id', String(255), ForeignKey('sessions.id'), nullable=False),
    Column('created_by', String(100)),
    Column('idea_title', String(500), nullable=False),
    Column('explanation', Text, nullable=False),
    Column('category', String(100), nullable=False),
    Column('expected_impact', Text),
    Column('estimated_cost', String(200)),
    Column('urgency', String(100), nullable=False),
    Column('status', String(50), default='submitted'),
    Column('submitted_at', DateTime(timezone=True), server_default=func.now()),
    Column('reviewed_at', DateTime(timezone=True)),
    Column('reviewer_notes', Text),
    Column('approved' , Boolean, default=False)
)

# user aaccounts table and idea table 
