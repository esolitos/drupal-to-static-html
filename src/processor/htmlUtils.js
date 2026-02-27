/**
 * HTML Utilities for Post-Processing
 * Pattern matching, URL handling, and HTML manipulation helpers
 */

const cheerio = require('cheerio');

class HtmlUtils {
  static loadHtml(html) {
    try {
      return cheerio.load(html);
    } catch (error) {
      console.warn('Failed to parse HTML:', error.message);
      return cheerio.load('');
    }
  }

  static isAbsoluteUrl(url) {
    return /^https?:\/\//.test(url);
  }

  static isRelativeUrl(url) {
    return /^\/|^\.\.\/|^\.\//.test(url);
  }

  static isSpecialUrl(url) {
    return /^(data:|javascript:|mailto:|tel:|sms:|#)/.test(url);
  }

  static extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      return null;
    }
  }

  static isSameDomain(url, siteDomain) {
    const urlDomain = this.extractDomain(url);
    if (!urlDomain) return false;
    const cleanUrlDomain = urlDomain.replace(/^www\./, '');
    const cleanSiteDomain = siteDomain.replace(/^www\./, '');
    return cleanUrlDomain === cleanSiteDomain;
  }

  static toRelativeUrl(absoluteUrl, siteDomain) {
    if (!this.isAbsoluteUrl(absoluteUrl)) {
      return absoluteUrl;
    }
    if (!this.isSameDomain(absoluteUrl, siteDomain)) {
      return absoluteUrl;
    }
    try {
      const urlObj = new URL(absoluteUrl);
      return urlObj.pathname + urlObj.search + urlObj.hash;
    } catch (error) {
      return absoluteUrl;
    }
  }

  static rewriteDrupalPaths(url) {
    return url.replace(/\/sites\/default\/files\//g, '/files/');
  }

  static hasJatos(html) {
    return /jatos|experiment|signup/i.test(html);
  }

  static isAdminElement(element, $) {
    const $elem = $(element);
    const classes = $elem.attr('class') || '';
    const id = $elem.attr('id') || '';
    const text = $elem.text();
    const adminPatterns = [/admin/i, /toolbar/i, /navbar/i, /login/i, /user-menu/i, /account/i];
    const allContent = `${classes} ${id} ${text}`;
    return adminPatterns.some((pattern) => pattern.test(allContent));
  }

  static isFormElement(element, $) {
    const $elem = $(element);
    const tagName = $elem.prop('tagName').toLowerCase();
    if (tagName === 'form') {
      const formClass = $elem.attr('class') || '';
      const formId = $elem.attr('id') || '';
      const skipPatterns = [/login/i, /search/i, /contact/i, /subscribe/i];
      const content = `${formClass} ${formId}`;
      return skipPatterns.some((pattern) => pattern.test(content));
    }
    return false;
  }

  static sanitizeHtml(html) {
    const $ = cheerio.load(html);
    $('script[src], script[type="text/javascript"]').remove();
    $('[onclick], [onerror], [onload]').each((_, elem) => {
      $(elem).removeAttr('onclick').removeAttr('onerror').removeAttr('onload');
    });
    return $.html();
  }

  static createJatosReplacement(linkedinProfile) {
    return `<div class="jatos-replacement" style="background: #f0f0f0; padding: 20px; border-radius: 4px; margin: 20px 0; text-align: center;">
  <p style="margin: 0; font-size: 16px; color: #333;">
    <strong>Experiments have concluded.</strong><br>
    For more information, please contact me on
    <a href="${linkedinProfile}" target="_blank" rel="noopener noreferrer" style="color: #0077b5; text-decoration: none;">LinkedIn</a>.
  </p>
</div>`;
  }
}

module.exports = HtmlUtils;
