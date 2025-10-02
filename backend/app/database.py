import os
from pathlib import Path

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import declarative_base, sessionmaker

DEFAULT_DB_URL = "sqlite:///./data/app.db"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB_URL)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    db_path = DATABASE_URL.replace("sqlite:///", "", 1)
    if db_path.startswith("./"):
        db_path = db_path[2:]
    db_file = Path(db_path)
    db_file.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    expected_tables = {"users", "games", "convocations", "presences", "invitations", "groups"}

    needs_reset = False

    # Drop old tables if they still exist (legacy schema)
    legacy_tables = {"players"}
    if tables & legacy_tables:
        needs_reset = True

    # If any expected table missing or missing new columns, reset
    if not expected_tables.issubset(tables):
        needs_reset = True
    else:
        games_columns = {column["name"] for column in inspector.get_columns("games")}
        if {"owner_id", "convocation_deadline", "auto_convocar_mensalistas", "group_id"} - games_columns:
            needs_reset = True
        presence_columns = {column["name"] for column in inspector.get_columns("presences")}
        if {"status", "queue_position"} - presence_columns:
            needs_reset = True
        invitation_columns = {column["name"] for column in inspector.get_columns("invitations")} if "invitations" in tables else set()
        if "invitations" in tables and {"name", "email", "token", "status", "expires_at", "group_id", "role"} - invitation_columns:
            needs_reset = True
        group_columns = {column["name"] for column in inspector.get_columns("groups")} if "groups" in tables else set()
        if "groups" in tables and {"name", "description", "created_at"} - group_columns:
            needs_reset = True
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if {
            "is_active",
            "confirmation_token",
            "last_confirmation_token",
            "reset_token",
            "reset_token_expires_at",
            "status",
            "profile_image",
            "preferred_position",
            "group_id",
        } - user_columns:
            needs_reset = True

    if needs_reset:
        Base.metadata.drop_all(bind=engine)

    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
