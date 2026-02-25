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
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    const email = await AsyncStorage.getItem('userEmail');
    const name = await AsyncStorage.getItem('userName');
    const photo = await AsyncStorage.getItem('profilePhoto');
    setUserEmail(email || '');
    setUserName(name || email?.split('@')[0] || 'User');
    setProfilePhoto(photo);
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
      Alert.alert('Success', 'Profile photo updated successfully!');
    } catch (error) {
      console.error('Error saving profile photo:', error);
      Alert.alert('Error', 'Failed to save profile photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('userToken');
            await AsyncStorage.removeItem('userEmail');
            await AsyncStorage.removeItem('userId');
            await AsyncStorage.removeItem('userName');
            await AsyncStorage.removeItem('pickupLocation');
            await AsyncStorage.removeItem('dropLocation');
            router.replace('/login');
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      icon: 'person',
      title: 'Edit Profile',
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/profile/edit');
      },
    },
    {
      icon: 'settings',
      title: 'Settings',
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/settings');
      },
    },
    {
      icon: 'help',
      title: 'Help & Support',
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/help-support');
      },
    },
    {
      icon: 'info',
      title: 'About',
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/profile-about');
      },
    },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Gradient Background */}
        <View style={styles.header}>
          <View style={styles.headerGradient}>
            <View style={styles.avatarWrapper}>
              <TouchableOpacity
                style={styles.avatarContainer}
                onPress={handlePickImage}
                disabled={uploadingPhoto}
                activeOpacity={0.8}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {uploadingPhoto ? (
                  <ActivityIndicator size="large" color="#fff" />
                ) : profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{userName.charAt(0).toUpperCase()}</Text>
                )}
                <View style={styles.cameraIconContainer}>
                  <Icon name="camera-alt" size={18} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>
            <Text style={styles.userName}>{userName}</Text>
            <Text style={styles.userSubtext}>{userEmail || 'Tap photo to change'}</Text>
          </View>
        </View>

        {/* Quick Settings Card */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Icon name="settings" size={24} color="#4CAF50" />
              <Text style={styles.sectionTitle}>Quick Settings</Text>
            </View>
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={styles.settingIconContainer}>
                  <Icon name="notifications" size={22} color="#4CAF50" />
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingText}>Push Notifications</Text>
                  <Text style={styles.settingSubtext}>Receive trip updates and alerts</Text>
                </View>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: '#ddd', true: '#4CAF50' }}
                thumbColor="#fff"
              />
            </View>
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={styles.settingIconContainer}>
                  <Icon name="location-on" size={22} color="#4CAF50" />
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingText}>Location Services</Text>
                  <Text style={styles.settingSubtext}>Enable for accurate pickup location</Text>
                </View>
              </View>
              <Switch
                value={locationEnabled}
                onValueChange={setLocationEnabled}
                trackColor={{ false: '#ddd', true: '#4CAF50' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* Menu Items Card */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.menuItem,
                  index === menuItems.length - 1 && styles.menuItemLast,
                ]}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <View style={styles.menuIconContainer}>
                    <Icon name={item.icon} size={22} color="#4CAF50" />
                  </View>
                  <Text style={styles.menuItemText}>{item.title}</Text>
                </View>
                <Icon name="chevron-right" size={24} color="#999" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Icon name="logout" size={24} color="#F44336" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Krushi Express © 2024</Text>
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
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: '#4CAF50',
    paddingBottom: 0,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  headerGradient: {
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  avatarWrapper: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    minWidth: 110,
    minHeight: 110,
    borderWidth: 4,
    borderColor: '#fff',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  avatarImage: {
    width: 102,
    height: 102,
    borderRadius: 51,
  },
  avatarText: {
    fontSize: 42,
    fontWeight: '800',
    color: '#4CAF50',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4CAF50',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    minWidth: 36,
    minHeight: 36,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  userName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
  },
  userSubtext: {
    fontSize: 14,
    color: '#E8F5E9',
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 56, // Minimum touch target height
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingTextContainer: {
    flex: 1,
  },
  settingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  settingSubtext: {
    fontSize: 12,
    color: '#999',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    paddingRight: 12,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 40,
    minHeight: 40,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginTop: 24,
    marginHorizontal: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 8,
    borderWidth: 2,
    borderColor: '#F44336',
    minHeight: 56,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F44336',
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
});

