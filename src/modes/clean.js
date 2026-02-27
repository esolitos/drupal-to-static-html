/**
 * Clean Mode - List snapshots and remove temp files
 * IMPORTANT: Does NOT delete snapshots - those are kept indefinitely for manual management
 */

const fs = require('fs-extra');
const path = require('path');
const FileManager = require('../crawler/fileManager');
const Logger = require('../utils/logger');

const logger = new Logger('clean');

// Patterns for temporary files to remove
const TEMP_PATTERNS = [
  /^\.tmp-/,
  /^temp-/,
  /^partial-/,
  /^\.crawl-/,
];

async function runClean() {
  logger.info('Starting clean mode...');

  const outputDir = process.env.OUTPUT_DIR || '/output';

  if (!fs.existsSync(outputDir)) {
    logger.warn(`Output directory does not exist: ${outputDir}`);
    console.log('No output directory found. Nothing to clean.');
    return 0;
  }

  // Remove temp files from output directory (NOT snapshots)
  let removedCount = 0;
  try {
    const entries = fs.readdirSync(outputDir);
    for (const entry of entries) {
      const isTemp = TEMP_PATTERNS.some((pattern) => pattern.test(entry));
      if (isTemp) {
        const fullPath = path.join(outputDir, entry);
        fs.removeSync(fullPath);
        logger.info(`Removed temp: ${entry}`);
        removedCount++;
      }
    }
  } catch (err) {
    logger.warn(`Error cleaning temp files: ${err.message}`);
  }

  if (removedCount > 0) {
    console.log(`Removed ${removedCount} temporary file(s).`);
  } else {
    console.log('No temporary files found to remove.');
  }

  // List all snapshots
  const snapshots = FileManager.listSnapshots(outputDir);

  console.log('\n=== Available Snapshots ===');

  if (snapshots.length === 0) {
    console.log('No snapshots found.');
    console.log('Run crawl mode to create a snapshot.');
  } else {
    console.log(`Found ${snapshots.length} snapshot(s):\n`);

    snapshots.forEach((snapshot, index) => {
      const sizeStr = FileManager.formatSize(snapshot.size);
      const isLatest = index === 0 ? ' [LATEST]' : '';
      console.log(`  ${index + 1}. ${snapshot.name}${isLatest}`);
      console.log(`     Path: ${snapshot.path}`);
      console.log(`     Size: ${sizeStr}`);
      console.log(`     Created: ${snapshot.createdAt.toISOString()}`);

      // Try to read metadata
      const metadataFile = path.join(snapshot.path, '.metadata.json');
      if (fs.existsSync(metadataFile)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
          if (meta.siteHost) console.log(`     Site: ${meta.siteHost}`);
          if (meta.crawledPages) console.log(`     Pages: ${meta.crawledPages}`);
        } catch (e) {
          // metadata unreadable, skip
        }
      }

      console.log('');
    });

    console.log('NOTE: Snapshots are NOT automatically deleted.');
    console.log('To delete a snapshot, manually remove the directory.');
    if (snapshots.length > 0) {
      console.log(`\nExample: rm -rf ${snapshots[snapshots.length - 1].path}`);
    }
  }

  return 0;
}

module.exports = { runClean };
