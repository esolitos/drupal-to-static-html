/**
 * Drupal to Static HTML Export Tool
 * Main entrypoint - dispatches to mode handlers based on MODE environment variable
 */

'use strict';

const Logger = require('./utils/logger');

const logger = new Logger('main');

const VALID_MODES = ['crawl', 'verify', 'clean'];

async function main() {
  const mode = (process.env.MODE || 'crawl').toLowerCase();

  logger.info(`drupal-to-static-html starting in mode: ${mode}`);
  logger.info(`Node.js version: ${process.version}`);

  if (!VALID_MODES.includes(mode)) {
    logger.error(`Invalid MODE: "${mode}". Must be one of: ${VALID_MODES.join(', ')}`);
    process.exit(1);
  }

  let exitCode = 1;

  try {
    switch (mode) {
      case 'crawl': {
        const { runCrawl } = require('./modes/crawl');
        exitCode = await runCrawl();
        break;
      }
      case 'verify': {
        const { runVerify } = require('./modes/verify');
        exitCode = await runVerify();
        break;
      }
      case 'clean': {
        const { runClean } = require('./modes/clean');
        exitCode = await runClean();
        break;
      }
    }
  } catch (error) {
    logger.error(`Unhandled error in mode "${mode}":`, error.message);
    logger.error(error.stack);
    exitCode = 1;
  }

  logger.info(`Exiting with code: ${exitCode}`);
  process.exit(exitCode);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  console.error(error.stack);
  process.exit(1);
});

main();
