# Caddy Control

Real-time fleet management for 38 golf carts fitted with iStartek VT-100 GPS trackers. Enter a geofence → the tracker's output pin fires a relay → the cart's drive wire opens → the cart stops. Operator hits **Bypass** in the dashboard → server sends iStartek command `900,1,0,<ms>,0` → relay releases for N seconds → cart moves again.

- **Dashboard** — live satellite map, 38 markers with status colors, pulsing fence polygon, alert center, role-based nav.
- **Bookings / Leaderboard / Profiles / Fences admin** — all wired to real backend data.
- **Protocol** — iStartek V1.6 (proprietary `&&` / `$$` ASCII framed, byte-sum checksum — NOT NMEA 0183).

---

## Repository layout

```
/                       Vite + React + TypeScript frontend  →  deployed to Vercel
/server/                Node.js + TypeScript backend        →  NOT deployable to Vercel
                        (TCP :8800 for trackers, HTTP+WS :3001 for browser)
/important_info/        Protocol docs, planning notes
```

## Why the backend is not on Vercel

Vercel only runs HTTPS serverless functions and static assets. This system needs:

- **Raw TCP listener on port 8800** for 38 VT-100 devices to connect and push telemetry. Vercel doesn't expose arbitrary TCP ports.
- **Long-lived Socket.io server** for the browser dashboard. Vercel's edge runtime doesn't support a persistent socket.io server with the connection lifecycle this needs.
- **Persistent SQLite file** for alerts, trips, bookings. Vercel's serverless filesystem is ephemeral.

Host the backend elsewhere. Options:

| Option | Pros | Cons |
|---|---|---|
| **Railway** (recommended) | One-click Docker deploy, built-in TCP proxy, $5/mo free | CC required |
| **Fly.io** | TCP support, global edge, generous free tier | Slight config |
| **Oracle Cloud Free Tier** | Free VPS forever, full control | Manual Linux admin |
| Render | Docker support | TCP proxy extra config |

A `Dockerfile` + `railway.json` is provided in `server/` for one-click Railway.

---

## Deploy — frontend (Vercel)

1. Import the repo in Vercel.
2. Vercel auto-detects Vite via `vercel.json`.
3. Set env vars in the Vercel dashboard (Project Settings → Environment Variables):
   - `VITE_BACKEND_URL` → your backend public URL, e.g. `https://caddy-api.up.railway.app`
   - `VITE_MAPBOX_TOKEN` → a public `pk.*` Mapbox access token (create at https://account.mapbox.com/access-tokens/ — restrict to your Vercel domain).
4. Deploy. The frontend will be at `https://<project>.vercel.app`.

## Deploy — backend

### Option A: Railway (recommended)

```bash
# from the repo root
cd server
railway init
railway up
```

Railway detects `railway.json` and builds from the `Dockerfile`. After deploy:

1. In the Railway project → Settings → Networking:
   - Generate a public HTTPS domain → copy it and set `VITE_BACKEND_URL` in Vercel.
   - Add a **TCP Proxy** for port `8800` → copy the `tcp://<...>.railway.app:<port>` endpoint. This is what you configure on the VT-100 devices (command `100,1,<host>,<port>`).
2. Set env vars:
   - `JWT_SECRET` — 32+ random chars
   - `FRONTEND_ORIGIN` — your Vercel URL, e.g. `https://caddy-control.vercel.app`
   - `HTTP_PORT=3001`
   - `TCP_PORT=8800`
   - `FLEET_SIZE=38`

### Option B: Self-hosted VPS / Oracle Cloud

```bash
# On your Linux box (Node 20+):
git clone https://github.com/Stryder-AI/Caddy-Control.git
cd Caddy-Control/server
cp .env.example .env && $EDITOR .env    # set JWT_SECRET, FRONTEND_ORIGIN, etc.
npm install && npm run build && npm start
```

Open firewall ports 3001 (HTTP) and 8800 (TCP) to the internet.

---

## Local development

```bash
# Terminal 1 — backend (TCP :8800, HTTP/WS :3001)
cd server
cp .env.example .env
npm install
npm run dev

# Terminal 2 — simulator (38 fake VT-100 trackers)
cd server
npm run simulate -- 38 --fence-cross

# Terminal 3 — frontend (http://localhost:8080)
cp .env.example .env
npm install
npm run dev
```

Default seeded credentials:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@caddy.local` | `caddy1234` |
| Operator | `operator@caddy.local` | `operator1234` |
| Viewer | `viewer@caddy.local` | `viewer1234` |

Tests: `cd server && npm test` (codec checksum, event decode, haversine, fence geometry).

---

## Configuring real VT-100 devices

After the backend is live, point each tracker at it. Over SMS (default password `0000`):

```
0000,100,1,<backend-host>,<tcp-port>
0000,102,5,60,30
0000,122,300
```

On first TCP connect, the server provisions the device automatically:
- `110` binds cart id, `125/126` push current fences, `251` sets output mode, `212,1,1,26` ties output1 to Enter-Fence event, `900` becomes the bypass override.

---

## Tech

Frontend: Vite, React 18, TypeScript, Tailwind, Mapbox GL, socket.io-client, framer-motion, shadcn/ui.
Backend: Node 20, Fastify, Socket.io, better-sqlite3, `net` (raw TCP), bcrypt, pino, Vitest.
