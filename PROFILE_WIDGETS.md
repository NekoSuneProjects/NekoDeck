# NekoDeck Profile Widgets

NekoDeck 0.3 makes **Profile Widgets** the primary experience. Discord Activities remain available only as an optional/classic utility mode.

## What NekoDeck can do now

NekoDeck can:

- connect encrypted provider credentials;
- fetch stats from supported providers;
- normalize provider data into a profile-card shape;
- render a Discord-style Profile Board preview;
- keep Discord Client IDs, Client Secrets and provider secrets server-side;
- prepare a provider/account-linking pipeline that can later be adapted to an approved Discord Game Stats integration.

Current Profile Widget data sources include Tracker Network, Steam, Rockstar Social Club, VRChat, Last.fm, Spotify and custom stats cards.

## What NekoDeck cannot self-enable

A NekoDeck preview is **not automatically a real Discord Game Stats widget** on a user's Profile Board.

As of August 2026, Discord describes Game Stats widgets as an early-access feature for select developers. Discord directs interested developers to Developer Solutions / Business Development. The public contact form is game-focused and asks for information such as project/game name, commercial availability, multiplayer status, target platforms and studio size.

NekoDeck therefore stores new Profile Widget instances with:

```json
{
  "profileWidget": true,
  "delivery": "discord-profile-board",
  "discordPublishStatus": "early-access-required"
}
```

This prevents the UI from presenting a Discord Activity route as if it were the Profile Board integration.

## Applying without owning a game

There is no documented self-service approval path for a generic third-party widget aggregator. You can contact Discord Developer Solutions and explain NekoDeck honestly as a developer tool / stats integration platform, but do not claim ownership of games or providers you do not represent.

If Discord approves NekoDeck or provides an early-access schema/API contract, the final Discord adapter can be added on top of the existing provider pipeline.

Official Discord contact page:

- https://discord.com/developers/contact-us

Official references:

- https://discord.com/developer-newsletter/april-2026
- https://discord.com/developer-newsletter/may-2026
- https://docs.discord.com/developers/platform/account-linking
- https://support.discord.com/hc/en-us/articles/35344672307607-Profile-Widgets-FAQ
