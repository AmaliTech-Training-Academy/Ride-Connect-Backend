
# Ride Connect Backend

API for Ride Connect — an employee carpooling platform where colleagues can offer rides, browse available journeys, request seats, and manage their trips from a personal dashboard, with in-app notifications for ride activity.

## Scope

- **Authentication** — register and log in with an email address and password
- **Profile** — update profile picture, change password, and log out
- **Rides** — post, browse/search, join requests, and ride status management
- **Dashboard** — rides you’re driving and rides you’ve joined
- **Notifications** — in-app alerts for join requests, acceptances, declines, cancellations, and related updates

## Tech stack

- Node.js
- Express
- TypeScript

## Running the project

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

> Setup details (env vars, database, scripts) will be added as the project is scaffolded.

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
| Update profile picture | `POST /api/auth/update-user` | `{ "image": "<cloudinary url>" }` |
| Change password | `POST /api/auth/change-password` | `{ "currentPassword": "...", "newPassword": "...", "revokeOtherSessions": true }` |
| Log out | `POST /api/auth/sign-out` | `{}` |

- The profile picture URL is stored in the `image` column of the `users` table. Upload the file to Cloudinary first, then save the returned URL.
- Change password returns `400 INVALID_PASSWORD` when the current password is wrong and `400 PASSWORD_TOO_SHORT` when the new one is under 8 characters. With `revokeOtherSessions: true`, other devices are logged out.
- Log out deletes the session from the database and clears the cookie, so the old cookie can no longer authenticate requests.
