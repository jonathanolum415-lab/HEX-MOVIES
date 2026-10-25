import mimetypes
import os
import re
import secrets
import sqlite3
import uuid
from contextlib import contextmanager
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    abort,
    current_app,
    flash,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{3,40}$")


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)

    app.config.from_mapping(
        SECRET_KEY=os.environ.get("MOVIE_SECRET_KEY") or _load_secret_key(app.instance_path),
        DATABASE=os.environ.get("MOVIE_DATABASE") or str(BASE_DIR / "movies.db"),
        UPLOAD_FOLDER=os.environ.get("MOVIE_UPLOAD_FOLDER") or str(BASE_DIR / "uploads"),
    )
    if test_config:
        app.config.update(test_config)
    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)

    with app.app_context():
        init_db()
    app.before_request(check_csrf)

    @app.context_processor
    def inject_globals():
        if "csrf_token" not in session:
            session["csrf_token"] = secrets.token_urlsafe(32)
        return {
            "site_name": "Hex Movies",
            "csrf_token": session["csrf_token"],
            "viewer_username": session.get("viewer_username"),
            "poster_art": {
                "adventure": "photo-1464822759023-fed622ff2c3b",
                "animation": "photo-1518709268805-4e9042af9f23",
                "comedy": "photo-1500530855697-b586d89ba3ee",
                "crime": "photo-1489599849927-2ee91cede3ba",
                "drama": "photo-1470252649378-9c29740c9fa8",
                "fantasy": "photo-1470770841072-f978cf4d019e",
                "sci-fi": "photo-1446776811953-b23d57bd21aa",
                "science fiction": "photo-1446776811953-b23d57bd21aa",
                "thriller": "photo-1489599849927-2ee91cede3ba",
            },
        }

    @app.get("/")
    def home():
        with get_db() as conn:
            movies = conn.execute(
                "SELECT id, title, genre, year, description, poster FROM movies ORDER BY created_at DESC"
            ).fetchall()
        genres = sorted(
            {
                genre.strip()
                for movie in movies
                for genre in (movie["genre"] or "").split(",")
                if genre.strip()
            },
            key=str.casefold,
        )
        return render_template("index.html", movies=movies, genres=genres)

    @app.route("/setup", methods=["GET", "POST"])
    def setup():
        if has_admin():
            return redirect(url_for("login"))
        if request.method == "POST":
            username = request.form.get("username", "").strip()
            password = request.form.get("password", "")
            if len(username) < 3 or len(username) > 80:
                flash("Choose a username between 3 and 80 characters.", "error")
            elif len(password) < 12:
                flash("Choose a password with at least 12 characters.", "error")
            else:
                with get_db() as conn:
                    cursor = conn.execute(
                        "INSERT INTO admins (username, password_hash) VALUES (?, ?)",
                        (username, generate_password_hash(password)),
                    )
                    conn.commit()
                session["admin_id"] = cursor.lastrowid
                flash("Admin account created. You can now manage your library.", "success")
                return redirect(url_for("admin"))
        return render_template("auth.html", mode="setup")

    @app.route("/register", methods=["GET", "POST"])
    def register():
        if session.get("viewer_id"):
            return redirect(url_for("home"))
        if request.method == "POST":
            username = request.form.get("username", "").strip()
            email = request.form.get("email", "").strip().lower()
            password = request.form.get("password", "")
            confirm_password = request.form.get("confirm_password", "")
            error = None
            if not USERNAME_PATTERN.fullmatch(username):
                error = "Use a username of 3–40 letters, numbers, dots, dashes, or underscores."
            elif len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
                error = "Enter a valid email address."
            elif len(password) < 4:
                error = "Choose a password with at least 4 characters."
            elif password != confirm_password:
                error = "The passwords do not match."

            if error:
                flash(error, "error")
            else:
                try:
                    with get_db() as conn:
                        cursor = conn.execute(
                            """
                            INSERT INTO users (username, email, password_hash)
                            VALUES (?, ?, ?)
                            """,
                            (username, email, generate_password_hash(password)),
                        )
                        conn.commit()
                except sqlite3.IntegrityError:
                    flash("That username or email address is already registered.", "error")
                else:
                    session.clear()
                    session["viewer_id"] = cursor.lastrowid
                    session["viewer_username"] = username
                    session["csrf_token"] = secrets.token_urlsafe(32)
                    flash("Your Hex Movies account is ready.", "success")
                    return redirect(url_for("home"))
        return render_template("auth.html", mode="register")

    @app.route("/viewer/login", methods=["GET", "POST"])
    def viewer_login():
        if session.get("viewer_id"):
            return redirect(url_for("home"))
        if request.method == "POST":
            email = request.form.get("email", "").strip().lower()
            password = request.form.get("password", "")
            with get_db() as conn:
                user = conn.execute(
                    "SELECT id, username, password_hash FROM users WHERE email = ?",
                    (email,),
                ).fetchone()
            if user and check_password_hash(user["password_hash"], password):
                session.clear()
                session["viewer_id"] = user["id"]
                session["viewer_username"] = user["username"]
                session["csrf_token"] = secrets.token_urlsafe(32)
                return redirect(url_for("home"))
            flash("Those email and password details don't match.", "error")
        return render_template("auth.html", mode="viewer_login")

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if session.get("admin_id"):
            return redirect(url_for("admin"))
        if not has_admin():
            return redirect(url_for("setup"))
        if request.method == "POST":
            username = request.form.get("username", "").strip()
            password = request.form.get("password", "")
            with get_db() as conn:
                admin = conn.execute(
                    "SELECT id, password_hash FROM admins WHERE username = ?", (username,)
                ).fetchone()
            if admin and check_password_hash(admin["password_hash"], password):
                session.clear()
                session["admin_id"] = admin["id"]
                session["csrf_token"] = secrets.token_urlsafe(32)
                return redirect(url_for("admin"))
            flash("Those login details don't match.", "error")
        return render_template("auth.html", mode="login")

    @app.post("/admin/logout")
    @admin_required
    def admin_logout():
        session.clear()
        return redirect(url_for("home"))

    @app.post("/logout")
    @viewer_required
    def viewer_logout():
        session.clear()
        return redirect(url_for("home"))

    @app.get("/admin")
    @admin_required
    def admin():
        with get_db() as conn:
            movies = conn.execute("SELECT * FROM movies ORDER BY created_at DESC").fetchall()
        return render_template("admin.html", movies=movies)

    @app.post("/admin/movies")
    @admin_required
    def create_movie():
        details = read_movie_form()
        if isinstance(details, str):
            flash(details, "error")
            return redirect(url_for("admin"))

        video = request.files.get("video")
        poster = request.files.get("poster")
        if not video or not video.filename:
            flash("Choose a movie video file to upload.", "error")
            return redirect(url_for("admin"))
        if poster and poster.filename and not allowed_file(poster.filename, IMAGE_EXTENSIONS):
            flash("Poster must be a JPG, PNG, WebP, or GIF image.", "error")
            return redirect(url_for("admin"))
        video_name = save_upload(video)
        poster_name = save_upload(poster, IMAGE_EXTENSIONS) if poster and poster.filename else None
        try:
            with get_db() as conn:
                conn.execute(
                    """
                    INSERT INTO movies (title, genre, year, description, poster, video_path)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (*details, poster_name, video_name),
                )
                conn.commit()
        except sqlite3.Error:
            remove_upload(video_name)
            if poster_name:
                remove_upload(poster_name)
            current_app.logger.exception("Could not save movie metadata")
            flash("The movie couldn't be saved. Please try again.", "error")
            return redirect(url_for("admin"))

        flash(f"{details[0]} was added to your library.", "success")
        return redirect(url_for("admin"))

    @app.post("/admin/movies/<int:movie_id>/edit")
    @admin_required
    def edit_movie(movie_id):
        details = read_movie_form()
        if isinstance(details, str):
            flash(details, "error")
            return redirect(url_for("admin"))
        with get_db() as conn:
            existing = conn.execute(
                "SELECT * FROM movies WHERE id = ?", (movie_id,)
            ).fetchone()
        if not existing:
            abort(404)

        video = request.files.get("video")
        poster = request.files.get("poster")
        if poster and poster.filename and not allowed_file(poster.filename, IMAGE_EXTENSIONS):
            flash("Poster must be a JPG, PNG, WebP, or GIF image.", "error")
            return redirect(url_for("admin"))

        new_video = save_upload(video) if video and video.filename else existing["video_path"]
        new_poster = save_upload(poster, IMAGE_EXTENSIONS) if poster and poster.filename else existing["poster"]
        try:
            with get_db() as conn:
                conn.execute(
                    """
                    UPDATE movies SET title = ?, genre = ?, year = ?, description = ?,
                        poster = ?, video_path = ? WHERE id = ?
                    """,
                    (*details, new_poster, new_video, movie_id),
                )
                conn.commit()
        except sqlite3.Error:
            if new_video != existing["video_path"]:
                remove_upload(new_video)
            if new_poster != existing["poster"] and new_poster:
                remove_upload(new_poster)
            current_app.logger.exception("Could not update movie metadata")
            flash("The movie couldn't be updated. Please try again.", "error")
            return redirect(url_for("admin"))

        if new_video != existing["video_path"]:
            remove_upload(existing["video_path"])
        if new_poster != existing["poster"] and existing["poster"]:
            remove_upload(existing["poster"])
        flash(f"{details[0]} was updated.", "success")
        return redirect(url_for("admin"))

    @app.post("/admin/movies/<int:movie_id>/delete")
    @admin_required
    def delete_movie(movie_id):
        with get_db() as conn:
            movie = conn.execute("SELECT * FROM movies WHERE id = ?", (movie_id,)).fetchone()
            if not movie:
                abort(404)
            conn.execute("DELETE FROM movies WHERE id = ?", (movie_id,))
            conn.commit()
        remove_upload(movie["video_path"])
        if movie["poster"]:
            remove_upload(movie["poster"])
        flash(f"{movie['title']} was removed from your library.", "success")
        return redirect(url_for("admin"))

    @app.get("/watch/<int:movie_id>")
    def watch_movie(movie_id):
        movie = find_movie(movie_id)
        video_path = existing_upload(movie["video_path"])
        mime_type = video_mime(video_path)
        return render_template(
            "watch.html",
            movie=movie,
            video_mime=mime_type,
            can_stream=mime_type.startswith("video/"),
        )

    @app.get("/stream/<int:movie_id>")
    def stream_movie(movie_id):
        movie = find_movie(movie_id)
        video_path = existing_upload(movie["video_path"])
        mime_type = video_mime(video_path)
        if not mime_type.startswith("video/"):
            abort(415, description="This file type can be downloaded but is not streamable in a web browser.")
        return send_from_directory(
            app.config["UPLOAD_FOLDER"],
            video_path.name,
            mimetype=mime_type,
            conditional=True,
        )

    @app.get("/download/<int:movie_id>")
    def download_movie(movie_id):
        movie = find_movie(movie_id)
        video_path = existing_upload(movie["video_path"])
        return send_from_directory(
            app.config["UPLOAD_FOLDER"],
            video_path.name,
            as_attachment=True,
            download_name=f"{secure_filename(movie['title']) or 'movie'}{video_path.suffix.lower()}",
            mimetype="application/octet-stream",
            conditional=True,
        )

    @app.get("/uploads/<path:filename>")
    def serve_upload(filename):
        path = (Path(app.config["UPLOAD_FOLDER"]) / filename).resolve()
        upload_root = Path(app.config["UPLOAD_FOLDER"]).resolve()
        if (
            upload_root not in path.parents
            or not path.is_file()
            or not allowed_file(path.name, IMAGE_EXTENSIONS)
        ):
            abort(404)
        return send_from_directory(upload_root, path.name)

    @app.errorhandler(413)
    def upload_too_large(_error):
        flash(
            "The web server rejected this request. The app has no configured upload size cap, "
            "but server, proxy, or available-storage limits may still apply.",
            "error",
        )
        return redirect(url_for("admin" if session.get("admin_id") else "home"))

    @app.after_request
    def add_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        return response

    return app


def _load_secret_key(instance_path):
    secret_file = Path(instance_path) / "secret_key"
    if secret_file.exists():
        return secret_file.read_text(encoding="ascii")
    value = secrets.token_hex(32)
    secret_file.write_text(value, encoding="ascii")
    return value


@contextmanager
def get_db():
    conn = sqlite3.connect(current_app.config["DATABASE"])
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS movies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                genre TEXT,
                year INTEGER,
                description TEXT,
                poster TEXT,
                video_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        for movie in conn.execute("SELECT id, poster, video_path FROM movies").fetchall():
            poster = Path((movie["poster"] or "").replace("\\", "/")).name or None
            video = Path((movie["video_path"] or "").replace("\\", "/")).name or None
            if poster != movie["poster"] or video != movie["video_path"]:
                conn.execute(
                    "UPDATE movies SET poster = ?, video_path = ? WHERE id = ?",
                    (poster, video, movie["id"]),
                )
        conn.commit()


def has_admin():
    with get_db() as conn:
        return conn.execute("SELECT 1 FROM admins LIMIT 1").fetchone() is not None


def check_csrf():
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        token = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token", "")
        expected = session.get("csrf_token", "")
        if not expected or not secrets.compare_digest(token, expected):
            abort(400, description="Invalid or missing form token. Refresh and try again.")


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin_id"):
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


def viewer_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("viewer_id"):
            return redirect(url_for("viewer_login"))
        return view(*args, **kwargs)

    return wrapped


def allowed_file(filename, extensions):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in extensions


def save_upload(file_storage, extensions=None):
    original_name = secure_filename(file_storage.filename)
    extension = Path(original_name).suffix.lower()
    if extensions is not None and not allowed_file(original_name, extensions):
        abort(400, description="Unsupported file type.")
    if not re.fullmatch(r"\.[a-z0-9]{1,16}", extension):
        extension = ".bin"
    filename = f"{uuid.uuid4().hex}.{extension}"
    file_storage.save(Path(current_app.config["UPLOAD_FOLDER"]) / filename)
    return filename


def remove_upload(filename):
    if not filename:
        return
    path = (Path(current_app.config["UPLOAD_FOLDER"]) / filename).resolve()
    upload_root = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
    if upload_root not in path.parents:
        current_app.logger.error("Refusing to remove a file outside the upload directory")
        return
    try:
        path.unlink(missing_ok=True)
    except OSError:
        current_app.logger.exception("Could not remove uploaded media file")


def find_movie(movie_id):
    with get_db() as conn:
        movie = conn.execute("SELECT * FROM movies WHERE id = ?", (movie_id,)).fetchone()
    if movie is None:
        abort(404)
    return movie


def existing_upload(filename):
    path = (Path(current_app.config["UPLOAD_FOLDER"]) / filename).resolve()
    upload_root = Path(current_app.config["UPLOAD_FOLDER"]).resolve()
    if upload_root not in path.parents or not path.is_file():
        abort(404, description="Movie file not found.")
    return path


def video_mime(path):
    mime_type = mimetypes.guess_type(path.name)[0]
    return mime_type if mime_type and mime_type.startswith("video/") else "application/octet-stream"


def read_movie_form():
    title = request.form.get("title", "").strip()
    genre = request.form.get("genre", "").strip()
    year_value = request.form.get("year", "").strip()
    description = request.form.get("description", "").strip()
    if not title or len(title) > 200:
        return "Enter a movie title between 1 and 200 characters."
    if len(genre) > 120 or len(description) > 5000:
        return "Genre or description is too long."
    try:
        year = int(year_value) if year_value else None
    except ValueError:
        return "Enter a valid release year."
    if year is not None and not 1888 <= year <= 2100:
        return "Release year must be between 1888 and 2100."
    return title, genre, year, description


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")), debug=False)
