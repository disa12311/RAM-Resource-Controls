/**
 * WorkerManager - Quản lý Web Workers cho heavy tasks
 * Tối ưu performance với multi-threading
 * Fixed: Service Worker compatible (no Blob URLs)
 */

class WorkerManager {
  constructor() {
    this.workers = new Map();
    this.workerPool = [];
    this.maxWorkers = 2; // Giảm xuống 2 workers cho ổn định
    this.taskQueue = [];
    this.isProcessing = false;
    this.nextTaskId = 1;
  }

  /**
   * Khởi tạo worker pool
   */
  async initialize() {
    console.log(`[WorkerManager] Initializing with ${this.maxWorkers} workers...`);
    
    // Note: Workers sẽ được tạo on-demand trong Service Worker
    // Vì không thể dùng Blob URLs
    
    console.log('[WorkerManager] Initialized (workers created on-demand)');
    return this;
  }

  /**
   * Execute task - Inline processing (no Web Workers in Service Worker)
   */
  async executeTask(type, data) {
    // Service Worker không hỗ trợ Web Workers tốt
    // Thay vào đó, chạy synchronously hoặc với setTimeout
    
    return new Promise((resolve, reject) => {
      try {
        let result;
        
        switch (type) {
          case 'analyzeTabPatterns':
            result = this.analyzeTabPatterns(data);
            break;
            
          case 'compressTabData':
            result = this.compressTabData(data);
            break;
            
          case 'decompressTabData':
            result = this.decompressTabData(data);
            break;
            
          case 'calculateOptimalSleepTime':
            result = this.calculateOptimalSleepTime(data);
            break;
            
          case 'predictTabUsage':
            result = this.predictTabUsage(data);
            break;
            
          default:
            throw new Error('Unknown task type: ' + type);
        }
        
        resolve(result);
        
      } catch (error) {
        console.error('[WorkerManager] Task error:', error);
        reject(error);
      }
    });
  }

  /**
   * Analyze tab patterns (ML)
   */
  analyzeTabPatterns(tabs) {
    const patterns = {
      frequentDomains: {},
      timePatterns: {},
      categoryScores: {}
    };
    
    for (const tab of tabs) {
      try {
        const url = new URL(tab.url);
        const domain = url.hostname;
        
        // Count frequency
        patterns.frequentDomains[domain] = 
          (patterns.frequentDomains[domain] || 0) + 1;
        
        // Categorize
        const category = this.categorizeTab(url, tab.title);
        patterns.categoryScores[category] = 
          (patterns.categoryScores[category] || 0) + 1;
        
        // Time patterns
        const hour = new Date(tab.lastActivity).getHours();
        patterns.timePatterns[hour] = 
          (patterns.timePatterns[hour] || 0) + 1;
          
      } catch (e) {
        // Skip invalid URLs
      }
    }
    
    return patterns;
  }

  /**
   * Categorize tab
   */
  categorizeTab(url, title) {
    const hostname = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const fullText = (hostname + path + (title || '')).toLowerCase();
    
    // Social Media
    if (/facebook|twitter|instagram|linkedin|reddit|tiktok/.test(hostname)) {
      return 'social';
    }
    
    // Video/Entertainment
    if (/youtube|netflix|twitch|vimeo|dailymotion/.test(hostname)) {
      return 'video';
    }
    
    // News
    if (/news|bbc|cnn|reuters|nytimes|guardian/.test(hostname)) {
      return 'news';
    }
    
    // Work/Productivity
    if (/docs\.google|notion|slack|trello|asana|jira|github/.test(hostname)) {
      return 'work';
    }
    
    // Shopping
    if (/amazon|ebay|shop|store|cart|buy/.test(fullText)) {
      return 'shopping';
    }
    
    return 'other';
  }

  /**
   * LZ4-like compression (simplified)
   */
  compressTabData(data) {
    const str = JSON.stringify(data);
    const compressed = [];
    let i = 0;
    const maxLookback = 1024; // Reduced for performance
    
    while (i < str.length) {
      let matchLen = 0;
      let matchPos = 0;
      
      // Find longest match
      const searchStart = Math.max(0, i - maxLookback);
      for (let j = searchStart; j < i; j++) {
        let len = 0;
        while (i + len < str.length && 
               str[i + len] === str[j + len] && 
               len < 255) {
          len++;
        }
        if (len > matchLen) {
          matchLen = len;
          matchPos = i - j;
        }
      }
      
      if (matchLen > 3) {
        compressed.push({ t: 'r', p: matchPos, l: matchLen });
        i += matchLen;
      } else {
        compressed.push({ t: 'l', c: str[i] });
        i++;
      }
    }
    
    return compressed;
  }

  /**
   * Decompress
   */
  decompressTabData(compressed) {
    const result = [];
    
    for (const token of compressed) {
      if (token.t === 'l') {
        result.push(token.c);
      } else if (token.t === 'r') {
        const start = result.length - token.p;
        for (let i = 0; i < token.l; i++) {
          result.push(result[start + i]);
        }
      }
    }
    
    return JSON.parse(result.join(''));
  }

  /**
   * Calculate optimal sleep time
   */
  calculateOptimalSleepTime(data) {
    const { tab, patterns, baseTime } = data;
    let multiplier = 1.0;
    
    try {
      const url = new URL(tab.url);
      const domain = url.hostname;
      
      // Frequent domains sleep slower
      const frequency = patterns.frequentDomains[domain] || 0;
      if (frequency > 10) multiplier *= 1.5;
      else if (frequency > 5) multiplier *= 1.2;
      
      // Category-based adjustment
      const category = this.categorizeTab(url, tab.title);
      switch (category) {
        case 'work':
          multiplier *= 1.8;
          break;
        case 'social':
          multiplier *= 0.7;
          break;
        case 'video':
          multiplier *= 0.5;
          break;
        case 'shopping':
          multiplier *= 0.6;
          break;
      }
      
      // Time-based adjustment
      const hour = new Date().getHours();
      const hourFreq = patterns.timePatterns[hour] || 0;
      if (hourFreq > 3) multiplier *= 1.3;
      
      // Metadata-based (if available)
      if (tab.metadata) {
        // Frequently activated tabs
        if (tab.metadata.activationCount > 15) {
          multiplier *= 1.4;
        }
        
        // Recently created tabs
        const age = Date.now() - tab.metadata.createdAt;
        if (age < 600000) { // 10 minutes
          multiplier *= 1.5;
        }
      }
      
    } catch (e) {
      // Use default multiplier
    }
    
    return Math.round(baseTime * multiplier);
  }

  /**
   * Predict tab usage probability
   */
  predictTabUsage(data) {
    const { tab, history, currentTime } = data;
    let score = 0.5; // Base score
    
    try {
      const url = new URL(tab.url);
      const domain = url.hostname;
      
      // History-based
      if (history) {
        const domainHistory = history.filter(h => h.includes(domain));
        score += Math.min(domainHistory.length * 0.05, 0.3);
      }
      
      // Recency score
      const lastVisit = tab.lastActivity;
      const hoursSince = (currentTime - lastVisit) / (1000 * 60 * 60);
      if (hoursSince < 1) score += 0.2;
      else if (hoursSince < 6) score += 0.1;
      else if (hoursSince > 24) score -= 0.2;
      
      // Active tab bonus
      if (tab.isActive) score += 0.3;
      
      // Audio bonus
      if (tab.audible) score += 0.4;
      
      // Metadata-based
      if (tab.metadata) {
        // High activation count
        if (tab.metadata.activationCount > 20) {
          score += 0.15;
        }
      }
      
    } catch (e) {
      // Return base score
    }
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Process queue (không cần trong inline mode)
   */
  async processQueue() {
    // Not needed for inline processing
  }

  /**
   * Cleanup
   */
  terminate() {
    // Clear any pending tasks
    this.taskQueue = [];
    console.log('[WorkerManager] Terminated');
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorkerManager;
}