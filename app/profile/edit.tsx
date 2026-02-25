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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

export default function EditProfile() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const storedName = await AsyncStorage.getItem('userName');
      const storedEmail = await AsyncStorage.getItem('userEmail');
      const storedPhone = await AsyncStorage.getItem('userPhone');
      const photo = await AsyncStorage.getItem('profilePhoto');
      setName(storedName || '');
      setEmail(storedEmail || '');
      setPhone(storedPhone || '');
      setProfilePhoto(photo);
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handlePickImage = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need camera roll permissions to change your profile photo.');
        return;
      }

      // Show options
      Alert.alert(
        'Change Profile Photo',
        'Choose an option',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Take Photo',
            onPress: async () => {
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });

              if (!result.canceled && result.assets[0]) {
                await handleImageSelected(result.assets[0].uri);
              }
            },
          },
          {
            text: 'Choose from Gallery',
            onPress: async () => {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });

              if (!result.canceled && result.assets[0]) {
                await handleImageSelected(result.assets[0].uri);
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const handleImageSelected = async (uri: string) => {
    setUploadingPhoto(true);
    try {
      // TODO: Upload to backend/Cloudinary
      // For now, just save locally
      await AsyncStorage.setItem('profilePhoto', uri);
      setProfilePhoto(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Profile photo updated successfully!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('Error saving profile photo:', error);
      Alert.alert('Error', 'Failed to save profile photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backButton}
        >
          <Icon name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={styles.saveButton} />
      </View>

      <ScrollView style={styles.container}>
        {/* Profile Picture */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={handlePickImage}
            disabled={uploadingPhoto}
            activeOpacity={0.8}
          >
            {uploadingPhoto ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{name.charAt(0).toUpperCase() || 'U'}</Text>
            )}
            <View style={styles.cameraIconContainer}>
              <Icon name="camera-alt" size={20} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.changePhotoText}>Tap photo to change</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={name}
              editable={false}
              placeholderTextColor="#999"
            />
            <Text style={styles.helperText}>Name cannot be changed</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={email}
              editable={false}
              placeholderTextColor="#999"
            />
            <Text style={styles.helperText}>Email cannot be changed</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={phone}
              editable={false}
              placeholderTextColor="#999"
            />
            <Text style={styles.helperText}>Phone number cannot be changed</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7FDF8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  container: {
    flex: 1,
  },
  avatarSection: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4CAF50',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  changePhotoText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  form: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  inputDisabled: {
    backgroundColor: '#f9f9f9',
    color: '#999',
  },
  inputError: {
    borderColor: '#F44336',
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
    marginTop: 4,
  },
  helperText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
});

