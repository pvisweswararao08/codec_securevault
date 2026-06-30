"""
app.py – Application factory.

Using the factory pattern (create_app) allows:
  * Clean testing with different configs
  * Avoidance of circular imports
  * Proper extension initialisation order

Run in development:
    python app.py
    Then open → http://127.0.0.1:5000  (frontend is served by Flask)

Run in production (example):
    gunicorn "app:create_app('production')" -w 4 -b 0.0.0.0:5000
"""
import logging
import os
import sys
import pathlib

from flask import Flask, jsonify, send_from_directory, send_file

from config import config
from extensions import db, bcrypt, jwt, cors, limiter
from middleware.security import apply_security_headers, register_jwt_callbacks


FRONTEND_DIR = pathlib.Path(__file__).parent.parent / "frontend"


def create_app(env: str | None = None) -> Flask:
    env = env or os.environ.get("FLASK_ENV", "development")
    app = Flask(__name__, static_folder=None)
    app.config.from_object(config.get(env, config["default"]))

    # ── Logging ──────────────────────────────────────────────────────────
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    # ── Extensions ────────────────────────────────────────────────────────
    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)

    # In development allow all origins; in production lock to configured origin
    cors_origins = "*" if env == "development" else app.config["FRONTEND_ORIGIN"]
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": cors_origins}},
        supports_credentials=(env != "development"),
    )

    # ── Security middleware ───────────────────────────────────────────────
    apply_security_headers(app)
    register_jwt_callbacks(app)

    # ── Blueprints ────────────────────────────────────────────────────────
    from routes.auth import auth_bp
    from routes.notes import notes_bp
    from routes.users import users_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(notes_bp)
    app.register_blueprint(users_bp)

    # ── Health check ──────────────────────────────────────────────────────
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "env": env}), 200

    # ── Serve frontend static files ───────────────────────────────────────
    # Flask serves the entire frontend/ folder so no separate web server is needed.
    # Visit http://127.0.0.1:5000 to open the app.
    @app.route("/")
    def index():
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.route("/<path:filename>")
    def static_files(filename):
        # Security: send_from_directory prevents path traversal
        return send_from_directory(FRONTEND_DIR, filename)

    # ── Global error handlers ─────────────────────────────────────────────
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found."}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed."}), 405

    @app.errorhandler(429)
    def rate_limit_exceeded(e):
        return jsonify(
            {"error": "Too many requests. Please slow down.", "retry_after": str(e.description)}
        ), 429

    @app.errorhandler(500)
    def internal_error(e):
        db.session.rollback()
        return jsonify({"error": "An internal error occurred."}), 500

    # ── DB initialisation ─────────────────────────────────────────────────
    with app.app_context():
        # Ensure all model tables are created
        import models.user          # noqa: F401
        import models.note          # noqa: F401
        import models.token_blocklist  # noqa: F401
        db.create_all()
        _seed_admin(app)

    return app


def _seed_admin(app: Flask) -> None:
    """Create a default admin if no users exist yet."""
    from models.user import User

    if User.query.count() == 0:
        admin = User(
            username="admin",
            email="admin@secureapp.local",
            role="admin",
        )
        admin.set_password("Admin@1234!")
        db.session.add(admin)
        db.session.commit()
        app.logger.info(
            ">> Default admin created -- username: admin / password: Admin@1234! "
            "(CHANGE THIS IN PRODUCTION)"
        )


if __name__ == "__main__":
    application = create_app()
    application.run(host="0.0.0.0", port=5000, debug=True)
