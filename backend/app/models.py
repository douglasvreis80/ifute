from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .database import Base


class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"
    SUPERADMIN = "superadmin"


class UserStatus(str, Enum):
    MENSALISTA = "mensalista"
    AVULSO = "avulso"


class ConvocationStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    DECLINED = "declined"


class PresenceRole(str, Enum):
    CONVOKED = "convocado"
    AVULSO = "avulso"


class PresenceStatus(str, Enum):
    CONFIRMED = "confirmed"
    WAITING = "waiting"
    DECLINED = "declined"


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    users = relationship("User", back_populates="group", cascade="all, delete")
    games = relationship("Game", back_populates="group", cascade="all, delete")
    invitations = relationship("Invitation", back_populates="group", cascade="all, delete-orphan")


class InvitationStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(SqlEnum(UserRole), nullable=False, default=UserRole.USER)
    status = Column(SqlEnum(UserStatus), nullable=False, default=UserStatus.AVULSO)
    is_active = Column(Boolean, default=False, nullable=False)
    confirmation_token = Column(String, nullable=True, unique=True)
    last_confirmation_token = Column(String, nullable=True, unique=True)
    reset_token = Column(String, nullable=True, unique=True)
    reset_token_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    profile_image = Column(String, nullable=True)
    preferred_position = Column(String, nullable=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="RESTRICT"), nullable=True)

    group = relationship("Group", back_populates="users")
    games_created = relationship("Game", back_populates="owner", cascade="all, delete")
    convocations = relationship("Convocation", back_populates="user", cascade="all, delete-orphan")
    presences = relationship("Presence", back_populates="user", cascade="all, delete-orphan")
    invitations = relationship("Invitation", back_populates="user")


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    location = Column(String, nullable=False)
    scheduled_at = Column(DateTime, nullable=False)
    max_players = Column(Integer, nullable=False, default=10)
    convocation_deadline = Column(DateTime, nullable=True)
    auto_convocar_mensalistas = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)

    owner = relationship("User", back_populates="games_created")
    group = relationship("Group", back_populates="games")
    convocations = relationship("Convocation", back_populates="game", cascade="all, delete-orphan")
    presences = relationship("Presence", back_populates="game", cascade="all, delete-orphan")


class Convocation(Base):
    __tablename__ = "convocations"
    __table_args__ = (
        UniqueConstraint("game_id", "user_id", name="uq_convocation_game_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    status = Column(SqlEnum(ConvocationStatus), nullable=False, default=ConvocationStatus.PENDING)
    responded_at = Column(DateTime, nullable=True)
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    game = relationship("Game", back_populates="convocations")
    user = relationship("User", back_populates="convocations")


class Presence(Base):
    __tablename__ = "presences"
    __table_args__ = (
        UniqueConstraint("game_id", "user_id", name="uq_presence_game_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    role = Column(SqlEnum(PresenceRole), nullable=False)
    status = Column(SqlEnum(PresenceStatus), nullable=False, default=PresenceStatus.CONFIRMED)
    queue_position = Column(Integer, nullable=True)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    game = relationship("Game", back_populates="presences")
    user = relationship("User", back_populates="presences")


class Invitation(Base):
    __tablename__ = "invitations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, index=True)
    token = Column(String, nullable=False, unique=True, index=True)
    status = Column(SqlEnum(InvitationStatus), nullable=False, default=InvitationStatus.PENDING)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False)
    role = Column(SqlEnum(UserRole), nullable=False, default=UserRole.USER)

    user = relationship("User", back_populates="invitations")
    group = relationship("Group", back_populates="invitations")
