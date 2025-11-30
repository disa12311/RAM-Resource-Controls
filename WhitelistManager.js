/**
 * WhitelistManager - Quản lý whitelist/blacklist domains
 * Pattern matching, wildcard support
 */

class WhitelistManager {
  constructor() {
    this.whitelist = new Set();
    this.blacklist = new Set();
    this.patterns = {
      whitelist: [],
      blacklist: []
    };
  }

  /**
   * Khởi tạo - Load từ storage
   */
  async initialize() {
    const stored = await chrome.storage.local.get([
      'whitelist',
      'blacklist'
    ]);

    if (stored.whitelist) {
      stored.whitelist.forEach(domain => this.whitelist.add(domain));
      this.compilePatterns('whitelist');
    }

    if (stored.blacklist) {
      stored.blacklist.forEach(domain => this.blacklist.add(domain));
      this.compilePatterns('blacklist');
    }

    console.log('[WhitelistManager] Initialized:', {
      whitelist: this.whitelist.size,
      blacklist: this.blacklist.size
    });

    return this;
  }

  /**
   * Compile patterns cho fast matching
   */
  compilePatterns(type) {
    const list = type === 'whitelist' ? this.whitelist : this.blacklist;
    const patterns = [];

    for (const domain of list) {
      // Convert wildcard to regex
      // *.example.com → ^.*\.example\.com$
      // example.* → ^example\..*$
      const pattern = domain
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      
      patterns.push(new RegExp('^' + pattern + '$', 'i'));
    }

    this.patterns[type] = patterns;
  }

  /**
   * Thêm domain vào whitelist
   */
  async addToWhitelist(domain) {
    domain = this.normalizeDomain(domain);
    if (!domain) return false;

    this.whitelist.add(domain);
    this.compilePatterns('whitelist');
    await this.save();

    console.log('[WhitelistManager] Added to whitelist:', domain);
    return true;
  }

  /**
   * Xóa domain khỏi whitelist
   */
  async removeFromWhitelist(domain) {
    domain = this.normalizeDomain(domain);
    const deleted = this.whitelist.delete(domain);
    
    if (deleted) {
      this.compilePatterns('whitelist');
      await this.save();
      console.log('[WhitelistManager] Removed from whitelist:', domain);
    }
    
    return deleted;
  }

  /**
   * Thêm domain vào blacklist
   */
  async addToBlacklist(domain) {
    domain = this.normalizeDomain(domain);
    if (!domain) return false;

    this.blacklist.add(domain);
    this.compilePatterns('blacklist');
    await this.save();

    console.log('[WhitelistManager] Added to blacklist:', domain);
    return true;
  }

  /**
   * Xóa domain khỏi blacklist
   */
  async removeFromBlacklist(domain) {
    domain = this.normalizeDomain(domain);
    const deleted = this.blacklist.delete(domain);
    
    if (deleted) {
      this.compilePatterns('blacklist');
      await this.save();
      console.log('[WhitelistManager] Removed from blacklist:', domain);
    }
    
    return deleted;
  }

  /**
   * Check nếu domain nằm trong whitelist
   */
  isWhitelisted(url) {
    try {
      const domain = new URL(url).hostname;
      
      // Exact match
      if (this.whitelist.has(domain)) return true;
      
      // Pattern match
      return this.patterns.whitelist.some(pattern => pattern.test(domain));
      
    } catch (e) {
      return false;
    }
  }

  /**
   * Check nếu domain nằm trong blacklist
   */
  isBlacklisted(url) {
    try {
      const domain = new URL(url).hostname;
      
      // Exact match
      if (this.blacklist.has(domain)) return true;
      
      // Pattern match
      return this.patterns.blacklist.some(pattern => pattern.test(domain));
      
    } catch (e) {
      return false;
    }
  }

  /**
   * Kiểm tra xem tab có được phép ngủ không
   */
  canSleep(url) {
    // Whitelist có priority cao nhất
    if (this.isWhitelisted(url)) {
      return false; // Không bao giờ ngủ
    }

    // Blacklist → luôn ngủ nhanh
    if (this.isBlacklisted(url)) {
      return true;
    }

    // Default: cho phép ngủ theo rules bình thường
    return null; // null = use default rules
  }

  /**
   * Get sleep priority
   * 0 = never sleep (whitelist)
   * 1 = normal
   * 2 = priority sleep (blacklist)
   */
  getSleepPriority(url) {
    if (this.isWhitelisted(url)) return 0;
    if (this.isBlacklisted(url)) return 2;
    return 1;
  }

  /**
   * Normalize domain
   */
  normalizeDomain(domain) {
    if (!domain) return null;
    
    domain = domain.trim().toLowerCase();
    
    // Remove protocol
    domain = domain.replace(/^https?:\/\//, '');
    
    // Remove path
    domain = domain.split('/')[0];
    
    // Remove port
    domain = domain.split(':')[0];
    
    return domain;
  }

  /**
   * Import rules
   */
  async importRules(data) {
    try {
      if (data.whitelist) {
        this.whitelist.clear();
        data.whitelist.forEach(d => this.whitelist.add(d));
        this.compilePatterns('whitelist');
      }

      if (data.blacklist) {
        this.blacklist.clear();
        data.blacklist.forEach(d => this.blacklist.add(d));
        this.compilePatterns('blacklist');
      }

      await this.save();
      console.log('[WhitelistManager] Imported rules');
      return true;
      
    } catch (error) {
      console.error('[WhitelistManager] Import failed:', error);
      return false;
    }
  }

  /**
   * Export rules
   */
  exportRules() {
    return {
      whitelist: Array.from(this.whitelist),
      blacklist: Array.from(this.blacklist),
      exportDate: new Date().toISOString(),
      version: '2.0.0'
    };
  }

  /**
   * Clear all rules
   */
  async clearAll() {
    this.whitelist.clear();
    this.blacklist.clear();
    this.patterns = { whitelist: [], blacklist: [] };
    await this.save();
    console.log('[WhitelistManager] Cleared all rules');
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      whitelistCount: this.whitelist.size,
      blacklistCount: this.blacklist.size,
      totalRules: this.whitelist.size + this.blacklist.size
    };
  }

  /**
   * Lưu vào storage
   */
  async save() {
    await chrome.storage.local.set({
      whitelist: Array.from(this.whitelist),
      blacklist: Array.from(this.blacklist)
    });
  }

  /**
   * Get all lists
   */
  getLists() {
    return {
      whitelist: Array.from(this.whitelist).sort(),
      blacklist: Array.from(this.blacklist).sort()
    };
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WhitelistManager;
}