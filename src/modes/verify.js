/**
 * Verify Mode - Validates the latest snapshot for completeness
 * Checks for broken links, missing assets, and reports to stdout
 */

const fs = require('fs-extra');
const path = require('path');
const cheerio = require('cheerio');
const FileManager = require('../crawler/fileManager');
const Logger = require('../utils/logger');

const logger = new Logger('verify');

async function runVerify() {
  logger.info('Starting verify mode...');

  const outputDir = process.env.OUTPUT_DIR || '/output';

  // Find latest snapshot
  const snapshots = FileManager.listSnapshots(outputDir);

  if (snapshots.length === 0) {
    logger.error('No snapshots found in output directory:', outputDir);
    logger.error('Run crawl mode first to create a snapshot.');
    return 1;
  }

  const latestSnapshot = snapshots[0];
  logger.info(`Verifying snapshot: ${latestSnapshot.name}`);
  logger.info(`  Path: ${latestSnapshot.path}`);
  logger.info(`  Size: ${FileManager.formatSize(latestSnapshot.size)}`);

  const issues = [];
  const warnings = [];
  let htmlFilesChecked = 0;

  // Walk all HTML files in snapshot
  const htmlFiles = findHtmlFiles(latestSnapshot.path);
  logger.info(`Found ${htmlFiles.length} HTML files to check`);

  for (const htmlFile of htmlFiles) {
    try {
      const html = fs.readFileSync(htmlFile, 'utf-8');
      const $ = cheerio.load(html);
      const relativeHtmlPath = path.relative(latestSnapshot.path, htmlFile);

      // Check all href links
      $('a[href]').each((_, elem) => {
        const href = $(elem).attr('href');
        if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) {
          return; // Skip external, anchors, special schemes
        }

        // Check if relative link target exists as file
        const targetPath = resolveLocalPath(href, latestSnapshot.path, htmlFile);
        if (targetPath && !fs.existsSync(targetPath)) {
          issues.push({
            type: 'broken-link',
            file: relativeHtmlPath,
            href,
            target: targetPath,
          });
        }
      });

      // Check all src attributes (images, scripts)
      $('[src]').each((_, elem) => {
        const src = $(elem).attr('src');
        if (!src || src.startsWith('http') || src.startsWith('data:')) {
          return;
        }

        const targetPath = resolveLocalPath(src, latestSnapshot.path, htmlFile);
        if (targetPath && !fs.existsSync(targetPath)) {
          issues.push({
            type: 'missing-asset',
            file: relativeHtmlPath,
            src,
            target: targetPath,
          });
        }
      });

      // Check all stylesheet links
      $('link[rel~=stylesheet][href]').each((_, elem) => {
        const href = $(elem).attr('href');
        if (!href || href.startsWith('http')) return;

        const targetPath = resolveLocalPath(href, latestSnapshot.path, htmlFile);
        if (targetPath && !fs.existsSync(targetPath)) {
          issues.push({
            type: 'missing-stylesheet',
            file: relativeHtmlPath,
            href,
            target: targetPath,
          });
        }
      });

      htmlFilesChecked++;
    } catch (err) {
      warnings.push({ type: 'read-error', file: htmlFile, error: err.message });
    }
  }

  // Check for metadata file
  const metadataFile = path.join(latestSnapshot.path, '.metadata.json');
  let metadata = null;
  if (fs.existsSync(metadataFile)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
    } catch (e) {
      warnings.push({ type: 'metadata-parse-error', error: e.message });
    }
  } else {
    warnings.push({ type: 'no-metadata', message: 'No .metadata.json found in snapshot' });
  }

  // Check for index.html
  const indexHtml = path.join(latestSnapshot.path, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    issues.push({ type: 'missing-index', message: 'No index.html found in snapshot root' });
  }

  // Print report
  console.log('\n=== Snapshot Verification Report ===');
  console.log(`Snapshot: ${latestSnapshot.name}`);
  console.log(`HTML files checked: ${htmlFilesChecked}`);

  if (metadata) {
    console.log(`\nSnapshot metadata:`);
    console.log(`  Site: ${metadata.siteHost || 'unknown'}`);
    console.log(`  Pages crawled: ${metadata.crawledPages || 'unknown'}`);
    console.log(`  Assets downloaded: ${metadata.downloadedAssets || 'unknown'}`);
    console.log(`  Crawl duration: ${metadata.crawlDuration || 'unknown'}`);
  }

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    warnings.forEach((w) => console.log(`  [WARN] ${w.type}: ${w.message || w.error || JSON.stringify(w)}`));
  }

  if (issues.length === 0) {
    console.log('\nResult: PASS - No issues found');
    return 0;
  } else {
    console.log(`\nIssues found (${issues.length}):`);

    // Group by type
    const grouped = {};
    issues.forEach((issue) => {
      if (!grouped[issue.type]) grouped[issue.type] = [];
      grouped[issue.type].push(issue);
    });

    for (const [type, typeIssues] of Object.entries(grouped)) {
      console.log(`\n  ${type} (${typeIssues.length}):`);
      typeIssues.slice(0, 10).forEach((issue) => {
        console.log(`    - In ${issue.file}: ${issue.href || issue.src} -> NOT FOUND`);
      });
      if (typeIssues.length > 10) {
        console.log(`    ... and ${typeIssues.length - 10} more`);
      }
    }

    console.log('\nResult: FAIL - Issues found');
    return 1;
  }
}

function findHtmlFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...findHtmlFiles(fullPath));
      } else if (entry.endsWith('.html')) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    logger.warn(`Error reading directory ${dir}: ${err.message}`);
  }
  return results;
}

function resolveLocalPath(href, snapshotRoot, currentFile) {
  try {
    // Remove query string and hash
    const cleanHref = href.split('?')[0].split('#')[0];
    if (!cleanHref) return null;

    if (cleanHref.startsWith('/')) {
      // Absolute path relative to snapshot root
      return path.join(snapshotRoot, cleanHref);
    } else {
      // Relative to current file's directory
      return path.join(path.dirname(currentFile), cleanHref);
    }
  } catch (e) {
    return null;
  }
}

module.exports = { runVerify };
