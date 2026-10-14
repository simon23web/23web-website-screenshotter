# 23Web — Website Screenshotter

A local web application that renders websites in Chromium and exports full-page PNG or JPEG screenshots.

## Run

Requires Node.js 22 or newer.

```sh
npm install
npm run setup
npm start
```

Open http://localhost:3000. Use `npm run dev` for server watch mode, or set `PORT` to change the port.

## Inputs

- A single HTTP or HTTPS URL.
- A sitemap URL or uploaded XML file. Sitemap indexes are recursively resolved, including namespaced XML. Limits: 50 sitemap files, 5,000 unique pages, 10 MB per file.
- A plain-text list with one URL per line, pasted or uploaded as a `.txt` file.

Inputs add to the current page selection. Duplicate URLs are removed. Filter and select pages, then capture up to 200 per batch. Choose a desktop, tablet, mobile, or custom viewport, PNG/JPEG, and a rendering delay. Mobile presets change viewport dimensions, not browser device emulation.

Each page uses an isolated browser context. The app waits for rendering, scrolls to trigger lazy content (up to 60 viewport steps), returns to the top, and captures the full page. Failures are reported per page without stopping the batch. Download individual images or a ZIP including a JSON manifest.

Screenshots are saved under `captures/<job-id>/`. Capture status is kept in memory, so restarting the server clears the UI's job records; existing images stay on disk. One capture batch runs at a time. Sites requiring login, blocking automation, or displaying cookie banners will be captured as they appear in a fresh browser session. Infinite-scrolling sites and very large pages may require tailored capture behavior.

By default, the server binds to localhost and is intended for trusted use. Set `HOST=0.0.0.0` when running behind a deployment proxy. It can access URLs reachable from your machine; do not expose it as an unauthenticated public service.

## Verification

```sh
npm test
# With the app running:
npm run test:browser
```

The application uses [Playwright full-page screenshots](https://playwright.dev/docs/screenshots).

## Docker deployment

```sh
docker compose up -d --build
```

Open http://localhost:3000. Docker installs Chromium and its Linux dependencies using the exact Playwright version in `package-lock.json`. The app runs as a non-root user with an init process, 1 GB of shared memory for Chromium, and a `/healthz` health check. No host Node.js or browser installation is required.

Screenshots persist in the `captures` named volume across container replacements. Job status remains in memory and resets on restart. `docker compose down` preserves captures; `docker compose down -v` deletes them.

```sh
docker compose logs -f
docker compose down
```

Copy `.env.example` to `.env` to change the host port or binding address. The default published port binds to `127.0.0.1` for use with a reverse proxy. Set `BIND_ADDRESS=0.0.0.0` to publish on all host interfaces. For internet deployment, put authentication and HTTPS at the reverse proxy: the application has no built-in authentication and can browse URLs reachable from the container. This configuration runs Chromium with Playwright's default sandbox setting (disabled); use a hardened browser service if you need isolation from hostile websites.

To use Docker without Compose:

```sh
docker build -t 23web/screenshotter:local .
docker run -d --name 23web-screenshotter --init --restart unless-stopped \
  --shm-size=1g -p 127.0.0.1:3000:3000 \
  -v 23web-captures:/app/captures 23web/screenshotter:local
```

## Branding

The logo and favicon are local copies of the official [23Web](https://23web.dev) assets. The interface uses the site's charcoal backgrounds, red/coral accents, Outfit headings, and Plus Jakarta Sans body typography. Google Fonts supplies the fonts, with system sans-serif fallbacks.

## Appearance

The header theme selector offers Device theme (default), Light mode, and Dark mode. Device theme follows changes to the operating system preference live. Explicit choices are remembered in this browser and synced across tabs. The theme is applied before the page renders to avoid a flash of the wrong appearance.
