import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '../contexts/LanguageContext';

export default function PrivacyPolicy() {
  const router = useRouter();
  const { t } = useLanguage();

  const sections = [
    {
      icon: 'info',
      title: 'Introduction',
      content: t.privacy.introduction,
      color: '#4CAF50',
    },
    {
      icon: 'data-usage',
      title: 'Data Collection',
      content: t.privacy.dataCollection,
      color: '#667eea',
    },
    {
      icon: 'settings',
      title: 'How We Use Your Data',
      content: t.privacy.dataUsage,
      color: '#facc15',
    },
    {
      icon: 'share',
      title: 'Data Sharing',
      content: t.privacy.dataSharing,
      color: '#4CAF50',
    },
    {
      icon: 'security',
      title: 'Data Security',
      content: t.privacy.dataSecurity,
      color: '#667eea',
    },
    {
      icon: 'gavel',
      title: 'Your Rights',
      content: t.privacy.userRights,
      color: '#facc15',
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backButton}
        >
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.privacy.title}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Last Updated Badge */}
        <View style={styles.lastUpdatedContainer}>
          <Icon name="update" size={16} color="#999" />
          <Text style={styles.lastUpdatedText}>{t.privacy.lastUpdated}</Text>
        </View>

        {/* Introduction Card */}
        <View style={styles.introCard}>
          <View style={styles.introIconContainer}>
            <Icon name="privacy-tip" size={32} color="#667eea" />
          </View>
          <Text style={styles.introText}>
            At Krushi Express, we are committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your personal information.
          </Text>
        </View>

        {/* Sections */}
        {sections.map((section, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconContainer, { backgroundColor: `${section.color}15` }]}>
                <Icon name={section.icon} size={24} color={section.color} />
              </View>
              <Text style={styles.cardTitle}>{section.title}</Text>
            </View>
            <Text style={styles.cardContent}>{section.content}</Text>
          </View>
        ))}

        {/* Contact Card */}
        <View style={styles.contactCard}>
          <View style={styles.contactHeader}>
            <Icon name="contact-support" size={24} color="#667eea" />
            <Text style={styles.contactTitle}>Questions About Privacy?</Text>
          </View>
          <Text style={styles.contactText}>{t.privacy.contactUs}</Text>
          <View style={styles.contactDetails}>
            <View style={styles.contactItem}>
              <Icon name="email" size={20} color="#667eea" />
              <Text style={styles.contactValue}>support@krushiexpress.com</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2024 Krushi Express. All rights reserved.</Text>
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
    paddingTop: 20,
    backgroundColor: '#667eea',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  container: {
    flex: 1,
  },
  lastUpdatedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 6,
  },
  lastUpdatedText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    letterSpacing: 0.2,
  },
  introCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  introIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8EAF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  introText: {
    fontSize: 16,
    lineHeight: 26,
    color: '#333',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: 0.3,
    flex: 1,
  },
  cardContent: {
    fontSize: 15,
    lineHeight: 24,
    color: '#555',
    letterSpacing: 0.1,
  },
  contactCard: {
    backgroundColor: '#E8EAF6',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C5CAE9',
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: 0.3,
  },
  contactText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#333',
    marginBottom: 16,
    letterSpacing: 0.1,
  },
  contactDetails: {
    gap: 12,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactValue: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  footer: {
    padding: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    letterSpacing: 0.3,
  },
});
