import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  Animated,
  Modal,
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

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [successVisible, setSuccessVisible] = useState(false);
  const [registeredName, setRegisteredName] = useState('');

  // Success animation values
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;

  const showSuccessModal = (userName: string) => {
    setRegisteredName(userName);
    setSuccessVisible(true);
    successScale.setValue(0.5);
    successOpacity.setValue(0);
    checkScale.setValue(0);
    checkOpacity.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(successOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      Animated.delay(150),
      Animated.parallel([
        Animated.spring(checkScale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]),
    ]).start();
  };
  
  const emailInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
  const router = useRouter();

  const validateName = (value: string) => {
    setName(value);
    if (!value.trim()) {
      setNameError('');
      return false;
    }
    if (value.trim().length < 2) {
      setNameError('Name must be at least 2 characters');
      return false;
    }
    setNameError('');
    return true;
  };

  const validateEmail = (value: string) => {
    const trimmedValue = value.trim();
    setEmail(value);
    if (!trimmedValue) {
      setEmailError('');
      return false;
    }
    if (!isValidEmail(trimmedValue)) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  };

  const validatePhone = (value: string) => {
    // Remove any non-digit characters for validation
    const digitsOnly = value.replace(/\D/g, '');
    setPhone(value);
    
    if (!value.trim()) {
      setPhoneError('');
      return false;
    }
    
    if (digitsOnly.length < 10) {
      setPhoneError('Phone number must be at least 10 digits');
      return false;
    }
    
    if (digitsOnly.length > 15) {
      setPhoneError('Phone number must be at most 15 digits');
      return false;
    }
    
    setPhoneError('');
    return true;
  };

  const validatePassword = (value: string) => {
    setPassword(value);
    if (!value) {
      setPasswordError('');
      return false;
    }
    if (value.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return false;
    }
    setPasswordError('');
    // Re-validate confirm password if it exists
    if (confirmPassword && confirmPassword !== value) {
      setConfirmPasswordError('Passwords do not match');
    } else if (confirmPassword) {
      setConfirmPasswordError('');
    }
    return true;
  };

  const validateConfirmPassword = (value: string) => {
    setConfirmPassword(value);
    if (!value) {
      setConfirmPasswordError('');
      return false;
    }
    if (value !== password) {
      setConfirmPasswordError('Passwords do not match');
      return false;
    }
    setConfirmPasswordError('');
    return true;
  };

  const handleRegister = async () => {
    // Clear previous errors
    setNameError('');
    setEmailError('');
    setPhoneError('');
    setPasswordError('');
    setConfirmPasswordError('');

    // Validate all fields
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setNameError('Name is required');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (trimmedName.length < 2) {
      setNameError('Name must be at least 2 characters');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!trimmedEmail) {
      setEmailError('Email is required');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setEmailError('Please enter a valid email address');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if (!phoneDigits) {
      setPhoneError('Phone number is required');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (phoneDigits.length < 10) {
      setPhoneError('Phone number must be at least 10 digits');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (phoneDigits.length > 15) {
      setPhoneError('Phone number must be at most 15 digits');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!password) {
      setPasswordError('Password is required');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const response = await customerAuthAPI.register({
        name: trimmedName,
        email: trimmedEmail,
        password,
        phone: phoneDigits,
      });

      if (response.ok && response.data) {
        // Store user data
        await AsyncStorage.setItem('userToken', response.data.token);
        await AsyncStorage.setItem('userEmail', trimmedEmail);
        await AsyncStorage.setItem('userId', response.data.customer.id);
        // Store the actual name from database (e.g., "Prasad Rathod")
        const userName = response.data.customer.name && response.data.customer.name.trim()
          ? response.data.customer.name.trim()
          : trimmedName;
        await AsyncStorage.setItem('userName', userName);

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showSuccessModal(userName);
      } else {
        throw new Error(response.message || 'Could not create account');
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Registration Failed', error.message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToLogin = () => {
    setSuccessVisible(false);
    setName(''); setEmail(''); setPhone(''); setPassword(''); setConfirmPassword('');
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ── Success Modal ── */}
      <Modal transparent animationType="none" visible={successVisible} onRequestClose={() => {}}>
        <Animated.View style={[styles.modalOverlay, { opacity: successOpacity }]}>
          <Animated.View style={[styles.successCard, { transform: [{ scale: successScale }] }]}>

            {/* Checkmark circle */}
            <Animated.View style={[styles.checkCircleOuter, { transform: [{ scale: checkScale }], opacity: checkOpacity }]}>
              <View style={styles.checkCircleInner}>
                <Icon name="check" size={48} color="#fff" />
              </View>
            </Animated.View>

            {/* Confetti dots */}
            <View style={styles.dotsRow}>
              {['#4CAF50','#FFC107','#2196F3','#E91E63','#FF9800'].map((c, i) => (
                <View key={i} style={[styles.dot, { backgroundColor: c }]} />
              ))}
            </View>

            <Text style={styles.successTitle}>Account Created!</Text>
            <Text style={styles.successGreeting}>Welcome, {registeredName} 🌾</Text>
            <Text style={styles.successBody}>
              Your Krushi Express account is ready.{'\n'}
              Start booking agricultural transport today!
            </Text>

            {/* Info pills */}
            <View style={styles.pillsRow}>
              <View style={styles.pill}>
                <Icon name="local-shipping" size={16} color="#4CAF50" />
                <Text style={styles.pillText}>Book Trips</Text>
              </View>
              <View style={styles.pill}>
                <Icon name="track-changes" size={16} color="#4CAF50" />
                <Text style={styles.pillText}>Track Live</Text>
              </View>
              <View style={styles.pill}>
                <Icon name="security" size={16} color="#4CAF50" />
                <Text style={styles.pillText}>Secure</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.successBtn} onPress={handleGoToLogin} activeOpacity={0.85}>
              <Text style={styles.successBtnText}>Continue to Login</Text>
              <Icon name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>
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
                <Image
                  source={require('../assets/Krushi.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Join Krushi Express and get started</Text>
            </View>

            {/* Form Section */}
            <View style={styles.formContainer}>
              {/* Name Input */}
              <View style={styles.inputContainer}>
                <View style={styles.inputWrapper}>
                  <Icon
                    name="person"
                    size={20}
                    color={nameError ? '#f44336' : '#666'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, nameError && styles.inputError]}
                    placeholder="Full name"
                    placeholderTextColor="#999"
                    value={name}
                    onChangeText={validateName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => emailInputRef.current?.focus()}
                    editable={!loading}
                  />
                  {name && !nameError && (
                    <Icon name="check-circle" size={20} color="#4CAF50" style={styles.checkIcon} />
                  )}
                </View>
                {nameError ? (
                  <Text style={styles.errorText}>{nameError}</Text>
                ) : null}
              </View>

              {/* Email Input */}
              <View style={styles.inputContainer}>
                <View style={styles.inputWrapper}>
                  <Icon
                    name="email"
                    size={20}
                    color={emailError ? '#f44336' : '#666'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    ref={emailInputRef}
                    style={[styles.input, emailError && styles.inputError]}
                    placeholder="Email address"
                    placeholderTextColor="#999"
                    value={email}
                    onChangeText={validateEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => phoneInputRef.current?.focus()}
                    editable={!loading}
                  />
                  {email && !emailError && (
                    <Icon name="check-circle" size={20} color="#4CAF50" style={styles.checkIcon} />
                  )}
                </View>
                {emailError ? (
                  <Text style={styles.errorText}>{emailError}</Text>
                ) : null}
              </View>

              {/* Phone Input */}
              <View style={styles.inputContainer}>
                <View style={styles.inputWrapper}>
                  <Icon
                    name="phone"
                    size={20}
                    color={phoneError ? '#f44336' : '#666'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    ref={phoneInputRef}
                    style={[styles.input, phoneError && styles.inputError]}
                    placeholder="Phone number"
                    placeholderTextColor="#999"
                    value={phone}
                    onChangeText={validatePhone}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                    editable={!loading}
                  />
                  {phone && !phoneError && (
                    <Icon name="check-circle" size={20} color="#4CAF50" style={styles.checkIcon} />
                  )}
                </View>
                {phoneError ? (
                  <Text style={styles.errorText}>{phoneError}</Text>
                ) : null}
              </View>

              {/* Password Input */}
              <View style={styles.inputContainer}>
                <View style={styles.inputWrapper}>
                  <Icon
                    name="lock"
                    size={20}
                    color={passwordError ? '#f44336' : '#666'}
                    style={styles.inputIcon}
                  />
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
                    returnKeyType="next"
                    onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
                    editable={!loading}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      setShowPassword(!showPassword);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={styles.eyeIcon}
                    disabled={!password}
                  >
                    <Icon
                      name={showPassword ? 'visibility' : 'visibility-off'}
                      size={20}
                      color={password ? '#666' : '#ccc'}
                    />
                  </TouchableOpacity>
                </View>
                {passwordError ? (
                  <Text style={styles.errorText}>{passwordError}</Text>
                ) : null}
              </View>

              {/* Confirm Password Input */}
              <View style={styles.inputContainer}>
                <View style={styles.inputWrapper}>
                  <Icon
                    name="lock-outline"
                    size={20}
                    color={confirmPasswordError ? '#f44336' : '#666'}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    ref={confirmPasswordInputRef}
                    style={[styles.input, confirmPasswordError && styles.inputError, styles.passwordInput]}
                    placeholder="Confirm password"
                    placeholderTextColor="#999"
                    value={confirmPassword}
                    onChangeText={validateConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleRegister}
                    editable={!loading}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      setShowConfirmPassword(!showConfirmPassword);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={styles.eyeIcon}
                    disabled={!confirmPassword}
                  >
                    <Icon
                      name={showConfirmPassword ? 'visibility' : 'visibility-off'}
                      size={20}
                      color={confirmPassword ? '#666' : '#ccc'}
                    />
                  </TouchableOpacity>
                </View>
                {confirmPasswordError ? (
                  <Text style={styles.errorText}>{confirmPasswordError}</Text>
                ) : null}
              </View>

              {/* Register Button */}
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <View style={styles.buttonContent}>
                    <ActivityIndicator color="#fff" size="small" style={styles.loader} />
                    <Text style={styles.buttonText}>Creating account...</Text>
                  </View>
                ) : (
                  <View style={styles.buttonContent}>
                    <Text style={styles.buttonText}>Create Account</Text>
                    <Icon name="arrow-forward" size={20} color="#fff" style={styles.buttonIcon} />
                  </View>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.divider} />
              </View>

              {/* Login Link */}
              <View style={styles.loginContainer}>
                <Text style={styles.loginText}>Already have an account? </Text>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/login');
                  }}
                  disabled={loading}
                >
                  <Text style={styles.loginLink}>Login</Text>
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
  safeArea: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    color: '#1a1a1a',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    paddingHorizontal: 16,
    minHeight: 56,
    height: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
    paddingVertical: 16,
    paddingHorizontal: 0,
    height: '100%',
  },
  passwordInput: {
    paddingRight: 8,
  },
  inputError: {
    borderColor: '#f44336',
  },
  checkIcon: {
    marginLeft: 8,
  },
  eyeIcon: {
    padding: 4,
  },
  errorText: {
    color: '#f44336',
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  buttonIcon: {
    marginLeft: 8,
  },
  loader: {
    marginRight: 8,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    fontSize: 15,
    color: '#666',
  },
  loginLink: {
    fontSize: 15,
    color: '#4CAF50',
    fontWeight: '700',
  },

  // ── Success Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successCard: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  checkCircleOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 4,
    borderColor: '#A5D6A7',
  },
  checkCircleInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  successGreeting: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
    marginBottom: 12,
  },
  successBody: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F8E9',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
  },
  successBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 10,
    width: '100%',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  successBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});



