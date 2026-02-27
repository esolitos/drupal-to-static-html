/**
 * Crawl Mode - Full-site recursive crawl with post-processing
 * Orchestrates: Crawler -> PostProcessor -> FileManager
 */

const axios = require('axios');
const CrawlerConfig = require('../crawler/config');
const Crawler = require('../crawler/crawler');
const PostProcessor = require('../processor/postProcessor');
const FileManager = require('../crawler/fileManager');
const HtmlUtils = require('../processor/htmlUtils');
const Logger = require('../utils/logger');

const logger = new Logger('crawl');

async function runCrawl() {
  logger.info('Starting crawl mode...');

  // Load configuration from environment
  const config = new CrawlerConfig(process.env);
  logger.info('Configuration loaded:', config.toString());

  // Initialize file manager
  const outputDir = process.env.OUTPUT_DIR || '/output';
  const fileManager = new FileManager(outputDir);
  const snapshotDir = fileManager.initializeSnapshot();
  logger.info(`Snapshot directory: ${snapshotDir}`);

  // Initialize post-processor
  const processor = new PostProcessor({
    siteDomain: config.siteHost,
    linkedinProfile: config.linkedInProfile,
    verbose: process.env.VERBOSE === 'true',
  });

  // Initialize crawler
  const crawler = new Crawler(config);

  let crawlResult;
  try {
    // Run crawler
    crawlResult = await crawler.crawl();

    logger.info(`Crawl finished: ${crawlResult.stats.pagesCrawled} pages, ${crawlResult.stats.assetCount} assets`);

    // Post-process and save each page
    logger.info('Post-processing and saving pages...');
    let savedCount = 0;

    for (const page of crawlResult.pages) {
      try {
        const processedHtml = processor.process(page.html, page.url);
        fileManager.savePage(page.url, processedHtml);
        savedCount++;

        if (savedCount % 10 === 0) {
          logger.info(`  Saved ${savedCount}/${crawlResult.pages.length} pages...`);
        }
      } catch (err) {
        logger.warn(`Failed to save page ${page.url}: ${err.message}`);
      }
    }

    logger.info(`Saved ${savedCount} pages`);

    // Download and save assets
    logger.info('Downloading and saving assets...');
    let assetCount = 0;
    const siteUrl = config.getSiteUrl();

    for (const assetUrl of crawlResult.assets) {
      try {
        const response = await axios.get(assetUrl, {
          timeout: config.connectTimeout,
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': config.getRandomUserAgent(),
            'Host': config.siteHost,
          },
          validateStatus: () => true,
        });

        if (response.status === 200) {
          const buffer = Buffer.from(response.data);
          // Compute save path matching the post-processed HTML references:
          // apply the same Drupal path rewrite so the file lands where the HTML points.
          const urlPath = new URL(assetUrl).pathname;
          const rewrittenPath = HtmlUtils.rewriteDrupalPaths(urlPath);
          fileManager.saveAssetAtPath(rewrittenPath, buffer);
          assetCount++;
        }
      } catch (err) {
        logger.warn(`Failed to download asset ${assetUrl}: ${err.message}`);
      }

      // Small delay between asset downloads
      if (config.crawlDelay > 0) {
        await new Promise((r) => setTimeout(r, Math.floor(config.crawlDelay / 4)));
      }
    }

    logger.info(`Downloaded ${assetCount} assets`);

    // Save snapshot metadata
    fileManager.saveMetadata({
      siteHost: config.siteHost,
      crawledPages: crawlResult.stats.pagesCrawled,
      savedPages: savedCount,
      downloadedAssets: assetCount,
      failedUrls: crawlResult.failed.length,
      crawlDuration: crawlResult.stats.duration,
    });

    const summary = fileManager.getSummary();
    logger.info('Crawl complete!');
    logger.info(`  Snapshot: ${summary.snapshotDir}`);
    logger.info(`  Pages: ${summary.pagesCount}`);
    logger.info(`  Assets: ${summary.assetsCount}`);

    if (crawlResult.failed.length > 0) {
      logger.warn(`  Failed URLs: ${crawlResult.failed.length}`);
      crawlResult.failed.forEach((f) => logger.warn(`    - ${f.url} (${f.error})`));
    }

    return 0; // Success exit code

  } catch (error) {
    logger.error('Crawl failed:', error.message);
    logger.error(error.stack);

    // Cleanup incomplete snapshot
    if (fileManager) {
      fileManager.cleanupFailedSnapshot();
    }

    return 1; // Failure exit code
  }
}

module.exports = { runCrawl };
