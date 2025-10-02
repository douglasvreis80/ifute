from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    jwt_secret: str = Field(default="super-secret-key", env="JWT_SECRET")
    token_expire_minutes: int = Field(default=60, env="TOKEN_EXPIRE_MINUTES")
    admin_default_user: str | None = Field(default=None, env="ADMIN_DEFAULT_USER")
    default_convocation_deadline_hours: int = Field(default=24, env="DEFAULT_CONVOCATION_DEADLINE_HOURS")
    smtp_host: str | None = Field(default=None, env="SMTP_HOST")
    smtp_port: int = Field(default=587, env="SMTP_PORT")
    smtp_user: str | None = Field(default=None, env="SMTP_USER")
    smtp_password: str | None = Field(default=None, env="SMTP_PASS")
    smtp_starttls: bool = Field(default=True, env="SMTP_STARTTLS")
    email_from: str | None = Field(default=None, env="EMAIL_FROM")
    frontend_base_url: str = Field(default="http://localhost:3000", env="FRONTEND_BASE_URL")
    invitation_expiration_hours: int = Field(default=72, env="INVITATION_EXPIRE_HOURS")


settings = Settings()
