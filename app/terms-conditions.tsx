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

export default function TermsConditions() {
  const router = useRouter();
  const { t } = useLanguage();

  const sections = [
    {
      icon: 'check-circle',
      title: 'Acceptance of Terms',
      content: t.terms.acceptance,
      color: '#4CAF50',
    },
    {
      icon: 'local-shipping',
      title: 'Our Services',
      content: t.terms.services,
      color: '#667eea',
    },
    {
      icon: 'account-circle',
      title: 'User Account',
      content: t.terms.userAccount,
      color: '#facc15',
    },
    {
      icon: 'event-note',
      title: 'Booking Terms',
      content: t.terms.booking,
      color: '#4CAF50',
    },
    {
      icon: 'payment',
      title: 'Payment',
      content: t.terms.payment,
      color: '#667eea',
    },
    {
      icon: 'cancel',
      title: 'Cancellation Policy',
      content: t.terms.cancellation,
      color: '#facc15',
    },
    {
      icon: 'gavel',
      title: 'Liability',
      content: t.terms.liability,
      color: '#4CAF50',
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#facc15" />
      
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
        <Text style={styles.headerTitle}>{t.terms.title}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Last Updated Badge */}
        <View style={styles.lastUpdatedContainer}>
          <Icon name="update" size={16} color="#999" />
          <Text style={styles.lastUpdatedText}>{t.terms.lastUpdated}</Text>
        </View>

        {/* Introduction Card */}
        <View style={styles.introCard}>
          <View style={styles.introIconContainer}>
            <Icon name="description" size={32} color="#facc15" />
          </View>
          <Text style={styles.introText}>
            By using Krushi Express, you agree to these Terms & Conditions. Please read them carefully before using our services.
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

        {/* Important Notice */}
        <View style={styles.noticeCard}>
          <View style={styles.noticeHeader}>
            <Icon name="info" size={24} color="#facc15" />
            <Text style={styles.noticeTitle}>Important Notice</Text>
          </View>
          <Text style={styles.noticeText}>
            Krushi Express acts as a platform facilitator only. We connect customers with drivers but are not responsible for goods damage, loss, or payment disputes. All transactions are between you and the driver.
          </Text>
        </View>

        {/* Contact Card */}
        <View style={styles.contactCard}>
          <View style={styles.contactHeader}>
            <Icon name="contact-support" size={24} color="#facc15" />
            <Text style={styles.contactTitle}>Questions About Terms?</Text>
          </View>
          <Text style={styles.contactText}>{t.terms.contactUs}</Text>
          <View style={styles.contactDetails}>
            <View style={styles.contactItem}>
              <Icon name="email" size={20} color="#facc15" />
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
    backgroundColor: '#facc15',
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
    color: '#1a1a1a',
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
    backgroundColor: '#FEF3C7',
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
    borderLeftColor: '#facc15',
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
  noticeCard: {
    backgroundColor: '#FEF3C7',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#facc15',
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  noticeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: 0.3,
  },
  noticeText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#333',
    letterSpacing: 0.1,
  },
  contactCard: {
    backgroundColor: '#FEF3C7',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
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
