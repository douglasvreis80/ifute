import logging
import smtplib
from email.message import EmailMessage
from typing import Optional

from .config import settings

logger = logging.getLogger(__name__)


def send_email(subject: str, to_email: str, body: str) -> None:
    if not settings.smtp_host or not settings.email_from:
        logger.warning("SMTP settings not configured; skipping email to %s", to_email)
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.email_from
    message["To"] = to_email
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            if settings.smtp_starttls:
                server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("Failed to send email to %s: %s", to_email, exc)


def build_confirmation_body(token: str) -> str:
    confirm_link = f"{settings.frontend_base_url.rstrip('/')}/confirm-account?token={token}"
    return (
        "Olá!\n\n"
        "Recebemos um pedido de criação de conta para este e-mail. "
        "Confirme seu cadastro acessando o link a seguir:\n"
        f"{confirm_link}\n\n"
        "Se você não solicitou este cadastro, ignore esta mensagem."
    )


def build_reset_body(token: str) -> str:
    reset_link = f"{settings.frontend_base_url.rstrip('/')}/reset-password?token={token}"
    return (
        "Olá!\n\n"
        "Recebemos um pedido para redefinir sua senha. "
        "Conclua o processo acessando o link:\n"
        f"{reset_link}\n\n"
        "Se você não solicitou a redefinição, apenas ignore esta mensagem."
    )


def build_invitation_body(name: str, token: str, expires_at: Optional[str] = None) -> str:
    register_link = f"{settings.frontend_base_url.rstrip('/')}/register?token={token}"
    expiry_notice = (
        f"Este link expira em {expires_at}.\n\n"
        if expires_at
        else "Este link expira em breve.\n\n"
    )
    body = (
        f"Olá, {name}!\n\n"
        "Você foi convidado para participar da Footy Friends. "
        "Complete seu cadastro acessando o link abaixo:\n"
        f"{register_link}\n\n"
    )
    body += expiry_notice
    body += (
        "Após concluir o cadastro, você poderá confirmar presença nas partidas e receber convocações.\n"
        "Se não reconhece este convite, ignore esta mensagem."
    )
    return body


def send_confirmation_email(to_email: str, token: str) -> None:
    send_email("Confirme sua conta", to_email, build_confirmation_body(token))


def send_reset_email(to_email: str, token: str) -> None:
    send_email("Redefinição de senha", to_email, build_reset_body(token))


def send_invitation_email(to_email: str, name: str, token: str, expires_at: Optional[str] = None) -> None:
    send_email("Convite para Footy Friends", to_email, build_invitation_body(name, token, expires_at))
