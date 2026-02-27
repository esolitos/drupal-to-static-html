/**
 * Crawler Configuration Manager
 * Loads settings from environment variables with sensible defaults
 */

class CrawlerConfig {
  constructor(env = process.env) {
    // Site configuration
    this.siteHost = env.SITE_HOST || 'localhost';
    this.siteIp = env.SITE_IP || '127.0.0.1';
    this.linkedInProfile = env.LINKEDIN_PROFILE || 'https://linkedin.com';

    // Crawling behavior
    this.crawlDelay = parseInt(env.CRAWL_DELAY || '500', 10);
    this.maxDepth = parseInt(env.MAX_DEPTH || '0', 10);
    this.maxPages = parseInt(env.MAX_PAGES || '10000', 10);

    // HTTP configuration
    this.connectTimeout = parseInt(env.CONNECT_TIMEOUT || '10000', 10);
    this.readTimeout = parseInt(env.READ_TIMEOUT || '30000', 10);
    this.maxRetries = parseInt(env.MAX_RETRIES || '3', 10);

    // User Agent rotation
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];

    this.validate();
  }

  validate() {
    if (!this.siteHost) throw new Error('SITE_HOST must be set');
    if (!this.siteIp) throw new Error('SITE_IP must be set');
    if (this.crawlDelay < 0) throw new Error('CRAWL_DELAY must be >= 0');
    if (this.maxRetries < 0) throw new Error('MAX_RETRIES must be >= 0');
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  getSiteUrl() {
    return `https://${this.siteHost}`;
  }

  toString() {
    return `CrawlerConfig {
  siteHost: ${this.siteHost}
  siteIp: ${this.siteIp}
  crawlDelay: ${this.crawlDelay}ms
  maxDepth: ${this.maxDepth === 0 ? 'unlimited' : this.maxDepth}
  maxPages: ${this.maxPages}
  connectTimeout: ${this.connectTimeout}ms
  maxRetries: ${this.maxRetries}
}`;
  }
}

module.exports = CrawlerConfig;
