/**
 * Drupal Site Crawler
 * Recursively crawls a Drupal site and collects all pages/assets
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const CrawlerConfig = require('./config');

class Crawler {
  constructor(config) {
    if (!(config instanceof CrawlerConfig)) {
      throw new TypeError('config must be a CrawlerConfig instance');
    }

    this.config = config;
    this.visitedUrls = new Set();
    this.queuedUrls = new Set();
    this.crawledPages = [];
    this.failedUrls = [];
    this.assetUrls = new Set();
    this.urlDepthMap = new Map();

    this.httpClient = axios.create({
      timeout: this.config.connectTimeout,
      maxRedirects: 10,
      validateStatus: () => true,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });
  }

  async crawl() {
    console.log('Starting crawl with config:');
    console.log(this.config.toString());
    console.log(`\nCrawling: ${this.config.getSiteUrl()}`);
    console.log(`Connecting to IP: ${this.config.siteIp}\n`);

    const startTime = Date.now();
    const startingUrl = this.config.getSiteUrl() + '/';

    this.queueUrl(startingUrl, 0);

    let processedCount = 0;
    while (this.queuedUrls.size > 0 && processedCount < this.config.maxPages) {
      const url = Array.from(this.queuedUrls)[0];
      this.queuedUrls.delete(url);

      const depth = this.getDepthForUrl(url);

      if (this.config.maxDepth > 0 && depth > this.config.maxDepth) {
        console.log(`Max depth reached: ${url}`);
        continue;
      }

      if (this.visitedUrls.has(url)) {
        continue;
      }

      this.visitedUrls.add(url);
      processedCount++;

      console.log(`[${processedCount}/${this.config.maxPages}] Fetching: ${url}`);

      try {
        const page = await this.fetchPage(url);

        if (page.status === 200) {
          this.crawledPages.push({
            url,
            html: page.html,
            status: page.status,
            depth,
            timestamp: Date.now(),
          });

          const newUrls = this.extractUrls(page.html, url);
          console.log(`  Found ${newUrls.urls.length} links, ${newUrls.assets.length} assets`);

          newUrls.urls.forEach((newUrl) => {
            if (!this.visitedUrls.has(newUrl) && !this.queuedUrls.has(newUrl)) {
              this.queueUrl(newUrl, depth + 1);
            }
          });

          newUrls.assets.forEach((asset) => this.assetUrls.add(asset));
        } else if (page.status === 'binary-asset') {
          // Non-HTML response (e.g. application/zip, Content-Disposition: attachment).
          // Route to the asset download pipeline so it is saved as binary, not garbled HTML.
          console.log(`  Binary asset (${page.contentType}) — queued for asset download`);
          this.assetUrls.add(url);
        } else {
          console.log(`  Status ${page.status} (skipping)`);
          this.failedUrls.push({ url, status: page.status, error: page.error });
        }
      } catch (error) {
        console.log(`  Error: ${error.message}`);
        this.failedUrls.push({ url, status: 0, error: error.message });
      }

      if (this.config.crawlDelay > 0) {
        await this.sleep(this.config.crawlDelay);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nCrawl complete in ${duration}s`);
    console.log(`Pages crawled: ${this.crawledPages.length}`);
    console.log(`Assets found: ${this.assetUrls.size}`);
    console.log(`Failed URLs: ${this.failedUrls.length}`);

    return {
      pages: this.crawledPages,
      assets: Array.from(this.assetUrls),
      failed: this.failedUrls,
      stats: {
        pagesCrawled: this.crawledPages.length,
        assetCount: this.assetUrls.size,
        failureCount: this.failedUrls.length,
        duration: duration + 's',
      },
    };
  }

  async fetchPage(url, attempt = 0) {
    try {
      const headers = {
        'User-Agent': this.config.getRandomUserAgent(),
        'Host': this.config.siteHost,
      };

      const response = await this.httpClient.get(url, { headers });

      if (response.status === 200 && response.data) {
        const contentType = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const contentDisp = (response.headers['content-disposition'] || '').toLowerCase();

        // Only treat as a page if the response is HTML (or content-type is absent, which defaults to text/html per spec).
        // Any other content-type or a Content-Disposition: attachment header means the response is a
        // downloadable binary that must be saved as an asset, not parsed as HTML.
        const isHtml = !contentType || contentType === 'text/html' || contentType === 'application/xhtml+xml';
        const isAttachment = /\battachment\b/.test(contentDisp);

        if (!isHtml || isAttachment) {
          return { html: '', status: 'binary-asset', contentType };
        }

        return { html: response.data, status: 200 };
      } else {
        return { html: '', status: response.status, error: `HTTP ${response.status}` };
      }
    } catch (error) {
      if (attempt < this.config.maxRetries) {
        console.log(`  Retry attempt ${attempt + 1}/${this.config.maxRetries}...`);
        await this.sleep(1000 * (attempt + 1));
        return this.fetchPage(url, attempt + 1);
      }
      return { html: '', status: 0, error: error.message };
    }
  }

  // File extensions that should be downloaded as binary assets rather than crawled as pages.
  static get BINARY_EXTENSIONS() {
    return /\.(zip|gz|tar|7z|rar|bz2|pdf|docx?|xlsx?|pptx?|odt|ods|odp|csv|mp3|mp4|wav|ogg|webm|avi|mov|mkv|flac|aac|woff2?|ttf|eot|otf)(\?.*)?$/i;
  }

  extractUrls(html, pageUrl) {
    const urls = new Set();
    const assets = new Set();

    try {
      const $ = cheerio.load(html);

      $('a[href]').each((_, elem) => {
        const href = $(elem).attr('href');
        const absoluteUrl = this.resolveUrl(href, pageUrl);
        if (!this.isSameDomain(absoluteUrl)) return;

        // Binary files linked via <a href> should be downloaded as assets, not crawled as pages.
        try {
          const pathname = new URL(absoluteUrl).pathname;
          if (Crawler.BINARY_EXTENSIONS.test(pathname)) {
            assets.add(absoluteUrl);
            return;
          }
        } catch (_) { /* fall through to urls */ }

        urls.add(absoluteUrl);
      });

      $('img[src], script[src], link[href][rel~=stylesheet]').each((_, elem) => {
        const src = $(elem).attr('src') || $(elem).attr('href');
        const absoluteUrl = this.resolveUrl(src, pageUrl);
        if (this.isSameDomain(absoluteUrl)) {
          assets.add(absoluteUrl);
        }
      });

      $('form[action]').each((_, elem) => {
        const action = $(elem).attr('action');
        const absoluteUrl = this.resolveUrl(action, pageUrl);
        if (this.isSameDomain(absoluteUrl)) {
          urls.add(absoluteUrl);
        }
      });
    } catch (error) {
      console.error(`Error extracting URLs: ${error.message}`);
    }

    return {
      urls: Array.from(urls),
      assets: Array.from(assets),
    };
  }

  resolveUrl(relativeUrl, baseUrl) {
    if (!relativeUrl) return '';
    if (relativeUrl.startsWith('#')) return '';
    if (/^(data:|javascript:|mailto:|tel:|sms:)/.test(relativeUrl)) return '';
    try {
      return new URL(relativeUrl, baseUrl).href;
    } catch (error) {
      return '';
    }
  }

  isSameDomain(url) {
    try {
      const parsedUrl = new URL(url);
      const urlHost = parsedUrl.hostname.replace(/^www\./, '');
      // Use siteHostname (port-stripped) so SITE_HOST=example.com:8080 still matches
      const siteHost = this.config.siteHostname.replace(/^www\./, '');
      return urlHost === siteHost;
    } catch (error) {
      return false;
    }
  }

  queueUrl(url, depth) {
    if (!this.visitedUrls.has(url) && !this.queuedUrls.has(url)) {
      this.queuedUrls.add(url);
      this.urlDepthMap.set(url, depth);
    }
  }

  getDepthForUrl(url) {
    return this.urlDepthMap.get(url) || 0;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = Crawler;
