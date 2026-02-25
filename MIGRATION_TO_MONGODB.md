# 🔄 Migration from Firebase to MongoDB Authentication

## ✅ Migration Complete!

All authentication features have been successfully migrated from Firebase to MongoDB.

---

## 📋 What Was Changed

### **Backend Changes:**

1. **✅ Updated Customer Model** (`models/Customer.js`)
   - Added `password` field (hashed with bcrypt)
   - Added `passwordResetToken` and `passwordResetExpires` fields
   - Added `loginAttempts` and `lockUntil` for security
   - Made `firebaseUid` optional (for backward compatibility)
   - Added password hashing middleware
   - Added password comparison method
   - Added login attempt management methods
   - Added password reset token generation method

2. **✅ Created Customer Authentication Routes** (`src/api/routes/customerAuth.js`)
   - `POST /api/customer-auth/register` - Register new customer
   - `POST /api/customer-auth/login` - Login customer
   - `POST /api/customer-auth/forgot-password` - Request password reset
   - `POST /api/customer-auth/reset-password` - Reset password with token
   - Rate limiting on all endpoints
   - JWT token generation for authenticated sessions

3. **✅ Updated Server** (`server.js`)
   - Added customer authentication routes
   - Routes available at `/api/customer-auth/*`

### **Frontend Changes:**

1. **✅ Created API Service** (`services/api.ts`)
   - Centralized API request handling
   - JWT token management
   - Customer authentication API methods

2. **✅ Updated Login Screen** (`app/login.tsx`)
   - Removed Firebase dependencies
   - Now uses backend API for login
   - Now uses backend API for forgot password
   - Stores JWT token instead of Firebase UID

3. **✅ Updated Register Screen** (`app/register.tsx`)
   - Removed Firebase dependencies
   - Now uses backend API for registration
   - Stores JWT token after registration

---

## 🔐 Authentication Flow

### **Registration:**
```
User fills form → Frontend validates → API POST /api/customer-auth/register
→ Backend validates → Creates customer in MongoDB → Hashes password
→ Generates JWT token → Returns token + customer data
→ Frontend stores token → User logged in
```

### **Login:**
```
User enters credentials → Frontend validates → API POST /api/customer-auth/login
→ Backend finds customer → Compares password → Checks account lock
→ Generates JWT token → Returns token + customer data
→ Frontend stores token → User logged in
```

### **Forgot Password:**
```
User enters email → API POST /api/customer-auth/forgot-password
→ Backend finds customer → Generates reset token → Saves token hash
→ Sends email with reset link → User clicks link
→ User enters new password → API POST /api/customer-auth/reset-password
→ Backend validates token → Updates password → Password reset complete
```

---

## 🔑 API Endpoints

### **Base URL:** `http://localhost:5000` (or your backend URL)

### **1. Register Customer**
```http
POST /api/customer-auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "1234567890",
  "address": {
    "street": "123 Main St",
    "city": "Mumbai",
    "district": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Account created successfully",
  "data": {
    "token": "jwt_token_here",
    "customer": {
      "id": "customer_id",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "1234567890"
    }
  }
}
```

### **2. Login**
```http
POST /api/customer-auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Login successful",
  "data": {
    "token": "jwt_token_here",
    "customer": {
      "id": "customer_id",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "1234567890",
      "isFarmer": false
    }
  }
}
```

### **3. Forgot Password**
```http
POST /api/customer-auth/forgot-password
Content-Type: application/json

{
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "If the email exists, a password reset link has been sent."
}
```

### **4. Reset Password**
```http
POST /api/customer-auth/reset-password
Content-Type: application/json

{
  "token": "reset_token_from_email",
  "email": "john@example.com",
  "password": "newpassword123"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Password has been reset successfully"
}
```

---

## 🔒 Security Features

1. **Password Hashing:** Bcrypt with 12 salt rounds
2. **JWT Tokens:** Secure token-based authentication
3. **Rate Limiting:**
   - Login: 5 attempts per 15 minutes
   - Register: 3 attempts per hour
   - Forgot Password: 3 attempts per hour
4. **Account Locking:** After 5 failed login attempts, account locked for 2 hours
5. **Password Reset Tokens:** Cryptographically secure, expire in 15 minutes
6. **Email Enumeration Prevention:** Always returns success message for forgot password

---

## 📝 Environment Variables Needed

### **Backend (.env):**
```env
MONGODB_URI=mongodb://localhost:27017/krushi
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
APP_URL=http://localhost:3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### **Frontend (app.json or .env):**
```json
{
  "extra": {
    "API_BASE_URL": "http://localhost:5000"
  }
}
```

---

## 🚀 Next Steps

### **Optional Improvements:**

1. **Update Register Form:**
   - Add name field (currently uses email prefix)
   - Add phone field (currently empty)
   - Add address fields

2. **Remove Firebase:**
   - Remove `firebase` package from `package.json`
   - Remove `services/firebase.ts` file
   - Remove Firebase configuration

3. **Add Email Verification:**
   - Send verification email on registration
   - Require email verification before login

4. **Add Profile Management:**
   - Update customer profile endpoint
   - Change password endpoint
   - Update profile picture

---

## ⚠️ Important Notes

1. **Backward Compatibility:**
   - Existing customers with `firebaseUid` can still exist
   - New customers will only have password (no firebaseUid)
   - You may want to migrate existing Firebase users

2. **Token Storage:**
   - JWT tokens are stored in AsyncStorage as `userToken`
   - Tokens expire after 7 days
   - Implement token refresh if needed

3. **Password Reset Email:**
   - Requires SMTP configuration
   - Email service must be properly configured
   - Reset link format: `${APP_URL}/reset-password?token=...&email=...`

4. **Testing:**
   - Test all endpoints with Postman/Thunder Client
   - Test rate limiting
   - Test account locking
   - Test password reset flow

---

## ✅ Migration Checklist

- [x] Update Customer model with password field
- [x] Create customer authentication routes
- [x] Add routes to server.js
- [x] Create API service in frontend
- [x] Update login screen
- [x] Update register screen
- [x] Update forgot password
- [ ] Test all endpoints
- [ ] Update register form with name/phone fields
- [ ] Remove Firebase dependencies (optional)
- [ ] Add email verification (optional)
- [ ] Migrate existing Firebase users (if any)

---

## 🎉 Result

**All authentication is now handled by MongoDB and your backend API!**

- ✅ No Firebase dependency for customer authentication
- ✅ Full control over authentication flow
- ✅ Secure password storage
- ✅ JWT token-based sessions
- ✅ Password reset functionality
- ✅ Account security features

---

**Migration Date:** December 2024  
**Status:** ✅ Complete and Ready for Testing

