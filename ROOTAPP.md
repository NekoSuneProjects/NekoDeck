# NekoDeck RootApp integration

NekoDeck 0.5 adds an **App Systems** layer so the same NekoDeck project can target **Discord**, **RootApp**, or both.

## How Root Apps differ from Discord Activities

Root Apps are packaged applications installed into Root communities. A Root App normally has:

- a browser-based client in `client/dist`;
- a Node/TypeScript server running in the Root cloud;
- optional Protobuf networking between client and server;
- a required `root-manifest.json` containing project identity, semantic version, package paths, optional settings and optional permissions.

NekoDeck therefore does not treat RootApp as another Discord-style URL mapping.

## App Systems → RootApp

Choose an existing NekoDeck app and configure:

- Root Developer Portal project ID;
- semantic version, e.g. `1.0.0`;
- whether Discord remains enabled for the same NekoDeck app;
- whether RootApp is enabled;
- optional Root manifest `settings` JSON;
- optional Root manifest `permissions` JSON;
- DEV_TOKEN for local Root DevHost testing;
- Root upload authentication token.

The DEV_TOKEN and upload token are stored through NekoDeck's existing encrypted credential store and are never placed in exported project ZIP files.

## Export Root project ZIP

NekoDeck exports a Root-ready project containing:

```text
root-manifest.json
package.json
client/
  dist/
server/
  package.json
  tsconfig.json
  .env.example
  src/
    main.ts
README.md
```

For an uploaded NekoDeck `web-activity`, the app's existing HTML/JS/CSS/WASM/media build is copied into `client/dist`. Other instance types receive a placeholder client which can be replaced with a compiled React/Vite/HTML client.

The generated Root server starts the Root lifecycle using `@rootsdk/server-app` and can be extended with Root APIs, persistence, jobs, community events and custom networking.

## Root build flow

Root currently documents Node.js 22+ for development.

After extracting a NekoDeck Root export:

```bash
npm install
npm --prefix server install
npm --prefix server run build
```

For local DevHost testing, copy `server/.env.example` to `server/.env`, place your Root-generated `DEV_TOKEN` in it, then run:

```bash
npm --prefix server run server
```

Package the compiled project:

```bash
npx rootsdk build package --output-file ./dist/rootapp-1-0-0.pkg
```

Upload it to Root:

```bash
npx rootsdk upload package --file ./dist/rootapp-1-0-0.pkg --auth-token $ROOT_AUTH_TOKEN
```

Create the Root project, DEV_TOKEN and upload token in the Root Developer Portal.

## Current scope

NekoDeck can directly reuse uploaded browser builds as a Root client. Root-specific client/server networking is not automatically invented from a Discord Activity. Add Root SDK calls or Protobuf services to the exported scaffold when the app needs Root community features or a Root-hosted backend.
