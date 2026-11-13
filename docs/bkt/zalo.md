# Zalo platform

The `zalo` platform connects Hermes to a personal Zalo account through the
[openzca](https://www.npmjs.com/package/openzca) CLI. One supervised
`openzca listen --raw --self --supervised` child carries inbound messages as
NDJSON; every outbound send is a short `openzca msg` child. openzca manages its
own Zalo cookies in `~/.openzca`; Hermes never reads or forwards them.

> **Risk notice.** openzca drives the Zalo protocol through a reverse-engineered
> interface. Use a **dedicated account** — never your personal Zalo account.
> Sending too many messages in a short time may trigger a temporary login
> suspension. A login failure is non-retryable; re-authenticate with
> `openzca --profile <name> auth login` and then restart the gateway.

## Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| Node.js | 22.13.0 | Required by openzca's SQLite binding (`node:sqlite`). Older Node gives a non-retryable `zalo_node_version` error. |
| openzca | **0.1.60** | `npm view openzca version` at the time this adapter was written. Pinned minimum: `(0, 1, 60)` in `adapter.py`. |
| Dedicated Zalo account | — | Personal accounts risk losing your chat history if the session is interrupted. |

Install openzca globally:

```sh
npm i -g openzca@0.1.60
```

## Login

```sh
openzca --profile <name> auth login
```

On a headless server, pass `--qr-base64` to get the QR code as a base64 string
that you can render in a terminal or transfer to a phone:

```sh
openzca --profile <name> auth login --qr-base64
```

Scan the QR code with the Zalo mobile app. The session is stored in
`~/.openzca/profiles/<name>/`.

## Hermes configuration

Add the following to your `.env` (use `hermes config set` or edit the file
directly — `.env` is for secrets):

```env
ZALO_PROFILE=<name>           # required: openzca profile name
ZALO_ALLOWED_USERS=uid1,uid2  # allow specific UIDs (leave empty to deny all)
# or
ZALO_ALLOW_ALL_USERS=true     # allow any contact or group member who @mentions the bot
ZALO_HOME_THREAD=<thread-id>  # cron / scheduled delivery target (DM UID or group:<groupId>)
```

Enable the platform:

```yaml
# config.yaml
gateway:
  platforms:
    zalo:
      enabled: true
```

Or set it through `hermes gateway setup`.

## Optional env vars

| Var | Default | Description |
|---|---|---|
| `ZALO_GROUP_REQUIRE_MENTION` | `true` | Set `false` to respond to every group message, not only @mentions. |
| `ZALO_OPENZCA_BIN` | auto | Absolute path to the `openzca` binary, overrides PATH and PM lookup. |

## Chat IDs

| Chat type | ID format | Example |
|---|---|---|
| DM | peer's Zalo UID | `123456789` |
| Group | `group:<groupId>` | `group:987654321` |

The `ZALO_HOME_THREAD` for cron delivery can be either format.

## Group chats

By default the bot only responds when it is @mentioned or when someone quotes
one of its messages. Set `ZALO_GROUP_REQUIRE_MENTION=false` to respond to every
message in joined groups.

`ZALO_ALLOW_ALL_USERS=true` exposes the bot to every contact and every group
member who can @mention it; use with caution on accounts that are in large
public groups.

## Media

| Direction | Supported | Notes |
|---|---|---|
| Inbound images | ✓ | Downloaded by openzca to `<HERMES_HOME>/cache/zalo-inbound/`; Hermes caches and removes the copy. |
| Inbound files | ✓ | Same path as images. |
| Inbound audio | ✓ | |
| Inbound video | ✓ | |
| Outbound images | ✓ | Local path or remote URL (downloaded first; `msg image -u` is never used). |
| Outbound files | ✓ | Via `msg upload`, requires the listener to be running. |
| Outbound voice | ✓ | Via `msg upload`. |
| Outbound video | ✓ | Via `msg upload`. |

Voice and video sent *from* Hermes go as file attachments (openzca's `msg voice`
and `msg video` disrupt the running listener).

## Re-authentication

When Zalo invalidates the session (the gateway logs `zalo_auth` with
`retryable=False`):

```sh
openzca --profile <name> auth login
hermes gateway restart
```

## Inbound media cache

openzca saves every received media file to the directory named by
`OPENZCA_LISTEN_MEDIA_DIR`, which the adapter sets to
`<HERMES_HOME>/cache/zalo-inbound/`. Hermes reads the file, caches it in its
own media store, and deletes the openzca copy. The directory is not cleaned
automatically if Hermes crashes before processing; you can safely delete any
files older than a few minutes.

## Security notes

- openzca's session credentials live in `~/.openzca` and `~/.openclaw`. The
  adapter's file-access guard blocks any attempt to read from those directories
  through the file-delivery tools, even via prompt injection from an allowed contact.
- The `openzca` child process inherits only a scrubbed copy of the environment
  (no provider API keys, no gateway secrets).
- `ZALO_ALLOW_ALL_USERS=true` is a significant attack surface: any contact or
  group member can send the bot an adversarial prompt.
