# Drupal to Static HTML Export Tool

A Docker-based crawler that exports any Drupal site to static HTML for nginx hosting. Supports Drupal 7, 8, 9, and 10.

## Features

- **Full-site recursive crawling** — BFS-based crawler with configurable depth and rate limiting
- **URL rewriting** — Converts absolute URLs to relative, rewrites Drupal file paths (`/sites/default/files/` → `/files/`)
- **JATOS form replacement** — Replaces experiment signup forms with a LinkedIn contact link
- **Admin element removal** — Strips Drupal admin toolbar, login forms, and edit links
- **Timestamped snapshots** — Each crawl creates a `YYYY-MM-DD_HH-MM-SS` snapshot in `/output/`
- **Asset deduplication** — Identical assets are stored only once
- **Cloudflare-aware** — Custom Host header + IP override for crawling behind Cloudflare
- **Three modes** — `crawl`, `verify`, `clean`

## Quick Start

```bash
docker run --rm -v $(pwd)/output:/output \
  -e SITE_HOST=esolitos.com \
  -e SITE_IP=127.0.0.1 \
  -e LINKEDIN_PROFILE=https://linkedin.com/in/your-name \
  -e MODE=crawl \
  ghcr.io/esolitos/drupal-to-static-html:latest
```

## Modes of Operation

### Crawl Mode (default)

Performs a full-site recursive crawl, applies post-processing, and saves to a timestamped snapshot.

```bash
docker run --rm -v $(pwd)/output:/output \
  -e SITE_HOST=example.com \
  -e SITE_IP=1.2.3.4 \
  -e LINKEDIN_PROFILE=https://linkedin.com/in/user \
  -e MODE=crawl \
  ghcr.io/esolitos/drupal-to-static-html:latest
```

Output structure:
```
output/
└── 2025-02-27_14-30-45/
    ├── index.html
    ├── about/index.html
    ├── blog/post-title/index.html
    ├── css/
    ├── js/
    ├── images/
    ├── files/
    └── .metadata.json
```

### Verify Mode

Validates the latest snapshot for broken links and missing assets.

```bash
docker run --rm -v $(pwd)/output:/output \
  -e MODE=verify \
  ghcr.io/esolitos/drupal-to-static-html:latest
```

Exits with code `0` if valid, `1` if issues found.

### Clean Mode

Lists all available snapshots and removes any temporary files. **Does NOT delete snapshots.**

```bash
docker run --rm -v $(pwd)/output:/output \
  -e MODE=clean \
  ghcr.io/esolitos/drupal-to-static-html:latest
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MODE` | `crawl` | Operation mode: `crawl`, `verify`, or `clean` |
| `SITE_HOST` | `localhost` | Domain name to crawl (e.g., `esolitos.com`) |
| `SITE_IP` | `127.0.0.1` | IP address to connect to (Cloudflare bypass) |
| `LINKEDIN_PROFILE` | `https://linkedin.com` | LinkedIn URL for JATOS form replacement |
| `CRAWL_DELAY` | `500` | Milliseconds between requests (0 = no delay) |
| `MAX_DEPTH` | `0` | Maximum crawl depth (0 = unlimited) |
| `MAX_PAGES` | `10000` | Maximum pages to crawl (safety limit) |
| `CONNECT_TIMEOUT` | `10000` | HTTP connection timeout in milliseconds |
| `READ_TIMEOUT` | `30000` | HTTP read timeout in milliseconds |
| `MAX_RETRIES` | `3` | Retry count for failed requests |
| `OUTPUT_DIR` | `/output` | Output directory (mount a volume here) |
| `VERBOSE` | `false` | Enable verbose logging (`true`/`false`) |

## Usage Examples

### Crawl a local Drupal container

```bash
# Drupal running locally on port 8080
docker run --rm \
  --network host \
  -v $(pwd)/output:/output \
  -e SITE_HOST=esolitos.com \
  -e SITE_IP=127.0.0.1 \
  -e LINKEDIN_PROFILE=https://linkedin.com/in/esolitos \
  -e MODE=crawl \
  -e CRAWL_DELAY=100 \
  ghcr.io/esolitos/drupal-to-static-html:latest
```

### Crawl a public site (Cloudflare-protected)

```bash
# Resolve real IP first: dig +short esolitos.com
docker run --rm \
  -v $(pwd)/output:/output \
  -e SITE_HOST=esolitos.com \
  -e SITE_IP=<resolved-ip> \
  -e LINKEDIN_PROFILE=https://linkedin.com/in/esolitos \
  -e MODE=crawl \
  ghcr.io/esolitos/drupal-to-static-html:latest
```

### Limited crawl (testing)

```bash
docker run --rm \
  -v $(pwd)/output:/output \
  -e SITE_HOST=esolitos.com \
  -e MODE=crawl \
  -e MAX_PAGES=10 \
  -e MAX_DEPTH=2 \
  -e CRAWL_DELAY=0 \
  ghcr.io/esolitos/drupal-to-static-html:latest
```

### Verify + auto-exit

```bash
docker run --rm -v $(pwd)/output:/output -e MODE=verify \
  ghcr.io/esolitos/drupal-to-static-html:latest && echo "PASS" || echo "FAIL"
```

## Repository Structure

```
drupal-to-static-html/
├── Dockerfile                     # Node.js 20 Alpine image
├── package.json                   # Dependencies: axios, cheerio, fs-extra
├── src/
│   ├── index.js                   # Main entrypoint (mode dispatch)
│   ├── modes/
│   │   ├── crawl.js               # Crawl mode orchestration
│   │   ├── verify.js              # Verify mode (snapshot validation)
│   │   └── clean.js               # Clean mode (temp file removal + snapshot listing)
│   ├── crawler/
│   │   ├── config.js              # Configuration from environment variables
│   │   ├── crawler.js             # BFS web crawler with retry logic
│   │   └── fileManager.js         # Snapshot creation and asset management
│   ├── processor/
│   │   ├── postProcessor.js       # URL rewriting, JATOS replacement, admin removal
│   │   └── htmlUtils.js           # HTML manipulation utilities
│   └── utils/
│       ├── logger.js              # Stdout logger with timestamps
│       └── helpers.js             # Utility functions
├── .github/
│   └── workflows/
│       └── build-and-publish.yml  # Builds and pushes to ghcr.io on release
└── README.md
```

## Post-Processing Details

### URL Rewriting
- Absolute same-domain URLs → relative: `https://example.com/about` → `/about`
- Drupal file paths: `/sites/default/files/image.jpg` → `/files/image.jpg`
- Handles `href`, `src`, and `srcset` attributes

### JATOS Form Replacement
Detects JATOS experiment elements (iframes, forms, links with `jatos` or `experiment` in their attributes) and replaces them with:
```html
<div class="jatos-replacement">
  <p>Experiments have concluded. Contact me on <a href="...">LinkedIn</a>.</p>
</div>
```

### Admin Element Removal
Removes:
- `#admin-bar`, `.admin-toolbar`, `.navbar-admin`, `.admin-menu`
- `#user-menu`, `.user-account-menu`
- Login forms (`#login-form`, `.login-form`)
- Links to `/admin/*`, `/user/logout`, `/user/login`, `/edit`, `/delete`

## Building Locally

```bash
git clone https://github.com/esolitos/drupal-to-static-html.git
cd drupal-to-static-html
npm install
docker build -t drupal-to-static-html .
```

## Publishing

The Docker image is automatically built and published to [ghcr.io/esolitos/drupal-to-static-html](https://ghcr.io/esolitos/drupal-to-static-html) when a GitHub release is created.

Tags published:
- `latest` — most recent release
- `v0.1.0` — exact version tag
- `0.1` — major.minor tag

## Target Sites

This tool was built for:
- **[esolitos.com](https://esolitos.com)** — Drupal 7 portfolio site
- **[marta.velnic.net](https://marta.velnic.net)** — Drupal 10 research platform with JATOS experiments

## Troubleshooting

### Crawler too slow?
Reduce `CRAWL_DELAY` (default 500ms). For local Docker containers, `CRAWL_DELAY=0` is safe.

### Cloudflare blocking crawl?
- Set `SITE_IP` to the origin server's real IP (bypasses Cloudflare CDN)
- The crawler sends a `Host` header with `SITE_HOST` to the `SITE_IP` address

### Missing pages?
- Check for JavaScript-rendered content (this tool doesn't execute JS)
- Increase `MAX_DEPTH` if the default limit is too shallow
- Check failed URLs in crawl output

### JATOS forms not replaced?
The detector looks for `jatos` or `experiment` in form `action`, `class`, or iframe `src`. Adjust patterns in `src/processor/postProcessor.js` if your site uses different identifiers.

### Out of disk space?
Each snapshot can be 50-500MB depending on site size. Use `clean` mode to list snapshots, then manually `rm -rf` old ones.

## License

MIT — see [LICENSE](LICENSE)
