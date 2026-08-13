# NekoDeck Activity Studio

NekoDeck 0.4 manages Discord Activities alongside Profile Board data sources.

## Supported browser/game builds

Any exported project that runs in a browser can be hosted as an uploaded Activity or mapped as an external Activity. Presets include:

- Generic HTML/CSS/JavaScript and SPA builds
- Unity WebGL
- Unreal legacy/community HTML/WASM exports
- Godot Web
- Construct 3
- GDevelop
- Phaser
- PixiJS
- Three.js
- Babylon.js
- GameMaker HTML5
- RPG Maker MV/MZ browser exports
- Ren'Py Web
- Pyodide/PyScript/browser-compatible Python
- Hosted Node.js and Python backend applications with a browser frontend

Uploaded builds may be a full folder or ZIP archive. ZIP uploads are extracted under `/data/activity-content/<activity-id>` with traversal, symlink, file-size, expanded-size and entry-count checks.

## Updating a game/app

Open **Activities → Created → Update build**.

- **ZIP replace** removes the previous build and replaces it with the ZIP.
- **ZIP patch** overlays only files contained in the ZIP.
- **Folder replace** removes the previous build and uploads a fresh exported folder.

The Discord Application ID does not need to change when the hosted build is updated.

## Unity WebGL

Upload the complete Unity Web/WebGL output including `index.html`, the `Build` folder and `TemplateData` when present. NekoDeck serves `.wasm`, `.data`, framework JavaScript, Brotli (`.br`), gzip (`.gz`) and Unity fallback (`.unityweb`) files with appropriate response headers.

## Unreal Engine

Discord Activities are web applications. A static Unreal HTML/WASM export can be hosted when produced by a compatible legacy/community web target. Unreal Pixel Streaming depends on WebRTC and is not compatible with Discord Activities while Discord's Activity proxy does not support WebRTC.

## Node.js / Python

NekoDeck does not execute arbitrary uploaded server code. Node.js, Express, Flask, FastAPI, Django and similar games/apps should be hosted as a server elsewhere (or as another explicitly managed service) and connected to NekoDeck using **External URL**. Their browser frontend can still be the Activity.

Python that runs in the browser through Pyodide/PyScript/WASM can be uploaded as a normal static Activity build.

## Discord server-size verification restriction

Unverified Discord Activities are limited by Discord to servers with fewer than 25 members. NekoDeck cannot override this restriction.

To remove it, open the application's Discord Developer Portal page, select **App Verification**, complete the qualification requirements and submit the application. Verified Activities can be used in servers regardless of server member count.

NekoDeck's **Max Participants** setting is separate. It represents how many people the Activity is designed for and should be mirrored in the Discord Developer Portal metadata. It does not change the unverified 25-member server restriction.

## Upload limits

Defaults:

```env
NEKODECK_ACTIVITY_MAX_FILE_BYTES=536870912
NEKODECK_ACTIVITY_MAX_ARCHIVE_BYTES=1073741824
NEKODECK_ACTIVITY_MAX_EXTRACTED_BYTES=2147483648
NEKODECK_ACTIVITY_MAX_ZIP_ENTRIES=20000
```

Increase these only when the host has enough disk space and memory for the game builds you intend to upload.
