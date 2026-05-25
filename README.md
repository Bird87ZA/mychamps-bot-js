# MyChamps Bot JS

Discord bot for MyChamps server workflows: schedules, attendance, stats, randomisers, and incident reporting.

The MyChamps API base URL is fixed in the app as `https://mychamps.gg`. Servers only need to configure a MyChamps API token.

## Requirements

- Node.js 20 or newer
- MySQL 8
- A Discord application and bot token
- A MyChamps API token for the Discord server

## Environment

Copy `.env.example` to `.env` and set:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DATABASE_URL="mysql://discord:discord@localhost:5306/discord"
```

When using Docker Compose, the app container uses `mysql://discord:discord@db:3306/discord`.

## Install And Run

For local development:

```bash
npm ci
npm run db:migrate
npm run db:generate
npm run build
npm run deploy-commands
npm run dev
```

With Docker Compose:

```bash
docker compose up -d --build
docker compose run --rm --no-deps --entrypoint npm app run deploy-commands
```

The Docker entrypoint runs `prisma migrate deploy` automatically when `DATABASE_URL` is set.

## Discord Bot Setup

Invite the bot with these OAuth2 scopes:

- `bot`
- `applications.commands`

Enable these Gateway Intents in the Discord Developer Portal because the app requests them:

- Server Members Intent
- Message Content Intent

The bot also uses the non-privileged `Guilds` and `Guild Messages` intents.

## Required Discord Permissions

Give the bot role these permissions at server level, or at least in every channel/category where the bot is used:

- `View Channel`
- `Send Messages`
- `Embed Links`
- `Read Message History`
- `Manage Channels`
- `Manage Roles`

For incident reporting, the selected incident Channel Group/category must allow the bot role:

- `View Channel`
- `Manage Channels`
- `Manage Roles`
- `Send Messages`
- `Embed Links`

The channel where `/incident setup` is run must allow the bot role:

- `View Channel`
- `Send Messages`
- `Embed Links`

Role hierarchy matters. In Discord server settings, place the bot role above:

- steward roles selected in `/incident setup`
- roles selected in `Roles to Add to Channel`
- ticket access roles configured in `/settings section: incidents`

Optional:

- `Mention Everyone` is only needed if steward roles are not mentionable and you still want role pings to notify members.

Common errors:

- `DiscordAPIError[50001]: Missing Access` when posting the setup button usually means the bot cannot view or send in the setup channel.
- `DiscordAPIError[50013]: Missing Permissions` while creating `incident-0001` usually means the bot is missing `Manage Channels` on the selected category, or the bot role is below a role it needs to manage in channel overwrites.
- `DiscordAPIError[50013]: Missing Permissions` while removing a defendant or locking a channel usually means the bot is missing `Manage Channels`/`Manage Roles`, or role hierarchy is wrong.

## Server Configuration

Run `/settings` as a server admin or a user with `Manage Guild`:

- `timezone`: IANA timezone, for example `Europe/Berlin`
- `post-time`: days before an event to post attendance
- `remind-attendees`: attendee reminder frequency in hours, or `0` to disable
- `incident-reminder-interval`: incident reminder frequency in hours
- `mychamps-api-token`: MyChamps API token

Run `/settings section: incidents` to configure:

- `Incidents Category`: default category where incident channels are created
- `Ticket Access Roles`: default roles that can view and review incident tickets

Run `/settings section: stats` to choose the MyChamps leagues included in `/stats`.

## Incident Reporting Flow

An admin or `Manage Guild` user runs `/incident setup` in the channel where the report button should be posted.

Step 1 asks for:

- Championship
- Button Label
- Button Color
- Button Message
- Channel Group

Step 2 asks for:

- Stewards Role
- Roles to Add to Channel
- Add reporter to channel

When a driver clicks the report button:

1. The bot opens a report modal for involved Discord users, description, evidence URL, and evidence files.
2. The bot creates a private channel named `incident-0001`, `incident-0002`, and so on.
3. `@everyone` cannot view the channel.
4. Steward/access roles can view and write in the channel.
5. Selected drivers can view the channel but cannot write directly.
6. The reporter is not added by default. If `Add reporter to channel` was selected during setup, the reporter gets view-only access.
7. The incident embed is posted with a `Submit Defence` button.

When a selected driver clicks `Submit Defence`:

1. The bot opens a defence modal for an answer, optional links, and an optional file.
2. The bot posts the defence as an embed in the incident channel.
3. The driver is removed from the channel.
4. The steward roles are tagged so they know a defence was submitted.

Stewards close the incident with `/incident close` in the incident channel. Closing supports `Penalty`, `Warning`, and `No Further Action`.

## MyChamps Account Linking

Users should link their Discord account on MyChamps first. In Discord, they can then run:

```text
/link email email:you@example.com
/link verify code:123456
/link status
```

Linked users can use `/stats`, and admins can use `/incident setup` with championships available to their MyChamps account.

## Useful Commands

```bash
npm run build
npm run lint
npm test
npm run db:migrate
npm run deploy-commands
```
