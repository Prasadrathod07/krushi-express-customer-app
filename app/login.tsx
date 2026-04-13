import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  Pressable,
  Image,
  Animated,
} from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { customerAuthAPI } from '../services/api';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';

// Email validation
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

type LoginMode = 'password' | 'otp';
type OtpStep = 'email' | 'verify';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 30;

export default function Login() {
  const [mode, setMode] = useState<LoginMode>('password');
  const tabAnim = useRef(new Animated.Value(0)).current;

  // ── Password login state ─────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // ── OTP login state ──────────────────────────────────────────────────────
  const [otpEmail, setOtpEmail] = useState('');
  const [otpStep, setOtpStep] = useState<OtpStep>('email');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<Array<TextInput | null>>([null, null, null, null, null, null]);
  const [otpTimer, setOtpTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

  // ── Logo animation ───────────────────────────────────────────────────────
  const [showLogoAnimation, setShowLogoAnimation] = useState(true);
  const [showLoginTransition, setShowLoginTransition] = useState(false);
  const passwordInputRef = useRef<TextInput>(null);
  const router = useRouter();

  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const transitionScale = useRef(new Animated.Value(1)).current;
  const transitionOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
          setShowLogoAnimation(false);
        });
      }, 1000);
    });
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── Tab switch ───────────────────────────────────────────────────────────
  const switchMode = (m: LoginMode) => {
    setEmailError('');
    setPasswordError('');
    setOtpError('');
    setMode(m);
    Animated.timing(tabAnim, {
      toValue: m === 'password' ? 0 : 1,
      duration: 220,
      useNativeDriver: false,
    }).start();
  };

  const tabIndicatorLeft = tabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['2%', '52%'],
  });

  // ── OTP timer ────────────────────────────────────────────────────────────
  const startTimer = () => {
    setOtpTimer(RESEND_COOLDOWN);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setOtpTimer(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // ── Logo transition ──────────────────────────────────────────────────────
  const showAnimatedTransition = (callback: () => void) => {
    setShowLoginTransition(true);
    transitionScale.setValue(0);
    transitionOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(transitionScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
      Animated.timing(transitionOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => { callback(); }, 1500);
    });
  };

  // ── Password login validation ────────────────────────────────────────────
  const validateEmail = (value: string) => {
    const trimmedValue = value.trim();
    setEmail(value);
    if (!trimmedValue) { setEmailError(''); return false; }
    if (!isValidEmail(trimmedValue)) { setEmailError('Please enter a valid email address'); return false; }
    setEmailError('');
    return true;
  };

  const validatePassword = (value: string) => {
    setPassword(value);
    if (!value) { setPasswordError(''); return false; }
    if (value.length < 6) { setPasswordError('Password must be at least 6 characters'); return false; }
    setPasswordError('');
    return true;
  };

  // ── Password login ───────────────────────────────────────────────────────
  const handleLogin = async () => {
    setEmailError('');
    setPasswordError('');
    const trimmedEmail = email.trim();
    if (!trimmedEmail) { setEmailError('Email is required'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return; }
    if (!isValidEmail(trimmedEmail)) { setEmailError('Please enter a valid email address'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return; }
    if (!password) { setPasswordError('Password is required'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return; }
    if (password.length < 6) { setPasswordError('Password must be at least 6 characters'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return; }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const response = await customerAuthAPI.login(trimmedEmail, password);
      if (response.ok && response.data) {
        await AsyncStorage.setItem('userToken', response.data.token);
        await AsyncStorage.setItem('userEmail', trimmedEmail);
        await AsyncStorage.setItem('userId', response.data.customer.id);
        const userName = response.data.customer.name && response.data.customer.name.trim() && !response.data.customer.name.includes('@')
          ? response.data.customer.name.trim()
          : trimmedEmail.split('@')[0];
        await AsyncStorage.setItem('userName', userName);
        if (rememberMe) await AsyncStorage.setItem('rememberMe', 'true');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAnimatedTransition(() => { router.replace('/(tabs)/home'); });
      } else {
        throw new Error(response.message || 'Login failed');
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Login Failed', error.message || 'Login failed. Please try again.', [{ text: 'OK' }]);
    } finally {
      setLoading(false);
    }
  };

  // ── OTP: send ────────────────────────────────────────────────────────────
  const handleSendOTP = async () => {
    setOtpError('');
    if (!otpEmail.trim() || !isValidEmail(otpEmail)) {
      setOtpError('Please enter a valid email address.');
      return;
    }
    setOtpLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await customerAuthAPI.sendEmailOTP(otpEmail.trim().toLowerCase());
      if (res.ok) {
        setOtpStep('verify');
        setOtp(['', '', '', '', '', '']);
        startTimer();
        setTimeout(() => otpRefs.current[0]?.focus(), 300);
      } else {
        setOtpError(res.message || 'Failed to send OTP. Try again.');
      }
    } catch (error: any) {
      setOtpError(error.message || 'Failed to send OTP.');
    } finally {
      setOtpLoading(false);
    }
  };

  // ── OTP: digit input ─────────────────────────────────────────────────────
  const handleOtpChange = (val: string, idx: number) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[idx] = val.slice(-1);
    setOtp(next);
    if (val && idx < OTP_LENGTH - 1) otpRefs.current[idx + 1]?.focus();
    if (next.every(d => d !== '')) handleVerifyOTP(next.join(''));
  };

  const handleOtpKeyPress = (e: any, idx: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  // ── OTP: verify ──────────────────────────────────────────────────────────
  const handleVerifyOTP = async (code?: string) => {
    const otpCode = code || otp.join('');
    setOtpError('');
    if (otpCode.length < OTP_LENGTH) { setOtpError('Enter the complete 6-digit code.'); return; }
    setOtpLoading(true);
    try {
      const res = await customerAuthAPI.verifyEmailOTP(otpEmail.trim().toLowerCase(), otpCode);
      if (res.ok && res.data) {
        await AsyncStorage.setItem('userToken', res.data.token);
        await AsyncStorage.setItem('userEmail', otpEmail.trim().toLowerCase());
        await AsyncStorage.setItem('userId', res.data.customer.id);
        const userName = res.data.customer.name && res.data.customer.name.trim() && !res.data.customer.name.includes('@')
          ? res.data.customer.name.trim()
          : otpEmail.split('@')[0];
        await AsyncStorage.setItem('userName', userName);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAnimatedTransition(() => { router.replace('/(tabs)/home'); });
      } else {
        throw new Error(res.message || 'OTP verification failed');
      }
    } catch (error: any) {
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
      setOtpError(error.message || 'Invalid or expired OTP. Try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setOtpLoading(false);
    }
  };

  // ── OTP: resend ──────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (otpTimer > 0) return;
    setOtpError('');
    setOtpLoading(true);
    try {
      const res = await customerAuthAPI.sendEmailOTP(otpEmail.trim().toLowerCase());
      if (res.ok) {
        setOtp(['', '', '', '', '', '']);
        startTimer();
        Alert.alert('OTP Sent', 'A new OTP has been sent to your email.');
      } else {
        setOtpError(res.message || 'Failed to resend OTP.');
      }
    } catch {
      setOtpError('Failed to resend OTP. Try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Forgot password ──────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Email Required', 'Please enter your email address to reset your password.', [{ text: 'OK' }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.', [{ text: 'OK' }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setForgotPasswordLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const response = await customerAuthAPI.forgotPassword(trimmedEmail);
      if (response.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('✓ Email Sent Successfully', response.message || 'Password reset instructions have been sent to your email.', [{ text: 'OK', onPress: () => setEmail('') }]);
      } else {
        throw new Error(response.message || 'Failed to send reset email');
      }
    } catch (error: any) {
      let errorTitle = 'Error';
      let errorMessage = 'An error occurred. Please try again.';
      let showRegisterOption = false;
      let useErrorHaptic = true;

      if (error.isNetworkError || error.code === 'NETWORK_ERROR') {
        errorTitle = 'Connection Error';
        errorMessage = 'Unable to connect to the server. Please check your internet connection.';
      } else if (error.code === 'EMAIL_NOT_FOUND' || error.status === 404) {
        errorTitle = 'Account Not Found';
        errorMessage = error.message || 'No account found with this email address. Please register.';
        showRegisterOption = true;
        useErrorHaptic = false;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (error.code === 'ACCOUNT_INACTIVE') {
        errorTitle = 'Account Inactive';
        errorMessage = error.message || 'Your account is inactive. Please contact support.';
      } else if (error.code === 'PASSWORD_NOT_SET') {
        errorTitle = 'Account Setup Required';
        errorMessage = error.message || 'Please register to create your account.';
        showRegisterOption = true;
        useErrorHaptic = false;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (error.message) {
        errorMessage = error.message;
      }

      if (useErrorHaptic) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      const alertButtons: any[] = [{ text: 'OK' }];
      if (showRegisterOption) {
        alertButtons.push({ text: 'Register', style: 'default', onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/register'); } });
      }
      Alert.alert(errorTitle, errorMessage, alertButtons);
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const otpFilled = otp.every(d => d !== '');

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Animated Logo Overlay on Mount */}
      {showLogoAnimation && (
        <Animated.View style={[styles.logoOverlay, { opacity: fadeAnim, transform: [{ scale: logoScale }] }]}>
          <Animated.View style={[styles.logoOverlayContent, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
            <Image source={require('../assets/Krushi.png')} style={styles.animatedLogo} resizeMode="contain" />
            <Text style={styles.animatedLogoText}>Krushi Express</Text>
          </Animated.View>
        </Animated.View>
      )}

      {/* Login Transition Overlay */}
      {showLoginTransition && (
        <Animated.View style={[styles.logoOverlay, { opacity: transitionOpacity, zIndex: 10000 }]}>
          <Animated.View style={[styles.logoOverlayContent, { transform: [{ scale: transitionScale }] }]}>
            <Image source={require('../assets/Krushi.png')} style={styles.animatedLogo} resizeMode="contain" />
            <Text style={styles.animatedLogoText}>Krushi Express</Text>
          </Animated.View>
        </Animated.View>
      )}

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            {/* Logo/Branding Section */}
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <Image source={require('../assets/Krushi.png')} style={styles.logoImage} resizeMode="contain" />
              </View>
              <Text style={styles.title}>Krushi Express</Text>
              <Text style={styles.subtitle}>Welcome back! Please login to continue</Text>
            </View>

            {/* Form Section */}
            <View style={styles.formContainer}>
              {/* ── Tab Toggle ── */}
              <View style={styles.tabBar}>
                <Animated.View style={[styles.tabIndicator, { left: tabIndicatorLeft }]} />
                <TouchableOpacity style={styles.tab} onPress={() => switchMode('password')} activeOpacity={0.8}>
                  <Icon name="lock" size={15} color={mode === 'password' ? '#fff' : '#666'} />
                  <Text style={[styles.tabText, mode === 'password' && styles.tabTextActive]}>Password</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.tab} onPress={() => switchMode('otp')} activeOpacity={0.8}>
                  <Icon name="email" size={15} color={mode === 'otp' ? '#fff' : '#666'} />
                  <Text style={[styles.tabText, mode === 'otp' && styles.tabTextActive]}>Email OTP</Text>
                </TouchableOpacity>
              </View>

              {/* ══════════════ PASSWORD MODE ══════════════ */}
              {mode === 'password' && (
                <>
                  {/* Email Input */}
                  <View style={styles.inputContainer}>
                    <View style={styles.inputWrapper}>
                      <Icon name="email" size={20} color={emailError ? '#f44336' : '#666'} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, emailError && styles.inputError]}
                        placeholder="Email address"
                        placeholderTextColor="#999"
                        value={email}
                        onChangeText={validateEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus={true}
                        returnKeyType="next"
                        onSubmitEditing={() => passwordInputRef.current?.focus()}
                        editable={!loading}
                      />
                      {email && !emailError && (
                        <Icon name="check-circle" size={20} color="#4CAF50" style={styles.checkIcon} />
                      )}
                    </View>
                    {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                  </View>

                  {/* Password Input */}
                  <View style={styles.inputContainer}>
                    <View style={styles.inputWrapper}>
                      <Icon name="lock" size={20} color={passwordError ? '#f44336' : '#666'} style={styles.inputIcon} />
                      <TextInput
                        ref={passwordInputRef}
                        style={[styles.input, passwordError && styles.inputError, styles.passwordInput]}
                        placeholder="Password"
                        placeholderTextColor="#999"
                        value={password}
                        onChangeText={validatePassword}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={handleLogin}
                        editable={!loading}
                      />
                      <TouchableOpacity onPress={() => { setShowPassword(!showPassword); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} style={styles.eyeIcon} disabled={!password}>
                        <Icon name={showPassword ? 'visibility' : 'visibility-off'} size={20} color={password ? '#666' : '#ccc'} />
                      </TouchableOpacity>
                    </View>
                    {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
                  </View>

                  {/* Remember Me & Forgot Password */}
                  <View style={styles.optionsRow}>
                    <Pressable onPress={() => { setRememberMe(!rememberMe); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} style={styles.rememberMeContainer}>
                      <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                        {rememberMe && <Icon name="check" size={16} color="#fff" />}
                      </View>
                      <Text style={styles.rememberMeText}>Remember me</Text>
                    </Pressable>
                    <TouchableOpacity onPress={handleForgotPassword} disabled={loading || forgotPasswordLoading} style={forgotPasswordLoading ? styles.forgotPasswordDisabled : undefined}>
                      {forgotPasswordLoading ? (
                        <View style={styles.forgotPasswordLoading}>
                          <ActivityIndicator size="small" color="#4CAF50" style={styles.forgotPasswordLoader} />
                          <Text style={styles.forgotPasswordText}>Sending...</Text>
                        </View>
                      ) : (
                        <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Login Button */}
                  <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
                    {loading ? (
                      <View style={styles.buttonContent}>
                        <ActivityIndicator color="#fff" size="small" style={styles.loader} />
                        <Text style={styles.buttonText}>Logging in...</Text>
                      </View>
                    ) : (
                      <View style={styles.buttonContent}>
                        <Text style={styles.buttonText}>Login</Text>
                        <Icon name="arrow-forward" size={20} color="#fff" style={styles.buttonIcon} />
                      </View>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* ══════════════ OTP MODE ══════════════ */}
              {mode === 'otp' && (
                <>
                  {/* Error Banner */}
                  {otpError ? (
                    <View style={styles.errorBanner}>
                      <Icon name="error" size={16} color="#c0392b" />
                      <Text style={styles.errorBannerText}>{otpError}</Text>
                    </View>
                  ) : null}

                  {otpStep === 'email' ? (
                    <>
                      <View style={styles.otpInfoBox}>
                        <Icon name="info" size={18} color="#4CAF50" />
                        <Text style={styles.otpInfoText}>
                          We'll send a 6-digit code to your registered email. Valid for 10 minutes.
                        </Text>
                      </View>

                      <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>Registered Email</Text>
                        <View style={styles.inputWrapper}>
                          <Icon name="email" size={20} color="#666" style={styles.inputIcon} />
                          <TextInput
                            style={styles.input}
                            placeholder="your@email.com"
                            placeholderTextColor="#999"
                            value={otpEmail}
                            onChangeText={setOtpEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoFocus={true}
                            editable={!otpLoading}
                          />
                        </View>
                      </View>

                      <TouchableOpacity style={[styles.button, otpLoading && styles.buttonDisabled]} onPress={handleSendOTP} disabled={otpLoading} activeOpacity={0.8}>
                        {otpLoading ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <View style={styles.buttonContent}>
                            <Icon name="send" size={18} color="#fff" style={styles.buttonIcon} />
                            <Text style={styles.buttonText}>Send OTP</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      {/* Email chip + change */}
                      <View style={styles.emailChip}>
                        <Icon name="email" size={15} color="#4CAF50" />
                        <Text style={styles.emailChipText} numberOfLines={1}>{otpEmail}</Text>
                        <TouchableOpacity onPress={() => { setOtpStep('email'); setOtpError(''); setOtp(['', '', '', '', '', '']); }}>
                          <Text style={styles.emailChipChange}>Change</Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.otpPrompt}>Enter the 6-digit code sent to your email</Text>

                      {/* OTP digit boxes */}
                      <View style={styles.otpRow}>
                        {otp.map((digit, i) => (
                          <TextInput
                            key={i}
                            ref={r => { otpRefs.current[i] = r; }}
                            style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                            value={digit}
                            onChangeText={v => handleOtpChange(v, i)}
                            onKeyPress={e => handleOtpKeyPress(e, i)}
                            keyboardType="number-pad"
                            maxLength={1}
                            selectTextOnFocus
                            textAlign="center"
                          />
                        ))}
                      </View>

                      {/* Resend */}
                      <View style={styles.resendRow}>
                        <Text style={styles.resendLabel}>Didn't receive it? </Text>
                        {otpTimer > 0
                          ? <Text style={styles.resendTimer}>Resend in {otpTimer}s</Text>
                          : (
                            <TouchableOpacity onPress={handleResend} disabled={otpLoading}>
                              <Text style={styles.resendLink}>Resend OTP</Text>
                            </TouchableOpacity>
                          )
                        }
                      </View>

                      <TouchableOpacity
                        style={[styles.button, (!otpFilled || otpLoading) && styles.buttonDisabled]}
                        onPress={() => handleVerifyOTP()}
                        disabled={!otpFilled || otpLoading}
                        activeOpacity={0.8}
                      >
                        {otpLoading ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <View style={styles.buttonContent}>
                            <Icon name="check-circle" size={20} color="#fff" style={styles.buttonIcon} />
                            <Text style={styles.buttonText}>Verify & Login</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}

              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.divider} />
              </View>

              {/* Register Link */}
              <View style={styles.registerContainer}>
                <Text style={styles.registerText}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/register'); }} disabled={loading || otpLoading}>
                  <Text style={styles.registerLink}>Register</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8f9fa' },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  logoContainer: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', marginBottom: 20, overflow: 'hidden' },
  logoImage: { width: '100%', height: '100%' },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginBottom: 8, color: '#1a1a1a', letterSpacing: 0.5 },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#666', paddingHorizontal: 20, lineHeight: 22 },
  formContainer: { width: '100%' },

  // ── Tab Bar ──
  tabBar: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 14, padding: 3, marginBottom: 20, position: 'relative', height: 44 },
  tabIndicator: { position: 'absolute', top: 3, width: '46%', height: 38, backgroundColor: '#2E7D32', borderRadius: 11 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, zIndex: 1 },
  tabText: { fontSize: 14, fontWeight: '600', color: '#666' },
  tabTextActive: { color: '#fff' },

  // ── Error Banner ──
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FEECEC', borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#c0392b' },
  errorBannerText: { flex: 1, fontSize: 13, color: '#c0392b', lineHeight: 18 },

  // ── OTP Info ──
  otpInfoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#F1F8E9', borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#4CAF50' },
  otpInfoText: { flex: 1, fontSize: 13, color: '#388E3C', lineHeight: 18 },
  emailChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F1F8E9', borderRadius: 10, padding: 10, marginBottom: 16 },
  emailChipText: { flex: 1, fontSize: 13, color: '#2E7D32', fontWeight: '500' },
  emailChipChange: { fontSize: 13, color: '#1565C0', fontWeight: '600' },
  otpPrompt: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 20 },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  otpBox: { width: 46, height: 56, borderRadius: 12, borderWidth: 2, borderColor: '#e0e0e0', backgroundColor: '#f8f9fa', fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  otpBoxFilled: { borderColor: '#4CAF50', backgroundColor: '#F1F8E9' },
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  resendLabel: { fontSize: 13, color: '#888' },
  resendTimer: { fontSize: 13, color: '#999', fontWeight: '600' },
  resendLink: { fontSize: 13, color: '#1565C0', fontWeight: '700' },

  // ── Inputs ──
  inputContainer: { marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 8 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#e0e0e0', paddingHorizontal: 16, minHeight: 56, height: 56, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 16, color: '#1a1a1a', paddingVertical: 16, paddingHorizontal: 0, height: '100%' },
  passwordInput: { paddingRight: 8 },
  inputError: { borderColor: '#f44336' },
  checkIcon: { marginLeft: 8 },
  eyeIcon: { padding: 4 },
  errorText: { color: '#f44336', fontSize: 12, marginTop: 6, marginLeft: 4, fontWeight: '500' },

  optionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 4 },
  rememberMeContainer: { flexDirection: 'row', alignItems: 'center' },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#4CAF50', marginRight: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  checkboxChecked: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  rememberMeText: { fontSize: 14, color: '#666', fontWeight: '500' },
  forgotPasswordText: { fontSize: 14, color: '#4CAF50', fontWeight: '600' },
  forgotPasswordDisabled: { opacity: 0.6 },
  forgotPasswordLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  forgotPasswordLoader: { marginRight: 6 },

  button: { backgroundColor: '#4CAF50', borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 24, shadowColor: '#4CAF50', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  buttonDisabled: { opacity: 0.7 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
  buttonIcon: { marginLeft: 8 },
  loader: { marginRight: 8 },

  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  divider: { flex: 1, height: 1, backgroundColor: '#e0e0e0' },
  dividerText: { marginHorizontal: 16, fontSize: 14, color: '#999', fontWeight: '500' },
  registerContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  registerText: { fontSize: 15, color: '#666' },
  registerLink: { fontSize: 15, color: '#4CAF50', fontWeight: '700' },

  logoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', zIndex: 9999, justifyContent: 'center', alignItems: 'center' },
  logoOverlayContent: { alignItems: 'center', justifyContent: 'center' },
  animatedLogo: { width: 150, height: 150, marginBottom: 20 },
  animatedLogoText: { fontSize: 28, fontWeight: '700', color: '#4CAF50', letterSpacing: 1 },
});
