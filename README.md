# Hex Movies

Hex Movies is a Flask-powered movie library with a cinematic responsive interface, viewer registration and sign-in, a separate admin account, movie upload/edit/delete, watch pages, and downloadable media.

## Important: use the Flask deployment for the real app

The current GitHub Pages URL serves a **static demo**. Static hosting cannot run Flask routes, connect to your database, process registration/login, or accept admin uploads. This repository includes a Render Blueprint in `render.yaml` to configure that service.

## Deploy on Render

1. Open Render and choose **New → Blueprint**. Connect this GitHub repository and select `render.yaml`.
2. The service configures a persistent disk mounted at `/var/data`. **Render's persistent disks and Starter service plan are paid; review pricing before deploying.**
3. Set `SUPABASE_DB_URL` if you want catalog and account data stored in Supabase PostgreSQL. Leave it blank to use SQLite on the persistent disk.
4. The Blueprint generates a secret session key and admin setup token. On first visit to `/setup`, use the generated `MOVIE_ADMIN_SETUP_TOKEN` environment value to create the admin account. This prevents visitors from claiming the first admin on a public server.
5. After deployment, use the Render service URL for the live app. GitHub Pages remains a static demo until it is replaced or redirected to the deployed service.

The service sets secure session cookies, a health check, and a persistent media/database directory. Movie uploads default to a 2 GB request cap. Adjust this and the disk size to fit your authorized collection.

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
- `SUPABASE_DB_URL`: PostgreSQL connection URI (optional).
- `MOVIE_UPLOAD_FOLDER`: media/poster directory (default `uploads/`).
- `MOVIE_MAX_UPLOAD_MB`: request cap in MB (default 2048).
- `MOVIE_ADMIN_SETUP_TOKEN`: secret required for first admin setup when set.
- `COOKIE_SECURE`: set `true` behind HTTPS (Render Blueprint enables this).

## Features

- First-run admin setup with an optional deployment setup token; separate admin login and logout.
- Viewer registration and email/password login. Passwords are hashed and registration requires 12+ characters.
- Admin upload, editing, poster/video replacement, and deletion.
- Search by title, genre, or year and genre filters.
- Browser playback for compatible video formats and download fallback.
- SQLite or Supabase PostgreSQL catalog, CSRF checks, poster allowlist, path-safe file serving, upload limits, and security headers.

## Data and media storage

Supabase PostgreSQL stores metadata and account password hashes, not video binaries. Uploads remain on the service's persistent disk. Use the server-only database connection string; never expose it in frontend JavaScript or commit secrets. The migration revokes table access from Supabase client roles.

Only upload content that you own or are authorized to store and share.

## Tests

Run `py -m unittest`. GitHub Actions runs tests on pushes and pull requests.
