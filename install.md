# 🚀 Hướng dẫn cài đặt RAM Monitor Extension

## 📁 Cấu trúc thư mục cần thiết

Tạo các file sau trong thư mục dự án:

```
RAM-Resource-Controls/
├── manifest.json
├── background.js
├── popup.html
├── popup.js
├── ResourceControls.js
├── WhitelistManager.js
├── PrivacyManager.js
└── APIManager.js
```

## ✅ Không cần npm install!

Extension này là **Chrome Extension thuần túy**, không cần:
- ❌ Node.js
- ❌ npm/yarn
- ❌ package.json
- ❌ Build tools
- ❌ Dependencies

## 🔧 Cài đặt vào Chrome/Edge

### Bước 1: Chuẩn bị files
Đảm bảo tất cả 8 files đã được tạo trong thư mục

### Bước 2: Mở Extension Manager
1. Mở Chrome/Edge
2. Vào `chrome://extensions/` (hoặc `edge://extensions/`)
3. Bật **Developer mode** (góc trên bên phải)

### Bước 3: Load Extension
1. Click **Load unpacked**
2. Chọn thư mục `RAM-Resource-Controls`
3. Extension sẽ được cài đặt ngay lập tức

### Bước 4: Kiểm tra
1. Icon extension xuất hiện trên toolbar
2. Click icon để mở popup
3. Kiểm tra RAM usage hiển thị

## 🐛 Nếu có lỗi

### Lỗi: "Manifest file is missing"
```bash
# Kiểm tra file manifest.json có tồn tại
ls -la manifest.json
```

### Lỗi: "Could not load background script"
```bash
# Kiểm tra các file JS có tồn tại
ls -la *.js
```

### Lỗi khi load extension
1. Mở **Extensions page**
2. Click **Errors** button trên extension card
3. Xem error details trong Console

## 📝 Checklist trước khi load

- [ ] Có file `manifest.json`
- [ ] Có file `background.js`
- [ ] Có file `popup.html`
- [ ] Có file `popup.js`
- [ ] Có file `ResourceControls.js`
- [ ] Có file `WhitelistManager.js`
- [ ] Có file `PrivacyManager.js`
- [ ] Có file `APIManager.js`

## 🎯 Sau khi cài đặt thành công

### Test cơ bản:
1. **Click extension icon** → Popup hiển thị RAM usage
2. **Right-click trên tab** → Context menu xuất hiện
3. **Mở Console** → Không có error logs

### Kiểm tra Service Worker:
1. Vào `chrome://extensions/`
2. Click **Service worker** link
3. Xem console logs:
```
[Background] Service Worker v3.0 loaded
[ResourceControls v3] Initialized: ...
[WhitelistManager] Initialized: ...
[PrivacyManager] Initialized: ...
[APIManager] Initialized: ...
```

## 🔍 Debug

### Xem Service Worker logs:
```javascript
// Mở chrome://extensions/
// Click "Service worker" → Console tab
// Logs sẽ hiển thị ở đây
```

### Xem Popup logs:
```javascript
// Click extension icon
// Right-click popup → Inspect
// Console tab sẽ hiển thị popup logs
```

## 🚀 Development Mode

### Hot reload:
1. Sửa code
2. Vào `chrome://extensions/`
3. Click **Reload** button trên extension card
4. Extension sẽ reload với code mới

### Live debugging:
```javascript
// Trong Service Worker Console:
console.log(resourceControls);
console.log(await resourceControls.getStats());

// Test RAM monitoring:
await resourceControls.monitorRAM();
```

## 📊 Kiểm tra hoạt động

### Test 1: RAM Monitoring
```javascript
// Service Worker Console
const stats = await resourceControls.getStats();
console.log('RAM Usage:', stats.memory.usagePercent + '%');
```

### Test 2: Tab Tracking
```javascript
// Service Worker Console
const tabs = await resourceControls.getTabsInfo();
console.log('Total tabs:', tabs.total);
console.log('Total RAM:', tabs.totalRAM + 'MB');
```

### Test 3: API
```javascript
// Generate API key
const key = await apiManager.generateApiKey('Test Key');
console.log('API Key:', key.key);
```

## ⚡ Performance Tips

### Giảm memory usage:
1. Tắt features không dùng trong manifest.json
2. Giảm `checkInterval` trong ResourceControls
3. Tắt tab tracking nếu không cần

### Tối ưu speed:
1. Cache DOM references (đã implement)
2. Debounce updates (đã implement)
3. Throttle API calls (đã implement)

## 🎨 Tùy chỉnh UI

### Thay đổi màu sắc:
Edit `popup.html` → `<style>` section:
```css
/* Primary color */
.header {
  background: linear-gradient(135deg, #YOUR_COLOR_1, #YOUR_COLOR_2);
}
```

### Thay đổi layout:
Edit grid trong `popup.html`:
```css
.stats-grid {
  grid-template-columns: 1fr 1fr 1fr; /* 3 columns */
}
```

## 📦 Distribution

### Đóng gói extension:
1. Vào `chrome://extensions/`
2. Click **Pack extension**
3. Chọn thư mục extension
4. Tạo `.crx` file và private key

### Chia sẻ:
- Share `.crx` file
- Hoặc share source code (thư mục)
- Hoặc publish lên Chrome Web Store

## 🔒 Security

### Permissions được sử dụng:
- `storage`: Lưu settings
- `tabs`: Đọc tab info
- `system.memory`: Đọc RAM usage
- `alarms`: Periodic monitoring
- `contextMenus`: Right-click menu

### Không có:
- ❌ Network requests
- ❌ Cookie access
- ❌ History access
- ❌ Bookmark access

## 📚 Tài liệu tham khảo

- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Service Workers](https://developer.chrome.com/docs/extensions/mv3/service_workers/)

---

## ❓ FAQ

**Q: Tại sao không có package.json?**
A: Đây là Chrome Extension thuần, không cần Node.js dependencies.

**Q: Cần build trước khi load không?**
A: Không! Load trực tiếp source code.

**Q: Có thể dùng trên Firefox không?**
A: Cần adapt một số API, nhưng logic core tương tự.

**Q: Extension có hoạt động offline không?**
A: Có! Hoàn toàn offline, không cần internet.

---

## ✅ Quick Start

```bash
# 1. Tạo thư mục
mkdir RAM-Resource-Controls
cd RAM-Resource-Controls

# 2. Copy tất cả 8 files vào thư mục

# 3. Load vào Chrome
# chrome://extensions/ → Load unpacked → Chọn thư mục

# Done! 🎉
```