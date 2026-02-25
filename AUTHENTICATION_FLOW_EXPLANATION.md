# 🔐 Authentication Flow Explanation

## How Forgot Password Works

### **Current Implementation (Firebase)**

The forgot password feature uses **Firebase Authentication's built-in password reset functionality**.

### **Step-by-Step Flow:**

1. **User Clicks "Forgot Password?"**
   - Located below the "Remember me" checkbox on the login screen
   - User must have entered their email address first

2. **Email Validation**
   - Checks if email field is not empty
   - Validates email format using regex pattern
   - Shows error alert if validation fails

3. **Firebase Password Reset Email**
   - Calls `sendPasswordResetEmail(auth, email)` from Firebase
   - Firebase sends a password reset email to the user's email address
   - Email contains a secure link to reset the password

4. **User Receives Email**
   - Email is sent by Firebase (from `noreply@krushi-express-mh24.firebaseapp.com`)
   - Contains a secure reset link
   - Link expires after a certain time (Firebase default: 1 hour)

5. **User Clicks Reset Link**
   - Opens in browser or app (if deep linking is configured)
   - User enters new password
   - Password is reset in Firebase Authentication

6. **User Can Now Login**
   - User returns to app
   - Logs in with email and new password

### **Code Location:**
- **File:** `app/login.tsx`
- **Function:** `handleForgotPassword()` (lines 149-176)

### **Firebase Function Used:**
```javascript
import { sendPasswordResetEmail } from 'firebase/auth';
await sendPasswordResetEmail(auth, email);
```

### **What Happens Behind the Scenes:**
- Firebase generates a secure token
- Sends email via Firebase's email service
- Token is one-time use and time-limited
- No backend API needed - handled entirely by Firebase

---

## How Registration Works

### **Current Implementation (Firebase)**

The registration feature uses **Firebase Authentication's email/password signup**.

### **Step-by-Step Flow:**

1. **User Navigates to Register Screen**
   - Clicks "Don't have an account? Register" on login screen
   - Or directly navigates to `/register` route

2. **User Fills Registration Form**
   - **Email:** Must be valid email format
   - **Password:** Minimum 6 characters (Firebase requirement)
   - **Confirm Password:** Must match password field

3. **Client-Side Validation**
   - Checks all fields are filled
   - Validates password match
   - Validates password length (min 6 characters)
   - Shows error alerts if validation fails

4. **Firebase Account Creation**
   - Calls `createUserWithEmailAndPassword(auth, email, password)`
   - Firebase creates new user account
   - User is automatically signed in after registration

5. **Success Handling**
   - Shows success alert
   - Automatically redirects to login screen
   - User must login again (security best practice)

6. **Error Handling**
   - Handles Firebase errors (email already exists, weak password, etc.)
   - Shows user-friendly error messages

### **Code Location:**
- **File:** `app/register.tsx`
- **Function:** `handleRegister()` (lines 14-41)

### **Firebase Function Used:**
```javascript
import { createUserWithEmailAndPassword } from 'firebase/auth';
await createUserWithEmailAndPassword(auth, email, password);
```

### **What Happens Behind the Scenes:**
- Firebase creates user account in Authentication database
- User gets unique UID (User ID)
- Password is hashed and stored securely
- Email verification can be enabled (currently not implemented)
- No backend API needed - handled entirely by Firebase

---

## 🔄 Complete Authentication Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER JOURNEY                              │
└─────────────────────────────────────────────────────────────┘

1. NEW USER (Registration)
   ┌──────────────┐
   │ Register Page │
   └──────┬───────┘
          │
          ├─> Fill Email, Password, Confirm Password
          │
          ├─> Client Validation
          │   ├─> All fields filled?
          │   ├─> Passwords match?
          │   └─> Password length >= 6?
          │
          ├─> Firebase: createUserWithEmailAndPassword()
          │   ├─> Creates account
          │   ├─> Returns user credentials
          │   └─> User auto-signed in
          │
          └─> Redirect to Login
              └─> User must login again

2. EXISTING USER (Login)
   ┌──────────────┐
   │  Login Page   │
   └──────┬───────┘
          │
          ├─> Fill Email & Password
          │
          ├─> Client Validation
          │   ├─> Email format valid?
          │   └─> Password length >= 6?
          │
          ├─> Firebase: signInWithEmailAndPassword()
          │   ├─> Validates credentials
          │   ├─> Returns user token
          │   └─> Creates session
          │
          ├─> Store in AsyncStorage
          │   ├─> userToken (UID)
          │   ├─> userEmail
          │   └─> rememberMe (optional)
          │
          └─> Redirect to Home Screen

3. FORGOT PASSWORD
   ┌──────────────┐
   │  Login Page   │
   └──────┬───────┘
          │
          ├─> Click "Forgot Password?"
          │
          ├─> Enter Email (if not already entered)
          │
          ├─> Email Validation
          │
          ├─> Firebase: sendPasswordResetEmail()
          │   ├─> Generates secure token
          │   ├─> Sends email with reset link
          │   └─> Token expires in 1 hour
          │
          ├─> User receives email
          │
          ├─> User clicks reset link
          │   └─> Opens reset page (Firebase hosted)
          │
          ├─> User enters new password
          │
          ├─> Firebase resets password
          │
          └─> User returns to app and logs in
```

---

## 📧 Email Configuration

### **Current Setup:**
- **Email Service:** Firebase Authentication (built-in)
- **Sender:** `noreply@krushi-express-mh24.firebaseapp.com`
- **No Custom Email Template:** Uses Firebase default templates

### **Email Templates:**
Firebase sends emails with default templates. You can customize these in:
- Firebase Console → Authentication → Templates
- Can customize:
  - Email subject
  - Email body
  - Email styling
  - Reset link expiration time

---

## 🔒 Security Features

### **Built-in Security (Firebase):**
1. **Password Hashing:** Passwords are never stored in plain text
2. **Secure Tokens:** Password reset tokens are cryptographically secure
3. **Rate Limiting:** Firebase prevents brute force attacks
4. **Session Management:** Secure session tokens
5. **Email Verification:** Can be enabled (currently disabled)

### **Current Limitations:**
- ❌ No email verification required
- ❌ No custom email templates
- ❌ No password strength requirements beyond 6 characters
- ❌ No account lockout after failed attempts (Firebase handles this)

---

## 🛠️ Technical Details

### **Dependencies:**
```json
{
  "firebase": "^11.10.0",
  "@react-native-async-storage/async-storage": "^2.1.2"
}
```

### **Firebase Configuration:**
- **File:** `services/firebase.ts`
- **Auth Persistence:** AsyncStorage (survives app restarts)
- **Database:** Firestore (available but not used for auth)

### **Storage:**
- **User Token:** Stored in AsyncStorage as `userToken`
- **User Email:** Stored in AsyncStorage as `userEmail`
- **Remember Me:** Stored in AsyncStorage as `rememberMe`

---

## 🚀 Future Enhancements (Optional)

### **Forgot Password:**
1. ✅ Custom email templates
2. ✅ Custom reset page (instead of Firebase default)
3. ✅ Deep linking for mobile apps
4. ✅ Password strength indicator
5. ✅ Account recovery options

### **Registration:**
1. ✅ Email verification required
2. ✅ Password strength requirements
3. ✅ Terms & Conditions checkbox
4. ✅ Profile information collection
5. ✅ Social login (Google, Apple, Facebook)
6. ✅ Phone number verification
7. ✅ OTP verification

---

## 📝 Code Examples

### **Forgot Password Function:**
```typescript
const handleForgotPassword = async () => {
  const trimmedEmail = email.trim();
  
  // Validation
  if (!trimmedEmail) {
    Alert.alert('Email Required', 'Please enter your email address.');
    return;
  }
  
  if (!isValidEmail(trimmedEmail)) {
    Alert.alert('Invalid Email', 'Please enter a valid email address.');
    return;
  }

  try {
    // Firebase sends reset email
    await sendPasswordResetEmail(auth, trimmedEmail);
    Alert.alert('Email Sent', 'Check your email for reset instructions.');
  } catch (error) {
    Alert.alert('Error', error.message);
  }
};
```

### **Registration Function:**
```typescript
const handleRegister = async () => {
  // Validation
  if (!email || !password || !confirmPassword) {
    Alert.alert('Error', 'Please fill all fields');
    return;
  }
  
  if (password !== confirmPassword) {
    Alert.alert('Error', 'Passwords do not match');
    return;
  }
  
  if (password.length < 6) {
    Alert.alert('Error', 'Password must be at least 6 characters');
    return;
  }

  try {
    // Firebase creates account
    await createUserWithEmailAndPassword(auth, email, password);
    Alert.alert('Success', 'Account created! Please login.');
    router.replace('/login');
  } catch (error) {
    Alert.alert('Registration Failed', error.message);
  }
};
```

---

## ❓ Common Questions

### **Q: Where are passwords stored?**
A: Passwords are stored in Firebase Authentication database, hashed using bcrypt. They are never stored in plain text.

### **Q: Can I customize the reset email?**
A: Yes! Go to Firebase Console → Authentication → Templates → Password reset

### **Q: How long is the reset link valid?**
A: Default is 1 hour. Can be customized in Firebase Console.

### **Q: What if user doesn't receive email?**
A: Check spam folder. Firebase emails sometimes go to spam. Can configure custom SMTP in Firebase.

### **Q: Can I add email verification?**
A: Yes! Use `sendEmailVerification()` after registration and check `emailVerified` before allowing login.

### **Q: Is there a backend API needed?**
A: No! Firebase handles everything. But you can add a backend API for additional features like:
- User profile storage
- Custom business logic
- Additional security checks
- Analytics tracking

---

## ✅ Summary

**Forgot Password:**
- Uses Firebase `sendPasswordResetEmail()`
- Sends email with secure reset link
- No backend API needed
- Fully automated by Firebase

**Registration:**
- Uses Firebase `createUserWithEmailAndPassword()`
- Creates account instantly
- No backend API needed
- Auto-signs in user (then redirects to login)

Both features are **fully functional** and **production-ready** using Firebase Authentication!

