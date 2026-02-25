import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Switch,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '../contexts/LanguageContext';

export default function Settings() {
  const router = useRouter();
  const { language, setLanguage, t, getLanguageName } = useLanguage();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const handleLanguageSelect = async (lang: 'en' | 'mr' | 'hi') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setLanguage(lang);
    setShowLanguageModal(false);
  };

  const settingsSections = [
    {
      title: t.settings.notifications,
      items: [
        {
          icon: 'notifications',
          title: t.settings.pushNotifications,
          value: notificationsEnabled,
          onToggle: setNotificationsEnabled,
          type: 'switch',
        },
        {
          icon: 'volume-up',
          title: t.settings.sound,
          value: soundEnabled,
          onToggle: setSoundEnabled,
          type: 'switch',
        },
      ],
    },
    {
      title: t.settings.location,
      items: [
        {
          icon: 'location-on',
          title: t.settings.locationServices,
          value: locationEnabled,
          onToggle: setLocationEnabled,
          type: 'switch',
        },
        {
          icon: 'my-location',
          title: t.settings.shareLiveLocation,
          value: true,
          onToggle: () => {},
          type: 'switch',
        },
      ],
    },
    {
      title: t.settings.general,
      items: [
        {
          icon: 'language',
          title: t.settings.language,
          value: getLanguageName(language),
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowLanguageModal(true);
          },
          type: 'button',
        },
        {
          icon: 'privacy-tip',
          title: t.settings.privacyPolicy,
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/privacy-policy');
          },
          type: 'button',
        },
        {
          icon: 'description',
          title: t.settings.termsConditions,
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/terms-conditions');
          },
          type: 'button',
        },
      ],
    },
  ];

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
        <Text style={styles.headerTitle}>{t.settings.title}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.container}>
        {settingsSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item, itemIndex) => (
              <View key={itemIndex} style={styles.settingItem}>
                <View style={styles.settingLeft}>
                  <View style={styles.iconContainer}>
                    <Icon name={item.icon} size={24} color="#4CAF50" />
                  </View>
                  <Text style={styles.settingText}>{item.title}</Text>
                </View>
                {item.type === 'switch' ? (
                  <Switch
                    value={item.value as boolean}
                    onValueChange={item.onToggle}
                    trackColor={{ false: '#ddd', true: '#4CAF50' }}
                    thumbColor="#fff"
                  />
                ) : (
                  <TouchableOpacity onPress={item.onPress}>
                    <View style={styles.settingRight}>
                      {item.value && (
                        <Text style={styles.settingValue}>{item.value}</Text>
                      )}
                      <Icon name="chevron-right" size={24} color="#999" />
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Language Selection Modal */}
      <Modal
        visible={showLanguageModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.settings.language}</Text>
              <TouchableOpacity
                onPress={() => setShowLanguageModal(false)}
                style={styles.modalCloseButton}
              >
                <Icon name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.languageList}>
              {(['en', 'mr', 'hi'] as const).map((lang) => (
                <TouchableOpacity
                  key={lang}
                  style={[
                    styles.languageItem,
                    language === lang && styles.languageItemActive,
                  ]}
                  onPress={() => handleLanguageSelect(lang)}
                >
                  <Text
                    style={[
                      styles.languageText,
                      language === lang && styles.languageTextActive,
                    ]}
                  >
                    {getLanguageName(lang)}
                  </Text>
                  {language === lang && (
                    <Icon name="check-circle" size={24} color="#4CAF50" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
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
  container: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingVertical: 12,
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingText: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingValue: {
    fontSize: 14,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageList: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  languageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#f9f9f9',
  },
  languageItemActive: {
    backgroundColor: '#E8F5E9',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  languageText: {
    fontSize: 16,
    color: '#333',
  },
  languageTextActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
});

