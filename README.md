# Ride Connect Backend

API for Ride Connect — an employee carpooling platform where colleagues can offer rides, browse available journeys, request seats, and manage their trips from a personal dashboard, with in-app notifications for ride activity.

## Scope

- **Authentication** — register and log in with a work email
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

## Database setup

The database layer (Drizzle ORM + Better Auth on PostgreSQL) is wired up, but you need a real Postgres instance and a few env vars before it'll run.

1. Provision a Postgres database (AWS RDS, Aurora, or self-managed — whatever you're using) and get its connection string.
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — your Postgres connection string
   - `DATABASE_SSL` — leave `true` for AWS-hosted Postgres, set to `false` for local Postgres without SSL
   - `BETTER_AUTH_SECRET` — a long random string (e.g. `openssl rand -base64 32`)
   - `BETTER_AUTH_URL` — defaults to `http://localhost:3000`, fine for local dev
3. Run the initial migration:
   ```bash
   npm run db:migrate
   ```

That creates the `user`, `session`, `account`, `verification` tables (from Better Auth) plus `rides` and `ride_requests`.

### Changing the schema later

1. Edit the relevant file in `src/db/schema/`
2. Generate a migration: `npm run db:generate`
3. Review the generated SQL in `drizzle/`
4. Apply it: `npm run db:migrate`

Other useful scripts: `npm run db:studio` (browse the DB in Drizzle Studio), `npm run auth:generate` (regenerate `src/db/schema/auth.schema.ts` after changing Better Auth's config in `src/lib/auth.ts`).
