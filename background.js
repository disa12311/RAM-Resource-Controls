/**
 * Background Service Worker - Advanced v2.0
 * Multi-threading, ML, Whitelist, Privacy, API
 */

importScripts('ResourceControls.js');
importScripts('WorkerManager.js');
importScripts('WhitelistManager.js');
importScripts('PrivacyManager.js');
importScripts('APIManager.js');

// Global instances
let resourceControls = null;
let workerManager = null;
let whitelistManager = null;
let privacyManager = null;
let apiManager = null;

let monitoringAlarm = 'resourceMonitor';
let keepAliveInterval = null;

// Service Worker Keep-Alive Strategy
function setupKeepAlive() {
  // Keep service worker alive
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // Ping to keep alive
    });
  }, 20000); // Every 20 seconds
}

// Khởi tạo extension
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Background] RAM Resource Controls v2.0 initializing...');
  
  await initializeManagers();
  
  // Setup context menus
  setupContextMenus();
  
  // Setup alarms
  chrome.alarms.create(monitoringAlarm, { 
    periodInMinutes: 1,
    delayInMinutes: 0
  });
  
  // Show welcome notification
  if (details.reason === 'install') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="48"%3E%3Crect fill="%230078d4" width="48" height="48"/%3E%3C/svg%3E',
      title: 'RAM Resource Controls Installed',
      message: 'Extension is ready! Right-click on tabs for quick actions.',
      priority: 1
    });
  }
  
  console.log('[Background] Initialization complete');
});

// Initialize all managers
async function initializeManagers() {
  resourceControls = new ResourceControls();
  await resourceControls.initialize();
  
  workerManager = new WorkerManager();
  await workerManager.initialize();
  
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
      id: 'sleep-tab',
      title: 'Sleep This Tab',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'never-sleep',
      title: 'Never Sleep This Domain',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'always-sleep',
      title: 'Always Sleep This Domain',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'separator1',
      type: 'separator',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'wake-all',
      title: 'Wake All Sleeping Tabs',
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
      case 'sleep-tab':
        await chrome.tabs.discard(tab.id);
        showNotification('Tab Sleeping', `Tab has been put to sleep`);
        break;

      case 'never-sleep':
        await whitelistManager.addToWhitelist(domain);
        showNotification('Domain Whitelisted', `${domain} will never sleep`);
        break;

      case 'always-sleep':
        await whitelistManager.addToBlacklist(domain);
        showNotification('Domain Blacklisted', `${domain} will sleep quickly`);
        break;

      case 'wake-all':
        const tabs = await chrome.tabs.query({ discarded: true });
        for (const t of tabs) {
          await chrome.tabs.reload(t.id);
        }
        showNotification('Tabs Awakened', `Woke up ${tabs.length} tabs`);
        break;
    }
  } catch (error) {
    console.error('[Background] Context menu error:', error);
  }
});

// Keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  try {
    switch (command) {
      case 'sleep-current-tab':
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) {
          await chrome.tabs.discard(activeTab.id);
          showNotification('Tab Sleeping', 'Current tab has been put to sleep');
        }
        break;

      case 'wake-all-tabs':
        const sleepingTabs = await chrome.tabs.query({ discarded: true });
        for (const tab of sleepingTabs) {
          await chrome.tabs.reload(tab.id);
        }
        showNotification('All Tabs Awakened', `Woke up ${sleepingTabs.length} tabs`);
        break;

      case 'toggle-auto-sleep':
        const config = resourceControls.config;
        const newState = !config.autoSleep;
        await resourceControls.updateConfig({ autoSleep: newState });
        showNotification(
          'Auto Sleep ' + (newState ? 'Enabled' : 'Disabled'),
          newState ? 'Tabs will sleep automatically' : 'Auto sleep is off'
        );
        break;
    }
  } catch (error) {
    console.error('[Background] Command error:', error);
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
      case 'updateSettings':
        await resourceControls.updateConfig(request.settings);
        if (request.settings.autoSleep) {
          const result = await checkAndSleepTabsWithML();
          console.log('[Background] Check result:', result);
        }
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

      case 'forceSleep':
        const result = await checkAndSleepTabsWithML();
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
        const apiKey = await apiManager.generateApiKey(request.name);
        sendResponse({ success: true, data: apiKey });
        break;

      case 'getApiKeys':
        const keys = apiManager.getApiKeys();
        sendResponse({ success: true, data: keys });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('[Background] Message handler error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Enhanced check with ML
async function checkAndSleepTabsWithML() {
  if (!resourceControls.config.autoSleep) {
    return { slept: 0, reason: 'Auto sleep disabled' };
  }

  try {
    const tabsInfo = await resourceControls.getTabsInfo();
    const memoryInfo = await resourceControls.getMemoryInfo();

    // Analyze patterns with ML worker
    const patterns = await workerManager.analyzeTabPatterns(tabsInfo.tabs);

    const sleepTimerMs = resourceControls.config.sleepTimer * 60 * 1000;
    const tabsToSleep = [];

    for (const tab of tabsInfo.tabs) {
      // Skip active, sleeping, audible tabs
      if (tab.isActive || tab.isSleeping || tab.audible) continue;
      
      // Skip system pages
      if (tab.url.startsWith('chrome://') || 
          tab.url.startsWith('chrome-extension://')) continue;

      // Check whitelist/blacklist
      const sleepPriority = whitelistManager.getSleepPriority(tab.url);
      if (sleepPriority === 0) continue; // Whitelisted - never sleep

      // Calculate optimal sleep time with ML
      const optimalTime = await workerManager.calculateOptimalSleepTime(
        tab, 
        patterns, 
        sleepTimerMs
      );

      // Blacklist → sleep immediately
      if (sleepPriority === 2) {
        tabsToSleep.push(tab);
        continue;
      }

      // Normal tabs → check optimal time
      if (tab.inactiveTime > optimalTime) {
        tabsToSleep.push(tab);
      }
    }

    // Sleep tabs
    let sleptCount = 0;
    for (const tab of tabsToSleep) {
      try {
        await chrome.tabs.discard(tab.id);
        sleptCount++;
        console.log(`[Background] Slept: "${tab.title}"`);
      } catch (error) {
        console.error(`[Background] Cannot sleep tab ${tab.id}:`, error);
      }
    }

    // Update stats
    if (sleptCount > 0) {
      const stats = await chrome.storage.local.get(['totalTabsSlept']);
      await chrome.storage.local.set({ 
        totalTabsSlept: (stats.totalTabsSlept || 0) + sleptCount,
        lastSleepTime: Date.now()
      });

      // Show notification if significant
      if (sleptCount >= 5) {
        showNotification(
          'Tabs Optimized',
          `Put ${sleptCount} tabs to sleep to free RAM`
        );
      }
    }

    return { slept: sleptCount, checked: tabsInfo.total };

  } catch (error) {
    console.error('[Background] ML check error:', error);
    return { slept: 0, reason: 'Error occurred' };
  }
}

// Alarm handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === monitoringAlarm) {
    try {
      const result = await checkAndSleepTabsWithML();
      if (result.slept > 0) {
        console.log(`[Background] Auto-slept ${result.slept} tabs`);
      }
    } catch (error) {
      console.error('[Background] Alarm error:', error);
    }
  }
});

// Tab events
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  resourceControls.updateTabActivity(activeInfo.tabId);
  await resourceControls.wakeTab(activeInfo.tabId);
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
    version: '2.0.0',
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

// Show notification helper
function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="48"%3E%3Crect fill="%230078d4" width="48" height="48"/%3E%3C/svg%3E',
    title,
    message,
    priority: 0
  });
}

// Cleanup on unload
self.addEventListener('unload', async () => {
  if (resourceControls) {
    await resourceControls.saveTabActivityTimes();
  }
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
});

console.log('[Background] Service Worker v2.0 loaded');