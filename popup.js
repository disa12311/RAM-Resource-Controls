/**
 * Popup Controller - Ultra Optimized
 * Zero memory leaks, minimal DOM operations
 */

class PopupController {
  constructor() {
    // State management
    this.state = {
      isLoading: false,
      isApplying: false,
      lastUpdate: 0,
      updateThrottle: 1000 // 1 giây throttle
    };
    
    // References cache
    this.refs = {};
    
    // Timers
    this.updateTimer = null;
    this.toastTimer = null;
    
    // Bound methods để tránh tạo function mới
    this.boundUpdateStats = this.updateStats.bind(this);
    this.boundApplySettings = this.applySettings.bind(this);
    this.boundSleepNow = this.sleepNow.bind(this);
    this.boundResetStats = this.resetStats.bind(this);
    this.boundHandleCheckboxGroup = this.handleCheckboxGroup.bind(this);
  }

  /**
   * Khởi tạo - Cache DOM references
   */
  async init() {
    // Cache tất cả DOM references một lần
    this.cacheReferences();
    
    // Load và render
    await this.loadAndRender();
    
    // Bind events
    this.bindEvents();
    
    // Start auto-update với throttle
    this.startAutoUpdate();
  }

  /**
   * Cache tất cả DOM references
   */
  cacheReferences() {
    this.refs = {
      // Stats
      statusIndicator: document.getElementById('statusIndicator'),
      statusText: document.getElementById('statusText'),
      totalTabsSlept: document.getElementById('totalTabsSlept'),
      activeTabsCount: document.getElementById('activeTabsCount'),
      
      // Inputs
      ramLimit: document.getElementById('ramLimit'),
      sleepTimer: document.getElementById('sleepTimer'),
      autoSleep: document.getElementById('autoSleep'),
      aggressiveMode: document.getElementById('aggressiveMode'),
      
      // Buttons
      applySettings: document.getElementById('applySettings'),
      applyText: document.getElementById('applyText'),
      sleepNow: document.getElementById('sleepNow'),
      resetStats: document.getElementById('resetStats'),
      
      // Groups
      autoSleepGroup: document.getElementById('autoSleepGroup'),
      aggressiveModeGroup: document.getElementById('aggressiveModeGroup'),
      
      // Toast
      toast: document.getElementById('toast')
    };
  }

  /**
   * Load settings và render
   */
  async loadAndRender() {
    try {
      // Load settings từ storage
      const settings = await chrome.storage.local.get([
        'ramLimit',
        'sleepTimer',
        'autoSleep',
        'aggressiveMode'
      ]);

      // Update UI một lần
      this.refs.ramLimit.value = settings.ramLimit || 2000;
      this.refs.sleepTimer.value = settings.sleepTimer || 10;
      this.refs.autoSleep.checked = settings.autoSleep || false;
      this.refs.aggressiveMode.checked = settings.aggressiveMode || false;

      // Update checkbox group states
      this.updateCheckboxGroupState('autoSleepGroup', settings.autoSleep);
      this.updateCheckboxGroupState('aggressiveModeGroup', settings.aggressiveMode);

      // Update stats
      await this.updateStats();
      
    } catch (error) {
      console.error('[Popup] Lỗi load và render:', error);
      this.showToast('Lỗi tải dữ liệu');
    }
  }

  /**
   * Update stats với throttle
   */
  async updateStats() {
    const now = Date.now();
    
    // Throttle updates
    if (now - this.state.lastUpdate < this.state.updateThrottle) {
      return;
    }
    
    if (this.state.isLoading) return;
    this.state.isLoading = true;
    this.state.lastUpdate = now;

    try {
      // Gọi background để lấy stats
      const response = await this.sendMessage({ action: 'getStats' });
      
      if (!response.success || !response.data) {
        throw new Error('Failed to get stats');
      }

      const { memory, tabs, totalTabsSlept, config } = response.data;

      // Batch DOM updates
      this.batchUpdateDOM({
        totalTabsSlept: totalTabsSlept || 0,
        activeTabsCount: tabs ? tabs.active : 0,
        statusText: config.autoSleep ? 'Đang hoạt động' : 'Tạm dừng',
        statusClass: config.autoSleep ? 'active' : 'inactive'
      });

    } catch (error) {
      console.error('[Popup] Lỗi update stats:', error);
      this.batchUpdateDOM({
        statusText: 'Lỗi kết nối',
        statusClass: 'inactive'
      });
    } finally {
      this.state.isLoading = false;
    }
  }

  /**
   * Batch update DOM để giảm reflow
   */
  batchUpdateDOM(updates) {
    // Request animation frame để batch updates
    requestAnimationFrame(() => {
      if (updates.totalTabsSlept !== undefined) {
        this.refs.totalTabsSlept.textContent = updates.totalTabsSlept.toLocaleString();
      }
      if (updates.activeTabsCount !== undefined) {
        this.refs.activeTabsCount.textContent = updates.activeTabsCount;
      }
      if (updates.statusText !== undefined) {
        this.refs.statusText.textContent = updates.statusText;
      }
      if (updates.statusClass !== undefined) {
        this.refs.statusIndicator.className = `status-indicator ${updates.statusClass}`;
      }
    });
  }

  /**
   * Áp dụng settings
   */
  async applySettings() {
    if (this.state.isApplying) return;
    this.state.isApplying = true;

    const ramLimit = parseInt(this.refs.ramLimit.value);
    const sleepTimer = parseInt(this.refs.sleepTimer.value);
    const autoSleep = this.refs.autoSleep.checked;
    const aggressiveMode = this.refs.aggressiveMode.checked;

    // Validate
    if (ramLimit < 1000 || ramLimit > 5000) {
      this.showToast('RAM phải từ 1000-5000 MB');
      this.state.isApplying = false;
      return;
    }

    if (sleepTimer < 1 || sleepTimer > 60) {
      this.showToast('Thời gian phải từ 1-60 phút');
      this.state.isApplying = false;
      return;
    }

    try {
      // Show loading
      this.refs.applyText.innerHTML = '<span class="loading-spinner"></span>';
      this.refs.applySettings.disabled = true;

      // Gửi tới background
      await this.sendMessage({
        action: 'updateSettings',
        settings: { ramLimit, sleepTimer, autoSleep, aggressiveMode }
      });

      // Update checkbox states
      this.updateCheckboxGroupState('autoSleepGroup', autoSleep);
      this.updateCheckboxGroupState('aggressiveModeGroup', aggressiveMode);

      // Show success
      this.showToast('Đã lưu cài đặt');
      
      // Update stats
      await this.updateStats();

    } catch (error) {
      console.error('[Popup] Lỗi áp dụng settings:', error);
      this.showToast('Lỗi lưu cài đặt');
    } finally {
      this.refs.applyText.textContent = 'Áp dụng cài đặt';
      this.refs.applySettings.disabled = false;
      this.state.isApplying = false;
    }
  }

  /**
   * Ngủ tabs ngay lập tức
   */
  async sleepNow() {
    try {
      this.refs.sleepNow.disabled = true;
      this.refs.sleepNow.innerHTML = '<span class="loading-spinner"></span> Đang ngủ...';

      const response = await this.sendMessage({ action: 'forceSleep' });
      
      if (response.success && response.data) {
        const { slept } = response.data;
        if (slept > 0) {
          this.showToast(`Đã ngủ ${slept} tabs`);
          // Update badge via background
          chrome.runtime.sendMessage({ action: 'updateBadge' });
        } else {
          this.showToast('Không có tabs cần ngủ');
        }
      }

      await this.updateStats();
      
    } catch (error) {
      console.error('[Popup] Lỗi sleep now:', error);
      this.showToast('Lỗi khi ngủ tabs');
    } finally {
      this.refs.sleepNow.innerHTML = 'Ngủ ngay';
      this.refs.sleepNow.disabled = false;
    }
  }

  /**
   * Reset thống kê
   */
  async resetStats() {
    if (!confirm('Bạn có chắc muốn reset thống kê?')) {
      return;
    }

    try {
      this.refs.resetStats.disabled = true;
      
      await this.sendMessage({ action: 'resetStats' });
      
      this.showToast('Đã reset thống kê');
      await this.updateStats();
      
    } catch (error) {
      console.error('[Popup] Lỗi reset stats:', error);
      this.showToast('Lỗi reset thống kê');
    } finally {
      this.refs.resetStats.disabled = false;
    }
  }

  /**
   * Update checkbox group state
   */
  updateCheckboxGroupState(groupId, isActive) {
    const group = this.refs[groupId];
    if (group) {
      if (isActive) {
        group.classList.add('active');
      } else {
        group.classList.remove('active');
      }
    }
  }

  /**
   * Handle checkbox group click
   */
  handleCheckboxGroup(e, checkboxId, groupId) {
    if (e.target.tagName !== 'INPUT') {
      const checkbox = this.refs[checkboxId];
      checkbox.checked = !checkbox.checked;
      this.updateCheckboxGroupState(groupId, checkbox.checked);
    } else {
      this.updateCheckboxGroupState(groupId, e.target.checked);
    }
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    // Clear existing timer
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
   * Start auto-update với debounce
   */
  startAutoUpdate() {
    // Clear existing
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
   * Bind tất cả events một lần
   */
  bindEvents() {
    // Buttons
    this.refs.applySettings.addEventListener('click', this.boundApplySettings);
    this.refs.sleepNow.addEventListener('click', this.boundSleepNow);
    this.refs.resetStats.addEventListener('click', this.boundResetStats);

    // Checkbox groups
    this.refs.autoSleepGroup.addEventListener('click', (e) => {
      this.handleCheckboxGroup(e, 'autoSleep', 'autoSleepGroup');
    });

    this.refs.aggressiveModeGroup.addEventListener('click', (e) => {
      this.handleCheckboxGroup(e, 'aggressiveMode', 'aggressiveModeGroup');
    });

    // Input changes - debounced
    let inputTimer;
    const inputs = [this.refs.ramLimit, this.refs.sleepTimer];
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
          // Có thể thêm validation real-time ở đây
        }, 500);
      });
    });
  }

  /**
   * Cleanup - Prevent memory leaks
   */
  cleanup() {
    // Stop timers
    this.stopAutoUpdate();
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    // Remove event listeners
    this.refs.applySettings.removeEventListener('click', this.boundApplySettings);
    this.refs.sleepNow.removeEventListener('click', this.boundSleepNow);
    this.refs.resetStats.removeEventListener('click', this.boundResetStats);

    // Clear references
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

// Cleanup on unload - Prevent memory leaks
window.addEventListener('unload', () => {
  if (popupController) {
    popupController.cleanup();
    popupController = null;
  }
});
