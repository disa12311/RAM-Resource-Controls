/**
 * ResourceControls v3.0 - RAM Monitoring Only
 * Chỉ monitor RAM, không có chức năng sleep tabs
 */

class ResourceControls {
  constructor() {
    this.config = {
      ramLimit: 2000,
      checkInterval: 60000,
      updateInterval: 3000,
      maxCacheAge: 2000,
      emergencyThreshold: 85,
      warningThreshold: 70,
      optimalThreshold: 60
    };
    
    // Core data structures
    this.tabActivityTimes = new Map();
    this.tabMetadata = new Map();
    this.memoryCache = null;
    this.memoryCacheTime = 0;
    
    // Performance tracking
    this.stats = {
      checksPerformed: 0,
      averageCheckTime: 0,
      lastCheckTime: 0,
      peakMemoryUsage: 0,
      averageMemoryUsage: 0
    };
    
    // Debounce timers
    this.saveTimeout = null;
  }

  /**
   * Initialize
   */
  async initialize() {
    try {
      const stored = await chrome.storage.local.get([
        'ramLimit',
        'tabActivityTimes',
        'tabMetadata',
        'stats'
      ]);

      // Merge config
      if (stored.ramLimit) {
        this.config.ramLimit = stored.ramLimit;
      }

      // Restore data structures
      if (stored.tabActivityTimes) {
        this.tabActivityTimes = new Map(Object.entries(stored.tabActivityTimes));
      }

      if (stored.tabMetadata) {
        this.tabMetadata = new Map(Object.entries(stored.tabMetadata));
      }

      if (stored.stats) {
        Object.assign(this.stats, stored.stats);
      }

      // Initialize tabs
      await this.initializeTabActivities();

      // Cleanup old data
      await this.cleanupOldData();

      console.log('[ResourceControls v3] Initialized:', {
        config: this.config,
        trackedTabs: this.tabActivityTimes.size
      });

      return this;
    } catch (error) {
      console.error('[ResourceControls] Init error:', error);
      return this;
    }
  }

  /**
   * Initialize tab activities
   */
  async initializeTabActivities() {
    try {
      const tabs = await chrome.tabs.query({});
      const now = Date.now();
      let initialized = 0;
      
      for (const tab of tabs) {
        // Skip system pages
        if (this.isSystemPage(tab.url)) continue;
        
        if (!this.tabActivityTimes.has(tab.id)) {
          this.tabActivityTimes.set(tab.id, now);
          initialized++;
        }
        
        if (!this.tabMetadata.has(tab.id)) {
          this.tabMetadata.set(tab.id, {
            createdAt: now,
            activationCount: 0,
            totalActiveTime: 0,
            domain: this.extractDomain(tab.url),
            category: this.categorizeURL(tab.url)
          });
        }
      }

      await this.saveTabData();
      console.log(`[ResourceControls] Initialized ${initialized} new tabs`);
    } catch (error) {
      console.error('[ResourceControls] Tab init error:', error);
    }
  }

  /**
   * Cleanup old data (30+ days)
   */
  async cleanupOldData() {
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [tabId, metadata] of this.tabMetadata.entries()) {
      if (now - metadata.createdAt > thirtyDays) {
        this.tabActivityTimes.delete(tabId);
        this.tabMetadata.delete(tabId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await this.saveTabData();
      console.log(`[ResourceControls] Cleaned ${cleaned} old entries`);
    }
  }

  /**
   * Update config
   */
  async updateConfig(newConfig) {
    // Validate ranges
    if (newConfig.ramLimit) {
      newConfig.ramLimit = Math.max(1000, Math.min(5000, newConfig.ramLimit));
    }

    Object.assign(this.config, newConfig);
    await chrome.storage.local.set(newConfig);
    console.log('[ResourceControls] Config updated:', newConfig);
  }

  /**
   * Get memory info with intelligent caching
   */
  async getMemoryInfo() {
    const now = Date.now();
    
    // Return cache if fresh
    if (this.memoryCache && (now - this.memoryCacheTime) < this.config.maxCacheAge) {
      return this.memoryCache;
    }

    try {
      const memoryInfo = await chrome.system.memory.getInfo();
      
      const totalBytes = memoryInfo.capacity;
      const availableBytes = memoryInfo.availableCapacity;
      const totalMB = Math.round(totalBytes / (1024 * 1024));
      const availableMB = Math.round(availableBytes / (1024 * 1024));
      const usedMB = totalMB - availableMB;
      const usagePercent = parseFloat(((usedMB / totalMB) * 100).toFixed(1));

      // Determine status
      let status = 'optimal';
      if (usagePercent > this.config.emergencyThreshold) status = 'critical';
      else if (usagePercent > this.config.warningThreshold) status = 'warning';
      else if (usagePercent > this.config.optimalThreshold) status = 'elevated';

      // Update peak memory
      if (usagePercent > this.stats.peakMemoryUsage) {
        this.stats.peakMemoryUsage = usagePercent;
      }

      // Update average memory
      this.stats.averageMemoryUsage = 
        (this.stats.averageMemoryUsage * 0.9) + (usagePercent * 0.1);

      this.memoryCache = {
        totalMB,
        availableMB,
        usedMB,
        usagePercent,
        totalBytes,
        availableBytes,
        status,
        timestamp: now,
        stale: false
      };
      this.memoryCacheTime = now;

      return this.memoryCache;
    } catch (error) {
      console.error('[ResourceControls] Memory error:', error);
      
      // Fallback to stale cache
      if (this.memoryCache) {
        return { ...this.memoryCache, stale: true };
      }
      
      return null;
    }
  }

  /**
   * Get tabs info with enhanced metadata
   */
  async getTabsInfo() {
    try {
      const [tabs, [activeTab]] = await Promise.all([
        chrome.tabs.query({}),
        chrome.tabs.query({ active: true, currentWindow: true })
      ]);
      
      const tabsInfo = [];
      const now = Date.now();
      
      for (const tab of tabs) {
        const isActive = tab.id === activeTab?.id;
        const lastActivity = this.tabActivityTimes.get(tab.id) || now;
        const inactiveTime = now - lastActivity;
        const metadata = this.tabMetadata.get(tab.id);
        
        // Enhanced RAM estimation
        const estimatedRAM = this.estimateTabRAM(tab, isActive, inactiveTime, metadata);
        
        tabsInfo.push({
          id: tab.id,
          title: tab.title || 'No title',
          url: tab.url || 'about:blank',
          favIconUrl: tab.favIconUrl,
          isActive,
          audible: tab.audible || false,
          estimatedRAM,
          lastActivity,
          inactiveTime,
          inactiveMinutes: Math.floor(inactiveTime / 60000),
          metadata: metadata || null
        });
      }

      // Efficient counting
      let active = 0, total = tabs.length;
      let totalRAM = 0;
      
      for (const info of tabsInfo) {
        active++;
        totalRAM += info.estimatedRAM;
      }

      return {
        tabs: tabsInfo,
        total,
        active,
        totalRAM,
        averageRAM: active > 0 ? Math.round(totalRAM / active) : 0
      };
    } catch (error) {
      console.error('[ResourceControls] Tabs info error:', error);
      return { tabs: [], total: 0, active: 0, totalRAM: 0, averageRAM: 0 };
    }
  }

  /**
   * Enhanced RAM estimation
   */
  estimateTabRAM(tab, isActive, inactiveTime, metadata) {
    let baseRAM = 100;
    
    // Active tab premium
    if (isActive) {
      return Math.round(300 + Math.random() * 200);
    }

    // Audio/video premium
    if (tab.audible) {
      return Math.round(200 + Math.random() * 150);
    }

    // URL-based estimation
    try {
      const url = new URL(tab.url);
      const hostname = url.hostname;
      const path = url.pathname;
      
      // Heavy sites
      if (/youtube|netflix|twitch/.test(hostname)) baseRAM += 150;
      else if (/facebook|instagram|twitter/.test(hostname)) baseRAM += 100;
      else if (/docs\.google|notion|figma|canva/.test(hostname)) baseRAM += 120;
      else if (/github|stackoverflow/.test(hostname)) baseRAM += 80;
      
      // Complex pages
      if (/\/(watch|video|stream|live)/.test(path)) baseRAM += 80;
      if (/\/(edit|create|design)/.test(path)) baseRAM += 60;
      
    } catch (e) {
      // Invalid URL
    }

    // Time-based decay
    const inactiveMinutes = inactiveTime / 60000;
    if (inactiveMinutes > 60) baseRAM *= 0.4;
    else if (inactiveMinutes > 30) baseRAM *= 0.5;
    else if (inactiveMinutes > 15) baseRAM *= 0.7;
    else if (inactiveMinutes > 5) baseRAM *= 0.85;

    // Frequency boost
    if (metadata && metadata.activationCount > 10) {
      baseRAM *= 1.2;
    }

    // Add variance
    baseRAM += Math.random() * 40;

    return Math.round(Math.max(50, Math.min(500, baseRAM)));
  }

  /**
   * Monitor RAM and collect stats
   */
  async monitorRAM() {
    const startTime = Date.now();
    this.stats.checksPerformed++;

    try {
      const [memoryInfo, tabsInfo] = await Promise.all([
        this.getMemoryInfo(),
        this.getTabsInfo()
      ]);
      
      if (!memoryInfo) {
        return { success: false, reason: 'No memory info' };
      }

      // Track performance
      const checkTime = Date.now() - startTime;
      this.stats.lastCheckTime = checkTime;
      this.stats.averageCheckTime = Math.round(
        (this.stats.averageCheckTime * (this.stats.checksPerformed - 1) + checkTime) / this.stats.checksPerformed
      );

      // Save stats periodically
      if (this.stats.checksPerformed % 10 === 0) {
        await chrome.storage.local.set({ stats: this.stats });
      }

      return {
        success: true,
        memory: memoryInfo,
        tabs: tabsInfo,
        checkTime
      };
    } catch (error) {
      console.error('[ResourceControls] Monitor error:', error);
      return { success: false, reason: 'Error: ' + error.message };
    }
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Categorize URL
   */
  categorizeURL(url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      
      if (/youtube|netflix|twitch|vimeo/.test(hostname)) return 'video';
      if (/facebook|twitter|instagram|linkedin|reddit|tiktok/.test(hostname)) return 'social';
      if (/docs\.google|notion|slack|trello|asana/.test(hostname)) return 'productivity';
      if (/github|stackoverflow|gitlab/.test(hostname)) return 'development';
      if (/amazon|ebay|shop|store/.test(hostname)) return 'shopping';
      if (/news|bbc|cnn|medium|blog/.test(hostname)) return 'news';
      
      return 'general';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Check if system page
   */
  isSystemPage(url) {
    return url.startsWith('chrome://') || 
           url.startsWith('chrome-extension://') ||
           url.startsWith('edge://') ||
           url.startsWith('about:') ||
           url.startsWith('data:');
  }

  /**
   * Update tab activity with metadata
   */
  updateTabActivity(tabId) {
    const now = Date.now();
    const lastActivity = this.tabActivityTimes.get(tabId) || now;
    
    this.tabActivityTimes.set(tabId, now);
    
    let metadata = this.tabMetadata.get(tabId);
    if (!metadata) {
      metadata = {
        createdAt: now,
        activationCount: 0,
        totalActiveTime: 0,
        domain: 'unknown',
        category: 'general'
      };
    }
    
    metadata.activationCount++;
    metadata.totalActiveTime += (now - lastActivity);
    
    this.tabMetadata.set(tabId, metadata);
    this.saveTabData();
  }

  /**
   * Remove tab from tracking
   */
  removeTab(tabId) {
    this.tabActivityTimes.delete(tabId);
    this.tabMetadata.delete(tabId);
    this.saveTabData();
  }

  /**
   * Save tab data (debounced)
   */
  saveTabData() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(async () => {
      try {
        await chrome.storage.local.set({
          tabActivityTimes: Object.fromEntries(this.tabActivityTimes),
          tabMetadata: Object.fromEntries(this.tabMetadata)
        });
      } catch (error) {
        console.error('[ResourceControls] Save error:', error);
      }
    }, 1000);
  }

  /**
   * Get comprehensive stats
   */
  async getStats() {
    const memoryInfo = await this.getMemoryInfo();
    const tabsInfo = await this.getTabsInfo();

    return {
      memory: memoryInfo,
      tabs: tabsInfo,
      config: this.config,
      trackedTabs: this.tabActivityTimes.size,
      performance: {
        checksPerformed: this.stats.checksPerformed,
        averageCheckTime: this.stats.averageCheckTime,
        lastCheckTime: this.stats.lastCheckTime,
        peakMemoryUsage: this.stats.peakMemoryUsage,
        averageMemoryUsage: Math.round(this.stats.averageMemoryUsage)
      }
    };
  }

  /**
   * Get RAM analysis
   */
  async getRAMAnalysis() {
    const stats = await this.getStats();
    const { memory, tabs } = stats;

    // Category breakdown
    const categoryRAM = {};
    const domainRAM = {};

    for (const tab of tabs.tabs) {
      const category = tab.metadata?.category || 'unknown';
      const domain = tab.metadata?.domain || 'unknown';

      categoryRAM[category] = (categoryRAM[category] || 0) + tab.estimatedRAM;
      domainRAM[domain] = (domainRAM[domain] || 0) + tab.estimatedRAM;
    }

    // Top consumers
    const topCategories = Object.entries(categoryRAM)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, ram]) => ({ category, ram }));

    const topDomains = Object.entries(domainRAM)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, ram]) => ({ domain, ram }));

    return {
      memory,
      totalTabs: tabs.total,
      totalRAM: tabs.totalRAM,
      averageRAM: tabs.averageRAM,
      topCategories,
      topDomains,
      recommendations: this.getRecommendations(memory, tabs)
    };
  }

  /**
   * Get recommendations based on RAM usage
   */
  getRecommendations(memory, tabs) {
    const recommendations = [];

    if (memory.usagePercent > 85) {
      recommendations.push({
        level: 'critical',
        message: 'RAM usage is critical. Consider closing some tabs.'
      });
    } else if (memory.usagePercent > 70) {
      recommendations.push({
        level: 'warning',
        message: 'RAM usage is high. Monitor active tabs.'
      });
    }

    // Find heavy tabs
    const heavyTabs = tabs.tabs
      .filter(t => t.estimatedRAM > 200)
      .sort((a, b) => b.estimatedRAM - a.estimatedRAM)
      .slice(0, 5);

    if (heavyTabs.length > 0) {
      recommendations.push({
        level: 'info',
        message: `${heavyTabs.length} tabs using >200MB RAM`,
        tabs: heavyTabs.map(t => ({
          title: t.title,
          ram: t.estimatedRAM
        }))
      });
    }

    return recommendations;
  }

  /**
   * Reset statistics
   */
  async resetStats() {
    this.stats = {
      checksPerformed: 0,
      averageCheckTime: 0,
      lastCheckTime: 0,
      peakMemoryUsage: 0,
      averageMemoryUsage: 0
    };
    
    await chrome.storage.local.set({ stats: this.stats });
    console.log('[ResourceControls] Stats reset');
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResourceControls;
}
