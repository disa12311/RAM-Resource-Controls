/**
 * APIManager - External API for other extensions
 * RESTful endpoints, authentication, rate limiting
 */

class APIManager {
  constructor() {
    this.apiKeys = new Map();
    this.rateLimits = new Map();
    this.requestCounts = new Map();
    this.endpoints = new Map();
    this.webhooks = new Map();
  }

  /**
   * Khởi tạo
   */
  async initialize() {
    const stored = await chrome.storage.local.get([
      'apiKeys',
      'apiEnabled',
      'webhooks'
    ]);

    this.apiEnabled = stored.apiEnabled || false;

    if (stored.apiKeys) {
      stored.apiKeys.forEach(([key, data]) => {
        this.apiKeys.set(key, data);
      });
    }

    if (stored.webhooks) {
      stored.webhooks.forEach(([id, webhook]) => {
        this.webhooks.set(id, webhook);
      });
    }

    // Setup endpoints
    this.setupEndpoints();

    // Setup external messaging listener
    this.setupExternalMessaging();

    console.log('[APIManager] Initialized:', {
      apiEnabled: this.apiEnabled,
      apiKeys: this.apiKeys.size,
      webhooks: this.webhooks.size
    });

    return this;
  }

  /**
   * Setup endpoints
   */
  setupEndpoints() {
    // GET /stats - Get statistics
    this.addEndpoint('GET', '/stats', async (req) => {
      return {
        success: true,
        data: await this.getStats()
      };
    });

    // POST /sleep - Sleep tabs
    this.addEndpoint('POST', '/sleep', async (req) => {
      const { tabIds } = req.body || {};
      return {
        success: true,
        data: await this.sleepTabs(tabIds)
      };
    });

    // POST /wake - Wake tabs
    this.addEndpoint('POST', '/wake', async (req) => {
      const { tabIds } = req.body || {};
      return {
        success: true,
        data: await this.wakeTabs(tabIds)
      };
    });

    // GET /tabs - Get tabs info
    this.addEndpoint('GET', '/tabs', async (req) => {
      return {
        success: true,
        data: await this.getTabsInfo()
      };
    });

    // PUT /config - Update config
    this.addEndpoint('PUT', '/config', async (req) => {
      const { config } = req.body || {};
      return {
        success: true,
        data: await this.updateConfig(config)
      };
    });

    // POST /whitelist - Add to whitelist
    this.addEndpoint('POST', '/whitelist', async (req) => {
      const { domain } = req.body || {};
      return {
        success: true,
        data: await this.addToWhitelist(domain)
      };
    });

    // DELETE /whitelist - Remove from whitelist
    this.addEndpoint('DELETE', '/whitelist', async (req) => {
      const { domain } = req.body || {};
      return {
        success: true,
        data: await this.removeFromWhitelist(domain)
      };
    });
  }

  /**
   * Add endpoint
   */
  addEndpoint(method, path, handler) {
    const key = `${method}:${path}`;
    this.endpoints.set(key, handler);
  }

  /**
   * Setup external messaging
   */
  setupExternalMessaging() {
    chrome.runtime.onMessageExternal.addListener(
      (request, sender, sendResponse) => {
        this.handleExternalRequest(request, sender)
          .then(sendResponse)
          .catch(error => sendResponse({ 
            success: false, 
            error: error.message 
          }));
        return true; // Async
      }
    );
  }

  /**
   * Handle external API request
   */
  async handleExternalRequest(request, sender) {
    // Check if API is enabled
    if (!this.apiEnabled) {
      return { success: false, error: 'API disabled' };
    }

    // Verify API key
    const { apiKey, method, path, body } = request;
    
    if (!this.verifyApiKey(apiKey)) {
      return { success: false, error: 'Invalid API key' };
    }

    // Check rate limit
    if (!this.checkRateLimit(apiKey)) {
      return { success: false, error: 'Rate limit exceeded' };
    }

    // Find endpoint
    const endpointKey = `${method}:${path}`;
    const handler = this.endpoints.get(endpointKey);

    if (!handler) {
      return { success: false, error: 'Endpoint not found' };
    }

    try {
      // Execute handler
      const result = await handler({ body, sender });
      
      // Trigger webhooks
      await this.triggerWebhooks('api_call', { method, path, result });
      
      return result;
      
    } catch (error) {
      console.error('[APIManager] Handler error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate API key
   */
  async generateApiKey(name, permissions = []) {
    const key = 'rc_' + this.randomString(32);
    
    const keyData = {
      name,
      key,
      permissions,
      createdAt: Date.now(),
      rateLimit: 100, // requests per hour
      enabled: true
    };

    this.apiKeys.set(key, keyData);
    await this.saveApiKeys();

    console.log('[APIManager] Generated API key:', name);
    return keyData;
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(key) {
    const deleted = this.apiKeys.delete(key);
    if (deleted) {
      await this.saveApiKeys();
      console.log('[APIManager] Revoked API key');
    }
    return deleted;
  }

  /**
   * Verify API key
   */
  verifyApiKey(key) {
    const keyData = this.apiKeys.get(key);
    return keyData && keyData.enabled;
  }

  /**
   * Check rate limit
   */
  checkRateLimit(apiKey) {
    const keyData = this.apiKeys.get(apiKey);
    if (!keyData) return false;

    const now = Date.now();
    const hour = Math.floor(now / 3600000);
    const limitKey = `${apiKey}:${hour}`;

    const count = this.requestCounts.get(limitKey) || 0;
    
    if (count >= keyData.rateLimit) {
      return false;
    }

    this.requestCounts.set(limitKey, count + 1);
    
    // Cleanup old entries
    if (Math.random() < 0.01) {
      this.cleanupRateLimits(hour);
    }

    return true;
  }

  /**
   * Cleanup old rate limit entries
   */
  cleanupRateLimits(currentHour) {
    for (const [key] of this.requestCounts) {
      const hour = parseInt(key.split(':')[1]);
      if (hour < currentHour - 1) {
        this.requestCounts.delete(key);
      }
    }
  }

  /**
   * Add webhook
   */
  async addWebhook(event, url, secret = null) {
    const id = this.randomString(16);
    
    const webhook = {
      id,
      event,
      url,
      secret,
      enabled: true,
      createdAt: Date.now()
    };

    this.webhooks.set(id, webhook);
    await this.saveWebhooks();

    console.log('[APIManager] Added webhook:', event);
    return webhook;
  }

  /**
   * Remove webhook
   */
  async removeWebhook(id) {
    const deleted = this.webhooks.delete(id);
    if (deleted) {
      await this.saveWebhooks();
      console.log('[APIManager] Removed webhook:', id);
    }
    return deleted;
  }

  /**
   * Trigger webhooks
   */
  async triggerWebhooks(event, data) {
    const webhooks = Array.from(this.webhooks.values())
      .filter(w => w.enabled && w.event === event);

    for (const webhook of webhooks) {
      try {
        await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': webhook.secret || ''
          },
          body: JSON.stringify({
            event,
            data,
            timestamp: Date.now()
          })
        });
      } catch (error) {
        console.error('[APIManager] Webhook error:', webhook.id, error);
      }
    }
  }

  /**
   * Enable/Disable API
   */
  async setApiEnabled(enabled) {
    this.apiEnabled = enabled;
    await chrome.storage.local.set({ apiEnabled: enabled });
    console.log('[APIManager] API', enabled ? 'enabled' : 'disabled');
    return enabled;
  }

  /**
   * Get API documentation
   */
  getDocumentation() {
    return {
      version: '2.0.0',
      baseUrl: 'chrome-extension://' + chrome.runtime.id,
      authentication: 'API Key in request body',
      endpoints: [
        {
          method: 'GET',
          path: '/stats',
          description: 'Get extension statistics',
          authentication: true
        },
        {
          method: 'POST',
          path: '/sleep',
          description: 'Sleep specific tabs',
          body: { tabIds: 'array of tab IDs' },
          authentication: true
        },
        {
          method: 'POST',
          path: '/wake',
          description: 'Wake sleeping tabs',
          body: { tabIds: 'array of tab IDs' },
          authentication: true
        },
        {
          method: 'GET',
          path: '/tabs',
          description: 'Get all tabs information',
          authentication: true
        },
        {
          method: 'PUT',
          path: '/config',
          description: 'Update configuration',
          body: { config: 'config object' },
          authentication: true
        }
      ],
      rateLimit: '100 requests/hour per API key'
    };
  }

  /**
   * Random string generator
   */
  randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Save API keys
   */
  async saveApiKeys() {
    const array = Array.from(this.apiKeys.entries());
    await chrome.storage.local.set({ apiKeys: array });
  }

  /**
   * Save webhooks
   */
  async saveWebhooks() {
    const array = Array.from(this.webhooks.entries());
    await chrome.storage.local.set({ webhooks: array });
  }

  /**
   * Get API keys list
   */
  getApiKeys() {
    return Array.from(this.apiKeys.values()).map(k => ({
      name: k.name,
      key: k.key.substring(0, 10) + '...',
      createdAt: k.createdAt,
      enabled: k.enabled
    }));
  }

  /**
   * Placeholder methods - will be connected to ResourceControls
   */
  async getStats() {
    return chrome.runtime.sendMessage({ action: 'getStats' });
  }

  async sleepTabs(tabIds) {
    return chrome.runtime.sendMessage({ action: 'sleepTabs', tabIds });
  }

  async wakeTabs(tabIds) {
    return chrome.runtime.sendMessage({ action: 'wakeTabs', tabIds });
  }

  async getTabsInfo() {
    return chrome.runtime.sendMessage({ action: 'getTabsInfo' });
  }

  async updateConfig(config) {
    return chrome.runtime.sendMessage({ action: 'updateSettings', settings: config });
  }

  async addToWhitelist(domain) {
    return chrome.runtime.sendMessage({ action: 'addToWhitelist', domain });
  }

  async removeFromWhitelist(domain) {
    return chrome.runtime.sendMessage({ action: 'removeFromWhitelist', domain });
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APIManager;
}