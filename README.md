# Dieter

A self-hosted web app for scheduling **set temperature** and **power off** actions on a **Daikin FDYA / BRP15B61 Airbase** heat pump. Runs on a Synology NAS (or any Docker host) and installs as a home screen app on iOS and Android.

![Dark UI showing temperature status and schedule list](screenshot.png)

## Features

- **Live status** — current set temp, room temp, outdoor temp, mode
- **Power toggle** — turn the unit on/off from the home screen
- **Time-based scheduling** — add as many schedules as you want, per day of week
- **Off schedules** — create "power off" events that do not require a temperature
- **PWA** — install on iOS / Android home screen; works like a native app
- **Local-only** — communicates directly with the BRP15B61 on your LAN; no cloud required

## Requirements

| Item | Detail |
|------|--------|
| Heat pump controller | Daikin BRP15B61 Airbase |
| NAS | Synology DS218+ or any x86/x64 Synology with Docker support |
| Router | Ability to set a static DHCP lease for the Daikin unit |

## Setup

### 1. Static IP for the Daikin unit

Log in to your router and assign a **static DHCP lease** to the BRP15B61's MAC address. Note the IP address — you'll need it in step 3.

### 2. Enable Docker on your NAS

Open **Package Center** → search **Container Manager** → Install.

### 3. Clone and configure

```bash
git clone https://github.com/yourname/daikin-scheduler.git
cd daikin-scheduler
cp .env.example .env
nano .env          # fill in DAIKIN_HOST, TZ, PORT
```

Minimum `.env`:

```
DAIKIN_HOST=192.168.1.42   # your Daikin's IP
TZ=Pacific/Auckland
PORT=8080
```

### 4. Deploy via SSH

SSH into your NAS and run:

```bash
cd /volume1/docker/daikin-scheduler   # or wherever you cloned it
docker compose up -d --build
```

The first build takes ~3 minutes while Node compiles the frontend.

### 5. Open the app

Visit `http://<nas-ip>:8080` in your browser.

### 6. Install on your home screen

**iOS (Safari):**
1. Open `http://<nas-ip>:8080` in Safari
2. Tap the Share button → **Add to Home Screen**
3. Tap **Add**

**Android (Chrome):**
1. Open the URL in Chrome
2. Tap the menu → **Add to Home screen** (or look for the install banner)

## Updating

```bash
cd /volume1/docker/daikin-scheduler
git pull
docker compose up -d --build
```

## Architecture

```
Browser / PWA
      │  HTTP on LAN
      ▼
[Nginx :80]  ──── /api/* ──▶  [FastAPI :8000]  ──── HTTP ──▶  BRP15B61
      │                              │
      │                        APScheduler
      │                        (cron jobs)
      ▼                              │
  React SPA                    SQLite /data/
```

- **Frontend** — React, served by Nginx, proxies `/api` to the backend
- **Backend** — FastAPI + APScheduler (Python 3.12)
- **Database** — SQLite at `/data/scheduler.db` (Docker volume; survives restarts)
- **Daikin API** — local HTTP on `/skyfi/aircon/*` endpoints

## API reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Current unit state |
| POST | `/api/control` | Direct control `{power, mode, temperature}` |
| GET | `/api/schedules` | List all schedules |
| POST | `/api/schedules` | Create schedule |
| PATCH | `/api/schedules/:id` | Update schedule |
| DELETE | `/api/schedules/:id` | Delete schedule |

### Schedule payloads

Schedules no longer use a `label` field. Use `action` to choose behavior:

- `setpoint` — turn unit on and apply `temperature` + `mode`
- `off` — turn unit off; `temperature` and `mode` are optional/ignored

Create setpoint schedule:

```json
{
  "time": "07:00",
  "days": ["mon", "tue", "wed", "thu", "fri"],
  "action": "setpoint",
  "temperature": 20,
  "mode": "heat",
  "enabled": true
}
```

Create off schedule:

```json
{
  "time": "22:30",
  "days": ["sun", "mon", "tue", "wed", "thu"],
  "action": "off",
  "enabled": true
}
```

## Troubleshooting

**"Unit unreachable"** — Check the `DAIKIN_HOST` in `.env` matches the unit's IP. Make sure your NAS and the Daikin are on the same network/VLAN.

**Schedules not firing** — Verify `TZ` in `.env` is set correctly. Check backend logs: `docker compose logs backend -f`.

**Frontend not loading** — Check `docker compose logs frontend`.

## Timezone values

Common NZ/AU values for `.env`:

```
TZ=Pacific/Auckland        # New Zealand
TZ=Australia/Sydney
TZ=Australia/Melbourne
TZ=Australia/Brisbane
TZ=Australia/Perth
```

Full list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

## License

MIT
