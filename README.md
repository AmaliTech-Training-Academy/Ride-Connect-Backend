
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
