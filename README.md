# Hex Movies

A responsive movie library with local uploads, an SQLite catalog, admin login, genre filters, cinematic artwork, and an in-browser video player with downloads.

## Run locally

1. Install Python 3.10 or newer.
2. Install the dependency: `py -m pip install -r requirements.txt`
3. Start the app: `py app.py`
4. Visit [http://127.0.0.1:5000](http://127.0.0.1:5000).
5. On first visit, create the admin account. Use a unique password of at least 12 characters.
6. Sign in and open **Manage library** to upload movies.

Movie metadata is stored in `movies.db`; uploaded movie and poster files are stored in `uploads/`. Movie uploads accept any file extension and have no app-configured size limit. Actual upload capacity is still limited by available disk space and any web server, reverse proxy, hosting provider, or browser constraints.

## Features

- First-run admin account setup; password hashes are stored instead of plaintext passwords.
- Public viewer registration and email/password sign-in, stored separately from admin accounts.
- Admin sign-in, sign-out, movie upload, metadata editing, replacement files, and deletion.
- Public movie catalog with live search by title, genre, or year and genre filters.
- HTML5 player with browser-native playback controls for recognized video MIME types and a download link for all uploaded formats. Playback depends on the browser and installed codecs; use the download link if a file cannot play in the browser.
- SQLite-backed catalog, local media storage, CSRF protection, poster file-type allowlists, and path-safe media serving.
- Responsive catalog, admin, and player pages under Hex Movies branding.

Only upload media that you own or are authorized to store and share. This development server is intended for personal use on your computer. It is not configured for public production hosting; do not expose it to the internet without adding production hosting, HTTPS, stronger operational controls, and a review of your authorization model.

## Test

Run the included application tests with `py -m unittest`.
