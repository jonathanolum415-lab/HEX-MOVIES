import io
import re
import tempfile
import unittest
from pathlib import Path

from app import create_app


class MovieSiteTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.app = create_app(
            {
                "TESTING": True,
                "SECRET_KEY": "test-only-secret",
                "DATABASE": str(root / "test.db"),
                "UPLOAD_FOLDER": str(root / "uploads"),
            }
        )
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def csrf_token(self, page="/setup"):
        response = self.client.get(page)
        match = re.search(
            rb'name="csrf_token" value="([^"]+)"',
            response.data,
        )
        self.assertIsNotNone(match)
        return match.group(1).decode()

    def create_admin(self):
        token = self.csrf_token()
        response = self.client.post(
            "/setup",
            data={
                "csrf_token": token,
                "username": "studio",
                "password": "a-long-test-password",
            },
            follow_redirects=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Manage your movies", response.data)

    def upload_movie(self):
        token = self.csrf_token("/admin")
        return self.client.post(
            "/admin/movies",
            data={
                "csrf_token": token,
                "title": "Test Feature",
                "genre": "Drama, Mystery",
                "year": "2024",
                "description": "A test film.",
                "video": (io.BytesIO(b"test video bytes"), "feature.mp4", "video/mp4"),
                "poster": (io.BytesIO(b"test poster bytes"), "poster.png", "image/png"),
            },
            content_type="multipart/form-data",
            follow_redirects=True,
        )

    def register_viewer(self, username="moviefan", email="fan@example.com", password="a-viewer-password"):
        return self.client.post(
            "/register",
            data={
                "csrf_token": self.csrf_token("/register"),
                "username": username,
                "email": email,
                "password": password,
                "confirm_password": password,
            },
            follow_redirects=True,
        )

    def test_setup_upload_stream_download_and_manage_movie(self):
        self.assertEqual(self.client.get("/admin").status_code, 302)
        self.create_admin()

        response = self.upload_movie()
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Test Feature", response.data)

        with self.app.app_context():
            from app import get_db

            with get_db() as conn:
                movie = conn.execute("SELECT * FROM movies").fetchone()
        self.assertEqual(movie["genre"], "Drama, Mystery")

        stream = self.client.get(f"/stream/{movie['id']}")
        self.assertEqual(stream.status_code, 200)
        self.assertEqual(stream.data, b"test video bytes")
        self.assertIn("video/mp4", stream.headers["Content-Type"])
        stream.close()
        ranged = self.client.get(f"/stream/{movie['id']}", headers={"Range": "bytes=0-3"})
        self.assertEqual(ranged.status_code, 206)
        self.assertEqual(ranged.data, b"test")
        ranged.close()
        download = self.client.get(f"/download/{movie['id']}")
        self.assertEqual(download.data, b"test video bytes")
        download.close()

        watch_page = self.client.get(f"/watch/{movie['id']}")
        self.assertIn(b"<video controls playsinline", watch_page.data)
        self.assertIn(b"Download movie", watch_page.data)
        self.assertIn(b"Watch online", self.client.get("/").data)

        token = self.csrf_token("/admin")
        update = self.client.post(
            f"/admin/movies/{movie['id']}/edit",
            data={
                "csrf_token": token,
                "title": "Updated Feature",
                "genre": "Comedy",
                "year": "2025",
                "description": "Updated.",
            },
            follow_redirects=True,
        )
        self.assertIn(b"Updated Feature", update.data)
        self.assertEqual(self.client.get("/").status_code, 200)

        token = self.csrf_token("/admin")
        deleted = self.client.post(
            f"/admin/movies/{movie['id']}/delete",
            data={"csrf_token": token},
            follow_redirects=True,
        )
        self.assertIn(b"No movies yet", deleted.data)
        self.assertEqual(self.client.get(f"/stream/{movie['id']}").status_code, 404)

    def test_login_protects_uploads_and_csrf(self):
        self.create_admin()
        self.client.post("/admin/logout", data={"csrf_token": self.csrf_token("/admin")})
        self.assertEqual(self.client.get("/admin").status_code, 302)

        login_token = self.csrf_token("/login")
        response = self.client.post(
            "/login",
            data={
                "csrf_token": login_token,
                "username": "studio",
                "password": "a-long-test-password",
            },
            follow_redirects=True,
        )
        self.assertIn(b"Manage your movies", response.data)

        self.assertEqual(self.client.post("/logout").status_code, 400)

    def test_viewer_registration_login_logout_and_admin_separation(self):
        registration_page = self.client.get("/register")
        self.assertEqual(registration_page.status_code, 200)
        self.assertIn(b"Create viewer account", registration_page.data)
        self.assertIn(b'name="confirm_password"', registration_page.data)

        response = self.register_viewer()
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Hi, moviefan", response.data)
        self.assertIn(b"Sign out", response.data)
        self.assertNotIn(b"Manage library", response.data)
        self.assertEqual(self.client.get("/admin").status_code, 302)

        with self.app.app_context():
            from app import get_db

            with get_db() as conn:
                user = conn.execute(
                    "SELECT username, email, password_hash FROM users WHERE email = ?",
                    ("fan@example.com",),
                ).fetchone()
        self.assertEqual(user["username"], "moviefan")
        self.assertNotEqual(user["password_hash"], "a-viewer-password")

        self.client.post("/logout", data={"csrf_token": self.csrf_token("/")})
        self.assertIn(b"Sign in", self.client.get("/").data)
        login = self.client.post(
            "/viewer/login",
            data={
                "csrf_token": self.csrf_token("/viewer/login"),
                "email": "FAN@example.com",
                "password": "a-viewer-password",
            },
            follow_redirects=True,
        )
        self.assertIn(b"Hi, moviefan", login.data)
        self.assertEqual(
            self.client.post(
                "/admin/movies",
                data={"csrf_token": self.csrf_token("/")},
            ).status_code,
            302,
        )

    def test_viewer_registration_rejects_duplicates_and_password_mismatch(self):
        self.register_viewer()
        self.client.post("/logout", data={"csrf_token": self.csrf_token("/")})

        duplicate = self.register_viewer(username="anotherfan")
        self.assertIn(b"already registered", duplicate.data)

        mismatch = self.client.post(
            "/register",
            data={
                "csrf_token": self.csrf_token("/register"),
                "username": "differentfan",
                "email": "different@example.com",
                "password": "a-viewer-password",
                "confirm_password": "a-different-password",
            },
            follow_redirects=True,
        )
        self.assertIn(b"passwords do not match", mismatch.data)

    def test_viewer_password_minimum_is_four_characters(self):
        registration_page = self.client.get("/register")
        self.assertIn(b'minlength="4"', registration_page.data)
        self.assertIn(b"4 characters minimum", registration_page.data)

        accepted = self.register_viewer(
            username="shortpass",
            email="short@example.com",
            password="abcd",
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertIn(b"Hi, shortpass", accepted.data)

        self.client.post("/logout", data={"csrf_token": self.csrf_token("/")})
        rejected = self.client.post(
            "/register",
            data={
                "csrf_token": self.csrf_token("/register"),
                "username": "tinyspass",
                "email": "tiny@example.com",
                "password": "abc",
                "confirm_password": "abc",
            },
            follow_redirects=True,
        )
        self.assertIn(b"at least 4 characters", rejected.data)

    def test_accepts_arbitrary_movie_extensions_and_has_no_app_upload_limit(self):
        self.create_admin()
        self.assertIsNone(self.app.config["MAX_CONTENT_LENGTH"])
        admin_page = self.client.get("/admin")
        self.assertIn(b"There is no upload-size cap in the app", admin_page.data)
        self.assertIn(b'name="video" type="file" required', admin_page.data)
        self.assertNotIn(b"500 MB", admin_page.data)
        token = self.csrf_token("/admin")
        response = self.client.post(
            "/admin/movies",
            data={
                "csrf_token": token,
                "title": "Unknown Container Feature",
                "video": (io.BytesIO(b"movie container bytes"), "feature.unknownmovie", "application/octet-stream"),
            },
            content_type="multipart/form-data",
            follow_redirects=True,
        )
        self.assertIn(b"Unknown Container Feature", response.data)
        with self.app.app_context():
            from app import get_db

            with get_db() as conn:
                movie = conn.execute(
                    "SELECT id, video_path FROM movies WHERE title = ?",
                    ("Unknown Container Feature",),
                ).fetchone()
        self.assertTrue(movie["video_path"].endswith(".unknownmovie"))
        watch_page = self.client.get(f"/watch/{movie['id']}")
        self.assertIn(b"can be downloaded", watch_page.data)
        self.assertNotIn(b"<video controls", watch_page.data)
        stream = self.client.get(f"/stream/{movie['id']}")
        self.assertEqual(stream.status_code, 415)
        download = self.client.get(f"/download/{movie['id']}")
        self.assertEqual(download.data, b"movie container bytes")
        self.assertIn("attachment", download.headers["Content-Disposition"])
        download.close()

    def test_accepts_mkv_upload_and_serves_matroska_mime_type(self):
        self.create_admin()
        token = self.csrf_token("/admin")
        response = self.client.post(
            "/admin/movies",
            data={
                "csrf_token": token,
                "title": "Matroska Feature",
                "genre": "Drama",
                "video": (io.BytesIO(b"matroska bytes"), "feature.mkv", "video/x-matroska"),
            },
            content_type="multipart/form-data",
            follow_redirects=True,
        )
        self.assertIn(b"Matroska Feature", response.data)
        with self.app.app_context():
            from app import get_db

            with get_db() as conn:
                movie = conn.execute(
                    "SELECT id FROM movies WHERE title = ?", ("Matroska Feature",)
                ).fetchone()
        response = self.client.get(f"/stream/{movie['id']}")
        self.assertEqual(response.status_code, 200)
        self.assertIn("video/x-matroska", response.headers["Content-Type"])
        self.assertEqual(response.data, b"matroska bytes")
        response.close()


if __name__ == "__main__":
    unittest.main()
