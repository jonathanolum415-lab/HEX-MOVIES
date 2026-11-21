# Hex Movies

Hex Movies is a static cinematic movie library hosted on GitHub Pages. Firebase Authentication and Cloud Firestore provide viewer accounts, a shared movie catalog, private watchlists, and owner-only catalog management.

## Hosting

The GitHub Actions workflow publishes `public/` to GitHub Pages whenever `main` changes. The expected site address is:

`https://jonathanolum415-lab.github.io/HEX-MOVIES/`

The repository must be public for GitHub Free Pages hosting. The workflow uses GitHub's Pages deploy actions and needs the repository's Pages source set to **GitHub Actions**. `actions/configure-pages` enables Pages when possible; if the first run reports Pages is disabled, set the source once in **Settings → Pages → Build and deployment → Source** and rerun the workflow.

## Firebase services and plan

- **Authentication:** email and password for viewer accounts.
- **Cloud Firestore:** public movie catalog, private profiles/watchlists, and owner role records.
- **Cloud Storage for Firebase:** not used. The app accepts HTTPS poster/watch links supplied by the owner. Firebase Storage requires Blaze, so this Spark setup does not enable uploads; `storage.rules` denies all access.
- **Cloud Functions / server APIs:** not used.

Keep the Firebase project on Spark. Do not attach a billing account or upgrade the plan. Firebase's current Storage requirement makes file uploads unavailable on Spark; use external media links that you are authorized to share.

## Configure the existing Firebase project

1. Sign in with `npx -y firebase-tools@latest login` and confirm the project with `npx -y firebase-tools@latest projects:list`.
2. Select the existing project from the repository with `npx -y firebase-tools@latest use <PROJECT_ID>`. Do not create a new project or change the billing plan.
3. Register a Firebase **Web app** if needed and copy its public client configuration into `public/firebase-config.js`. Do not place service-account keys or other server credentials in `public/`.
4. In **Authentication → Sign-in method**, enable **Email/Password**. Add `jonathanolum415-lab.github.io` to **Authorized domains**.
5. Create a **Standard Cloud Firestore** database in Native mode if one does not already exist.
6. Deploy Firestore rules and indexes only:

   ```sh
   npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes
   ```

GitHub Pages is the website host. Do not deploy Firebase Hosting or Cloud Storage.

## Private owner provisioning

There is no public admin signup or admin role selector. To provision the library owner:

1. In Firebase Console **Authentication → Users**, add or identify the owner's account and copy its UID.
2. In **Firestore → Data**, create `admins/{OWNER_UID}` with `role` (string) set to `owner`.
3. The owner signs in normally; only that pre-provisioned UID sees the management panel. Firestore rules deny client writes to `admins`, so an account cannot grant itself admin access.

Remove the admin document in Firebase Console to revoke owner access. Restrict Firebase Console access to trusted maintainers.

## Data model and rules

- `movies/{movieId}`: public catalog entry with bounded title, genre, year, rating, runtime, HTTPS poster/watch URLs, description, feature flag, and immutable creation timestamp.
- `users/{uid}`: private display profile, readable only by its owner.
- `users/{uid}/watchlist/{movieId}`: private saved film IDs.
- `admins/{uid}`: owner role record, readable only by the matching UID and never writable from the app.

`firestore.rules` validates the schema and field sizes, prevents client role creation or changes, and keeps profiles and watchlists private. `storage.rules` denies all access because Storage is not used on Spark. Review rules against the final Firebase project configuration before launch.

## Preview locally

The sample catalog works without Firebase configuration. In preview mode, watchlist choices remain in the current browser, while accounts and shared data are unavailable.

```sh
python -m http.server 8000 --directory public
```

Open `http://localhost:8000`. After Firebase is configured and Firestore rules are deployed, the same static app uses the live backend.

Only add media you own or are authorized to share.
