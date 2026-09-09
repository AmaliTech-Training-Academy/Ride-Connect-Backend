# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository is not yet scaffolded — it currently contains only this file, a README, and git metadata. There is no `package.json`, source directory, build tooling, linter, or test suite yet. Do not assume any of the tooling below exists until you've verified it's been added; update this file once real commands and structure are in place.

## Project overview

Ride Connect Backend is the API for Ride Connect, an employee carpooling platform where colleagues can offer rides, browse available journeys, request seats, and manage trips from a personal dashboard, with in-app notifications for ride activity.

Planned scope:
- **Authentication** — register and log in with a work email
- **Rides** — post, browse/search, join requests, and ride status management
- **Dashboard** — rides the user is driving and rides they've joined
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

Setup details (env vars, database, scripts) have not been added yet.

## Working agreements

- **Commits**: organize backend PRs into logical commits rather than splitting into multiple PRs (e.g. one commit for auth, one for business logic, one for tests). Target ~200 lines per commit (flexible; test files are exempt from the cap) and ~5 commits per PR as a guideline, not a hard rule. Large initial scaffolding work is excluded from these limits.
- **Testing**: tests must pass before work is considered done. Target 75% coverage minimum (80% for stricter areas).
- **Code quality**: keep imports organized, remove unused variables, follow consistent naming conventions.
- **Documentation**: document key classes, methods, and modules where it aids maintainability (JSDoc or equivalent).
- **Definition of done**: tested, readable, documented, follows coding standards, and ready to be safely reviewed and merged.
