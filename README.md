# Drupal to Static HTML Export Tool

Docker-based crawler that exports Drupal sites to static HTML for nginx hosting.

## Project Status

Under Development

## Quick Start

```bash
docker run --rm -v $(pwd)/output:/output \
  -e SITE_HOST=esolitos.com \
  -e SITE_IP=127.0.0.1 \
  -e LINKEDIN_PROFILE=https://linkedin.com/in/your-name \
  -e MODE=crawl \
  ghcr.io/esolitos/drupal-to-static-html:latest
```

## Features

- Full-site recursive crawling (Node.js-based)
- Post-processing: URL rewriting, form replacement
- Crawl, Verify, Clean modes
- Docker containerization
- GitHub Container Registry (ghcr.io) distribution
- Cloudflare-aware crawling (Host header + IP override)

## Repository Structure

- `src/` - Application source code
  - `modes/` - Operating modes (crawl, verify, clean)
  - `crawler/` - Core crawling logic
  - `processor/` - HTML post-processing
  - `utils/` - Utilities (logging, helpers)
- `.github/workflows/` - GitHub Actions CI/CD
- `Dockerfile` - Container definition

## License

MIT
