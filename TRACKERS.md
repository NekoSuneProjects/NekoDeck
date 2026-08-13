# NekoDeck v0.2 Tracker & Music Widgets

Every created widget still requires a Discord Client ID and Client Secret. A Bot Token is optional unless a future widget explicitly needs gateway/bot features. Provider secrets are encrypted at rest and are never returned by the public instance API.

## New widgets

| Widget | Credentials | Mode |
|---|---|---|
| Tracker Network | TRN API key | Apex live API; Fortnite/Halo link-only because TRN does not expose those through the public developer API |
| Steam Stats | Steam Web API key | Profile, owned games, total/top playtime |
| Last.fm | Last.fm API key | Profile, recent/now-playing, top artists/tracks |
| Spotify | Spotify Client ID + Secret, then OAuth Connect | Profile, current/recent/top tracks |
| Rockstar GTA V | Existing Social Club session cookie | Experimental legacy StatsAjax categories |
| VRChat | Existing VRChat auth cookie/session | Experimental current-account summary |
| Custom Stats Card | none beyond Discord | Custom title, message, image URL and arbitrary Label=Value stats |

## Rockstar / VRChat safety

NekoDeck does not ask for Rockstar or VRChat passwords. These integrations accept an existing authenticated cookie/session and store it using the same encrypted secret store as Discord/provider credentials. Session-based integrations can stop working when the provider changes an undocumented endpoint or expires the login.

## Tracker Network

NekoDeck does not scrape Tracker.gg. Apex uses the documented Tracker Network public API. Fortnite and Halo return a Tracker Network search/profile link until a supported API is available.

## Spotify OAuth

After creating a Spotify widget, open it in Tracker Hub and choose **Connect Spotify**. Add the redirect URI NekoDeck displays to the Spotify developer application. Access/refresh tokens are stored encrypted server-side.
