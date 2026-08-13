# NekoDeck

**NekoDeck** is a public, customisable Discord utility-widget platform by **NekoSuneVR / NekoSuneProjects**. It is designed to run as a desktop application, a normal browser dashboard, a Docker service, and as the web foundation for Discord Activities.

## What is included

- Modern dark desktop/web UI with custom accent colour, density and glass-panel settings.
- **Widget Library** and **Created Widgets** manager.
- Per-widget Discord credential profiles.
- Discord **Client ID + Client Secret required** when creating a widget.
- Discord **Bot Token optional** unless a future widget specifically needs bot/gateway functionality.
- AES-256-GCM encrypted secret storage.
- Hypixel tracker backend using the official Hypixel Public API.
- Battlefield tracker backend using the public GameTools Battlefield API.
- System monitor, endpoint status checker, timer, notes, counter, random picker and custom-API templates.
- Electron desktop packaging for Windows and Linux.
- Docker/browser deployment.
- GitHub Actions CI and automatic GitHub Releases.
- Multi-architecture GHCR images for `linux/amd64` and `linux/arm64`.

## Widget templates in v0.1.0

| Widget | Category | Extra credentials | Status |
|---|---|---|---|
| Hypixel Tracker | Gaming | Hypixel API key | Ready |
| Battlefield Tracker | Gaming | None | Ready |
| System Monitor | Utility | None | Ready |
| Status Checker | Utility | None | Ready |
| Shared Timer | Social | None | Ready |
| Shared Notes | Social | None | Ready |
| Live Counter | Social | None | Ready |
| Random Picker | Social | None | Ready |
| Custom API Widget | Developer | Provider-dependent | Ready |

Every created widget stores a Discord Client ID and Client Secret. A Bot Token is intentionally optional because Discord Activities do not automatically require a bot token. Add a bot token only when a widget uses bot-only API or Gateway features.

## Security model

Discord Client Secrets, bot tokens and provider API keys are encrypted at rest with **AES-256-GCM**. They are not returned from the normal API after creation. The public widget-instance response only contains the Discord Client ID and boolean credential-status flags.

By default, NekoDeck generates a random `data/master.key` on first launch. Keep the `data` directory private and persistent. Docker deployments can instead set `NEKODECK_MASTER_KEY`.

When exposing the browser/Docker dashboard beyond localhost, set `NEKODECK_API_TOKEN` and enter the same token under **Settings → Admin API token**.

> Never commit a Discord Client Secret, Discord Bot Token, Hypixel API key, `master.key`, `.env`, or the `data/` directory to Git.

## Development

Requirements: Node.js 22+.

```bash
npm install
npm run dev
```

The Vite development UI opens on `http://localhost:5173` and proxies `/api` to the NekoDeck server on port `3210`.

Build the browser UI:

```bash
npm run build:web
npm start
```

## Desktop

Run the Electron app locally:

```bash
npm install
npm run desktop
```

Build Windows:

```bash
npm run build:win
```

Outputs include an NSIS installer and portable EXE in `release/`.

Build Linux:

```bash
npm run build:linux
```

Outputs include AppImage and DEB packages in `release/`.

GitHub-hosted runners build each operating system on its native runner via `.github/workflows/desktop.yml`.

## Docker / browser

```bash
docker compose up -d --build
```

Open:

```text
http://localhost:3210
```

Published image:

```bash
docker pull ghcr.io/nekosuneprojects/nekodeck:latest
docker run -d \
  --name nekodeck \
  -p 3210:3210 \
  -v ./data:/data \
  -e NEKODECK_API_TOKEN='choose-a-long-random-token' \
  ghcr.io/nekosuneprojects/nekodeck:latest
```

The GitHub Docker workflow publishes `latest`, tag-based, and commit-SHA image tags to GHCR.

GitHub Container Registry can create a new organization package as private by default. After the first successful publish, if the package is not already public under your organization policy, open the NekoDeck package settings and change its visibility to **Public**.

## Discord Activity setup

NekoDeck is built to be served as the web application behind a Discord Activity. In the Discord Developer Portal:

1. Create/select a Discord Application.
2. Enable Activities.
3. Configure User Install and/or Guild Install as needed.
4. Add an OAuth redirect placeholder/redirect required by your Activity setup.
5. Configure the Activity URL mapping to your HTTPS NekoDeck deployment.
6. Create the matching widget in NekoDeck and enter the Discord Client ID and Client Secret.
7. Only add a Bot Token if that specific widget also uses bot functionality.

The Discord Client ID is public. The Client Secret and Bot Token are private and must stay server-side.

## Hypixel Tracker

Create a Hypixel application/key in the Hypixel Developer Dashboard, then create a **Hypixel Tracker** widget and store that key in its provider field.

Backend endpoint:

```text
GET /api/widgets/hypixel/:instanceId/player?player=<minecraft-username-or-uuid>
```

## Battlefield Tracker

The Battlefield adapter supports:

- Battlefield 3
- Battlefield 4
- Battlefield Hardline
- Battlefield 1
- Battlefield V
- Battlefield 2042
- Battlefield 6

Backend endpoint:

```text
GET /api/widgets/battlefield/:instanceId/player?game=bf2042&name=<player>&platform=pc
```

Battlefield data is provided through the community GameTools API. NekoDeck is not affiliated with EA, DICE, Hypixel, Discord, Tracker Network, or GameTools.

## Release workflow

Push a tag such as:

```bash
git tag nekodeck-v0.1.0
git push origin nekodeck-v0.1.0
```

The desktop workflow builds Windows and Linux packages and creates a GitHub Release. The Docker workflow publishes the corresponding GHCR image tag.

## Project structure

```text
NekoDeck/
├─ src/                    React/Vite dashboard
├─ server/                 Express API + encrypted credential store
├─ electron/               Electron desktop shell
├─ shared/widgets.json     Widget registry
├─ tests/                  Node tests
├─ .github/workflows/      Desktop, web CI and GHCR automation
├─ Dockerfile
├─ docker-compose.yml
└─ package.json
```

## License

MIT © 2026 NekoSuneVR / NekoSuneProjects
