# Hex Movies

Hex Movies is a Flask-powered movie library with viewer registration and sign-in, a separate admin account, movie upload/edit/delete, watch pages, and downloads.

## Render Free deployment

The Render Blueprint uses the **Free web service plan** only. It does not create paid services or persistent disks.

1. In Render, create a Blueprint from this repository and use `render.yaml`.
2. Review the plan and confirm the web service is set to **Free**. No disk is provisioned.
3. The Blueprint generates a session secret and admin setup token. Retrieve `MOVIE_ADMIN_SETUP_TOKEN` from the service's Environment settings, then use it on first visit to `/setup`.
4. Use the Render service URL for the live Flask app. GitHub Pages is a static demo and cannot run the backend.

### Free-plan limitations

Render Free web services sleep after inactivity and use an ephemeral filesystem. This means the included SQLite database, uploaded movies, and posters may be lost on redeploy, restart, or instance replacement. This free-only configuration is suitable for functional testing/demo use, **not reliable permanent storage**. No persistent disk is configured. Upload limit is reduced to 512 MB to avoid overwhelming a small free instance.

For persistence without paid Render hosting, configure a separate free PostgreSQL provider and free object storage, then add their credentials. These must be set up and tested separately before relying on user accounts or uploaded media.

## Run locally

1. Install Python 3.10+.
2. `py -m pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and set optional variables.
4. Run `py app.py`.
5. Visit `http://127.0.0.1:5000` and create your first admin account with a password of at least 12 characters.
6. Sign in and open **Manage library** to upload.

## Configuration

- `MOVIE_SECRET_KEY`: session signing key.
- `MOVIE_DATABASE`: SQLite path (default `movies.db`).
- `SUPABASE_DB_URL`: server-side PostgreSQL connection URI (optional).
- `MOVIE_UPLOAD_FOLDER`: media/poster directory (default `uploads/`).
- `MOVIE_MAX_UPLOAD_MB`: upload request limit in MB (Render Free Blueprint: 512 MB).
- `MOVIE_ADMIN_SETUP_TOKEN`: secret required for first admin setup when set.
- `COOKIE_SECURE`: set `true` behind HTTPS (Render Blueprint enables this).

## Features

- Secure first-run admin setup and separate admin login/logout.
- Viewer registration and email/password login; passwords are hashed and require 12+ characters.
- Admin upload, editing, poster/video replacement, and deletion.
- Search by title, genre, or year and genre filters.
- Browser playback for compatible video formats and download fallback.
- SQLite or Supabase PostgreSQL catalog, CSRF checks, poster allowlist, path-safe file serving, upload limits, and security headers.

## Storage notes

Supabase PostgreSQL stores catalog and account metadata only; video files need object storage or a persistent filesystem. Never expose server-only database/storage secrets in frontend JavaScript or commit them. Apply database migrations as appropriate.

Only upload content you own or are authorized to store and share.

## Tests

Run `py -m unittest`. GitHub Actions runs tests on pushes and pull requests.
