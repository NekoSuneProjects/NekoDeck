# NekoDeck Bot Builder

NekoDeck v0.6 adds a multi-platform bot project builder for Discord.js and Root Bots.

The builder stores bot definitions in the normal encrypted NekoDeck data store and can export platform-native source projects. A shared command can target Discord, Root, or both.

## Discord.js

Generated Discord projects use modern discord.js with slash commands and Node.js 24.17+.

Required secrets are written only to `.env.example` in exports. Real bot tokens are stored encrypted in NekoDeck and are never embedded in exported ZIPs.

Generated projects contain:

- `src/index.mjs` — Discord client and interaction handlers
- `src/register-commands.mjs` — global or optional guild command registration
- `commands.json` — generated command metadata
- `.env.example`
- `package.json`
- `README.md`

## Root Bots

Root Bots are server-only projects. Generated Root projects use `@rootsdk/server-bot`, subscribe to `ChannelMessageEvent.ChannelMessageCreated`, and reply through `rootServer.community.channelMessages.create`.

Generated projects contain:

- `src/main.ts`
- `root-manifest.json`
- `.env.example`
- `package.json`
- `tsconfig.json`
- `README.md`

Root commands are represented as text commands such as `/ping`, matching Root's current starter-bot model.

The Root manifest always requests `channel.createMessage` because generated commands and auto-replies need to send messages. Additional Root settings and permissions may be supplied from the builder.

## Shared command model

Each command has:

- name
- description
- response text
- Discord enabled toggle
- Root enabled toggle
- Discord ephemeral toggle

Responses support these simple placeholders:

- `{user}` — triggering user's display/tag/ID value where available
- `{command}` — command name
- `{args}` — text after the Root command; Discord slash commands currently expose this as an empty value unless the generated project is edited to add options

## Auto replies

Auto replies are optional text-message triggers. They support exact, starts-with, contains, and regex matching.

Discord auto replies require the Guild Messages and Message Content gateway intents. Root auto replies use the same `ChannelMessageCreated` subscription as Root commands.

## Publishing

Discord exports are self-hosted Node.js bots. Use your own hosting/container/service after export.

Root exports follow Root's package pipeline:

```bash
npm install
npm run build
npm run bot
npx rootsdk build package --output-file ./dist/rootbot-1-0-0.pkg
npx rootsdk upload package --file ./dist/rootbot-1-0-0.pkg --auth-token $ROOT_AUTH_TOKEN
```

Root's `DEV_TOKEN` is required for local DevHost testing. The upload authentication token comes from the Root Developer Portal.
