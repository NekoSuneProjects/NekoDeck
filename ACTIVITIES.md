# NekoDeck Discord Activities

NekoDeck supports three web Activity sources in addition to the built-in tools.

## 1. Uploaded Web App / HTML5 Game

Upload the **built output**, not the source project. Examples:

- Vite / React: `dist/`
- Create React App: `build/`
- Plain HTML5 game: folder containing `index.html`
- WebAssembly app: folder containing the HTML loader and `.wasm` assets

NekoDeck preserves folder paths and serves JS, CSS, modules, images, fonts, audio, video and WASM from `/data/activity-content/<activity-id>/`.

Discord URL Mapping:

```text
PREFIX  TARGET
/       your-nekodeck-domain.example/api/activity-host/<activity-id>/
```

Do not include `https://` in a Discord mapping target.

## 2. Unity WebGL / Web Build

In Unity, build for the **Web/WebGL** platform, then upload the complete generated output folder.

Typical structure:

```text
MyGame/
├── index.html
├── Build/
│   ├── MyGame.loader.js
│   ├── MyGame.framework.js
│   ├── MyGame.data
│   └── MyGame.wasm
└── TemplateData/
```

Compressed Unity builds are supported too, including `.br`, `.gz` and `.unityweb` variants. NekoDeck returns Unity-compatible `Content-Type` and `Content-Encoding` headers for WebAssembly, JavaScript and data files.

Discord URL Mapping is the same as an uploaded web app:

```text
/  ->  your-nekodeck-domain.example/api/activity-host/<activity-id>/
```

For maximum Discord compatibility, test Unity Web builds with browser restrictions in mind. Discord currently routes Activity networking through its proxy and does not support WebRTC.

## 3. External URL App

External apps now use a **direct Discord root mapping**. NekoDeck does not iframe just the remote HTML.

If the app is hosted at:

```text
https://game.example.com/my-game/
```

configure Discord:

```text
PREFIX  TARGET
/       game.example.com/my-game/
```

This allows the app's HTML, relative JS/CSS, images, audio, video, fonts and WASM to load through the same Discord proxy mapping.

The target must be a **directory**. Prefer a URL ending in `/` or `/index.html`. Discord does not support mapping the Activity root directly to an arbitrary HTML filename.

If the external app loads assets, APIs or WebSockets from another origin/CDN, add additional URL Mappings for those origins and put more-specific prefixes above `/`.

## Media

Normal browser media APIs are supported by NekoDeck-hosted apps:

```html
<audio src="audio/music.ogg" controls></audio>
<video src="video/intro.mp4" controls playsinline></video>
```

Browser autoplay restrictions still apply; user interaction may be required before audio starts.

## Upload limits

Default maximum size is 512 MB **per file**. Override it with:

```env
NEKODECK_ACTIVITY_MAX_FILE_BYTES=1073741824
```

The example above allows up to 1 GiB per uploaded file.
