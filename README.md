# magic-dart-service

A self-hostable web app (installable PWA) and MCP server over a local cache of [OpenDART](https://opendart.fss.or.kr) (금융감독원 전자공시) data, built on [`magic-dart`](https://www.npmjs.com/package/magic-dart). The UI is in Korean.

- **Browse:** latest filings, company search, company profiles, key financials, ownership reports (5% holders, executives) and major-event reports (주요사항보고서), with links to the original DART documents.
- **Cache:** everything is stored in SQLite. Scheduled jobs (KST) keep the corp list, today's filings (every 15 min), financials, ownership and events fresh within a daily request budget. Pages and MCP tools read from the cache first and fetch from OpenDART only when needed.
- **MCP:** a Streamable HTTP endpoint at `/mcp` with OAuth 2.1 (dynamic client registration + PKCE), so Claude and other MCP clients can query the cache as the signed-in user.
- **Accounts:** username + password (argon2id), optional second factors (passkeys, TOTP, recovery codes), invite-based registration, `admin` / `user` roles.

## Guided setup (no web security experience needed)

New to self-hosting? Copy the prompt below into an AI coding assistant that can run commands on your server, such as [Claude Code](https://claude.com/claude-code). It asks a few questions, explains anything that takes time to arrange, and then does the setup with you step by step. You can also read it as a checklist and follow it yourself.

<details>
<summary><strong>Setup prompt</strong> (click to expand, then copy everything in the box)</summary>

````text
You are helping me self-host magic-dart-service, a web app and MCP server that caches data from
OpenDART (Korea's electronic disclosure system). I am not a web security expert: explain each step
in plain words, run commands for me when you can, and stop to ask before anything that costs money,
opens network ports, or changes system settings. Follow the repository's README.md for details and
read it before you start; if this prompt and the README disagree, the README wins.

0. GET THE CODE (do this first, before asking me anything). The official repository is
   https://github.com/themrsung/magic-dart-service
   Check the current working directory and tell me briefly what you found:
   - Already inside a clone of this repository (its `git remote -v` points at the URL above, or
     package.json says "magic-dart-service"): run `git status`. If there are no local changes,
     update with `git pull --ff-only`. If there are local changes or the pull fails, show me and
     ask before doing anything else. Never discard my changes.
   - A `magic-dart-service` folder exists here: go into it and apply the rule above.
   - Not here: clone it automatically with
     `git clone https://github.com/themrsung/magic-dart-service.git` and go into the new folder.
     (If git isn't installed, explain how to install it for my OS first.)
   - A clone whose remote points somewhere else (a fork or mirror): tell me and ask which one to use.
   If a `.env` file already exists, this is an existing installation: never overwrite it. Read it,
   tell me which settings are already filled in (never print APP_SECRET), and only change what I ask.
   Then read README.md from the updated code before continuing.

Then ask me these questions ONE AT A TIME, in this order, and wait for each answer:

1. LANGUAGE. Ask which language I want to use for this setup (for example 한국어 or English).
   Use that language for everything that follows, including your explanations.

2. OPENDART API KEY. Ask whether I already have an OpenDART API key (인증키) from
   https://opendart.fss.or.kr. If I don't, tell me to apply for one first and come back once it is
   issued, because the application has to be approved and that takes time. Don't go on to the
   installation until I have a key, unless I explicitly say I only want to try the app with the
   built-in mock API (`npm run dev:mock`, see "Development" in the README).
   Never ask me to paste the key into this chat: I will enter it myself on the app's admin page.

3. STATIC IP. Ask whether my server has a static IPv4 address from a datacenter or cloud provider
   (a VPS, for example). OpenDART only accepts requests from IP addresses I have registered, each
   registration is reviewed before it takes effect, and changing an approved IP later also takes
   time. The repository owner has only seen datacenter IPs approved; home (residential) IPs may be
   rejected and often change. If I don't have one, recommend getting a small server with a static
   IPv4 before continuing, rather than relying on a home connection.
   Also explain the README warning: the IP allowlist is the real protection for the key, so this
   server's IP must not be shared with untrusted services, and the server must not be used as a VPN
   exit node, proxy or NAT gateway for other devices.

4. USERS. Ask whether more than one person will use the app.
   - Just me: set REGISTRATION=closed (only the first admin account will exist).
   - More people: keep REGISTRATION=invite (the admin creates single-use invite links).
     Explain that "open" lets anyone on the internet register, and only use it if I insist.

5. OS AND DOCKER. Ask which operating system the server runs (Linux distribution, macOS or
   Windows), and whether I want to use Docker (recommended) or run it directly with Node.js.
   - On Linux with Docker, keep COMPOSE_FILE=docker-compose.yml:docker-compose.host-id.yml in .env,
     which binds the encrypted API key to this machine.
   - On Docker Desktop (macOS/Windows), remove that COMPOSE_FILE line, as the README explains.
   - Ask whether I have a domain name. HTTPS is required (passkeys and secure cookies need it). If I
     have no reverse proxy yet, use the built-in Caddy profile, which gets certificates automatically.

6. COMPLETE THE SETUP. Then, checking each step works before moving on:
   a. Install what's missing (git, Docker with Compose v2, or Node.js 22.18+). Ask before installing.
   b. In the folder from step 0, copy .env.example to .env (skip if .env already exists).
   c. Fill in .env: ORIGIN (https://my-domain), DOMAIN, REGISTRATION from question 4, and a fresh
      APP_SECRET generated with `openssl rand -base64 48`. Don't show me the secret in full and tell
      me not to share or commit .env. Leave everything else at its default unless the README says
      otherwise for my setup.
   d. DNS: help me point my domain's A record at the server's static IPv4, and check it resolves.
   e. Firewall: with the Caddy profile only ports 80 and 443 need to be open. Never expose port 3000
      (the app) directly to the internet.
   f. Start it: `docker compose --profile caddy up -d --build` (Caddy) or
      `docker compose up -d --build` (my own reverse proxy), or the "Without Docker" steps.
   g. First run: find the one-time setup token in the logs (`docker compose logs app`), open
      https://my-domain/setup and create the admin account with a long password (10+ characters;
      a sentence works well). Then, on the account page (계정), set up a passkey or an authenticator
      app and store the recovery codes somewhere safe, offline.
   h. On the admin page (관리), I enter my OpenDART API key myself. Show me the server's public IP
      listed there and remind me to register exactly that IP with OpenDART and wait for approval.
   i. If more than one user: show me how to create an invite link on the admin page.
   j. Finally, explain how to connect an MCP client (README "Connecting MCP clients"), how to update
      (git pull, then rebuild), and that I should back up the data volume and keep .env safe.

At the end, give me a short summary of what was set up, where the configuration lives, and anything
still waiting on me (for example OpenDART's IP approval).
````

</details>

## Requirements

- An **OpenDART API key** (free: [opendart.fss.or.kr](https://opendart.fss.or.kr) → 인증키 신청). OpenDART only accepts calls from IP addresses registered with the key, so register your server's public IP (the admin page shows it).
  > **The IP allowlist is the real protection, not the key.** You can look the key up again at any time by signing in to OpenDART, but changing it may require contacting OpenDART support (unverified; it may not be possible at all). So assume a leaked key stays valid, and treat every program that sends traffic from the registered IP as able to use your quota:
  > - don't run untrusted or shared services (other people's apps, public proxies, seedboxes, …) on the same public IP;
  > - don't use the server as a VPN **exit node** (WireGuard, mesh VPNs), proxy or NAT gateway for other devices, since their traffic would leave from the allowlisted IP;
  > - when you move servers, remove the old IP from the allowlist.
  >
  > Adding an IP to the allowlist isn't instant: OpenDART reviews and approves each request before the IP is allowed. The repo owner has only tested approval with datacenter IPs; requests for residential IPs may be rejected.
  >
  > This app stores the key encrypted and never displays it again (see [OpenDART key storage](#opendart-key-storage)).
- Docker with Compose v2, **or** Node.js ≥ 22.18.
- A domain name and HTTPS for anything beyond local testing. Passkeys and `Secure` cookies need a secure origin (`https://…` or `http://localhost`).

## Quick start (Docker Compose)

```sh
cp .env.example .env
# Edit .env: set ORIGIN, DOMAIN and APP_SECRET (openssl rand -base64 48)
# On Docker Desktop (macOS/Windows), remove the COMPOSE_FILE line (it would bind to the Docker VM, not the computer)

# Option A: built-in Caddy with automatic HTTPS for $DOMAIN (ports 80/443 must reach this host)
docker compose --profile caddy up -d --build

# Option B: app only, on 127.0.0.1:3000, behind your own reverse proxy
docker compose up -d --build
```

Then follow [First run](#first-run).

### Behind your own reverse proxy

Point your proxy at `127.0.0.1:3000` (or change `APP_BIND`) and:

- set `ORIGIN` to the public URL users type, e.g. `https://dart.example.com`. The app uses it for cookies, OAuth metadata and the passkey relying-party ID;
- forward the client address in `X-Forwarded-For`, and set `ADDRESS_HEADER=X-Forwarded-For` and `XFF_DEPTH` to the number of proxies in front of the app (usually `1`). These are [adapter-node](https://svelte.dev/docs/kit/adapter-node#Environment-variables) settings. Rate limiting depends on them: if the app is reachable without going through your proxy, clients can spoof this header. In that case unset `ADDRESS_HEADER`;
- allow request bodies of at least 1 MB, and don't buffer responses for `/mcp`.

nginx example:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Without Docker

```sh
npm ci
npm run build
ORIGIN=https://dart.example.com APP_SECRET=… DATA_DIR=./data node build
```

The app listens on `HOST`/`PORT` (default `0.0.0.0:3000`) and keeps its SQLite database in `DATA_DIR` (default `./data`).

## First run

1. On first start with an empty database, the server log prints a one-time setup token:
   ```
   [auth] No accounts yet. Open https://dart.example.com/setup and enter setup token: …
   ```
   (`docker compose logs app`). You can set `SETUP_TOKEN` instead to choose it yourself.
2. Open `/setup`, enter the token and create the first **admin** account.
3. On **계정** (Account), enroll a second factor: a passkey and/or an authenticator app (TOTP). You'll get 10 single-use recovery codes. Store them somewhere safe.
4. On **관리** (Admin), save your OpenDART API key. It's validated with one real call, stored encrypted, and the corp list download starts right away. The app never shows it again; you can look it up on the OpenDART website. The same page shows the server's public IP to register with OpenDART, today's request usage and the jobs.
5. Invite others from **관리 → 사용자 → 초대 링크 만들기**. Links are single-use and valid for 7 days.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `ORIGIN` | (required) | Public URL, e.g. `https://dart.example.com`. Single origin for the app, MCP and OAuth. The passkey RP ID is its hostname, so changing the hostname invalidates registered passkeys. |
| `APP_SECRET` | (required) | ≥ 32 random characters. Derives the keys that encrypt TOTP secrets and hash recovery codes. Changing it invalidates all TOTP enrollments and recovery codes. |
| `REGISTRATION` | `invite` | `closed` (no new accounts), `invite` (admin-issued links only) or `open` (anyone can register as `user`). |
| `SETUP_TOKEN` | random | Token for `/setup` while no account exists. |
| `AUTO_DAILY_BUDGET` | `2000` | Daily OpenDART requests the scheduled jobs may spend (KST day). |
| `TOTAL_DAILY_CAP` | `18000` | Hard daily stop for all OpenDART traffic (OpenDART's quota is about 20,000/day). |
| `API_KEY_HOST_BINDING` | `auto` | How the stored OpenDART key is protected: `auto` binds it to this host's hardware ID when one is available, `required` refuses to store it without one, `off` uses `APP_SECRET` only. See [OpenDART key storage](#opendart-key-storage). |
| `HOST_ID_FILE` | | File holding the host's machine ID. Set to `/run/host-id` by `docker-compose.host-id.yml`. Without it the app reads `/etc/machine-id` (Linux), `IOPlatformUUID` (macOS) or `MachineGuid` (Windows). |
| `COMPOSE_FILE` | (in `.env.example`) | `docker-compose.yml:docker-compose.host-id.yml` mounts the host's `/etc/machine-id` into the container (Linux hosts only). |
| `EGRESS_IP_LOOKUP` | `on` | `off` stops the admin page from looking up this server's public IP. See [Outbound requests](#outbound-requests). |
| `ADDRESS_HEADER`, `XFF_DEPTH` | `X-Forwarded-For`, `1` (compose) | Where adapter-node reads the client IP. Unset both if there's no proxy. |
| `DOMAIN` | | Hostname for the `caddy` compose profile. |
| `APP_BIND` | `127.0.0.1:3000` | Host port mapping for the app container. |
| `DATA_DIR` | `/data` (Docker), `./data` | SQLite location. Back up this directory. |
| `HOST`, `PORT` | `0.0.0.0`, `3000` | Listen address. |
| `DISABLE_SCHEDULER` | | `1` disables the background jobs. |

## Connecting MCP clients

The MCP endpoint is `https://dart.example.com/mcp`. Clients discover the OAuth server from `/.well-known/oauth-protected-resource/mcp`, register themselves and open the consent page in your browser. You must be signed in to approve. Each client is bound to the account that first approves it and acts with that account's access. You can see and revoke your clients on **계정 → MCP 연결** (admins see all of them on **관리**).

- **Claude Code:** `claude mcp add --transport http dart https://dart.example.com/mcp` (the Account page has a copy button).
- **Claude (web/desktop) and other clients:** add a custom connector with the URL above.

Tools: `search_companies`, `get_company`, `list_filings`, `get_financials`, `get_ownership`, `get_major_events`, `get_filing_document_url`, `get_usage`. All are read-only. Cache misses spend the shared daily OpenDART budget.

## Security notes

- **Single origin, everything authenticated.** Every page and API route requires a session, except login, setup, registration/invite, `/api/health`, static assets and the MCP/OAuth machine endpoints (which use bearer tokens and PKCE).
- **Passwords:** argon2id (m = 19 MiB, t = 2, p = 1). Minimum 10 characters, checked against a list of common passwords, no composition rules.
- **Second factors:** passkeys (WebAuthn, discoverable credentials; a passkey with user verification is a complete login on its own), TOTP (RFC 6238, secret encrypted at rest with AES-256-GCM, codes can't be reused), and 10 single-use recovery codes stored as keyed hashes. Removing a factor or issuing new recovery codes requires the current password.
- **Sessions:** 256-bit random tokens in an `HttpOnly; Secure; SameSite=Lax` cookie, stored as SHA-256 hashes. Idle timeout 7 days, absolute lifetime 30 days. Tokens rotate on login and after password or factor changes. Changing your password signs out your other devices. Users can list and revoke their own sessions.
- **CSRF:** every state-changing request must carry an `Origin` header matching `ORIGIN`, whatever its content type. Only `/mcp` and the OAuth token, registration and revocation endpoints are exempt, because MCP clients aren't browsers. This check replaces SvelteKit's built-in one, which can't exempt those endpoints.
- **Abuse protection:** per-IP limits on login, second-factor, registration, setup and OAuth endpoints. Per-account progressive lockout after 5 failed attempts (1 min, doubling up to 1 h), applied to unknown usernames too. Login errors are generic and take the same time whether or not the user exists. Limits live in memory, so they reset on restart.
- **Audit log:** sign-ins, failures, lockouts and factor, session, role, invite, MCP client and API key changes are recorded with their IP addresses (kept for a year). Admins see everything; users see their own recent activity.
- **Headers:** CSP (`default-src 'self'`, nonce-based scripts, `frame-ancestors 'none'`), HSTS when `ORIGIN` is https, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`.
- **Roles:** only admins can change the OpenDART key, run jobs, see usage and audit logs, and manage users and invites. Disabling a user ends their sessions and invalidates their MCP tokens. The last active admin can't be disabled or demoted.
- **The OpenDART key** is encrypted at rest, optionally bound to the host's hardware, and never sent to any browser. See below.
- **Lost second factor:** there's no admin reset in the UI yet. If someone loses every factor and recovery code, clear them in SQLite: `UPDATE users SET totp_secret = NULL WHERE username = '…'` and delete that user's rows from `webauthn_credentials`.

### OpenDART key storage

The key is encrypted with AES-256-GCM. The encryption key is derived (HKDF-SHA256) from `APP_SECRET` and, by default, a SHA-256 digest of the host's hardware ID. A copy of the database or a backup, even together with `APP_SECRET`, can't reveal the key on another machine. The raw hardware ID is never stored or logged.

- **Linux + Docker:** the container can't see the host's ID unless it's mounted. Keep `COMPOSE_FILE=docker-compose.yml:docker-compose.host-id.yml` in `.env`, which mounts `/etc/machine-id` read-only at `/run/host-id`.
- **Docker Desktop (macOS/Windows):** remove that line. The mount doesn't fail there: it silently picks up the Docker VM's own `/etc/machine-id`, which isn't the computer's hardware ID and is regenerated when Docker Desktop is reset or reinstalled, making the stored key unreadable. The key is then protected by `APP_SECRET` only. Set `API_KEY_HOST_BINDING=required` if you'd rather refuse to store the key than fall back.
- **Without Docker:** the ID is read from `/etc/machine-id`, `IOPlatformUUID` or `MachineGuid`.
- A key saved before a host ID was available is re-encrypted with the host binding automatically once one appears. The admin page shows how the stored key is protected.

**Moving to a new server, reinstalling the OS (new machine-id) or changing `APP_SECRET` makes the stored key unreadable.** The admin page then says so, and you re-enter the key, which you can look up again by signing in to OpenDART. If you migrate servers often, set `API_KEY_HOST_BINDING=off`.

Encryption at rest protects the key in backups and copied databases. It doesn't help against software on the same host or public IP: changing the key may require contacting OpenDART support (unverified, and it may not be possible), so OpenDART's IP allowlist is what actually limits who can use it. Keep the registered IP for this server alone, as described under [Requirements](#requirements).

### Outbound requests

Besides OpenDART, the server contacts `api.ipify.org` (falling back to `icanhazip.com`) only when an admin opens the admin page, to show the public IP OpenDART will see. Set `EGRESS_IP_LOOKUP=off` to disable it. Browsers load the Pretendard web font from `cdn.jsdelivr.net`.

## Development

```sh
npm install
npm run dev:mock        # http://localhost:5173 against a local mock OpenDART API
npm run check && npm test
```

`npm run dev:mock` starts the [mock OpenDART API](test/mock-opendart/README.md): three fictional companies, snapshot 2026-10-18, so treat its shapes as stale after that. It then starts `vite dev` with `OPENDART_BASE_URL` pointing at the mock, a separate database in `.dev-data/` and a mock API key already saved. Pass vite flags after `--`, e.g. `npm run dev:mock -- --open`.

**Dev login bypass:** in this setup any username and password signs in as an admin, with no second factor. The bypass is on only when both hold:

- the app runs under `vite dev` (SvelteKit's `dev` flag is compiled to `false` in production builds, so `node build` and the Docker image never have it);
- `OPENDART_BASE_URL` points at a loopback host (`localhost`, `127.0.0.1`, `[::1]`).

The login page shows a banner and the server log a warning while it's on.

Against the real API instead:

```sh
ORIGIN=http://localhost:5173 APP_SECRET=dev-secret-dev-secret-dev-secret-00 npm run dev
```

`OPENDART_BASE_URL` (default `https://opendart.fss.or.kr/api`) overrides the API root, for testing only.

## License

[MIT](LICENSE)
