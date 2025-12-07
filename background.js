/**
 * Background Service Worker v3.0
 * RAM Monitoring + API Manager + Whitelist + Privacy
 */

importScripts('ResourceControls.js');
importScripts('WhitelistManager.js');
importScripts('PrivacyManager.js');
importScripts('APIManager.js');

// Global instances
let resourceControls = null;
let whitelistManager = null;
let privacyManager = null;
let apiManager = null;

let monitoringAlarm = 'ramMonitor';
let keepAliveInterval = null;

// Service Worker Keep-Alive
function setupKeepAlive() {
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // Ping to keep alive
    });
  }, 20000);
}

// Initialize extension
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Background] Extension v3.0 initializing...');
  
  await initializeManagers();
  
  // Setup context menus
  setupContextMenus();
  
  // Setup RAM monitoring alarm
  chrome.alarms.create(monitoringAlarm, { 
    periodInMinutes: 1,
    delayInMinutes: 0
  });
  
  console.log('[Background] Initialization complete');
  
  if (details.reason === 'install') {
    console.log('[Background] Welcome! Extension installed successfully.');
  }
});

// Initialize all managers
async function initializeManagers() {
  resourceControls = new ResourceControls();
  await resourceControls.initialize();
  
  whitelistManager = new WhitelistManager();
  await whitelistManager.initialize();
  
  privacyManager = new PrivacyManager();
  await privacyManager.initialize();
  
  apiManager = new APIManager();
  await apiManager.initialize();
}

// Startup initialization
(async () => {
  if (!resourceControls) {
    await initializeManagers();
    setupKeepAlive();
  }
})();

// Setup context menus
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'check-ram',
      title: 'Check RAM Usage',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'never-track',
      title: 'Don\'t Track This Domain',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'separator1',
      type: 'separator',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'view-stats',
      title: 'View RAM Statistics',
      contexts: ['page']
    });
  });
}

// Context menu handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const url = tab.url;
    const domain = new URL(url).hostname;

    switch (info.menuItemId) {
      case 'check-ram':
        const ramInfo = await resourceControls.getMemoryInfo();
        console.log('[Background] RAM Usage:', ramInfo);
        break;

      case 'never-track':
        await whitelistManager.addToWhitelist(domain);
        console.log('[Background] Added to whitelist:', domain);
        break;

      case 'view-stats':
        const stats = await resourceControls.getStats();
        console.log('[Background] Stats:', stats);
        break;
    }
  } catch (error) {
    console.error('[Background] Context menu error:', error);
  }
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true;
});

async function handleMessage(request, sender, sendResponse) {
  try {
    switch (request.action) {
      // Resource Controls
      case 'updateSettings':
        await resourceControls.updateConfig(request.settings);
        sendResponse({ success: true });
        break;

      case 'getStats':
        const stats = await resourceControls.getStats();
        const whitelistStats = whitelistManager.getStats();
        const privacyStatus = privacyManager.getStatus();
        sendResponse({ 
          success: true, 
          data: { ...stats, whitelistStats, privacyStatus }
        });
        break;

      case 'getRAMAnalysis':
        const analysis = await resourceControls.getRAMAnalysis();
        sendResponse({ success: true, data: analysis });
        break;

      case 'monitorRAM':
        const result = await resourceControls.monitorRAM();
        sendResponse({ success: true, data: result });
        break;

      case 'resetStats':
        await resourceControls.resetStats();
        sendResponse({ success: true });
        break;

      // Whitelist management
      case 'addToWhitelist':
        await whitelistManager.addToWhitelist(request.domain);
        sendResponse({ success: true });
        break;

      case 'removeFromWhitelist':
        await whitelistManager.removeFromWhitelist(request.domain);
        sendResponse({ success: true });
        break;

      case 'addToBlacklist':
        await whitelistManager.addToBlacklist(request.domain);
        sendResponse({ success: true });
        break;

      case 'removeFromBlacklist':
        await whitelistManager.removeFromBlacklist(request.domain);
        sendResponse({ success: true });
        break;

      case 'getLists':
        const lists = whitelistManager.getLists();
        sendResponse({ success: true, data: lists });
        break;

      // Privacy management
      case 'setPrivacyMode':
        await privacyManager.setPrivacyMode(request.enabled);
        sendResponse({ success: true });
        break;

      case 'exportData':
        const exportData = await exportAllData();
        sendResponse({ success: true, data: exportData });
        break;

      case 'importData':
        await importAllData(request.data);
        sendResponse({ success: true });
        break;

      // API management
      case 'generateApiKey':
        const apiKey = await apiManager.generateApiKey(request.name, request.permissions);
        sendResponse({ success: true, data: apiKey });
        break;

      case 'revokeApiKey':
        const revoked = await apiManager.revokeApiKey(request.key);
        sendResponse({ success: true, data: revoked });
        break;

      case 'getApiKeys':
        const keys = apiManager.getApiKeys();
        sendResponse({ success: true, data: keys });
        break;

      case 'setApiEnabled':
        const enabled = await apiManager.setApiEnabled(request.enabled);
        sendResponse({ success: true, data: enabled });
        break;

      case 'getDocumentation':
        const docs = apiManager.getDocumentation();
        sendResponse({ success: true, data: docs });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('[Background] Message handler error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// RAM monitoring alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === monitoringAlarm) {
    try {
      const result = await resourceControls.monitorRAM();
      if (result.success) {
        const { memory } = result;
        
        // Log if critical
        if (memory.status === 'critical') {
          console.warn('[Background] CRITICAL RAM:', memory.usagePercent + '%');
        }
      }
    } catch (error) {
      console.error('[Background] Monitoring error:', error);
    }
  }
});

// Tab events
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  resourceControls.updateTabActivity(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.audible === true) {
    resourceControls.updateTabActivity(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  resourceControls.removeTab(tabId);
});

// Export all data
async function exportAllData() {
  const data = {
    version: '3.0.0',
    timestamp: Date.now(),
    config: resourceControls.config,
    stats: await resourceControls.getStats(),
    whitelist: whitelistManager.getLists(),
    privacy: privacyManager.getStatus()
  };

  if (privacyManager.isPrivacyMode) {
    return await privacyManager.exportEncryptedBackup(data);
  }

  return JSON.stringify(data);
}

// Import all data
async function importAllData(dataStr) {
  let data;

  if (privacyManager.isPrivacyMode) {
    data = await privacyManager.importEncryptedBackup(dataStr);
  } else {
    data = JSON.parse(dataStr);
  }

  // Import config
  await resourceControls.updateConfig(data.config);

  // Import whitelist
  if (data.whitelist) {
    await whitelistManager.importRules(data.whitelist);
  }

  console.log('[Background] Data imported successfully');
}

// Cleanup on unload
self.addEventListener('unload', async () => {
  if (resourceControls) {
    await resourceControls.saveTabData();
  }
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
});

console.log('[Background] Service Worker v3.0 loaded');