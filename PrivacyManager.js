/**
 * PrivacyManager - Quản lý privacy mode
 * Encryption, local-only storage, zero tracking
 */

class PrivacyManager {
  constructor() {
    this.isPrivacyMode = false;
    this.encryptionKey = null;
    this.localOnlyMode = false;
  }

  /**
   * Khởi tạo
   */
  async initialize() {
    const stored = await chrome.storage.local.get([
      'privacyMode',
      'localOnlyMode',
      'encryptionKey'
    ]);

    this.isPrivacyMode = stored.privacyMode || false;
    this.localOnlyMode = stored.localOnlyMode || false;
    
    // Generate encryption key nếu chưa có
    if (!stored.encryptionKey) {
      this.encryptionKey = this.generateKey();
      await chrome.storage.local.set({ encryptionKey: this.encryptionKey });
    } else {
      this.encryptionKey = stored.encryptionKey;
    }

    console.log('[PrivacyManager] Initialized:', {
      privacyMode: this.isPrivacyMode,
      localOnly: this.localOnlyMode
    });

    return this;
  }

  /**
   * Toggle privacy mode
   */
  async setPrivacyMode(enabled) {
    this.isPrivacyMode = enabled;
    await chrome.storage.local.set({ privacyMode: enabled });
    
    if (enabled) {
      console.log('[PrivacyManager] Privacy mode ENABLED');
      // Clear any analytics/tracking
      await this.clearTrackingData();
    } else {
      console.log('[PrivacyManager] Privacy mode DISABLED');
    }
    
    return enabled;
  }

  /**
   * Toggle local-only mode
   */
  async setLocalOnlyMode(enabled) {
    this.localOnlyMode = enabled;
    await chrome.storage.local.set({ localOnlyMode: enabled });
    
    console.log('[PrivacyManager] Local-only mode:', enabled);
    return enabled;
  }

  /**
   * Generate encryption key
   */
  generateKey() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Encrypt data
   */
  async encrypt(data) {
    if (!this.isPrivacyMode) return data;

    try {
      const str = JSON.stringify(data);
      const encoded = new TextEncoder().encode(str);
      
      // Simple XOR encryption với key
      const key = new TextEncoder().encode(this.encryptionKey);
      const encrypted = new Uint8Array(encoded.length);
      
      for (let i = 0; i < encoded.length; i++) {
        encrypted[i] = encoded[i] ^ key[i % key.length];
      }
      
      // Convert to base64
      return btoa(String.fromCharCode.apply(null, encrypted));
      
    } catch (error) {
      console.error('[PrivacyManager] Encryption error:', error);
      return data; // Fallback
    }
  }

  /**
   * Decrypt data
   */
  async decrypt(encrypted) {
    if (!this.isPrivacyMode) return encrypted;

    try {
      // Decode from base64
      const decoded = atob(encrypted);
      const bytes = new Uint8Array(decoded.length);
      
      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i);
      }
      
      // XOR decrypt
      const key = new TextEncoder().encode(this.encryptionKey);
      const decrypted = new Uint8Array(bytes.length);
      
      for (let i = 0; i < bytes.length; i++) {
        decrypted[i] = bytes[i] ^ key[i % key.length];
      }
      
      const str = new TextDecoder().decode(decrypted);
      return JSON.parse(str);
      
    } catch (error) {
      console.error('[PrivacyManager] Decryption error:', error);
      return encrypted; // Fallback
    }
  }

  /**
   * Clear tracking data
   */
  async clearTrackingData() {
    // Clear analytics, logs, history
    await chrome.storage.local.remove([
      'analytics',
      'logs',
      'history',
      'lastSyncTime'
    ]);
    
    console.log('[PrivacyManager] Tracking data cleared');
  }

  /**
   * Sanitize data trước khi lưu
   */
  sanitizeData(data) {
    if (!this.isPrivacyMode) return data;

    // Remove sensitive info
    const sanitized = { ...data };
    
    // Remove URLs
    if (sanitized.url) {
      try {
        const url = new URL(sanitized.url);
        sanitized.url = url.origin; // Chỉ giữ domain
      } catch (e) {
        delete sanitized.url;
      }
    }
    
    // Remove titles (có thể chứa sensitive info)
    if (sanitized.title) {
      sanitized.title = '[REDACTED]';
    }
    
    // Remove favicons
    delete sanitized.favIconUrl;
    
    return sanitized;
  }

  /**
   * Check nếu operation được phép
   */
  isOperationAllowed(operation) {
    if (!this.isPrivacyMode) return true;

    const blockedOperations = [
      'sendAnalytics',
      'syncToCloud',
      'shareData',
      'exportFullHistory'
    ];

    return !blockedOperations.includes(operation);
  }

  /**
   * Get privacy status
   */
  getStatus() {
    return {
      privacyMode: this.isPrivacyMode,
      localOnlyMode: this.localOnlyMode,
      encryptionEnabled: this.isPrivacyMode,
      trackingDisabled: this.isPrivacyMode
    };
  }

  /**
   * Export encrypted backup
   */
  async exportEncryptedBackup(data) {
    if (!this.isPrivacyMode) {
      return JSON.stringify(data);
    }

    const encrypted = await this.encrypt(data);
    return JSON.stringify({
      encrypted: true,
      data: encrypted,
      timestamp: Date.now()
    });
  }

  /**
   * Import encrypted backup
   */
  async importEncryptedBackup(backup) {
    try {
      const parsed = JSON.parse(backup);
      
      if (parsed.encrypted) {
        return await this.decrypt(parsed.data);
      } else {
        return parsed;
      }
      
    } catch (error) {
      console.error('[PrivacyManager] Import error:', error);
      throw error;
    }
  }

  /**
   * Generate privacy report
   */
  getPrivacyReport() {
    return {
      privacyModeEnabled: this.isPrivacyMode,
      localOnlyStorage: this.localOnlyMode,
      encryptionActive: this.isPrivacyMode,
      dataCollection: this.isPrivacyMode ? 'Disabled' : 'Enabled',
      analytics: this.isPrivacyMode ? 'Blocked' : 'Allowed',
      cloudSync: this.localOnlyMode ? 'Disabled' : 'Enabled',
      recommendations: this.getRecommendations()
    };
  }

  /**
   * Get privacy recommendations
   */
  getRecommendations() {
    const recommendations = [];

    if (!this.isPrivacyMode) {
      recommendations.push('Enable Privacy Mode for enhanced protection');
    }

    if (!this.localOnlyMode) {
      recommendations.push('Enable Local-Only Mode to prevent cloud sync');
    }

    if (recommendations.length === 0) {
      recommendations.push('Privacy settings are optimal');
    }

    return recommendations;
  }

  /**
   * Reset encryption key
   */
  async resetEncryptionKey() {
    this.encryptionKey = this.generateKey();
    await chrome.storage.local.set({ encryptionKey: this.encryptionKey });
    console.log('[PrivacyManager] Encryption key reset');
    return true;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PrivacyManager;
}