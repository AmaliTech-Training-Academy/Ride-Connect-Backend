# Ride Connect Backend

API for Ride Connect — an employee carpooling platform where colleagues can offer rides, browse available journeys, request seats, and manage their trips from a personal dashboard, with in-app notifications for ride activity.

## Scope

- **Authentication** — register and log in with an email address and password
- **Profile** — update profile picture, change password, and log out
- **Rides** — post, browse/search, join requests, and ride status management
- **Dashboard** — rides you’re driving and rides you’ve joined
- **Notifications** — in-app alerts for join requests, acceptances, declines, cancellations, and related updates

## Tech stack

- Node.js 20+ and TypeScript
- Express
- PostgreSQL with Drizzle ORM (migrations in `drizzle/`)
- better-auth for sessions and email/password credentials
- Zod for request validation and the OpenAPI spec
- Vitest for tests, Scalar for the API reference at `/api/docs`

## Prerequisites

- **Node.js 20 or newer** — `.nvmrc` pins `20`, and `package.json` requires `>=20`. If you use nvm, run `nvm use`.
- **PostgreSQL 18** — matching what CI and the deployed stack run. Any local install or a `docker run postgres:18` will do.
- **npm** — the repo ships a `package-lock.json`.

## Setup

```bash
git clone https://github.com/AmaliTech-Training-Academy/Ride-Connect-Backend.git
cd Ride-Connect-Backend

# Install dependencies (npm ci for a lockfile-exact install)
npm install

# Create your local environment file
cp .env.example .env
```

Then open `.env` and fill in the values described below. `.env` holds real secrets and is gitignored — only `.env.example` is committed.

## Environment variables

Every variable below comes from `.env.example`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string used by the app and by drizzle-kit. |
| `TEST_DATABASE_URL` | Yes, for tests | — | Separate database for the test suite. Tests truncate tables, so it must never point at the development database. |
| `BETTER_AUTH_SECRET` | Yes | — | Secret better-auth signs session tokens with. Must be at least 32 characters. |
| `BETTER_AUTH_URL` | Yes | — | Public base URL better-auth resolves its routes against, e.g. `http://localhost:3000`. |
| `PORT` | No | `3000` | HTTP port the Express server listens on. |
| `TRUSTED_ORIGINS` | No | empty | Comma-separated browser origins allowed to call the API (CORS). Empty allows no cross-origin request. |
| `DOCS_ENABLED` | No | `true` | Set to `false` to stop serving the API reference at `/api/docs`. |
| `ALLOWED_EMAIL_DOMAINS` | No | `amalitech.com,amalitechtraining.org` | Comma-separated domains allowed to register. Sign-up from any other domain is rejected. |
| `AWS_REGION` | Yes | — | Region of the avatar bucket, e.g. `eu-west-1`. |
| `S3_BUCKET` | Yes | — | S3 bucket that stores user avatars. |
| `MEDIA_BASE_URL` | No | `https://<S3_BUCKET>.s3.<AWS_REGION>.amazonaws.com` | Public base URL saved avatar URLs are built from. |

Notes:

- **Never commit `.env`** or paste real secrets into committed files.
- **List-style variables** (`TRUSTED_ORIGINS`, `ALLOWED_EMAIL_DOMAINS`) are comma-separated: `http://localhost:3000,http://localhost:5173`. Entries are trimmed, and email domains are lowercased before matching.
- Generate a secret with:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

- Locally the AWS SDK also needs credentials to sign uploads: set `AWS_PROFILE`, or `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. On EC2 it uses the instance role. Tests never reach AWS.
- `NODE_ENV` (`development` | `test` | `production`) is also read by the config schema and defaults to `development`. It is not listed in `.env.example` and you normally do not need to set it.

## Database

The app does not create its own database. Create the two databases and point the environment at them:

```bash
createdb rideconnect_dev
createdb rideconnect_test
```

Set `DATABASE_URL` to the first and `TEST_DATABASE_URL` to the second in `.env`:

```bash
DATABASE_URL="postgresql://<user>:<password>@localhost:5432/rideconnect_dev"
TEST_DATABASE_URL="postgresql://<user>:<password>@localhost:5432/rideconnect_test"
```

Apply the migrations:

```bash
# Development database
npm run db:migrate

# Test database — run this before the first test run and after any schema change
npm run db:migrate:test
```

Other database scripts:

| Script | What it does |
| --- | --- |
| `npm run db:generate` | Generates a new migration from changes to `src/db/schema.ts`. |
| `npm run db:studio` | Opens Drizzle Studio against `DATABASE_URL`. |
| `npm run db:migrate:deploy` | Runs the compiled migration script (`node dist/db/migrate.js`) against `DATABASE_URL`. Used by the deploy workflow, after `npm run build`. |

After editing `src/db/schema.ts`, run `npm run db:generate` to create the migration, then `npm run db:migrate` (and `npm run db:migrate:test`) to apply it.

There is **no seed script** — the database starts empty. Register a user through the API instead, as shown in the walkthrough below.

## Running

```bash
# Development server with reload on change
npm run dev

# Production-style run
npm run build
npm start
```

The server logs `Server listening on port <PORT>` once it is up. Start it with `npm run dev` and leave it running for the walkthrough below.

## Testing

Tests run against `TEST_DATABASE_URL` and truncate tables, so migrate the test database first:

```bash
# Once, and again after any schema change
npm run db:migrate:test

# Run the suite
npm test
```

Also available:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run lint:fix    # eslint . --fix
```

## API docs

With the server running and `DOCS_ENABLED` left at its default, the interactive reference is at:

[http://localhost:3000/api/docs](http://localhost:3000/api/docs)

It is served by Scalar and pulls two specs: the app's own routes from `/api/docs/openapi.json`, and the auth endpoints under an "Auth" tab, generated by better-auth. Set `DOCS_ENABLED=false` to stop serving it.

## Usage walkthrough

All commands below assume the server is running on the default port and that your email uses an allowed domain.

**1. Sign up.** Registration is restricted to `@amalitech.com` and `@amalitechtraining.org` addresses.

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"you@amalitech.com","password":"Passw0rd123","name":"Your Name"}'
```

```json
{
  "token": "…",
  "user": { "id": "…", "name": "Your Name", "email": "you@amalitech.com", "image": null }
}
```

**2. Sign in and save the session cookie.** Every endpoint below needs it.

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"you@amalitech.com","password":"Passw0rd123"}'
```

**3. Publish a ride.**

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/rides \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "Kumasi",
    "destination": "Accra",
    "departureDate": "2026-12-01",
    "departureTime": "07:30",
    "availableSeats": 3,
    "office": "KUMASI",
    "routeDescription": "Via Bekwai"
  }'
```

`201 Created`:

```json
{
  "success": true,
  "message": "Ride created successfully",
  "data": {
    "id": "…",
    "driverId": "…",
    "driverName": "Your Name",
    "driverImage": null,
    "origin": "Kumasi",
    "destination": "Accra",
    "routeDescription": "Via Bekwai",
    "departureAt": "2026-12-01T07:30:00.000Z",
    "totalSeats": 3,
    "availableSeats": 3,
    "status": "OPEN",
    "office": "KUMASI",
    "createdAt": "…"
  }
}
```

**4. Browse the rides you could join.**

```bash
curl -b cookies.txt "http://localhost:3000/api/rides?office=KUMASI&limit=5"
```

```json
{ "success": true, "message": "Rides fetched successfully", "data": [ { "id": "…", "status": "OPEN" } ] }
```

Response shapes:

- App routes answer with `{ "success": true, "message": "…", "data": … }`, and errors with `{ "success": false, "message": "…" }`.
- Routes under `/api/auth/*` are handled by better-auth and return its own shapes, not the envelope above.
- `departureDate` (`YYYY-MM-DD`) and `departureTime` (`HH:MM`) are combined as UTC, and the departure must be in the future. `office` is one of `KUMASI`, `ACCRA`, `TAKORADI`, and `availableSeats` is between 1 and 8.
- The full route list — requests, accept/decline, notifications, and the dashboard — is in `/api/docs`.

## Registration is restricted to AmaliTech addresses

Sign-up only accepts `@amalitech.com` and `@amalitechtraining.org` addresses. The rule is
enforced in the backend, on the `users` model itself (better-auth's `user.create.before`
hook), so calling `POST /api/auth/sign-up/email` directly cannot get around it. The allowed
domains live in one place, `ALLOWED_EMAIL_DOMAINS` in the environment (see `.env.example`),
and default to `amalitech.com,amalitechtraining.org`.

Only exact matches pass: subdomains (`user@mail.amalitech.com`) and look-alikes
(`user@notamalitech.com`, `user@amalitech.com.evil.com`, `user@amalitech.org`) are rejected.
A rejected attempt writes no user and no session, and is answered with:

```json
403 Forbidden
{ "message": "Registration is restricted to @amalitech.com or @amalitechtraining.org email addresses.", "code": "EMAIL_DOMAIN_NOT_ALLOWED" }
```

Sign-in is unaffected — accounts that already exist keep working whatever their domain.

## Profile endpoints

These are provided by better-auth under `/api/auth`. All of them need the session cookie, so call them with `credentials: 'include'`.

| Action | Endpoint | Body |
| --- | --- | --- |
| Get current user (includes `image`) | `GET /api/auth/get-session` | — |
| Change password | `POST /api/auth/change-password` | `{ "currentPassword": "...", "newPassword": "...", "revokeOtherSessions": true }` |
| Log out | `POST /api/auth/sign-out` | `{}` |

- The profile picture URL is stored in the `image` column of the `users` table. Set it with the avatar endpoints below.
- Change password returns `400 INVALID_PASSWORD` when the current password is wrong and `400 PASSWORD_TOO_SHORT` when the new one is under 8 characters. With `revokeOtherSessions: true`, other devices are logged out.
- Log out deletes the session from the database and clears the cookie, so the old cookie can no longer authenticate requests.

## Profile picture upload

Avatars live in S3. The browser uploads the file straight to the bucket; the API only signs the upload and saves the result.

1. `POST /api/users/me/avatar/upload` with `{ "contentType": "image/jpeg" }` (`image/jpeg`, `image/png`, or `image/webp`). The response carries `url`, `fields`, and `key`.
2. Send a `multipart/form-data` `POST` to `url` with every entry of `fields` first and the file last, under the name `file`. Do not send the session cookie. S3 answers `204`. Files over `maxBytes` (5 MB) or of a different type are rejected, and the form expires after `expiresIn` seconds.
3. `PUT /api/users/me/avatar` with `{ "key": "<key from step 1>" }`. The response's `image` is the public URL, now also returned by `get-session`. The previous S3 avatar is deleted.

```js
const { data } = await api.post('/users/me/avatar/upload', { contentType: file.type });
const form = new FormData();
Object.entries(data.fields).forEach(([name, value]) => form.append(name, value));
form.append('file', file);
await fetch(data.url, { method: 'POST', body: form });
await api.put('/users/me/avatar', { key: data.key });
```

Images uploaded to Cloudinary before this keep working; they are replaced the next time the user changes their picture.

## Contributing

Branch names and commit messages are enforced in CI (see `PR_RULES.md`):

- Branches: `feat/<us-id>-short-desc` (e.g. `feat/t79-readme-setup-guide`) or `fix/<short-desc>`.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, …).

Check both before opening a pull request:

```bash
npm run check:branch
npm run check:commits
```
