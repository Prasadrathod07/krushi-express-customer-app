import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
  Alert,
  Switch,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../contexts/LanguageContext';
import { Language } from '../../lib/i18n';
import { customerAPI } from '../../services/api';
import { API_URL } from '../../lib/env';
import * as ImageManipulator from 'expo-image-manipulator';

const { width } = Dimensions.get('window');

const GREEN       = '#2E7D32';
const GREEN_LIGHT = '#4CAF50';
const GREEN_BG    = '#F1F8E9';

const PREF_NOTIFICATIONS_KEY = '@pref_notifications';
const PREF_LOCATION_KEY      = '@pref_location';

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language, setLanguage, t } = useLanguage();

  const [userName, setUserName]               = useState('');
  const [userEmail, setUserEmail]             = useState('');
  const [profilePhoto, setProfilePhoto]       = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto]   = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [locationOn, setLocationOn]           = useState(true);
  const [totalTrips, setTotalTrips]           = useState<number | null>(null);
  const [rating, setRating]                   = useState<string>('—');
  const [memberSince, setMemberSince]         = useState<string>('—');

  // Load user info and preferences on focus
  useFocusEffect(
    useCallback(() => {
      loadUserInfo();
      loadPreferences();
      loadProfileStats();
    }, [])
  );

  const loadUserInfo = async () => {
    const email = await AsyncStorage.getItem('userEmail');
    const name  = await AsyncStorage.getItem('userName');
    setUserEmail(email || '');
    setUserName(name || email?.split('@')[0] || 'User');
    // Load photo from API first; fall back to cached local URI
    try {
      const response = await customerAPI.getProfile();
      if (response.ok && response.data?.profilePhoto) {
        setProfilePhoto(response.data.profilePhoto);
        await AsyncStorage.setItem('profilePhoto', response.data.profilePhoto);
        return;
      }
    } catch { /* silently fall back */ }
    const photo = await AsyncStorage.getItem('profilePhoto');
    setProfilePhoto(photo);
  };

  const loadPreferences = async () => {
    const notif    = await AsyncStorage.getItem(PREF_NOTIFICATIONS_KEY);
    const location = await AsyncStorage.getItem(PREF_LOCATION_KEY);
    setNotificationsOn(notif === null ? true : notif === 'true');
    setLocationOn(location === null ? true : location === 'true');
  };

  const loadProfileStats = async () => {
    try {
      const response = await customerAPI.getProfile();
      if (response.ok && response.data) {
        const data = response.data;
        setTotalTrips(data.stats?.totalTrips ?? null);
        const avg = data.stats?.averageRating;
        setRating(avg && avg > 0 ? avg.toFixed(1) : '—');
        if (data.createdAt) {
          setMemberSince(new Date(data.createdAt).getFullYear().toString());
        }
        // Sync name/email in case profile was updated elsewhere
        if (data.name)  { setUserName(data.name);  await AsyncStorage.setItem('userName', data.name); }
        if (data.email) { setUserEmail(data.email); }
        if (data.phone) await AsyncStorage.setItem('userPhone', data.phone);
      }
    } catch {
      // silently fall back to cached values
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.charAt(0).toUpperCase();
  };

  const handlePickImage = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t.common.error, 'We need camera roll permissions to change your profile photo.');
        return;
      }
      Alert.alert(t.profile.editProfile, 'Choose an option', [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: 'Take Photo',
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] as any, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
            if (!result.canceled && result.assets[0]) await handleImageSelected(result.assets[0].uri);
          },
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
            if (!result.canceled && result.assets[0]) await handleImageSelected(result.assets[0].uri);
          },
        },
      ]);
    } catch {
      Alert.alert(t.common.error, 'Failed to pick image. Please try again.');
    }
  };

  const handleImageSelected = async (uri: string) => {
    setUploadingPhoto(true);
    try {
      // Show local preview immediately
      setProfilePhoto(uri);

      // Compress: resize to max 600px wide, 80% JPEG quality
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 600 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      const compressedUri = compressed.uri;

      // Upload to Cloudinary
      const filename = compressedUri.split('/').pop() || 'photo.jpg';
      const ext = filename.match(/\.(\w+)$/);
      const formData = new FormData();
      formData.append('file', { uri: compressedUri, name: filename, type: ext ? `image/${ext[1]}` : 'image/jpeg' } as any);
      const token = await AsyncStorage.getItem('userToken');
      const API_BASE = API_URL || 'http://192.168.12.83:5000';
      const res = await fetch(`${API_BASE}/api/cloudinary/upload?type=public&category=profiles`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!data.ok || !data.data?.secure_url) throw new Error('Upload failed');

      const cloudUrl = data.data.secure_url;

      // Save URL to database
      await customerAPI.updateProfile({ profilePhoto: cloudUrl });

      // Cache Cloudinary URL locally
      await AsyncStorage.setItem('profilePhoto', cloudUrl);
      setProfilePhoto(cloudUrl);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(t.common.error, 'Failed to upload profile photo. Please try again.');
      // Revert preview on failure
      const cached = await AsyncStorage.getItem('profilePhoto');
      setProfilePhoto(cached);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    setNotificationsOn(value);
    await AsyncStorage.setItem(PREF_NOTIFICATIONS_KEY, String(value));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleToggleLocation = async (value: boolean) => {
    setLocationOn(value);
    await AsyncStorage.setItem(PREF_LOCATION_KEY, String(value));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleLanguageChange = (lang: Language) => {
    if (language === lang) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLanguage(lang);
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(t.profile.logOutTitle, t.profile.logOutConfirm, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.profile.logOut,
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove([
            'userToken', 'userEmail', 'userId', 'userName',
            'pickupLocation', 'dropLocation', 'profilePhoto',
          ]);
          router.replace('/login');
        },
      },
    ]);
  };

  const accountItems = [
    {
      icon: 'person',
      label: t.profile.editProfile,
      color: '#1565C0',
      bg: '#E3F2FD',
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/profile/edit'); },
    },
    {
      icon: 'history',
      label: t.profile.tripHistory,
      color: '#6A1B9A',
      bg: '#F3E5F5',
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/rides'); },
    },
  ];

  const supportItems = [
    {
      icon: 'help-outline',
      label: t.profile.helpSupport,
      color: '#E65100',
      bg: '#FFF3E0',
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/help-support'); },
    },
    {
      icon: 'info-outline',
      label: t.profile.aboutApp,
      color: '#00695C',
      bg: '#E0F2F1',
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/profile-about'); },
    },
    {
      icon: 'privacy-tip',
      label: t.settings.privacyPolicy,
      color: '#1565C0',
      bg: '#E3F2FD',
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/privacy-policy'); },
    },
    {
      icon: 'description',
      label: t.settings.termsConditions,
      color: '#4E342E',
      bg: '#EFEBE9',
      onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/terms-conditions'); },
    },
  ];

  const LANGUAGES: { code: Language; label: string; native: string }[] = [
    { code: 'en', label: 'English', native: 'English' },
    { code: 'mr', label: 'Marathi', native: 'मराठी' },
  ];

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={GREEN} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* ── Hero Header ── */}
        <View style={styles.hero}>
          <View style={styles.decCircle1} />
          <View style={styles.decCircle2} />
          <View style={styles.decCircle3} />

          {/* Settings shortcut */}
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/settings'); }}
          >
            <Icon name="settings" size={22} color="#fff" />
          </TouchableOpacity>

          {/* Avatar */}
          <TouchableOpacity style={styles.avatarRing} onPress={handlePickImage} disabled={uploadingPhoto} activeOpacity={0.85}>
            <View style={styles.avatarInner}>
              {uploadingPhoto ? (
                <ActivityIndicator size="large" color={GREEN_LIGHT} />
              ) : profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitials}>{getInitials(userName)}</Text>
              )}
            </View>
            <View style={styles.cameraBtn}>
              <Icon name="camera-alt" size={14} color="#fff" />
            </View>
          </TouchableOpacity>

          <Text style={styles.heroName}>{userName}</Text>
          <Text style={styles.heroEmail}>{userEmail}</Text>

          <View style={styles.badge}>
            <Icon name="verified" size={14} color={GREEN_LIGHT} />
            <Text style={styles.badgeText}>{t.profile.verifiedMember}</Text>
          </View>
        </View>

        {/* ── Stats Row ── */}
        <View style={styles.statsRow}>
          {[
            {
              icon: 'local-shipping',
              label: t.profile.totalTrips,
              value: totalTrips !== null ? String(totalTrips) : '—',
            },
            { icon: 'star',  label: t.profile.rating,      value: rating },
            { icon: 'eco',   label: t.profile.memberSince, value: memberSince },
          ].map((s, i) => (
            <View key={i} style={[styles.statCard, i === 1 && styles.statCardCenter]}>
              <View style={styles.statIconBox}>
                <Icon name={s.icon as any} size={20} color={GREEN_LIGHT} />
              </View>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Preferences ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.profile.preferences}</Text>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleLeft}>
                <View style={[styles.toggleIcon, { backgroundColor: '#E8F5E9' }]}>
                  <Icon name="notifications-active" size={20} color={GREEN_LIGHT} />
                </View>
                <View>
                  <Text style={styles.toggleLabel}>{t.profile.pushNotifications}</Text>
                  <Text style={styles.toggleSub}>{t.profile.tripUpdatesAlerts}</Text>
                </View>
              </View>
              <Switch
                value={notificationsOn}
                onValueChange={handleToggleNotifications}
                trackColor={{ false: '#ddd', true: GREEN_LIGHT }}
                thumbColor="#fff"
              />
            </View>
            <View style={styles.dividerLine} />
            <View style={styles.toggleRow}>
              <View style={styles.toggleLeft}>
                <View style={[styles.toggleIcon, { backgroundColor: '#E3F2FD' }]}>
                  <Icon name="my-location" size={20} color="#1565C0" />
                </View>
                <View>
                  <Text style={styles.toggleLabel}>{t.profile.locationServices}</Text>
                  <Text style={styles.toggleSub}>{t.profile.accuratePickup}</Text>
                </View>
              </View>
              <Switch
                value={locationOn}
                onValueChange={handleToggleLocation}
                trackColor={{ false: '#ddd', true: GREEN_LIGHT }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* ── Language ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.profile.language}</Text>
          <View style={styles.card}>
            <View style={styles.langHeader}>
              <View style={[styles.menuIconBox, { backgroundColor: '#E8EAF6' }]}>
                <Icon name="language" size={20} color="#3949AB" />
              </View>
              <Text style={styles.langHeaderText}>{t.profile.chooseLanguage}</Text>
            </View>
            <View style={styles.dividerLine} />
            <View style={styles.langRow}>
              {LANGUAGES.map(({ code, native }) => (
                <TouchableOpacity
                  key={code}
                  style={[styles.langChip, language === code && styles.langChipActive]}
                  onPress={() => handleLanguageChange(code)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.langLabel, language === code && styles.langLabelActive]}>{native}</Text>
                  {language === code && <Icon name="check-circle" size={16} color={GREEN} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ── Account ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.profile.account}</Text>
          <View style={styles.card}>
            {accountItems.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.menuRow, i < accountItems.length - 1 && styles.menuRowBorder]}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIconBox, { backgroundColor: item.bg }]}>
                  <Icon name={item.icon as any} size={20} color={item.color} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Icon name="chevron-right" size={22} color="#ccc" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Support ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.profile.support}</Text>
          <View style={styles.card}>
            {supportItems.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.menuRow, i < supportItems.length - 1 && styles.menuRowBorder]}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIconBox, { backgroundColor: item.bg }]}>
                  <Icon name={item.icon as any} size={20} color={item.color} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Icon name="chevron-right" size={22} color="#ccc" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Log Out ── */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
            <View style={styles.logoutIconBox}>
              <Icon name="logout" size={20} color="#E53935" />
            </View>
            <Text style={styles.logoutText}>{t.profile.logOut}</Text>
            <Icon name="chevron-right" size={22} color="#E53935" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Image source={require('../../assets/Krushi.png')} style={styles.footerLogo} resizeMode="contain" />
          <Text style={styles.footerName}>Krushi Express</Text>
          <Text style={styles.footerVersion}>{t.profile.version}</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6F9' },

  // ── Hero ──
  hero: {
    backgroundColor: GREEN,
    paddingTop: 20,
    paddingBottom: 36,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  decCircle1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', top: -60, left: -60 },
  decCircle2: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.06)', top: -20, right: -40 },
  decCircle3: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.04)', bottom: -30, left: width / 2 - 60 },
  settingsBtn: { position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },

  avatarRing: { width: 108, height: 108, borderRadius: 54, borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)', padding: 3, marginBottom: 14, position: 'relative' },
  avatarInner: { flex: 1, borderRadius: 50, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 50 },
  avatarInitials: { fontSize: 36, fontWeight: '800', color: GREEN_LIGHT },
  cameraBtn: { position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: GREEN_LIGHT, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },

  heroName: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0.3, marginBottom: 4 },
  heroEmail: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  badgeText: { fontSize: 12, color: '#fff', fontWeight: '600' },

  // ── Stats ──
  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: -20, gap: 10, zIndex: 1 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 },
  statCardCenter: { borderTopWidth: 3, borderTopColor: GREEN_LIGHT },
  statIconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: GREEN_BG, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#888', fontWeight: '500', textAlign: 'center' },

  // ── Sections ──
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 4 },
  card: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },

  // ── Toggles ──
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  toggleIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 2 },
  toggleSub: { fontSize: 12, color: '#aaa' },
  dividerLine: { height: 1, backgroundColor: '#f5f5f5', marginHorizontal: 16 },

  // ── Language ──
  langHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  langHeaderText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  langRow: { flexDirection: 'row', padding: 12, gap: 10 },
  langChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 14,
    backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: 'transparent',
  },
  langChipActive: { backgroundColor: GREEN_BG, borderColor: GREEN },
  langLabel: { fontSize: 14, fontWeight: '600', color: '#666' },
  langLabelActive: { color: GREEN, fontWeight: '700' },

  // ── Menu rows ──
  menuRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  menuIconBox: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1a1a' },

  // ── Logout ──
  logoutBtn: { backgroundColor: '#FFF5F5', borderRadius: 18, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14, borderWidth: 1, borderColor: '#FFCDD2' },
  logoutIconBox: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#FFEBEE', justifyContent: 'center', alignItems: 'center' },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#E53935', flex: 1 },

  // ── Footer ──
  footer: { alignItems: 'center', paddingVertical: 32, gap: 6 },
  footerLogo: { width: 40, height: 40, opacity: 0.4 },
  footerName: { fontSize: 13, fontWeight: '700', color: '#bbb' },
  footerVersion: { fontSize: 11, color: '#ccc' },
});
