import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { customerAPI } from '../../services/api';
import { API_URL } from '../../lib/env';
import * as ImageManipulator from 'expo-image-manipulator';
import { useLanguage } from '../../contexts/LanguageContext';

const GREEN       = '#2E7D32';
const GREEN_LIGHT = '#4CAF50';
const GREEN_BG    = '#F1F8E9';

export default function EditProfile() {
  const router = useRouter();
  const { t } = useLanguage();

  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Read-only
  const [name,  setName]  = useState('');
  const [email, setEmail] = useState('');

  // Editable
  const [phone,            setPhone]            = useState('');
  const [alternativePhone, setAlternativePhone] = useState('');
  const [city,     setCity]     = useState('');
  const [district, setDistrict] = useState('');
  const [state,    setState]    = useState('');
  const [pincode,  setPincode]  = useState('');
  const [street,   setStreet]   = useState('');

  // Validation errors
  const [phoneError,    setPhoneError]    = useState('');
  const [altPhoneError, setAltPhoneError] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    let apiPhoto: string | null = null;
    try {
      const response = await customerAPI.getProfile();
      if (response.ok && response.data) {
        const d = response.data;
        setName(d.name  || '');
        setEmail(d.email || '');
        setPhone(d.phone || '');
        setAlternativePhone(d.alternativePhone || '');
        setStreet(d.address?.street   || '');
        setCity(d.address?.city       || '');
        setDistrict(d.address?.district || '');
        setState(d.address?.state     || '');
        setPincode(d.address?.pincode || '');
        apiPhoto = d.profilePhoto || null;
      }
    } catch {
      // fall back to cached values
      const storedName  = await AsyncStorage.getItem('userName');
      const storedEmail = await AsyncStorage.getItem('userEmail');
      const storedPhone = await AsyncStorage.getItem('userPhone');
      setName(storedName   || '');
      setEmail(storedEmail || '');
      setPhone(storedPhone || '');
    } finally {
      // Prefer Cloudinary URL from API; fall back to cached local URI
      const photo = apiPhoto || await AsyncStorage.getItem('profilePhoto');
      setProfilePhoto(photo);
      setLoading(false);
    }
  };

  const validatePhone = (value: string) => {
    if (!value) return '';
    if (!/^[6-9]\d{9}$/.test(value)) return 'Enter a valid 10-digit Indian mobile number';
    return '';
  };

  const handleSave = async () => {
    const pErr   = validatePhone(phone);
    const altErr = alternativePhone ? validatePhone(alternativePhone) : '';
    setPhoneError(pErr);
    setAltPhoneError(altErr);
    if (pErr || altErr) return;

    setSaving(true);
    try {
      const response = await customerAPI.updateProfile({
        phone:            phone            || undefined,
        alternativePhone: alternativePhone || null,
        address: {
          street:   street   || undefined,
          city:     city     || undefined,
          district: district || undefined,
          state:    state    || undefined,
          pincode:  pincode  || undefined,
        },
      });

      if (response.ok) {
        if (phone) await AsyncStorage.setItem('userPhone', phone);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t.common.success || 'Success', 'Profile updated successfully.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert(t.common.error, response.message || 'Failed to update profile.');
      }
    } catch (err: any) {
      Alert.alert(t.common.error, err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const uploadPhotoToCloudinary = async (uri: string) => {
    setUploadingPhoto(true);
    // Show local preview immediately
    setProfilePhoto(uri);
    try {
      // Compress: resize to max 600px wide, 80% JPEG quality
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 600 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      const compressedUri = compressed.uri;

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
      await customerAPI.updateProfile({ profilePhoto: cloudUrl });
      await AsyncStorage.setItem('profilePhoto', cloudUrl);
      setProfilePhoto(cloudUrl);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(t.common.error, 'Failed to upload profile photo. Please try again.');
      const cached = await AsyncStorage.getItem('profilePhoto');
      setProfilePhoto(cached);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePickImage = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t.common.error, 'Camera roll permission is required.');
        return;
      }
      Alert.alert(t.profile.editProfile, 'Choose an option', [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: 'Take Photo',
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] as any, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
            if (!result.canceled && result.assets[0]) await uploadPhotoToCloudinary(result.assets[0].uri);
          },
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
            if (!result.canceled && result.assets[0]) await uploadPhotoToCloudinary(result.assets[0].uri);
          },
        },
      ]);
    } catch {
      Alert.alert(t.common.error, 'Failed to pick image.');
    }
  };

  const getInitials = (n: string) => {
    const parts = n.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.charAt(0).toUpperCase() || 'U';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={GREEN_LIGHT} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={GREEN} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.profile.editProfile}</Text>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity style={styles.avatarRing} onPress={handlePickImage} disabled={uploadingPhoto} activeOpacity={0.85}>
              {uploadingPhoto ? (
                <ActivityIndicator size="large" color={GREEN_LIGHT} />
              ) : profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarInitials}>{getInitials(name)}</Text>
              )}
              <View style={styles.cameraBtn}>
                <Icon name="camera-alt" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.tapText}>Tap to change photo</Text>
          </View>

          {/* Read-only section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account Info</Text>
            <View style={styles.card}>
              <Field label="Full Name" value={name} readonly />
              <Field label="Email" value={email} readonly last />
            </View>
          </View>

          {/* Phone section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact</Text>
            <View style={styles.card}>
              <EditField
                label="Phone Number"
                value={phone}
                onChangeText={(v) => { setPhone(v); setPhoneError(''); }}
                keyboardType="phone-pad"
                maxLength={10}
                error={phoneError}
                placeholder="10-digit mobile number"
              />
              <EditField
                label="Alternative Phone"
                value={alternativePhone}
                onChangeText={(v) => { setAlternativePhone(v); setAltPhoneError(''); }}
                keyboardType="phone-pad"
                maxLength={10}
                error={altPhoneError}
                placeholder="Optional"
                last
              />
            </View>
          </View>

          {/* Address section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Address</Text>
            <View style={styles.card}>
              <EditField label="Street / Village" value={street} onChangeText={setStreet} placeholder="Street or village name" />
              <EditField label="City / Taluka" value={city} onChangeText={setCity} placeholder="City or taluka" />
              <EditField label="District" value={district} onChangeText={setDistrict} placeholder="District" />
              <EditField label="State" value={state} onChangeText={setState} placeholder="State" />
              <EditField label="Pincode" value={pincode} onChangeText={setPincode} keyboardType="number-pad" maxLength={6} placeholder="6-digit pincode" last />
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Helper sub-components ──────────────────────────────────────────────────────

function Field({ label, value, readonly, last }: { label: string; value: string; readonly?: boolean; last?: boolean }) {
  return (
    <View style={[fieldStyles.row, !last && fieldStyles.rowBorder]}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={[fieldStyles.input, fieldStyles.readonlyInput]}>
        <Text style={fieldStyles.readonlyText}>{value || '—'}</Text>
        <Icon name="lock" size={14} color="#ccc" />
      </View>
    </View>
  );
}

function EditField({
  label, value, onChangeText, keyboardType, maxLength, error, placeholder, last,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: any;
  maxLength?: number;
  error?: string;
  placeholder?: string;
  last?: boolean;
}) {
  return (
    <View style={[fieldStyles.row, !last && fieldStyles.rowBorder]}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        style={[fieldStyles.input, error ? fieldStyles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType || 'default'}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor="#bbb"
        autoCorrect={false}
        autoCapitalize="none"
      />
      {!!error && <Text style={fieldStyles.error}>{error}</Text>}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: '#F4F6F9' },
  loadingBox:  { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: GREEN, paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  headerTitle:  { fontSize: 18, fontWeight: '700', color: '#fff', flex: 1, textAlign: 'center' },
  saveBtn:      { minWidth: 60, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
  saveBtnText:  { fontSize: 14, fontWeight: '700', color: '#fff' },

  avatarSection: { alignItems: 'center', paddingVertical: 28, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  avatarRing:    { width: 100, height: 100, borderRadius: 50, backgroundColor: GREEN_LIGHT, justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'visible' },
  avatarImg:     { width: 100, height: 100, borderRadius: 50 },
  avatarInitials:{ fontSize: 40, fontWeight: '800', color: '#fff' },
  cameraBtn:     { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  tapText:       { marginTop: 10, fontSize: 13, color: '#888' },

  section:      { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 },
  card:         { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
});

const fieldStyles = StyleSheet.create({
  row:          { paddingHorizontal: 16, paddingVertical: 12 },
  rowBorder:    { borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  label:        { fontSize: 12, fontWeight: '600', color: '#999', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:        { backgroundColor: '#F7F8FA', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1a1a1a', borderWidth: 1, borderColor: '#EBEBEB' },
  inputError:   { borderColor: '#E53935' },
  readonlyInput:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readonlyText: { fontSize: 15, color: '#aaa' },
  error:        { fontSize: 12, color: '#E53935', marginTop: 4 },
});
