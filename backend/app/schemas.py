from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field

from .models import (
    ConvocationStatus,
    PresenceRole,
    PresenceStatus,
    UserRole,
    UserStatus,
)


class UserBase(BaseModel):
    name: str = Field(..., min_length=1)
    email: EmailStr


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)
    group_id: int = Field(..., gt=0)


class UserResponse(UserBase):
    id: int
    role: UserRole
    status: UserStatus
    profile_image: Optional[str]
    preferred_position: Optional[str]
    created_at: datetime
    group_id: int

    class Config:
        orm_mode = True


class UserPublic(BaseModel):
    id: int
    name: str
    role: UserRole
    status: UserStatus
    profile_image: Optional[str]
    preferred_position: Optional[str]
    group_id: int

    class Config:
        orm_mode = True


class GroupBase(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None


class GroupCreate(GroupBase):
    pass


class GroupResponse(GroupBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True


class GroupSummary(BaseModel):
    id: int
    name: str
    description: Optional[str] = None

    class Config:
        orm_mode = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class GameBase(BaseModel):
    name: str = Field(..., min_length=1)
    location: str = Field(..., min_length=1)
    scheduled_at: datetime
    max_players: int = Field(default=10, gt=0)
    convocation_deadline: Optional[datetime] = None
    auto_convocar_mensalistas: bool = False


class GameCreate(GameBase):
    convocation_user_ids: List[int] = Field(default_factory=list)
    group_id: Optional[int] = None


class GameResponse(GameBase):
    id: int
    created_at: datetime
    owner: Optional[UserPublic]
    available_slots: int = 0
    reserved_slots: int = 0
    group_id: int

    class Config:
        orm_mode = True


class ConvocationResponse(BaseModel):
    id: int
    status: ConvocationStatus
    responded_at: Optional[datetime]
    user: UserPublic

    class Config:
        orm_mode = True


class PresenceResponse(BaseModel):
    id: int
    role: PresenceRole
    status: PresenceStatus
    joined_at: datetime
    queue_position: Optional[int] = None
    user: UserPublic

    class Config:
        orm_mode = True


class ConfirmResponse(BaseModel):
    presence: PresenceResponse
    displaced_waiting: List[int] = []


class GameDetail(GameResponse):
    convocations: List[ConvocationResponse]
    presences: List[PresenceResponse]


class ConvocationAssignRequest(BaseModel):
    user_ids: List[int]


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)


class InvitationCreate(BaseModel):
    name: str = Field(..., min_length=1)
    email: EmailStr


class InvitationBatchRequest(BaseModel):
    invitations: List[InvitationCreate]


class InvitationResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    status: str
    expires_at: datetime
    created_at: datetime
    accepted_at: Optional[datetime] = None
    group_id: int
    group: Optional[GroupSummary] = None
    role: UserRole

    class Config:
        orm_mode = True


class InvitationSkipped(BaseModel):
    name: str
    email: EmailStr
    reason: str
    group_id: Optional[int] = None


class InvitationBatchResponse(BaseModel):
    created: List[InvitationResponse]
    skipped: List[InvitationSkipped] = []


class InvitationTokenInfo(BaseModel):
    name: str
    email: EmailStr
    expires_at: datetime
    group_id: int
    group_name: str
    group_description: Optional[str] = None
    role: UserRole


class InvitedRegisterRequest(BaseModel):
    token: str
    password: str = Field(..., min_length=6)
    preferred_position: Optional[str] = None


class SuperadminInvitationCreate(BaseModel):
    name: str = Field(..., min_length=1)
    email: EmailStr
    group_id: int = Field(..., gt=0)


class SuperadminInvitationBatchRequest(BaseModel):
    invitations: List[SuperadminInvitationCreate]


class UpdateUserStatusRequest(BaseModel):
    status: UserStatus
