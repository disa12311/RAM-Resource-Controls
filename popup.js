/**
 * Popup Controller - RAM Monitor
 */

class PopupController {
  constructor() {
    this.state = {
      isLoading: false,
      lastUpdate: 0,
      updateThrottle: 2000
    };
    
    this.refs = {};
    this.updateTimer = null;
    this.toastTimer = null;
    
    // Bound methods
    this.boundUpdateStats = this.updateStats.bind(this);
    this.boundApplySettings = this.applySettings.bind(this);
    this.boundCheckNow = this.checkNow.bind(this);
    this.boundResetStats = this.resetStats.bind(this);
  }

  /**
   * Initialize
   */
  async init() {
    this.cacheReferences();
    await this.loadAndRender();
    this.bindEvents();
    this.startAutoUpdate();
  }

  /**
   * Cache DOM references
   */
  cacheReferences() {
    this.refs = {
      // RAM Card
      ramUsage: document.getElementById('ramUsage'),
      ramStatus: document.getElementById('ramStatus'),
      ramBarFill: document.getElementById('ramBarFill'),
      usedRAM: document.getElementById('usedRAM'),
      availableRAM: document.getElementById('availableRAM'),
      
      // Stats
      totalTabs: document.getElementById('totalTabs'),
      totalTabRAM: document.getElementById('totalTabRAM'),
      avgTabRAM: document.getElementById('avgTabRAM'),
      peakRAM: document.getElementById('peakRAM'),
      
      // Top Consumers
      topConsumers: document.getElementById('topConsumers'),
      
      // Controls
      ramLimit: document.getElementById('ramLimit'),
      applySettings: document.getElementById('applySettings'),
      checkNow: document.getElementById('checkNow'),
      resetStats: document.getElementById('resetStats'),
      
      // Toast
      toast: document.getElementById('toast')
    };
  }

  /**
   * Load and render
   */
  async loadAndRender() {
    try {
      // Load settings
      const settings = await chrome.storage.local.get(['ramLimit']);
      this.refs.ramLimit.value = settings.ramLimit || 2000;

      // Update stats
      await this.updateStats();
      
    } catch (error) {
      console.error('[Popup] Load error:', error);
      this.showToast('Failed to load data');
    }
  }

  /**
   * Update stats
   */
  async updateStats() {
    const now = Date.now();
    
    if (now - this.state.lastUpdate < this.state.updateThrottle) {
      return;
    }
    
    if (this.state.isLoading) return;
    this.state.isLoading = true;
    this.state.lastUpdate = now;

    try {
      const response = await this.sendMessage({ action: 'getStats' });
      
      if (!response.success || !response.data) {
        throw new Error('Failed to get stats');
      }

      const { memory, tabs, performance } = response.data;

      // Update RAM Card
      this.updateRAMCard(memory);
      
      // Update Stats
      this.updateStatsCards(tabs, performance);
      
      // Update Top Consumers
      await this.updateTopConsumers();

    } catch (error) {
      console.error('[Popup] Update error:', error);
    } finally {
      this.state.isLoading = false;
    }
  }

  /**
   * Update RAM card
   */
  updateRAMCard(memory) {
    if (!memory) return;

    const { usagePercent, usedMB, availableMB, status } = memory;

    // Update values
    this.refs.ramUsage.textContent = usagePercent + '%';
    this.refs.usedRAM.textContent = usedMB + ' MB';
    this.refs.availableRAM.textContent = availableMB + ' MB';
    this.refs.ramBarFill.style.width = usagePercent + '%';

    // Update status badge
    this.refs.ramStatus.textContent = status;
    this.refs.ramStatus.className = 'status-badge status-' + status;
  }

  /**
   * Update stats cards
   */
  updateStatsCards(tabs, performance) {
    if (!tabs) return;

    this.refs.totalTabs.textContent = tabs.total;
    this.refs.totalTabRAM.textContent = tabs.totalRAM + ' MB';
    this.refs.avgTabRAM.textContent = tabs.averageRAM + ' MB';
    
    if (performance) {
      this.refs.peakRAM.textContent = Math.round(performance.peakMemoryUsage) + '%';
    }
  }

  /**
   * Update top consumers
   */
  async updateTopConsumers() {
    try {
      const response = await this.sendMessage({ action: 'getRAMAnalysis' });
      
      if (!response.success || !response.data) {
        return;
      }

      const { topDomains } = response.data;

      if (!topDomains || topDomains.length === 0) {
        this.refs.topConsumers.innerHTML = '<div class="empty-state">No data yet</div>';
        return;
      }

      this.refs.topConsumers.innerHTML = topDomains
        .slice(0, 5)
        .map(item => `
          <div class="consumer-item">
            <div class="consumer-name">${item.domain}</div>
            <div class="consumer-ram">${item.ram} MB</div>
          </div>
        `).join('');

    } catch (error) {
      console.error('[Popup] Top consumers error:', error);
    }
  }

  /**
   * Apply settings
   */
  async applySettings() {
    const ramLimit = parseInt(this.refs.ramLimit.value);

    if (ramLimit < 1000 || ramLimit > 5000) {
      this.showToast('RAM limit must be 1000-5000 MB');
      return;
    }

    try {
      this.refs.applySettings.disabled = true;
      this.refs.applySettings.innerHTML = '<span class="loading-spinner"></span> Applying...';

      await this.sendMessage({
        action: 'updateSettings',
        settings: { ramLimit }
      });

      this.showToast('Settings saved');
      await this.updateStats();

    } catch (error) {
      console.error('[Popup] Apply error:', error);
      this.showToast('Failed to save settings');
    } finally {
      this.refs.applySettings.disabled = false;
      this.refs.applySettings.textContent = 'Apply Settings';
    }
  }

  /**
   * Check now
   */
  async checkNow() {
    try {
      this.refs.checkNow.disabled = true;
      this.refs.checkNow.innerHTML = '<span class="loading-spinner"></span> Checking...';

      await this.sendMessage({ action: 'monitorRAM' });
      
      this.showToast('RAM check complete');
      await this.updateStats();

    } catch (error) {
      console.error('[Popup] Check error:', error);
      this.showToast('Check failed');
    } finally {
      this.refs.checkNow.disabled = false;
      this.refs.checkNow.textContent = 'Check Now';
    }
  }

  /**
   * Reset stats
   */
  async resetStats() {
    if (!confirm('Reset all statistics?')) {
      return;
    }

    try {
      this.refs.resetStats.disabled = true;
      
      await this.sendMessage({ action: 'resetStats' });
      
      this.showToast('Statistics reset');
      await this.updateStats();
      
    } catch (error) {
      console.error('[Popup] Reset error:', error);
      this.showToast('Reset failed');
    } finally {
      this.refs.resetStats.disabled = false;
    }
  }

  /**
   * Show toast
   */
  showToast(message) {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    const toast = this.refs.toast;
    toast.textContent = message;
    toast.className = 'toast show';

    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  /**
   * Send message to background
   */
  sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response || { success: false });
      });
    });
  }

  /**
   * Start auto-update
   */
  startAutoUpdate() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    // Update every 3 seconds
    this.updateTimer = setInterval(this.boundUpdateStats, 3000);
  }

  /**
   * Stop auto-update
   */
  stopAutoUpdate() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * Bind events
   */
  bindEvents() {
    this.refs.applySettings.addEventListener('click', this.boundApplySettings);
    this.refs.checkNow.addEventListener('click', this.boundCheckNow);
    this.refs.resetStats.addEventListener('click', this.boundResetStats);
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.stopAutoUpdate();
    
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.refs.applySettings.removeEventListener('click', this.boundApplySettings);
    this.refs.checkNow.removeEventListener('click', this.boundCheckNow);
    this.refs.resetStats.removeEventListener('click', this.boundResetStats);
    
    this.refs = null;
    this.state = null;
  }
}

// Initialize
let popupController = null;

document.addEventListener('DOMContentLoaded', () => {
  popupController = new PopupController();
  popupController.init();
});

window.addEventListener('unload', () => {
  if (popupController) {
    popupController.cleanup();
    popupController = null;
  }
});
