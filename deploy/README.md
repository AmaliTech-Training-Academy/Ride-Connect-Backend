# Parallel host

Create the instance in the same region as the current host. Attach an Elastic IP. Open ports 22, 80, and 443. Install Docker Engine and the Compose plugin. Add the SSH user to the `docker` group.

```bash
sudo mkdir -p /opt/ride-connect
sudo chown "$USER" /opt/ride-connect
```

Copy `compose.yml` and `Caddyfile` into `/opt/ride-connect/`. Create these files there and do not commit the real ones:

- `.env` from `.env.example`. `SITE_ADDRESS` is the Elastic IP plus `.nip.io`, with no scheme. `ACME_EMAIL` is the address Let's Encrypt will use. Leave `API_TAG` empty until the pipeline writes it.
- `api.env` from `api.env.example`. `DATABASE_URL` must use hostname `postgres` and the same user, password, and database as `db.env`. `BETTER_AUTH_URL` is `https://` plus `SITE_ADDRESS`. `BETTER_AUTH_SECRET` is at least 32 characters.
- `db.env` from `db.env.example`.

Repository secrets for this workflow, separate from the current host:

- `DOCKER_EC2_HOST`
- `DOCKER_EC2_USER`
- `DOCKER_EC2_SSH_KEY` (same private key as the current host)
- `DOCKER_EC2_INSTANCE_ID`

After the first push, set the GHCR package `ride-connect-api` to public.

When the first deploy has succeeded:

```bash
sudo cp ride-connect.service /etc/systemd/system/ride-connect.service
sudo systemctl enable ride-connect.service
```

The trial is done when the migrate container exits 0, `https://<SITE_ADDRESS>/api/health` returns 200, and an email-and-password sign-up against that origin returns a session.

Promotion moves the current host's Elastic IP onto this instance, stops the current host, and sets `BETTER_AUTH_URL` to the original public URL. The workflow trigger changes to `develop` in that merge.
