# Polymart Status

Public-facing status page for [polymart.co](https://polymart.co). Polls live API endpoints every 30 seconds and displays real-time health for all service groups.

Built with Vite + React + TypeScript + Tailwind CSS.

---

## Quick start

**Prerequisites:** Node.js v18+

```bash
# Install dependencies
npm ci

# Start dev server (http://localhost:5173)
npm run dev
```

Or use the setup script:

```bash
# Linux / macOS
chmod +x setup.sh
./setup.sh          # dev (default)
./setup.sh build    # production build → dist/
./setup.sh preview  # build + local preview
./setup.sh docker   # build + run via Docker

# Windows (PowerShell)
.\setup.ps1         # dev (default)
.\setup.ps1 build
.\setup.ps1 preview
.\setup.ps1 docker
```

---

## Production deployment

### Google Cloud (one-click)

SSH into your Compute Engine VM, clone this repo, then run:

```bash
bash deploy.sh
```

The script will prompt for your domain and email, then handle everything:
installing Docker, building the container, configuring nginx, and issuing an
SSL certificate via Let's Encrypt.

**Before running**, make sure ports 80 and 443 are open in GCP:

```bash
gcloud compute firewall-rules create allow-http-https \
  --allow tcp:80,tcp:443 \
  --target-tags http-server,https-server
```

Or: GCP Console → VPC Network → Firewall → Create Rule.

### Docker (manual)

```bash
docker compose up --build -d
```

Serves the built app on **port 3000** via nginx. To change the port, edit `docker-compose.yml`.

### Static hosting (Vercel / Netlify / Cloudflare Pages)

Connect the repo and set:

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Node version:** 20

No extra configuration needed - the app is a pure static SPA with no server-side requirements.

---

## Configuration

There is no `.env` file required. The base API URL is hardcoded to `https://polymart.co` in [`src/pages/StatusPage.tsx`](src/pages/StatusPage.tsx).

To point at a different API origin, change the `BASE` constant at the top of that file.

---

## Adding incidents

Incidents are maintained manually in the `INCIDENTS` array near the bottom of [`src/pages/StatusPage.tsx`](src/pages/StatusPage.tsx):

```ts
const INCIDENTS = [
  {
    date: '2026-05-19',
    title: 'Maintenance to server infrastructure',
    status: 'INVESTIGATING',
  },
  {
    date: '2026-05-14',
    title: 'Brief database connectivity issue (duration: 4 min)',
    status: 'RESOLVED',
  },
]
```

Valid `status` values: `RESOLVED` · `MONITORING` · `INVESTIGATING`

---

## Project structure

```text
├── public/               Static assets (logo, images)
├── src/
│   ├── components/
│   │   └── ErrorBoundary.tsx
│   ├── lib/
│   │   └── utils.ts      cn() helper
│   ├── pages/
│   │   └── StatusPage.tsx  Main page (all monitoring logic lives here)
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── setup.sh              Linux/macOS setup script
├── setup.ps1             Windows setup script
├── tailwind.config.js
└── vite.config.ts
```

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve the production build locally |
