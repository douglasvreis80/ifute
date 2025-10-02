from datetime import datetime, timedelta
from typing import List, Optional, Tuple
import secrets

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from . import models, schemas
from .models import UserRole, UserStatus
from .config import settings
from .security import get_password_hash, verify_password


# User helpers

def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email.lower()).first()


def get_user_by_id(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()


def list_users(db: Session, *, group_id: Optional[int] = None) -> List[models.User]:
    query = db.query(models.User)
    if group_id is not None:
        query = query.filter(models.User.group_id == group_id)
    return query.order_by(models.User.name).all()


def get_group_by_id(db: Session, group_id: int) -> Optional[models.Group]:
    return db.query(models.Group).filter(models.Group.id == group_id).first()


def get_group_by_name(db: Session, name: str) -> Optional[models.Group]:
    return db.query(models.Group).filter(models.Group.name == name).first()


def create_group(db: Session, payload: schemas.GroupCreate) -> models.Group:
    if get_group_by_name(db, payload.name):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Já existe um grupo com esse nome")

    group = models.Group(name=payload.name, description=payload.description)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


def list_groups(db: Session) -> List[models.Group]:
    return db.query(models.Group).order_by(models.Group.name).all()


def create_user(
    db: Session,
    user: schemas.UserCreate,
    role: models.UserRole = models.UserRole.USER,
    *,
    is_active: bool = True,
    confirmation_token: Optional[str] = None,
    preferred_position: Optional[str] = None,
) -> models.User:
    group = None
    if role != models.UserRole.SUPERADMIN:
        group = get_group_by_id(db, user.group_id)
        if not group:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Grupo informado não existe")
    elif user.group_id:
        group = get_group_by_id(db, user.group_id)

    if get_user_by_email(db, user.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    db_user = models.User(
        name=user.name,
        email=user.email.lower(),
        password_hash=get_password_hash(user.password),
        role=role,
        is_active=is_active,
        confirmation_token=confirmation_token,
        last_confirmation_token=confirmation_token,
        reset_token=None,
        reset_token_expires_at=None,
        preferred_position=preferred_position,
        group_id=group.id if group else None,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def authenticate_user(db: Session, email: str, password: str) -> Optional[models.User]:
    user = get_user_by_email(db, email)
    if not user or not verify_password(password, user.password_hash):
        return None
    return user


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def create_pending_user(db: Session, user: schemas.UserCreate) -> Tuple[models.User, str]:
    token = generate_token()
    db_user = create_user(db, user, is_active=False, confirmation_token=token)
    return db_user, token


def confirm_user(db: Session, token: str) -> Tuple[models.User, bool]:
    db_user = (
        db.query(models.User)
        .filter(models.User.confirmation_token == token)
        .first()
    )
    if db_user:
        db_user.is_active = True
        db_user.confirmation_token = None
        if not db_user.last_confirmation_token:
            db_user.last_confirmation_token = token
        db.commit()
        db.refresh(db_user)
        return db_user, True

    fallback_user = (
        db.query(models.User)
        .filter(models.User.last_confirmation_token == token)
        .first()
    )
    if fallback_user and fallback_user.is_active:
        return fallback_user, False

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token inválido ou expirado")


def generate_reset_token(db: Session, user: models.User) -> str:
    token = generate_token()
    user.reset_token = token
    user.reset_token_expires_at = datetime.utcnow() + timedelta(hours=2)
    db.commit()
    db.refresh(user)
    return token


def reset_password(db: Session, token: str, new_password: str) -> None:
    user = (
        db.query(models.User)
        .filter(models.User.reset_token == token)
        .first()
    )
    if not user or not user.reset_token_expires_at or user.reset_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token inválido ou expirado")

    user.password_hash = get_password_hash(new_password)
    user.reset_token = None
    user.reset_token_expires_at = None
    db.commit()


def _expire_pending_invitations(db: Session, email: str, *, group_id: Optional[int] = None) -> None:
    query = db.query(models.Invitation).filter(
        models.Invitation.email == email,
        models.Invitation.status == models.InvitationStatus.PENDING,
    )
    if group_id is not None:
        query = query.filter(models.Invitation.group_id == group_id)
    pending_invites = query.all()
    if not pending_invites:
        return
    for invite in pending_invites:
        invite.status = models.InvitationStatus.EXPIRED
    db.commit()


def create_invitations(
    db: Session,
    invitations: List[schemas.InvitationCreate],
    *,
    group_id: int,
    role: UserRole,
) -> Tuple[List[models.Invitation], List[dict]]:
    if group_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Administrador não vinculado a um grupo")

    group = get_group_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Grupo informado não existe")

    if role == UserRole.SUPERADMIN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convites para superadmin não são suportados")

    created: List[models.Invitation] = []
    skipped: List[dict] = []

    for item in invitations:
        email = item.email.lower()
        if get_user_by_email(db, email):
            skipped.append({"email": email, "name": item.name, "reason": "email_exists"})
            _expire_pending_invitations(db, email, group_id=group_id)
            continue

        _expire_pending_invitations(db, email, group_id=group_id)

        token = generate_token()
        expires_at = datetime.utcnow() + timedelta(hours=settings.invitation_expiration_hours)
        invitation = models.Invitation(
            name=item.name,
            email=email,
            token=token,
            status=models.InvitationStatus.PENDING,
            expires_at=expires_at,
            group_id=group_id,
            role=role,
        )
        db.add(invitation)
        created.append(invitation)

    db.commit()
    for invitation in created:
        db.refresh(invitation)

    return created, skipped


def list_invitations(
    db: Session,
    *,
    group_id: Optional[int] = None,
    role: Optional[UserRole] = None,
) -> List[models.Invitation]:
    query = db.query(models.Invitation).options(joinedload(models.Invitation.group))
    if group_id is not None:
        query = query.filter(models.Invitation.group_id == group_id)
    if role is not None:
        query = query.filter(models.Invitation.role == role)
    invitations = query.order_by(models.Invitation.created_at.desc()).all()
    now = datetime.utcnow()
    dirty = False
    for invitation in invitations:
        if invitation.status == models.InvitationStatus.PENDING and invitation.expires_at < now:
            invitation.status = models.InvitationStatus.EXPIRED
            dirty = True
    if dirty:
        db.commit()
    return invitations


def create_admin_invitations(
    db: Session,
    invitations: List[schemas.SuperadminInvitationCreate],
) -> Tuple[List[models.Invitation], List[dict]]:
    grouped: dict[int, List[schemas.InvitationCreate]] = {}
    for item in invitations:
        grouped.setdefault(item.group_id, []).append(
            schemas.InvitationCreate(name=item.name, email=item.email)
        )

    all_created: List[models.Invitation] = []
    all_skipped: List[dict] = []

    for group_id, items in grouped.items():
        created, skipped = create_invitations(
            db,
            items,
            group_id=group_id,
            role=UserRole.ADMIN,
        )
        all_created.extend(created)
        for entry in skipped:
            enriched = entry.copy()
            enriched["group_id"] = group_id
            all_skipped.append(enriched)

    return all_created, all_skipped


def get_active_invitation(db: Session, token: str) -> models.Invitation:
    invitation = (
        db.query(models.Invitation)
        .options(joinedload(models.Invitation.group))
        .filter(models.Invitation.token == token)
        .first()
    )
    if not invitation:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convite inválido")

    if invitation.status == models.InvitationStatus.PENDING and invitation.expires_at < datetime.utcnow():
        invitation.status = models.InvitationStatus.EXPIRED
        db.commit()

    if invitation.status != models.InvitationStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convite inválido ou expirado")

    return invitation


def mark_invitation_accepted(db: Session, invitation: models.Invitation, user: models.User) -> None:
    invitation.status = models.InvitationStatus.ACCEPTED
    invitation.accepted_at = datetime.utcnow()
    invitation.user_id = user.id
    _expire_pending_invitations(db, invitation.email, group_id=invitation.group_id)
    db.commit()


def update_user_status(db: Session, user: models.User, status_value: UserStatus) -> models.User:
    if user.status != status_value:
        user.status = status_value
        db.commit()
        db.refresh(user)
    return user


def update_profile_image(db: Session, user: models.User, image_path: str) -> models.User:
    user.profile_image = image_path
    db.commit()
    db.refresh(user)
    return user


# Game helpers

def _resolve_convocation_deadline(game_data: schemas.GameBase) -> Optional[datetime]:
    if game_data.convocation_deadline:
        return game_data.convocation_deadline
    return datetime.utcnow() + timedelta(hours=settings.default_convocation_deadline_hours)


def create_game(db: Session, game: schemas.GameCreate, owner: models.User) -> models.Game:
    convocation_deadline = _resolve_convocation_deadline(game)

    target_group_id = owner.group_id
    if game.group_id is not None and game.group_id != target_group_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Não é possível criar partidas para outro grupo",
        )

    if target_group_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuário não está vinculado a um grupo")

    db_game = models.Game(
        name=game.name,
        location=game.location,
        scheduled_at=game.scheduled_at,
        max_players=game.max_players,
        convocation_deadline=convocation_deadline,
        auto_convocar_mensalistas=game.auto_convocar_mensalistas,
        owner_id=owner.id,
        group_id=target_group_id,
    )
    db.add(db_game)
    db.commit()
    db.refresh(db_game)

    selected_convocations = list(game.convocation_user_ids)

    if game.auto_convocar_mensalistas:
        mensalistas = (
            db.query(models.User)
            .filter(
                models.User.status == models.UserStatus.MENSALISTA,
                models.User.group_id == target_group_id,
            )
            .all()
        )
        selected_convocations.extend(user.id for user in mensalistas)

    if selected_convocations:
        deduped: List[int] = []
        seen = set()
        for user_id in selected_convocations:
            if user_id in seen:
                continue
            seen.add(user_id)
            deduped.append(user_id)
        selected_convocations = deduped
        assign_convocations(db, db_game, selected_convocations)
        db.refresh(db_game)

    return db_game


def assign_convocations(db: Session, game: models.Game, user_ids: List[int]) -> List[models.Convocation]:
    unique_user_ids = list(dict.fromkeys(user_ids))
    users = (
        db.query(models.User)
        .filter(models.User.id.in_(unique_user_ids), models.User.group_id == game.group_id)
        .all()
    )
    found_ids = {user.id for user in users}
    missing = set(unique_user_ids) - found_ids
    if missing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Users not found: {sorted(missing)}")

    existing_convocations = {conv.user_id: conv for conv in game.convocations}

    # Remove convocations that are no longer present and any related presences
    for user_id, conv in list(existing_convocations.items()):
        if user_id not in found_ids:
            db.delete(conv)
            presence = (
                db.query(models.Presence)
                .filter(models.Presence.game_id == game.id, models.Presence.user_id == user_id)
                .first()
            )
            if presence:
                db.delete(presence)

    # Add or keep convocations
    for user in users:
        if user.id not in existing_convocations:
            db.add(models.Convocation(game_id=game.id, user_id=user.id))

    db.commit()
    db.refresh(game)
    _fill_waitlist(db, game)
    return game.convocations


def get_games(db: Session, group_id: int) -> List[models.Game]:
    return (
        db.query(models.Game)
        .filter(models.Game.group_id == group_id)
        .order_by(models.Game.scheduled_at)
        .all()
    )


def get_game(db: Session, game_id: int, *, group_id: Optional[int] = None) -> models.Game:
    query = db.query(models.Game).filter(models.Game.id == game_id)
    if group_id is not None:
        query = query.filter(models.Game.group_id == group_id)
    game = query.first()
    if not game:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    return game


def delete_game(db: Session, game: models.Game) -> None:
    db.delete(game)
    db.commit()


def _compute_slot_metrics(game: models.Game) -> Tuple[int, int, int]:
    now = datetime.utcnow()
    confirmed_presences = [
        presence for presence in game.presences if presence.status == models.PresenceStatus.CONFIRMED
    ]
    used_slots = len(confirmed_presences)
    reserved_slots = sum(
        1
        for conv in game.convocations
        if conv.status == models.ConvocationStatus.PENDING
        and (game.convocation_deadline is None or game.convocation_deadline > now)
    )
    available_slots = max(game.max_players - used_slots - reserved_slots, 0)
    return used_slots, reserved_slots, available_slots


def get_slot_summary(game: models.Game) -> Tuple[int, int]:
    _, reserved, available = _compute_slot_metrics(game)
    return reserved, available


def _ensure_presence(
    db: Session,
    game_id: int,
    user_id: int,
    role: models.PresenceRole,
    status_value: models.PresenceStatus,
) -> models.Presence:
    presence = (
        db.query(models.Presence)
        .filter(models.Presence.game_id == game_id, models.Presence.user_id == user_id)
        .first()
    )
    if presence:
        presence.role = role
        presence.status = status_value
        return presence

    presence = models.Presence(
        game_id=game_id,
        user_id=user_id,
        role=role,
        status=status_value,
    )
    db.add(presence)
    return presence


def _fill_waitlist(db: Session, game: models.Game) -> List[models.Presence]:
    promoted: List[models.Presence] = []
    while True:
        _, reserved, available = _compute_slot_metrics(game)
        if available <= 0:
            break
        waiting_presence = (
            db.query(models.Presence)
            .filter(
                models.Presence.game_id == game.id,
                models.Presence.status == models.PresenceStatus.WAITING,
            )
            .order_by(models.Presence.queue_position.asc(), models.Presence.joined_at.asc())
            .first()
        )
        if not waiting_presence:
            break
        waiting_presence.status = models.PresenceStatus.CONFIRMED
        promoted.append(waiting_presence)
        db.commit()
        db.refresh(waiting_presence)
        db.refresh(game)
    return promoted


def join_as_avulso(db: Session, game_id: int, user: models.User) -> models.Presence:
    game = get_game(db, game_id, group_id=user.group_id)

    conv = (
        db.query(models.Convocation)
        .filter(models.Convocation.game_id == game.id, models.Convocation.user_id == user.id)
        .first()
    )
    if conv:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convocado deve confirmar presença pelo fluxo de convocação")

    existing_presence = (
        db.query(models.Presence)
        .filter(models.Presence.game_id == game.id, models.Presence.user_id == user.id)
        .first()
    )
    if existing_presence:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuário já inscrito neste jogo")

    _, _, available = _compute_slot_metrics(game)
    status_value = (
        models.PresenceStatus.CONFIRMED if available > 0 else models.PresenceStatus.WAITING
    )

    max_position = (
        db.query(models.Presence.queue_position)
        .filter(
            models.Presence.game_id == game.id,
            models.Presence.queue_position.isnot(None),
        )
        .order_by(models.Presence.queue_position.desc())
        .first()
    )
    next_position = (max_position[0] if max_position and max_position[0] is not None else 0) + 1

    presence = models.Presence(
        game_id=game.id,
        user_id=user.id,
        role=models.PresenceRole.AVULSO,
        status=status_value,
        queue_position=next_position,
    )
    db.add(presence)
    db.commit()
    db.refresh(presence)

    db.refresh(game)
    return presence


def confirm_convocation(db: Session, game_id: int, user: models.User) -> Tuple[models.Presence, List[models.Presence]]:
    convocation = (
        db.query(models.Convocation)
        .filter(models.Convocation.game_id == game_id, models.Convocation.user_id == user.id)
        .first()
    )
    if not convocation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Convocação não encontrada para este usuário")

    convocation.status = models.ConvocationStatus.CONFIRMED
    convocation.responded_at = datetime.utcnow()

    game = convocation.game
    db.refresh(game)

    _, reserved, available = _compute_slot_metrics(game)
    displaced: List[models.Presence] = []

    if available <= 0:
        # libera espaço removendo o último avulso promovido, mantendo a ordem original da fila
        avulso_to_wait = (
            db.query(models.Presence)
            .filter(
                models.Presence.game_id == game.id,
                models.Presence.role == models.PresenceRole.AVULSO,
                models.Presence.status == models.PresenceStatus.CONFIRMED,
            )
            .order_by(models.Presence.queue_position.desc(), models.Presence.joined_at.desc())
            .first()
        )
        if avulso_to_wait:
            avulso_to_wait.status = models.PresenceStatus.WAITING
            displaced.append(avulso_to_wait)
        else:
            available = 1

    presence = _ensure_presence(
        db,
        game_id,
        user.id,
        models.PresenceRole.CONVOKED,
        models.PresenceStatus.CONFIRMED,
    )
    db.commit()
    db.refresh(convocation)
    db.refresh(presence)
    for displaced_presence in displaced:
        db.refresh(displaced_presence)
    return presence, displaced


def decline_convocation(db: Session, game_id: int, user: models.User) -> List[models.Presence]:
    convocation = (
        db.query(models.Convocation)
        .filter(models.Convocation.game_id == game_id, models.Convocation.user_id == user.id)
        .first()
    )
    if not convocation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Convocação não encontrada para este usuário")

    convocation.status = models.ConvocationStatus.DECLINED
    convocation.responded_at = datetime.utcnow()

    presence = (
        db.query(models.Presence)
        .filter(models.Presence.game_id == game_id, models.Presence.user_id == user.id)
        .first()
    )
    if presence:
        db.delete(presence)

    db.commit()

    game = convocation.game
    db.refresh(game)
    return _fill_waitlist(db, game)


def remove_presence(
    db: Session,
    game_id: int,
    requesting_user: models.User,
    user_id: Optional[int] = None,
) -> List[models.Presence]:
    game = get_game(db, game_id, group_id=requesting_user.group_id)

    target_user_id = user_id or requesting_user.id

    presence = (
        db.query(models.Presence)
        .filter(models.Presence.game_id == game.id, models.Presence.user_id == target_user_id)
        .first()
    )
    if not presence:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Presença não encontrada")

    if requesting_user.role != models.UserRole.ADMIN and presence.user_id != requesting_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to remove this presence")

    db.delete(presence)
    db.commit()
    db.refresh(game)
    return _fill_waitlist(db, game)


def generate_game_snapshot(game: models.Game) -> schemas.GameDetail:
    reserved, available = get_slot_summary(game)

    convocations = [
        schemas.ConvocationResponse.from_orm(conv)
        for conv in sorted(
            game.convocations,
            key=lambda conv: (
                0 if conv.status == models.ConvocationStatus.CONFIRMED else 1,
                conv.user.name.lower(),
            ),
        )
    ]

    def presence_sort_key(presence: models.Presence) -> Tuple[int, int, int, datetime]:
        role_priority = 0 if presence.role == models.PresenceRole.CONVOKED else 1
        status_priority = {
            models.PresenceStatus.CONFIRMED: 0,
            models.PresenceStatus.WAITING: 1,
            models.PresenceStatus.DECLINED: 2,
        }.get(presence.status, 3)
        queue_order = (
            presence.queue_position
            if presence.status == models.PresenceStatus.WAITING and presence.queue_position is not None
            else 10**9
        )
        return (role_priority, status_priority, queue_order, presence.joined_at)

    presences = [
        schemas.PresenceResponse.from_orm(presence)
        for presence in sorted(game.presences, key=presence_sort_key)
    ]

    owner = schemas.UserPublic.from_orm(game.owner) if game.owner else None

    return schemas.GameDetail(
        id=game.id,
        name=game.name,
        location=game.location,
        scheduled_at=game.scheduled_at,
        max_players=game.max_players,
        convocation_deadline=game.convocation_deadline,
        created_at=game.created_at,
        owner=owner,
        convocations=convocations,
        presences=presences,
        reserved_slots=reserved,
        available_slots=available,
        group_id=game.group_id,
    )
