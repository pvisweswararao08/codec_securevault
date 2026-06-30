"""
config.py – Environment-aware application configuration.
All secrets are loaded from environment variables / .env file.
Never hard-code secrets in source code.
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class Config:
    # ── Core ──────────────────────────────────────────────────────────────
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "dev-only-secret-change-in-prod")
    DEBUG: bool = False
    TESTING: bool = False

    # ── Database ───────────────────────────────────────────────────────────
    SQLALCHEMY_DATABASE_URI: str = os.environ.get(
        "DATABASE_URL", "sqlite:///secureapp.db"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,   # reconnect on stale connections
    }

    # ── JWT ───────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = os.environ.get("JWT_SECRET_KEY", "dev-jwt-secret-change-me")
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRES: timedelta = timedelta(minutes=15)
    JWT_REFRESH_TOKEN_EXPIRES: timedelta = timedelta(days=7)
    # Tokens are sent in Authorization header (Bearer) – never stored in localStorage
    JWT_TOKEN_LOCATION: list = ["headers"]
    JWT_HEADER_NAME: str = "Authorization"
    JWT_HEADER_TYPE: str = "Bearer"

    # ── Security Headers (applied by middleware/security.py) ──────────────
    FRONTEND_ORIGIN: str = os.environ.get("FRONTEND_ORIGIN", "http://127.0.0.1:5500")

    # ── Rate limiting ─────────────────────────────────────────────────────
    RATELIMIT_DEFAULT: str = "200 per day;50 per hour"
    RATELIMIT_STORAGE_URI: str = "memory://"   # swap to Redis in prod

    # ── Account lockout ───────────────────────────────────────────────────
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_MINUTES: int = 15


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False
    # In production, ensure DATABASE_URL is a proper PostgreSQL URI.
    # Force long secrets via environment – never fall back to defaults.
    @classmethod
    def init_app(cls, app):
        assert os.environ.get("SECRET_KEY"), "SECRET_KEY env var not set!"
        assert os.environ.get("JWT_SECRET_KEY"), "JWT_SECRET_KEY env var not set!"


config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
