/**
 * HTML Post-Processor for Drupal Exports
 * Transforms Drupal-generated HTML into static-friendly HTML
 */

const cheerio = require('cheerio');
const HtmlUtils = require('./htmlUtils');

class PostProcessor {
  constructor(config = {}) {
    this.siteDomain = config.siteDomain || 'localhost';
    this.linkedinProfile = config.linkedinProfile || 'https://linkedin.com';
    this.verbose = config.verbose || false;
  }

  process(html, pageUrl = '') {
    if (!html || typeof html !== 'string') {
      console.warn('Invalid HTML input');
      return html;
    }

    let processed = html;
    processed = HtmlUtils.sanitizeHtml(processed);
    const $ = cheerio.load(processed);
    this.rewriteUrls($);
    this.replaceJatosForms($);
    this.removeAdminElements($);
    this.cleanupHtml($);
    return $.html();
  }

  rewriteUrls($) {
    if (this.verbose) console.log('  Rewriting URLs...');

    $('[href]').each((_, elem) => {
      const $elem = $(elem);
      let href = $elem.attr('href');
      if (href) {
        if (HtmlUtils.isSpecialUrl(href)) return;
        href = HtmlUtils.rewriteDrupalPaths(href);
        href = HtmlUtils.toRelativeUrl(href, this.siteDomain);
        $elem.attr('href', href);
      }
    });

    $('[src]').each((_, elem) => {
      const $elem = $(elem);
      let src = $elem.attr('src');
      if (src) {
        if (HtmlUtils.isSpecialUrl(src)) return;
        src = HtmlUtils.rewriteDrupalPaths(src);
        src = HtmlUtils.toRelativeUrl(src, this.siteDomain);
        $elem.attr('src', src);
      }
    });

    $('[srcset]').each((_, elem) => {
      const $elem = $(elem);
      let srcset = $elem.attr('srcset');
      if (srcset) {
        srcset = srcset.split(',').map((item) => {
          const parts = item.trim().split(/\s+/);
          const url = parts[0];
          const descriptor = parts.slice(1).join(' ');
          let rewritten = url;
          if (!HtmlUtils.isSpecialUrl(rewritten)) {
            rewritten = HtmlUtils.rewriteDrupalPaths(rewritten);
            rewritten = HtmlUtils.toRelativeUrl(rewritten, this.siteDomain);
          }
          return descriptor ? `${rewritten} ${descriptor}` : rewritten;
        }).join(', ');
        $elem.attr('srcset', srcset);
      }
    });

    if (this.verbose) console.log('    URLs rewritten');
  }

  replaceJatosForms($) {
    if (this.verbose) console.log('  Replacing JATOS forms...');
    let replacementCount = 0;

    $('iframe[src*="jatos"], iframe[class*="jatos"]').each((_, elem) => {
      $(elem).replaceWith(HtmlUtils.createJatosReplacement(this.linkedinProfile));
      replacementCount++;
    });

    $('form').each((_, elem) => {
      const $form = $(elem);
      const action = $form.attr('action') || '';
      const formClass = $form.attr('class') || '';
      if (/jatos|experiment|signup/i.test(action + formClass)) {
        $form.replaceWith(HtmlUtils.createJatosReplacement(this.linkedinProfile));
        replacementCount++;
      }
    });

    $('a').each((_, elem) => {
      const $link = $(elem);
      const href = $link.attr('href') || '';
      const text = $link.text();
      if (/jatos|experiment/.test(href + text.toLowerCase())) {
        $link.replaceWith(HtmlUtils.createJatosReplacement(this.linkedinProfile));
        replacementCount++;
      }
    });

    if (this.verbose && replacementCount > 0) {
      console.log(`    Replaced ${replacementCount} JATOS elements`);
    }
  }

  removeAdminElements($) {
    if (this.verbose) console.log('  Removing admin elements...');
    let removedCount = 0;

    const adminSelectors = [
      '#admin-bar',
      '.admin-toolbar',
      '.navbar-admin',
      '.admin-menu',
      '#user-menu',
      '.user-account-menu',
      '#login-form',
      '.login-form',
      '[role="complementary"] nav',
    ];

    adminSelectors.forEach((selector) => {
      const count = $(selector).length;
      $(selector).remove();
      removedCount += count;
    });

    $('a').each((_, elem) => {
      const $link = $(elem);
      const href = $link.attr('href') || '';
      const text = $link.text().toLowerCase();
      if (/^\/admin|\/user\/logout|\/user\/login|^\/edit|^\/delete|^\/revisions/.test(href)) {
        $link.parent().is('li') ? $link.parent().remove() : $link.remove();
        removedCount++;
      }
      if (/edit|delete|revise|unpublish/i.test(text) && $link.attr('rel') === 'admin') {
        $link.remove();
        removedCount++;
      }
    });

    if (this.verbose && removedCount > 0) {
      console.log(`    Removed ${removedCount} admin elements`);
    }
  }

  cleanupHtml($) {
    $('p:empty').remove();
    $('div:empty').remove();
    $('*').each((_, elem) => {
      if (elem.type === 'comment') {
        $(elem).remove();
      }
    });
    $('[align], [valign], [bgcolor]').each((_, elem) => {
      $(elem).removeAttr('align').removeAttr('valign').removeAttr('bgcolor');
    });
  }

  processMultiple(pages) {
    return pages.map((page) => ({
      ...page,
      html: this.process(page.html, page.url),
      processed: true,
    }));
  }
}

module.exports = PostProcessor;
