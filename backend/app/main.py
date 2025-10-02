import logging
import os
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from . import crud, email_utils, models, schemas, security
from .config import settings
from .database import SessionLocal, ensure_schema, get_db

ensure_schema()

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _parse_origins() -> List[str]:
    defaults = {"http://localhost:3000", "http://127.0.0.1:3000"}

    extra_origins = os.getenv("CORS_ALLOWED_ORIGINS")
    if extra_origins:
        for origin in extra_origins.split(","):
            cleaned = origin.strip().rstrip("/")
            if cleaned:
                defaults.add(cleaned)

    frontend_origin = os.getenv("FRONTEND_ORIGIN")
    if frontend_origin:
        defaults.add(frontend_origin.strip().rstrip("/"))

    return sorted(defaults)


def _origin_regex() -> str:
    return os.getenv(
        "CORS_ALLOWED_REGEX",
        r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    )


app = FastAPI(title="Footy Friends", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_origins(),
    allow_origin_regex=_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


@app.on_event("startup")
def ensure_default_admin() -> None:
    if not settings.admin_default_user:
        return

    parts = [value.strip() for value in settings.admin_default_user.split(",")]
    if len(parts) != 3:
        logger.warning(
            "ADMIN_DEFAULT_USER should follow 'Name,email,password'. Skipping creation."
        )
        return

    name, email, password = parts
    with SessionLocal() as db:
        existing = crud.get_user_by_email(db, email)
        if existing:
            if existing.role != models.UserRole.SUPERADMIN:
                existing.role = models.UserRole.SUPERADMIN
                db.commit()
                logger.info("Promoted existing user '%s' to superadmin", email)
            return
        group = crud.get_group_by_name(db, name) or crud.create_group(
            db,
            schemas.GroupCreate(name=name, description=f"Grupo padrão para {name}"),
        )
        user_schema = schemas.UserCreate(name=name, email=email, password=password, group_id=group.id)
        crud.create_user(db, user_schema, role=models.UserRole.SUPERADMIN, is_active=True)
        logger.info("Created default superadmin user '%s'", email)


# Auth routes


@app.post("/auth/register", response_model=schemas.MessageResponse, status_code=status.HTTP_201_CREATED)
def register(
    user: schemas.UserCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    new_user, token = crud.create_pending_user(db, user)
    background_tasks.add_task(email_utils.send_confirmation_email, new_user.email, token)
    return schemas.MessageResponse(message="Cadastro realizado! Verifique seu e-mail para confirmar a conta.")


@app.post("/auth/login", response_model=schemas.TokenResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = crud.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Conta não confirmada. Verifique seu e-mail.")

    access_token = security.create_access_token({"sub": str(user.id)})
    return schemas.TokenResponse(access_token=access_token)


@app.get("/auth/me", response_model=schemas.UserResponse)
def read_current_user(current_user: models.User = Depends(security.get_current_user)):
    return current_user


@app.get("/auth/confirm", response_model=schemas.MessageResponse)
def confirm_account(token: str, db: Session = Depends(get_db)):
    _, confirmed_now = crud.confirm_user(db, token)
    message = (
        "Conta confirmada com sucesso! Você já pode fazer login."
        if confirmed_now
        else "Conta já estava confirmada. Você já pode fazer login."
    )
    return schemas.MessageResponse(message=message)


@app.post("/auth/forgot-password", response_model=schemas.MessageResponse)
def forgot_password(
    request: schemas.ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    user = crud.get_user_by_email(db, request.email.lower())
    if user:
        token = crud.generate_reset_token(db, user)
        background_tasks.add_task(email_utils.send_reset_email, user.email, token)
    return schemas.MessageResponse(message="Se o e-mail estiver cadastrado, enviaremos instruções para redefinir a senha.")


@app.post("/auth/reset-password", response_model=schemas.MessageResponse)
def reset_password(
    payload: schemas.ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    crud.reset_password(db, payload.token, payload.new_password)
    return schemas.MessageResponse(message="Senha atualizada com sucesso!")


@app.get("/auth/invitations/{token}", response_model=schemas.InvitationTokenInfo)
def get_invitation(token: str, db: Session = Depends(get_db)):
    invitation = crud.get_active_invitation(db, token)
    return schemas.InvitationTokenInfo(
        name=invitation.name,
        email=invitation.email,
        expires_at=invitation.expires_at,
        group_id=invitation.group_id,
        group_name=invitation.group.name if invitation.group else "",
        group_description=invitation.group.description if invitation.group else None,
        role=invitation.role,
    )


@app.post("/auth/register-invited", response_model=schemas.MessageResponse, status_code=status.HTTP_201_CREATED)
def register_invited(
    payload: schemas.InvitedRegisterRequest,
    db: Session = Depends(get_db),
):
    invitation = crud.get_active_invitation(db, payload.token)

    if invitation.role == models.UserRole.SUPERADMIN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convites de superadmin não podem ser concluídos pela interface pública")

    if crud.get_user_by_email(db, invitation.email):
        invitation.status = models.InvitationStatus.EXPIRED
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="E-mail já cadastrado")

    if not invitation.group_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convite sem grupo associado")

    user_data = schemas.UserCreate(
        name=invitation.name,
        email=invitation.email,
        password=payload.password,
        group_id=invitation.group_id,
    )
    new_user = crud.create_user(
        db,
        user_data,
        role=invitation.role,
        is_active=True,
        preferred_position=payload.preferred_position,
    )
    crud.mark_invitation_accepted(db, invitation, new_user)
    return schemas.MessageResponse(message="Cadastro concluído! Você já pode fazer login.")


# Profile routes


@app.post("/users/me/upload-photo", response_model=schemas.UserResponse)
async def upload_profile_photo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Envie um arquivo de imagem.")

    extension = Path(file.filename).suffix or ".png"
    filename = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / filename

    contents = await file.read()
    destination.write_bytes(contents)

    relative_path = f"/uploads/{filename}"
    updated_user = crud.update_profile_image(db, current_user, relative_path)
    return schemas.UserResponse.from_orm(updated_user)


# User routes


@app.get("/users", response_model=List[schemas.UserPublic])
def list_users(db: Session = Depends(get_db), current_user: models.User = Depends(security.require_admin)):
    if current_user.group_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Administrador não vinculado a grupo")
    users = crud.list_users(db, group_id=current_user.group_id)
    return [schemas.UserPublic.from_orm(user) for user in users]


# Group routes


@app.get("/groups", response_model=List[schemas.GroupResponse])
def list_groups(db: Session = Depends(get_db)):
    groups = crud.list_groups(db)
    return [schemas.GroupResponse.from_orm(group) for group in groups]


@app.post("/groups", response_model=schemas.GroupResponse, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: schemas.GroupCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(security.require_superadmin),
):
    group = crud.create_group(db, payload)
    return schemas.GroupResponse.from_orm(group)


# Superadmin routes


@app.post(
    "/superadmin/invitations",
    response_model=schemas.InvitationBatchResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_admin_invitations(
    payload: schemas.SuperadminInvitationBatchRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: models.User = Depends(security.require_superadmin),
):
    if not payload.invitations:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum convite informado")

    created, skipped = crud.create_admin_invitations(db, payload.invitations)
    for invitation in created:
        expires_at = invitation.expires_at.strftime("%d/%m/%Y %H:%M")
        background_tasks.add_task(
            email_utils.send_invitation_email,
            invitation.email,
            invitation.name,
            invitation.token,
            expires_at,
        )

    return schemas.InvitationBatchResponse(
        created=[schemas.InvitationResponse.from_orm(inv) for inv in created],
        skipped=[schemas.InvitationSkipped(**item) for item in skipped],
    )


@app.get("/superadmin/invitations", response_model=List[schemas.InvitationResponse])
def list_admin_invitations(
    group_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(security.require_superadmin),
):
    invitations = crud.list_invitations(db, group_id=group_id, role=models.UserRole.ADMIN)
    return [schemas.InvitationResponse.from_orm(invitation) for invitation in invitations]


# Admin routes


@app.post(
    "/admin/invitations",
    response_model=schemas.InvitationBatchResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_invitations(
    payload: schemas.InvitationBatchRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin),
):
    if not payload.invitations:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum convite informado")

    if current_user.group_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Administrador não vinculado a grupo")

    created, skipped = crud.create_invitations(
        db,
        payload.invitations,
        group_id=current_user.group_id,
        role=models.UserRole.USER,
    )
    for invitation in created:
        expires_at = invitation.expires_at.strftime("%d/%m/%Y %H:%M")
        background_tasks.add_task(
            email_utils.send_invitation_email,
            invitation.email,
            invitation.name,
            invitation.token,
            expires_at,
        )

    return schemas.InvitationBatchResponse(
        created=[schemas.InvitationResponse.from_orm(inv) for inv in created],
        skipped=[schemas.InvitationSkipped(**item) for item in skipped],
    )


@app.get("/admin/invitations", response_model=List[schemas.InvitationResponse])
def list_invitations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin),
):
    if current_user.group_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Administrador não vinculado a grupo")

    invitations = crud.list_invitations(db, group_id=current_user.group_id, role=models.UserRole.USER)
    return [schemas.InvitationResponse.from_orm(invitation) for invitation in invitations]


@app.patch("/admin/users/{user_id}/status", response_model=schemas.UserResponse)
def set_user_status(
    user_id: int,
    payload: schemas.UpdateUserStatusRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin),
):
    if current_user.group_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Administrador não vinculado a grupo")
    user = crud.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    if user.group_id != current_user.group_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário pertence a outro grupo")
    updated = crud.update_user_status(db, user, payload.status)
    return schemas.UserResponse.from_orm(updated)


# Game routes


@app.post("/games", response_model=schemas.GameResponse, status_code=status.HTTP_201_CREATED)
def create_game(
    game: schemas.GameCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin),
):
    created_game = crud.create_game(db, game, current_user)
    reserved, available = crud.get_slot_summary(created_game)
    response = schemas.GameResponse.from_orm(created_game)
    response.available_slots = available
    response.reserved_slots = reserved
    return response


@app.get("/games", response_model=List[schemas.GameResponse])
def list_games(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user),
):
    if current_user.group_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuário não vinculado a grupo")
    games = crud.get_games(db, current_user.group_id)
    result: List[schemas.GameResponse] = []
    for game in games:
        reserved, available = crud.get_slot_summary(game)
        item = schemas.GameResponse.from_orm(game)
        item.available_slots = available
        item.reserved_slots = reserved
        result.append(item)
    return result


@app.get("/games/{game_id}", response_model=schemas.GameDetail)
def get_game_detail(
    game_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user),
):
    game = crud.get_game(db, game_id, group_id=current_user.group_id)
    return crud.generate_game_snapshot(game)


@app.post("/games/{game_id}/convocations", response_model=schemas.GameDetail)
def set_convocations(
    game_id: int,
    payload: schemas.ConvocationAssignRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.require_admin),
):
    game = crud.get_game(db, game_id, group_id=current_user.group_id)
    crud.assign_convocations(db, game, payload.user_ids)
    db.refresh(game)
    return crud.generate_game_snapshot(game)


@app.post("/games/{game_id}/confirm", response_model=schemas.ConfirmResponse)
def confirm_convocation(
    game_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user),
):
    presence, displaced = crud.confirm_convocation(db, game_id, current_user)
    return schemas.ConfirmResponse(
        presence=schemas.PresenceResponse.from_orm(presence),
        displaced_waiting=[item.user_id for item in displaced],
    )


@app.post("/games/{game_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_convocation(
    game_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user),
):
    crud.decline_convocation(db, game_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/games/{game_id}/join", response_model=schemas.PresenceResponse, status_code=status.HTTP_201_CREATED)
def join_as_avulso(
    game_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user),
):
    presence = crud.join_as_avulso(db, game_id, current_user)
    return schemas.PresenceResponse.from_orm(presence)


@app.delete("/games/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_game(
    game_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user),
):
    game = crud.get_game(db, game_id, group_id=current_user.group_id)
    if game.owner_id != current_user.id and current_user.role != models.UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to delete this game")
    crud.delete_game(db, game)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete("/games/{game_id}/presences/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_presence(
    game_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user),
):
    crud.remove_presence(db, game_id, current_user, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
