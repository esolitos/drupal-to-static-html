/**
 * File Manager for Crawler Snapshots
 * Handles saving crawled pages and assets to disk with proper structure
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

class FileManager {
  constructor(outputDir = '/output') {
    this.outputDir = outputDir;
    this.snapshotDir = null;
    this.assetMap = new Map();
    this.pageCount = 0;
    this.assetCount = 0;
  }

  initializeSnapshot() {
    const timestamp = this.getTimestamp();
    this.snapshotDir = path.join(this.outputDir, timestamp);

    fs.ensureDirSync(this.snapshotDir);
    fs.ensureDirSync(path.join(this.snapshotDir, 'files'));
    fs.ensureDirSync(path.join(this.snapshotDir, 'css'));
    fs.ensureDirSync(path.join(this.snapshotDir, 'js'));
    fs.ensureDirSync(path.join(this.snapshotDir, 'images'));

    console.log(`Created snapshot directory: ${this.snapshotDir}`);
    return this.snapshotDir;
  }

  getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hour}-${minute}-${second}`;
  }

  savePage(url, html) {
    if (!this.snapshotDir) {
      throw new Error('Snapshot not initialized. Call initializeSnapshot() first.');
    }

    const filePath = this.getPageFilePath(url);
    const fullPath = path.join(this.snapshotDir, filePath);

    fs.ensureDirSync(path.dirname(fullPath));
    fs.writeFileSync(fullPath, html, 'utf-8');

    this.pageCount++;
    return { url, filePath, fullPath };
  }

  getPageFilePath(url) {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      pathname = pathname.replace(/\/$/, '') || '/';

      if (pathname === '/') {
        return 'index.html';
      }

      pathname = pathname.substring(1);

      if (path.extname(pathname)) {
        return pathname;
      }

      return `${pathname}/index.html`;
    } catch (error) {
      console.warn(`Invalid URL: ${url}, falling back to hash-based naming`);
      const hash = crypto.createHash('md5').update(url).digest('hex');
      return `pages/${hash}.html`;
    }
  }

  /**
   * Save an asset at an explicit relative path (matching the path used in post-processed HTML).
   * Use this instead of saveAsset to keep saved paths in sync with HTML references.
   */
  saveAssetAtPath(relPath, fileBuffer) {
    if (!this.snapshotDir) {
      throw new Error('Snapshot not initialized. Call initializeSnapshot() first.');
    }

    // Strip leading slash and normalize
    const normalized = path.normalize(relPath.replace(/^\//, ''));

    // Security: prevent directory traversal
    const fullPath = path.resolve(this.snapshotDir, normalized);
    if (!fullPath.startsWith(path.resolve(this.snapshotDir) + path.sep)) {
      console.warn(`Skipping asset with unsafe path: ${relPath}`);
      return null;
    }

    // Deduplicate by content hash
    const contentHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    if (this.assetMap.has(contentHash)) return this.assetMap.get(contentHash);

    fs.ensureDirSync(path.dirname(fullPath));
    fs.writeFileSync(fullPath, fileBuffer);

    const result = { relPath: normalized, contentHash };
    this.assetMap.set(contentHash, result);
    this.assetCount++;
    return result;
  }

  saveAsset(assetUrl, fileBuffer, mimeType = 'application/octet-stream') {
    if (!this.snapshotDir) {
      throw new Error('Snapshot not initialized. Call initializeSnapshot() first.');
    }

    const contentHash = crypto.createHash('md5').update(fileBuffer).digest('hex');

    if (this.assetMap.has(contentHash)) {
      return this.assetMap.get(contentHash);
    }

    const destDir = this.getAssetDirectory(mimeType, assetUrl);
    const filename = this.getAssetFilename(assetUrl, mimeType);
    const filePath = path.join(destDir, filename);
    const fullPath = path.join(this.snapshotDir, filePath);

    fs.ensureDirSync(path.dirname(fullPath));
    fs.writeFileSync(fullPath, fileBuffer);

    const result = { assetUrl, filePath, contentHash };
    this.assetMap.set(contentHash, result);

    this.assetCount++;
    return result;
  }

  getAssetDirectory(mimeType, url = '') {
    if (mimeType.includes('image')) return 'images';
    if (mimeType.includes('stylesheet') || url.endsWith('.css')) return 'css';
    if (mimeType.includes('javascript') || url.endsWith('.js')) return 'js';
    return 'files';
  }

  getAssetFilename(url, mimeType) {
    try {
      const urlObj = new URL(url);
      let filename = path.basename(urlObj.pathname);

      if (!filename || filename === '') {
        const ext = this.getExtensionForMimeType(mimeType);
        const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
        filename = `asset-${hash}${ext}`;
      }

      filename = filename.replace(/[^a-zA-Z0-9._\-]/g, '_');
      return filename;
    } catch (error) {
      const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
      const ext = this.getExtensionForMimeType(mimeType);
      return `asset-${hash}${ext}`;
    }
  }

  getExtensionForMimeType(mimeType) {
    const mimeMap = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
      'image/webp': '.webp',
      'text/css': '.css',
      'text/javascript': '.js',
      'application/javascript': '.js',
      'application/json': '.json',
      'text/html': '.html',
      'text/plain': '.txt',
    };

    if (mimeMap[mimeType]) return mimeMap[mimeType];

    for (const [mime, ext] of Object.entries(mimeMap)) {
      if (mimeType.includes(mime.split('/')[0])) return ext;
    }

    return '';
  }

  saveMetadata(metadata) {
    if (!this.snapshotDir) throw new Error('Snapshot not initialized');

    const metadataFile = path.join(this.snapshotDir, '.metadata.json');
    const data = {
      timestamp: this.getTimestamp(),
      pagesCount: this.pageCount,
      assetsCount: this.assetCount,
      ...metadata,
    };

    fs.writeFileSync(metadataFile, JSON.stringify(data, null, 2), 'utf-8');
  }

  getSummary() {
    return {
      snapshotDir: this.snapshotDir,
      pagesCount: this.pageCount,
      assetsCount: this.assetCount,
      totalAssets: this.assetMap.size,
      timestamp: this.getTimestamp(),
    };
  }

  cleanupFailedSnapshot() {
    if (this.snapshotDir && fs.existsSync(this.snapshotDir)) {
      try {
        const files = fs.readdirSync(this.snapshotDir);
        if (files.length < 2) {
          fs.removeSync(this.snapshotDir);
          console.log(`Cleaned up incomplete snapshot: ${this.snapshotDir}`);
        }
      } catch (error) {
        console.warn(`Failed to cleanup snapshot: ${error.message}`);
      }
    }
  }

  static listSnapshots(outputDir = '/output') {
    try {
      if (!fs.existsSync(outputDir)) return [];

      const entries = fs.readdirSync(outputDir);
      return entries
        .filter((entry) => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(entry))
        .map((entry) => {
          const fullPath = path.join(outputDir, entry);
          const stats = fs.statSync(fullPath);
          return {
            name: entry,
            path: fullPath,
            createdAt: stats.birthtime,
            size: FileManager.getDirectorySize(fullPath),
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error(`Failed to list snapshots: ${error.message}`);
      return [];
    }
  }

  static getDirectorySize(dir) {
    let size = 0;
    try {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          size += FileManager.getDirectorySize(filePath);
        } else {
          size += stats.size;
        }
      });
    } catch (error) {
      console.warn(`Error calculating directory size: ${error.message}`);
    }
    return size;
  }

  static formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

module.exports = FileManager;
