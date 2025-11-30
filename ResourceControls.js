/**
 * ResourceControls - Core module quản lý RAM và tabs
 * Tối ưu hiệu suất với logic nâng cao
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
      minInactiveTime: 60000, // 1 phút tối thiểu
      maxCacheAge: 2000 // 2 giây
    };
    
    this.tabActivityTimes = new Map();
    this.tabMetadata = new Map(); // Metadata bổ sung
    this.memoryCache = null;
    this.memoryCacheTime = 0;
    this.sleepHistory = new Map(); // Lịch sử ngủ
  }

  /**
   * Khởi tạo và load cấu hình
   */
  async initialize() {
    const stored = await chrome.storage.local.get([
      'ramLimit',
      'sleepTimer', 
      'autoSleep',
      'aggressiveMode',
      'tabActivityTimes',
      'tabMetadata'
    ]);

    Object.assign(this.config, stored);

    if (stored.tabActivityTimes) {
      this.tabActivityTimes = new Map(Object.entries(stored.tabActivityTimes));
    }

    if (stored.tabMetadata) {
      this.tabMetadata = new Map(Object.entries(stored.tabMetadata));
    }

    await this.initializeTabActivities();

    console.log('[ResourceControls] Initialized with config:', this.config);
    return this;
  }

  /**
   * Khởi tạo thời gian hoạt động cho các tab hiện có
   */
  async initializeTabActivities() {
    try {
      const tabs = await chrome.tabs.query({});
      const now = Date.now();
      
      for (const tab of tabs) {
        if (!this.tabActivityTimes.has(tab.id)) {
          this.tabActivityTimes.set(tab.id, now);
        }
        
        // Initialize metadata
        if (!this.tabMetadata.has(tab.id)) {
          this.tabMetadata.set(tab.id, {
            createdAt: now,
            activationCount: 0,
            totalActiveTime: 0,
            lastSleepTime: null,
            sleepCount: 0
          });
        }
      }

      await this.saveTabData();
    } catch (error) {
      console.error('[ResourceControls] Error initializing tab activities:', error);
    }
  }

  /**
   * Cập nhật cấu hình
   */
  async updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
    await chrome.storage.local.set(newConfig);
    console.log('[ResourceControls] Config updated:', newConfig);
  }

  /**
   * Lấy thông tin bộ nhớ (có cache thông minh)
   */
  async getMemoryInfo() {
    const now = Date.now();
    
    // Return cache nếu còn fresh
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

      this.memoryCache = {
        totalMB,
        availableMB,
        usedMB,
        usagePercent,
        totalBytes,
        availableBytes,
        timestamp: now
      };
      this.memoryCacheTime = now;

      return this.memoryCache;
    } catch (error) {
      console.error('[ResourceControls] Memory info error:', error);
      
      // Fallback to cached data
      if (this.memoryCache) {
        return { ...this.memoryCache, stale: true };
      }
      
      return null;
    }
  }

  /**
   * Lấy danh sách tabs với thông tin chi tiết (optimized)
   */
  async getTabsInfo() {
    try {
      // Parallel queries
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
        
        // Ước tính RAM thông minh dựa trên nhiều yếu tố
        let estimatedRAM = this.estimateTabRAM(tab, isActive, isSleeping, inactiveTime, metadata);
        
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
          metadata: metadata || null
        });
      }

      // Efficient counting
      let active = 0, sleeping = 0;
      for (const info of tabsInfo) {
        if (info.isSleeping) sleeping++;
        else active++;
      }

      return {
        tabs: tabsInfo,
        total: tabs.length,
        active,
        sleeping
      };
    } catch (error) {
      console.error('[ResourceControls] Error getting tabs info:', error);
      return { tabs: [], total: 0, active: 0, sleeping: 0 };
    }
  }

  /**
   * Ước tính RAM cho tab (logic nâng cao)
   */
  estimateTabRAM(tab, isActive, isSleeping, inactiveTime, metadata) {
    if (isSleeping) return 0;

    let baseRAM = 100; // Base memory
    
    // Active tab gets more RAM
    if (isActive) {
      baseRAM = 300 + Math.random() * 200; // 300-500MB
      return Math.round(baseRAM);
    }

    // Audio/video tabs
    if (tab.audible) {
      baseRAM = 200 + Math.random() * 150; // 200-350MB
      return Math.round(baseRAM);
    }

    // Based on URL complexity
    try {
      const url = new URL(tab.url);
      const hostname = url.hostname;
      
      // Heavy sites
      if (/youtube|netflix|twitch|facebook|instagram/.test(hostname)) {
        baseRAM += 100;
      }
      
      // Documents/productivity
      if (/docs.google|notion|figma/.test(hostname)) {
        baseRAM += 80;
      }
      
    } catch (e) {
      // Invalid URL
    }

    // Based on inactive time - longer inactive = less RAM
    const inactiveMinutes = inactiveTime / 60000;
    if (inactiveMinutes > 30) {
      baseRAM *= 0.5; // 50% reduction
    } else if (inactiveMinutes > 15) {
      baseRAM *= 0.7; // 30% reduction
    } else if (inactiveMinutes > 5) {
      baseRAM *= 0.85; // 15% reduction
    }

    // Based on activation frequency
    if (metadata && metadata.activationCount > 10) {
      baseRAM *= 1.2; // Frequently used tabs maintain more RAM
    }

    // Add random variance
    baseRAM += Math.random() * 50;

    return Math.round(Math.max(50, baseRAM)); // Minimum 50MB
  }

  /**
   * Cập nhật thời gian hoạt động của tab
   */
  updateTabActivity(tabId) {
    const now = Date.now();
    const lastActivity = this.tabActivityTimes.get(tabId) || now;
    
    this.tabActivityTimes.set(tabId, now);
    
    // Update metadata
    let metadata = this.tabMetadata.get(tabId);
    if (!metadata) {
      metadata = {
        createdAt: now,
        activationCount: 0,
        totalActiveTime: 0,
        lastSleepTime: null,
        sleepCount: 0
      };
    }
    
    metadata.activationCount++;
    metadata.totalActiveTime += (now - lastActivity);
    
    this.tabMetadata.set(tabId, metadata);
    this.saveTabData();
  }

  /**
   * Xóa tab khỏi tracking
   */
  removeTab(tabId) {
    this.tabActivityTimes.delete(tabId);
    this.tabMetadata.delete(tabId);
    this.sleepHistory.delete(tabId);
    this.saveTabData();
  }

  /**
   * Lưu tab data vào storage (debounced)
   */
  saveTabData() {
    // Debounce để tránh write quá nhiều
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(async () => {
      await chrome.storage.local.set({
        tabActivityTimes: Object.fromEntries(this.tabActivityTimes),
        tabMetadata: Object.fromEntries(this.tabMetadata)
      });
    }, 1000);
  }

  /**
   * Kiểm tra và ngủ tabs (logic nâng cao)
   */
  async checkAndSleepTabs() {
    if (!this.config.autoSleep) {
      return { slept: 0, reason: 'Auto sleep disabled' };
    }

    try {
      const memoryInfo = await this.getMemoryInfo();
      const tabsInfo = await this.getTabsInfo();
      
      if (!memoryInfo) {
        return { slept: 0, reason: 'Cannot get memory info' };
      }

      const sleepTimerMs = Math.max(
        this.config.sleepTimer * 60 * 1000,
        this.config.minInactiveTime
      );

      const tabsToSleep = [];
      const now = Date.now();

      // Calculate dynamic sleep timer based on RAM usage
      let effectiveSleepTimer = this.calculateEffectiveSleepTimer(
        sleepTimerMs,
        memoryInfo.usagePercent
      );

      for (const tab of tabsInfo.tabs) {
        // Skip conditions
        if (tab.isActive || tab.isSleeping || tab.audible) continue;
        if (this.isSystemPage(tab.url)) continue;

        // Check if tab should sleep
        const shouldSleep = this.shouldTabSleep(
          tab,
          effectiveSleepTimer,
          memoryInfo.usagePercent
        );

        if (shouldSleep) {
          tabsToSleep.push(tab);
        }
      }

      // Sleep tabs with priority sorting
      tabsToSleep.sort((a, b) => {
        // Sort by priority: less important tabs sleep first
        const priorityA = this.getTabSleepPriority(a);
        const priorityB = this.getTabSleepPriority(b);
        return priorityB - priorityA; // Higher priority = sleep later
      });

      let sleptCount = 0;
      for (const tab of tabsToSleep) {
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
          
          // Record in history
          this.sleepHistory.set(tab.id, now);
          
          console.log(`[ResourceControls] Slept tab: "${tab.title}" (inactive: ${tab.inactiveMinutes}m)`);
        } catch (error) {
          console.error(`[ResourceControls] Cannot sleep tab ${tab.id}:`, error);
        }
      }

      // Aggressive mode: emergency sleep
      if (this.config.aggressiveMode && memoryInfo.usagePercent > 85) {
        const emergencyCount = await this.emergencySleep(tabsInfo.tabs, sleptCount);
        sleptCount += emergencyCount;
      }

      // Update stats
      if (sleptCount > 0) {
        await this.updateStats(sleptCount);
      }

      return {
        slept: sleptCount,
        checked: tabsInfo.total,
        memory: memoryInfo.usagePercent,
        effectiveTimer: Math.round(effectiveSleepTimer / 60000)
      };
    } catch (error) {
      console.error('[ResourceControls] Error in checkAndSleepTabs:', error);
      return { slept: 0, reason: 'Error occurred' };
    }
  }

  /**
   * Tính effective sleep timer dựa trên RAM usage
   */
  calculateEffectiveSleepTimer(baseTimer, usagePercent) {
    if (!this.config.aggressiveMode) {
      return baseTimer;
    }

    if (usagePercent > 85) return baseTimer * 0.3;
    if (usagePercent > 75) return baseTimer * 0.5;
    if (usagePercent > 65) return baseTimer * 0.7;
    if (usagePercent > 55) return baseTimer * 0.85;
    
    return baseTimer;
  }

  /**
   * Kiểm tra xem tab có nên ngủ không
   */
  shouldTabSleep(tab, effectiveSleepTimer, usagePercent) {
    // Basic time check
    if (tab.inactiveTime < effectiveSleepTimer) {
      return false;
    }

    // Check metadata
    if (tab.metadata) {
      // Tabs mới tạo - cho thêm thời gian
      const age = Date.now() - tab.metadata.createdAt;
      if (age < 300000) { // 5 phút
        return false;
      }

      // Tabs được dùng thường xuyên - sleep chậm hơn
      if (tab.metadata.activationCount > 20) {
        return tab.inactiveTime > effectiveSleepTimer * 1.5;
      }
    }

    // RAM-based decisions
    if (usagePercent > 80) {
      return true; // Sleep aggressively
    }

    return true;
  }

  /**
   * Get tab sleep priority (0-100, higher = more important)
   */
  getTabSleepPriority(tab) {
    let priority = 50; // Base priority

    // Metadata-based priority
    if (tab.metadata) {
      // Frequently activated tabs
      priority += Math.min(tab.metadata.activationCount, 20);
      
      // Recently slept tabs - lower priority
      if (tab.metadata.lastSleepTime) {
        const timeSinceSleep = Date.now() - tab.metadata.lastSleepTime;
        if (timeSinceSleep < 600000) { // 10 minutes
          priority -= 10;
        }
      }
    }

    // URL-based priority
    try {
      const url = new URL(tab.url);
      const hostname = url.hostname;
      
      // Important domains
      if (/gmail|docs\.google|drive\.google|calendar/.test(hostname)) {
        priority += 15;
      }
      
      // Social media - lower priority
      if (/facebook|twitter|instagram|tiktok/.test(hostname)) {
        priority -= 10;
      }
    } catch (e) {
      // Invalid URL
    }

    // Inactivity-based
    if (tab.inactiveMinutes > 60) {
      priority -= 20;
    }

    return Math.max(0, Math.min(100, priority));
  }

  /**
   * Emergency sleep khi RAM quá cao
   */
  async emergencySleep(tabs, alreadySlept) {
    const activeNonSystemTabs = tabs.filter(t => 
      !t.isSleeping && 
      !t.isActive && 
      !t.audible &&
      !this.isSystemPage(t.url)
    );

    const targetCount = Math.ceil(activeNonSystemTabs.length * 0.5);
    const toSleep = Math.max(0, targetCount - alreadySlept);
    
    let sleptCount = 0;
    for (let i = 0; i < toSleep && i < activeNonSystemTabs.length; i++) {
      try {
        await chrome.tabs.discard(activeNonSystemTabs[i].id);
        sleptCount++;
        console.log(`[ResourceControls] Emergency sleep: "${activeNonSystemTabs[i].title}"`);
      } catch (error) {
        console.error('[ResourceControls] Emergency sleep error:', error);
      }
    }

    return sleptCount;
  }

  /**
   * Check if URL is system page
   */
  isSystemPage(url) {
    return url.startsWith('chrome://') || 
           url.startsWith('chrome-extension://') ||
           url.startsWith('edge://') ||
           url.startsWith('about:');
  }

  /**
   * Đánh thức tab
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
      console.error(`[ResourceControls] Wake tab error ${tabId}:`, error);
    }
  }

  /**
   * Lấy thống kê tổng quan
   */
  async getStats() {
    const stored = await chrome.storage.local.get([
      'totalTabsSlept',
      'lastSleepTime'
    ]);

    const memoryInfo = await this.getMemoryInfo();
    const tabsInfo = await this.getTabsInfo();

    return {
      memory: memoryInfo,
      tabs: tabsInfo,
      totalTabsSlept: stored.totalTabsSlept || 0,
      lastSleepTime: stored.lastSleepTime || null,
      config: this.config,
      trackedTabs: this.tabActivityTimes.size
    };
  }

  /**
   * Update statistics
   */
  async updateStats(sleptCount) {
    const stats = await chrome.storage.local.get(['totalTabsSlept']);
    const total = (stats.totalTabsSlept || 0) + sleptCount;
    await chrome.storage.local.set({ 
      totalTabsSlept: total,
      lastSleepTime: Date.now()
    });
  }

  /**
   * Reset thống kê
   */
  async resetStats() {
    await chrome.storage.local.set({
      totalTabsSlept: 0,
      lastSleepTime: null
    });
    console.log('[ResourceControls] Stats reset');
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResourceControls;
}