# Hosts

Pushes to `develop` deploy to the `dev` GitHub environment and pushes to `main` deploy to `prod`. Each environment points at its own instance; set both up the same way.

Create the instance in the region set in `AWS_REGION`. Attach an Elastic IP. Open ports 22, 80, and 443. Install Docker Engine and the Compose plugin. Add the SSH user to the `docker` group.

```bash
sudo mkdir -p /opt/ride-connect
sudo chown "$USER" /opt/ride-connect
```

Copy `compose.yml` and `Caddyfile` into `/opt/ride-connect/`. Create these files there and do not commit the real ones:

- `.env` from `.env.example`. `SITE_ADDRESS` is the Elastic IP plus `.nip.io`, with no scheme. `ACME_EMAIL` is the address Let's Encrypt will use. Leave `API_TAG` empty until the pipeline writes it.
- `api.env` from `api.env.example`. `DATABASE_URL` must use hostname `postgres` and the same user, password, and database as `db.env`. `BETTER_AUTH_URL` is `https://` plus `SITE_ADDRESS`. `BETTER_AUTH_SECRET` is at least 32 characters.
- `db.env` from `db.env.example`.

Secrets on each of the `dev` and `prod` environments, pointing at that environment's instance:

- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_KEY`
- `EC2_INSTANCE_ID`

Repository secrets shared by both:

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- `DOZZLE_USERS` (the `users.yml` for the log viewer, see below)

The GHCR packages are private. Log the host in once with a classic personal access token that has only `read:packages`, so manual pulls work:

```bash
echo <token> | docker login ghcr.io -u <github-username> --password-stdin
```

Deploys log in with the job's own token in a throwaway Docker config, so they leave this login in place.

## Avatar storage

Each environment has its own S3 bucket, e.g. `ride-connect-avatars-dev-…` for `dev`. Set `AWS_REGION` and `S3_BUCKET` in `api.env`.

The bucket:

- Object Ownership: ACLs disabled.
- Block Public Access: only the two ACL settings on.
- Bucket policy: `s3:GetObject` for `"Principal": "*"` on `arn:aws:s3:::<bucket>/avatars/*`.
- CORS: `POST` from the environment's `https://<SITE_ADDRESS>`, plus `http://localhost:5173` on `dev` only.

The instance reaches the bucket through an IAM role, not access keys. Attach a role with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<bucket>/avatars/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::<bucket>"
    }
  ]
}
```

`s3:ListBucket` lets the API tell a missing upload (404) apart from a permission error (403).

The API runs in a container, one network hop past the instance, so set the metadata hop limit to 2 or the SDK cannot fetch the role's credentials:

```bash
aws ec2 modify-instance-metadata-options --instance-id <id> --http-tokens required --http-put-response-hop-limit 2
```

Check from the host with `docker run --rm amazon/aws-cli sts get-caller-identity`; it should name the role.

## Log viewer

Dozzle serves live container logs at `https://<SITE_ADDRESS>/logs`. It reads Docker through a socket proxy that only allows read calls, so the viewer cannot start, stop, or exec into containers.

Generate an entry per teammate. The password is read from stdin and stored as a bcrypt hash:

```bash
docker run -it --rm amir20/dozzle:v11.1.3 generate <username> --name "<Full Name>" --email <email> --user-roles download > user.yml
```

Merge the entries under a single `users:` key and save the whole file as the `DOZZLE_USERS` secret. Each deploy writes it to `/opt/ride-connect/dozzle/users.yml` and restarts Dozzle when it changed. To add or remove someone, update the secret and redeploy.

When the first deploy has succeeded:

```bash
sudo cp ride-connect.service /etc/systemd/system/ride-connect.service
sudo systemctl enable ride-connect.service
```

A host is ready when the migrate container exits 0, `https://<SITE_ADDRESS>/api/health` returns 200, and an email-and-password sign-up against that origin returns a session.
