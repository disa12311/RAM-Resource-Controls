/**
 * ResourceControls v3.0 - Advanced Core Module
 * Smart RAM management với ML-inspired logic
 */

class ResourceControls {
  constructor() {
    this.config = {
      ramLimit: 2000,
      sleepTimer: 10,
      autoSleep: false,
      aggressiveMode: false,
      checkInterval: 60000,
      updateInterval: 3000,
      minInactiveTime: 60000,
      maxCacheAge: 2000,
      emergencyThreshold: 85,
      warningThreshold: 70,
      optimalThreshold: 60
    };
    
    // Core data structures (optimized)
    this.tabActivityTimes = new Map();
    this.tabMetadata = new Map();
    this.memoryCache = null;
    this.memoryCacheTime = 0;
    this.sleepHistory = new Map();
    
    // Performance tracking
    this.stats = {
      checksPerformed: 0,
      totalSlept: 0,
      emergencySleeps: 0,
      averageCheckTime: 0,
      lastCheckTime: 0
    };
    
    // Debounce timers
    this.saveTimeout = null;
    this.checkTimeout = null;
  }

  /**
   * Initialize with enhanced error handling
   */
  async initialize() {
    try {
      const stored = await chrome.storage.local.get([
        'ramLimit',
        'sleepTimer', 
        'autoSleep',
        'aggressiveMode',
        'tabActivityTimes',
        'tabMetadata',
        'stats'
      ]);

      // Merge config
      Object.assign(this.config, {
        ramLimit: stored.ramLimit,
        sleepTimer: stored.sleepTimer,
        autoSleep: stored.autoSleep,
        aggressiveMode: stored.aggressiveMode
      });

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
        trackedTabs: this.tabActivityTimes.size,
        totalSlept: this.stats.totalSlept
      });

      return this;
    } catch (error) {
      console.error('[ResourceControls] Init error:', error);
      return this;
    }
  }

  /**
   * Initialize tab activities with smart defaults
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
            lastSleepTime: null,
            sleepCount: 0,
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

    // Clean old tab data
    for (const [tabId, metadata] of this.tabMetadata.entries()) {
      if (now - metadata.createdAt > thirtyDays) {
        this.tabActivityTimes.delete(tabId);
        this.tabMetadata.delete(tabId);
        this.sleepHistory.delete(tabId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await this.saveTabData();
      console.log(`[ResourceControls] Cleaned ${cleaned} old entries`);
    }
  }

  /**
   * Update config with validation
   */
  async updateConfig(newConfig) {
    // Validate ranges
    if (newConfig.ramLimit) {
      newConfig.ramLimit = Math.max(1000, Math.min(5000, newConfig.ramLimit));
    }
    if (newConfig.sleepTimer) {
      newConfig.sleepTimer = Math.max(1, Math.min(60, newConfig.sleepTimer));
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
        const isSleeping = tab.discarded;
        const lastActivity = this.tabActivityTimes.get(tab.id) || now;
        const inactiveTime = now - lastActivity;
        const metadata = this.tabMetadata.get(tab.id);
        
        // Enhanced RAM estimation
        const estimatedRAM = this.estimateTabRAM(tab, isActive, isSleeping, inactiveTime, metadata);
        
        // Calculate sleep score (0-100, higher = should sleep more)
        const sleepScore = this.calculateSleepScore(tab, inactiveTime, metadata, isActive, isSleeping);
        
        tabsInfo.push({
          id: tab.id,
          title: tab.title || 'No title',
          url: tab.url || 'about:blank',
          favIconUrl: tab.favIconUrl,
          isActive,
          isSleeping,
          audible: tab.audible || false,
          estimatedRAM,
          lastActivity,
          inactiveTime,
          inactiveMinutes: Math.floor(inactiveTime / 60000),
          metadata: metadata || null,
          sleepScore
        });
      }

      // Efficient counting with categories
      let active = 0, sleeping = 0, total = tabs.length;
      let totalRAM = 0;
      
      for (const info of tabsInfo) {
        if (info.isSleeping) sleeping++;
        else {
          active++;
          totalRAM += info.estimatedRAM;
        }
      }

      return {
        tabs: tabsInfo,
        total,
        active,
        sleeping,
        totalRAM,
        averageRAM: active > 0 ? Math.round(totalRAM / active) : 0
      };
    } catch (error) {
      console.error('[ResourceControls] Tabs info error:', error);
      return { tabs: [], total: 0, active: 0, sleeping: 0, totalRAM: 0, averageRAM: 0 };
    }
  }

  /**
   * Calculate sleep score (0-100, higher = should sleep sooner)
   */
  calculateSleepScore(tab, inactiveTime, metadata, isActive, isSleeping) {
    if (isActive || isSleeping) return 0;
    
    let score = 50; // Base score

    // Inactivity score (0-30 points)
    const inactiveMinutes = inactiveTime / 60000;
    if (inactiveMinutes > 60) score += 30;
    else if (inactiveMinutes > 30) score += 20;
    else if (inactiveMinutes > 15) score += 10;
    else if (inactiveMinutes > 5) score += 5;

    // Metadata score (-20 to +20 points)
    if (metadata) {
      // Low activation = higher score
      if (metadata.activationCount < 3) score += 15;
      else if (metadata.activationCount < 10) score += 5;
      else if (metadata.activationCount > 30) score -= 15;
      
      // Recently slept = lower score
      if (metadata.lastSleepTime) {
        const timeSinceSleep = Date.now() - metadata.lastSleepTime;
        if (timeSinceSleep < 300000) score -= 20; // 5 minutes
      }
    }

    // URL-based score (-15 to +15 points)
    try {
      const url = new URL(tab.url);
      const hostname = url.hostname;
      
      // Important sites = lower score
      if (/gmail|docs\.google|drive|calendar|notion|slack/.test(hostname)) {
        score -= 15;
      }
      
      // Social/entertainment = higher score
      if (/facebook|twitter|instagram|tiktok|youtube|netflix/.test(hostname)) {
        score += 10;
      }
      
      // News sites = higher score
      if (/news|blog|medium|reddit/.test(hostname)) {
        score += 5;
      }
    } catch (e) {
      // Invalid URL
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Enhanced RAM estimation with ML-inspired factors
   */
  estimateTabRAM(tab, isActive, isSleeping, inactiveTime, metadata) {
    if (isSleeping) return 0;

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
   * Advanced check and sleep with ML-inspired decisions
   */
  async checkAndSleepTabs() {
    if (!this.config.autoSleep) {
      return { slept: 0, reason: 'Auto sleep disabled' };
    }

    const startTime = Date.now();
    this.stats.checksPerformed++;

    try {
      const [memoryInfo, tabsInfo] = await Promise.all([
        this.getMemoryInfo(),
        this.getTabsInfo()
      ]);
      
      if (!memoryInfo) {
        return { slept: 0, reason: 'No memory info' };
      }

      // Calculate dynamic thresholds
      const sleepTimerMs = Math.max(
        this.config.sleepTimer * 60 * 1000,
        this.config.minInactiveTime
      );

      const effectiveSleepTimer = this.calculateEffectiveSleepTimer(
        sleepTimerMs,
        memoryInfo.usagePercent
      );

      // Filter and score candidates
      const candidates = tabsInfo.tabs
        .filter(tab => this.isValidSleepCandidate(tab))
        .map(tab => ({
          ...tab,
          shouldSleep: this.shouldTabSleep(tab, effectiveSleepTimer, memoryInfo.usagePercent)
        }))
        .filter(tab => tab.shouldSleep)
        .sort((a, b) => b.sleepScore - a.sleepScore); // Highest score first

      // Determine how many to sleep based on RAM status
      let targetCount = candidates.length;
      if (memoryInfo.status === 'critical') {
        targetCount = Math.ceil(candidates.length * 0.8); // 80%
      } else if (memoryInfo.status === 'warning') {
        targetCount = Math.ceil(candidates.length * 0.6); // 60%
      } else if (memoryInfo.status === 'elevated') {
        targetCount = Math.ceil(candidates.length * 0.4); // 40%
      } else {
        targetCount = Math.ceil(candidates.length * 0.3); // 30%
      }

      const toSleep = candidates.slice(0, targetCount);

      // Sleep tabs
      let sleptCount = 0;
      const now = Date.now();

      for (const tab of toSleep) {
        try {
          await chrome.tabs.discard(tab.id);
          sleptCount++;
          
          // Update metadata
          const metadata = this.tabMetadata.get(tab.id);
          if (metadata) {
            metadata.lastSleepTime = now;
            metadata.sleepCount++;
            this.tabMetadata.set(tab.id, metadata);
          }
          
          this.sleepHistory.set(tab.id, now);
          
          console.log(`[ResourceControls] Slept: "${tab.title}" (score: ${tab.sleepScore}, inactive: ${tab.inactiveMinutes}m)`);
        } catch (error) {
          console.error(`[ResourceControls] Sleep failed:`, error);
        }
      }

      // Emergency sleep if critical
      if (this.config.aggressiveMode && memoryInfo.status === 'critical') {
        const emergencyCount = await this.emergencySleep(tabsInfo.tabs, sleptCount);
        sleptCount += emergencyCount;
        if (emergencyCount > 0) {
          this.stats.emergencySleeps++;
        }
      }

      // Update stats
      if (sleptCount > 0) {
        await this.updateStats(sleptCount);
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
        slept: sleptCount,
        checked: tabsInfo.total,
        candidates: candidates.length,
        memory: memoryInfo.usagePercent,
        status: memoryInfo.status,
        effectiveTimer: Math.round(effectiveSleepTimer / 60000),
        checkTime
      };
    } catch (error) {
      console.error('[ResourceControls] Check error:', error);
      return { slept: 0, reason: 'Error: ' + error.message };
    }
  }

  /**
   * Check if tab is valid sleep candidate
   */
  isValidSleepCandidate(tab) {
    return !tab.isActive && 
           !tab.isSleeping && 
           !tab.audible && 
           !this.isSystemPage(tab.url);
  }

  /**
   * Calculate effective sleep timer with smooth scaling
   */
  calculateEffectiveSleepTimer(baseTimer, usagePercent) {
    if (!this.config.aggressiveMode) {
      return baseTimer;
    }

    // Smooth exponential scaling
    if (usagePercent > 85) return baseTimer * 0.2;
    if (usagePercent > 80) return baseTimer * 0.3;
    if (usagePercent > 75) return baseTimer * 0.5;
    if (usagePercent > 70) return baseTimer * 0.6;
    if (usagePercent > 65) return baseTimer * 0.7;
    if (usagePercent > 60) return baseTimer * 0.8;
    if (usagePercent > 55) return baseTimer * 0.9;
    
    return baseTimer;
  }

  /**
   * Enhanced should sleep decision
   */
  shouldTabSleep(tab, effectiveSleepTimer, usagePercent) {
    // Time check
    if (tab.inactiveTime < effectiveSleepTimer) {
      return false;
    }

    // Metadata checks
    if (tab.metadata) {
      // New tabs grace period
      const age = Date.now() - tab.metadata.createdAt;
      if (age < 180000) return false; // 3 minutes

      // Frequent tabs protection
      if (tab.metadata.activationCount > 30) {
        return tab.inactiveTime > effectiveSleepTimer * 2;
      }
      if (tab.metadata.activationCount > 15) {
        return tab.inactiveTime > effectiveSleepTimer * 1.5;
      }
    }

    // Critical RAM = aggressive
    if (usagePercent > 85) return true;

    // Score-based decision
    return tab.sleepScore > 60;
  }

  /**
   * Emergency sleep with smart selection
   */
  async emergencySleep(tabs, alreadySlept) {
    const candidates = tabs
      .filter(t => !t.isSleeping && !t.isActive && !t.audible && !this.isSystemPage(t.url))
      .sort((a, b) => b.sleepScore - a.sleepScore);

    const targetCount = Math.ceil(candidates.length * 0.7);
    const toSleep = Math.max(0, targetCount - alreadySlept);
    
    let sleptCount = 0;
    for (let i = 0; i < toSleep && i < candidates.length; i++) {
      try {
        await chrome.tabs.discard(candidates[i].id);
        sleptCount++;
        console.log(`[ResourceControls] EMERGENCY SLEEP: "${candidates[i].title}"`);
      } catch (error) {
        // Continue on error
      }
    }

    return sleptCount;
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
        lastSleepTime: null,
        sleepCount: 0,
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
    this.sleepHistory.delete(tabId);
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
   * Wake tab
   */
  async wakeTab(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.discarded) {
        await chrome.tabs.reload(tabId);
        console.log(`[ResourceControls] Woke tab ${tabId}`);
      }
      this.updateTabActivity(tabId);
    } catch (error) {
      console.error(`[ResourceControls] Wake error:`, error);
    }
  }

  /**
   * Get comprehensive stats
   */
  async getStats() {
    const stored = await chrome.storage.local.get(['totalTabsSlept', 'lastSleepTime']);
    const memoryInfo = await this.getMemoryInfo();
    const tabsInfo = await this.getTabsInfo();

    return {
      memory: memoryInfo,
      tabs: tabsInfo,
      totalTabsSlept: stored.totalTabsSlept || 0,
      lastSleepTime: stored.lastSleepTime || null,
      config: this.config,
      trackedTabs: this.tabActivityTimes.size,
      performance: {
        checksPerformed: this.stats.checksPerformed,
        averageCheckTime: this.stats.averageCheckTime,
        lastCheckTime: this.stats.lastCheckTime,
        emergencySleeps: this.stats.emergencySleeps
      }
    };
  }

  /**
   * Update statistics
   */
  async updateStats(sleptCount) {
    const stats = await chrome.storage.local.get(['totalTabsSlept']);
    const total = (stats.totalTabsSlept || 0) + sleptCount;
    this.stats.totalSlept = total;
    
    await chrome.storage.local.set({ 
      totalTabsSlept: total,
      lastSleepTime: Date.now()
    });
  }

  /**
   * Reset statistics
   */
  async resetStats() {
    this.stats = {
      checksPerformed: 0,
      totalSlept: 0,
      emergencySleeps: 0,
      averageCheckTime: 0,
      lastCheckTime: 0
    };
    
    await chrome.storage.local.set({
      totalTabsSlept: 0,
      lastSleepTime: null,
      stats: this.stats
    });
    
    console.log('[ResourceControls] Stats reset');
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResourceControls;
}
