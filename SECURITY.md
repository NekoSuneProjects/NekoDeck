# Security Policy

NekoDeck stores Discord Client Secrets, optional Bot Tokens, and provider API keys encrypted at rest using AES-256-GCM.

## Do not commit secrets

Never commit `.env`, `data/`, `master.key`, Discord Client Secrets, Discord Bot Tokens, provider keys, or exported runtime data.

## Docker / remote web deployments

Set `NEKODECK_API_TOKEN` before exposing NekoDeck outside a trusted network. Place public deployments behind HTTPS and a reverse proxy. Persist `/data` and protect that volume with host-level access controls and backups.

## Reporting a vulnerability

Please report security issues privately to the project owner rather than opening a public issue containing credentials, exploit details, or private user data.
