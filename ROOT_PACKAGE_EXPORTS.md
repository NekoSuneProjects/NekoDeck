# Root `.pkg` exports in NekoDeck

NekoDeck supports two Root export modes for both Root Apps and Root Bots:

1. **Source ZIP** — editable source project.
2. **Ready `.pkg`** — NekoDeck installs generated dependencies, builds the project, invokes the Root SDK packager, and returns the completed package.

## Root App workflow

The generated Root App source ZIP is designed so this works from its project root:

```bash
npm install && npm run build
npx rootsdk build package --output-file ./rootapp.pkg --project-folder .
```

Publishing with the current documented Root CLI uses:

```bash
npx rootsdk upload package \
  --file ./rootapp.pkg \
  --authToken <AUTH_TOKEN>
```

NekoDeck also supports an optional advanced upload-host field. When configured, it appends:

```bash
--host dev.rootapp.com
```

The current Root documentation lists `--file` and `--authToken` as the supported upload options, so leave the host field blank unless your Root environment/tooling specifically requires it.

## Root Bot workflow

Root Bot source exports use the same package name and packaging flow:

```bash
npm install && npm run build
npx rootsdk build package --output-file ./rootapp.pkg --project-folder .
```

The Root Bot manifest remains server-only.

## NekoDeck UI

### Root Apps

Open:

```text
App Systems → RootApp
```

Available actions:

- **Source ZIP**
- **Build .pkg**
- **Build + Upload**
- **Preview manifest**

### Root Bots

Open:

```text
Bot Builder → Export → Root Bot
```

Available actions:

- **Source ZIP**
- **Build .pkg**
- **Build + Upload**
- **Manifest**

## Build isolation

Ready-package builds are created in a unique temporary directory. NekoDeck runs only the source project it generated itself, then removes the temporary directory after the request completes.

The Root upload authentication token is passed directly to the Root CLI and is not written into the exported project or returned in build logs.

Environment tuning:

```env
# Default: 10 minutes
NEKODECK_ROOT_BUILD_TIMEOUT_MS=600000

# Default: 2 MiB captured build output
NEKODECK_ROOT_BUILD_LOG_BYTES=2097152
```

The NekoDeck host/container needs outbound npm access to install Root SDK packages before creating a ready `.pkg`.
