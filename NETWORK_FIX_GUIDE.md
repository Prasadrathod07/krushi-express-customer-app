# 🔧 Network Connection Fix Guide

## ✅ Problem Fixed

**Issue:** "Unable to connect to the server" error when using forgot password (or any API call)

**Root Cause:** Mobile apps cannot use `localhost` - they need the actual IP address of your computer.

---

## 🔧 What Was Changed

### **1. Updated API URL**
- **Before:** `http://localhost:5000`
- **After:** `http://192.168.12.81:5000` (your computer's IP address)

### **2. Improved Error Messages**
- Better error messages with troubleshooting steps
- Added request logging for debugging
- Added timeout handling

---

## 📱 How to Use

### **Step 1: Restart Your App**
After updating `app.json`, you need to restart your Expo app:

```bash
# Stop the current app (Ctrl+C)
# Then restart:
npm start
# OR
expo start
```

### **Step 2: Make Sure Server is Running**
Ensure your backend server is running on port 5000:
```bash
cd Backend
npm start
# OR
node server.js
```

### **Step 3: Check Network**
- Your phone/emulator and computer must be on the **same WiFi network**
- Firewall should allow connections on port 5000

---

## 🔍 Troubleshooting

### **If Still Getting Connection Error:**

#### **1. Check Your IP Address**
Your IP might have changed. Find it again:
```bash
# Windows:
ipconfig | findstr /i "IPv4"

# Mac/Linux:
ifconfig | grep "inet "
```

Then update `app.json` with the new IP.

#### **2. Check Firewall**
Windows Firewall might be blocking port 5000:
- Go to Windows Defender Firewall
- Allow Node.js through firewall
- Or allow port 5000

#### **3. Check Server is Accessible**
Test from your phone's browser:
```
http://192.168.12.81:5000/health
```

Should return: `{"status":"healthy",...}`

#### **4. For Android Emulator**
If using Android emulator, use:
```
http://10.0.2.2:5000
```

#### **5. For iOS Simulator**
If using iOS simulator, use:
```
http://localhost:5000
```
(Simulator can use localhost)

---

## 📝 Configuration Files

### **app.json**
```json
{
  "expo": {
    "extra": {
      "API_BASE_URL": "http://192.168.12.81:5000"
    }
  }
}
```

### **If IP Changes**
If your computer gets a new IP address:
1. Find new IP: `ipconfig | findstr /i "IPv4"`
2. Update `app.json` with new IP
3. Restart Expo app

---

## 🚀 Production Setup

For production, use your actual domain:
```json
{
  "expo": {
    "extra": {
      "API_BASE_URL": "https://api.krushiexpress.com"
    }
  }
}
```

---

## ✅ Verification

After fixing, test:
1. ✅ Forgot password should work
2. ✅ Login should work
3. ✅ Register should work
4. ✅ All API calls should work

---

**Status:** ✅ Fixed - Restart your app to apply changes!

