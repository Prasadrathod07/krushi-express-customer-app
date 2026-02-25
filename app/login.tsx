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

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showLogoAnimation, setShowLogoAnimation] = useState(true);
  const [showLoginTransition, setShowLoginTransition] = useState(false);
  
  const passwordInputRef = useRef<TextInput>(null);
  const router = useRouter();
  
  // Logo animation values
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  
  // Login transition animation
  const transitionScale = useRef(new Animated.Value(1)).current;
  const transitionOpacity = useRef(new Animated.Value(1)).current;

  // Animate logo on mount
  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Fade out after animation completes
      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => {
          setShowLogoAnimation(false);
        });
      }, 1000);
    });
  }, []);

  // Show animated logo transition after login
  const showAnimatedTransition = (callback: () => void) => {
    setShowLoginTransition(true);
    
    // Reset animation values - start from 0
    transitionScale.setValue(0);
    transitionOpacity.setValue(0);
    
    // Animate in with spring effect
    Animated.parallel([
      Animated.spring(transitionScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(transitionOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Wait a bit to show the logo, then navigate
      setTimeout(() => {
        callback();
      }, 1500);
    });
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
    return true;
  };

  const handleLogin = async () => {
    // Clear previous errors
    setEmailError('');
    setPasswordError('');
    
    // Validate inputs
    const trimmedEmail = email.trim();
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

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      const response = await customerAuthAPI.login(trimmedEmail, password);
      
      if (response.ok && response.data) {
        // Store user data
        await AsyncStorage.setItem('userToken', response.data.token);
        await AsyncStorage.setItem('userEmail', trimmedEmail);
        await AsyncStorage.setItem('userId', response.data.customer.id);
        
        // Store the actual name from database (e.g., "Prasad Rathod")
        const userName = response.data.customer.name && response.data.customer.name.trim() && !response.data.customer.name.includes('@')
          ? response.data.customer.name.trim()
          : trimmedEmail.split('@')[0];
        
        await AsyncStorage.setItem('userName', userName);
        console.log('[Login] ✅ Stored userName:', userName);
        
        if (rememberMe) {
          await AsyncStorage.setItem('rememberMe', 'true');
        }
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        // Show animated logo transition before going to home
        showAnimatedTransition(() => {
          router.replace('/(tabs)/home');
        });
      } else {
        throw new Error(response.message || 'Login failed');
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Login failed. Please try again.';
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Login Failed', errorMessage, [{ text: 'OK' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    
    if (!trimmedEmail) {
      Alert.alert(
        'Email Required',
        'Please enter your email address to reset your password.',
        [{ text: 'OK' }]
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    
    if (!isValidEmail(trimmedEmail)) {
      Alert.alert(
        'Invalid Email',
        'Please enter a valid email address.',
        [{ text: 'OK' }]
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    // Show loading state for forgot password
    setForgotPasswordLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const response = await customerAuthAPI.forgotPassword(trimmedEmail);
      
      if (response.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          '✓ Email Sent Successfully',
          response.message || 'Password reset instructions have been sent to your email address. Please check your inbox and follow the instructions.',
          [
            {
              text: 'OK',
              onPress: () => {
                // Optionally clear email field after success
                setEmail('');
              }
            }
          ]
        );
      } else {
        throw new Error(response.message || 'Failed to send reset email');
      }
    } catch (error: any) {
      let errorTitle = 'Error';
      let errorMessage = 'An error occurred. Please try again.';
      let showRegisterOption = false;
      let useErrorHaptic = true;

      // Handle different error types
      if (error.isNetworkError || error.code === 'NETWORK_ERROR') {
        errorTitle = 'Connection Error';
        errorMessage = 'Unable to connect to the server. Please check your internet connection and try again.';
        useErrorHaptic = true;
      } else if (error.code === 'EMAIL_NOT_FOUND' || error.status === 404) {
        errorTitle = 'Account Not Found';
        errorMessage = error.message || 'No account found with this email address. Please register to create an account.';
        showRegisterOption = true;
        // This is expected behavior, use warning haptic instead
        useErrorHaptic = false;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (error.code === 'ACCOUNT_INACTIVE') {
        errorTitle = 'Account Inactive';
        errorMessage = error.message || 'Your account is currently inactive. Please contact support.';
        useErrorHaptic = true;
      } else if (error.code === 'PASSWORD_NOT_SET') {
        errorTitle = 'Account Setup Required';
        errorMessage = error.message || 'Please register to create your account.';
        showRegisterOption = true;
        useErrorHaptic = false;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (error.message) {
        errorMessage = error.message;
        useErrorHaptic = true;
      }

      // Use error haptic only for actual errors
      if (useErrorHaptic) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      
      const alertButtons: any[] = [{ text: 'OK' }];
      
      if (showRegisterOption) {
        alertButtons.push({
          text: 'Register',
          style: 'default',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/register');
          }
        });
      }

      Alert.alert(errorTitle, errorMessage, alertButtons);
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Animated Logo Overlay on Mount */}
      {showLogoAnimation && (
        <Animated.View
          style={[
            styles.logoOverlay,
            {
              opacity: fadeAnim,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.logoOverlayContent,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }],
              },
            ]}
          >
            <Image
              source={require('../assets/Krushi.png')}
              style={styles.animatedLogo}
              resizeMode="contain"
            />
            <Text style={styles.animatedLogoText}>Krushi Express</Text>
          </Animated.View>
        </Animated.View>
      )}

      {/* Login Transition Overlay */}
      {showLoginTransition && (
        <Animated.View
          style={[
            styles.logoOverlay,
            {
              opacity: transitionOpacity,
              zIndex: 10000,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.logoOverlayContent,
              {
                transform: [{ scale: transitionScale }],
              },
            ]}
          >
            <Image
              source={require('../assets/Krushi.png')}
              style={styles.animatedLogo}
              resizeMode="contain"
            />
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
                <Image
                  source={require('../assets/Krushi.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.title}>Krushi Express</Text>
              <Text style={styles.subtitle}>Welcome back! Please login to continue</Text>
            </View>

            {/* Form Section */}
            <View style={styles.formContainer}>
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
                {emailError ? (
                  <Text style={styles.errorText}>{emailError}</Text>
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
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
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

              {/* Remember Me & Forgot Password */}
              <View style={styles.optionsRow}>
                <Pressable
                  onPress={() => {
                    setRememberMe(!rememberMe);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={styles.rememberMeContainer}
                >
                  <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                    {rememberMe && <Icon name="check" size={16} color="#fff" />}
                  </View>
                  <Text style={styles.rememberMeText}>Remember me</Text>
                </Pressable>

                <TouchableOpacity 
                  onPress={handleForgotPassword} 
                  disabled={loading || forgotPasswordLoading}
                  style={forgotPasswordLoading && styles.forgotPasswordDisabled}
                >
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
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
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

              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.divider} />
              </View>

              {/* Register Link */}
              <View style={styles.registerContainer}>
                <Text style={styles.registerText}>Don't have an account? </Text>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/register');
                  }}
                  disabled={loading}
                >
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
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 4,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#4CAF50',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  rememberMeText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  forgotPasswordDisabled: {
    opacity: 0.6,
  },
  forgotPasswordLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotPasswordLoader: {
    marginRight: 6,
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
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerText: {
    fontSize: 15,
    color: '#666',
  },
  registerLink: {
    fontSize: 15,
    color: '#4CAF50',
    fontWeight: '700',
  },
  logoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoOverlayContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  animatedLogo: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  animatedLogoText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#4CAF50',
    letterSpacing: 1,
  },
});



