import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '../contexts/LanguageContext';

export default function HelpSupport() {
  const router = useRouter();
  const { t } = useLanguage();

  const supportOptions = [
    {
      icon: 'email',
      title: 'Email Support',
      description: 'Get help via email',
      action: 'mailto:support@krushiexpress.com',
      color: '#4CAF50',
    },
    {
      icon: 'phone',
      title: 'Call Us',
      description: '+91 9876543210',
      action: 'tel:+919876543210',
      color: '#667eea',
    },
    {
      icon: 'chat',
      title: 'Live Chat',
      description: 'Chat with our support team',
      action: null,
      color: '#facc15',
    },
    {
      icon: 'help-center',
      title: 'FAQs',
      description: 'Frequently asked questions',
      action: null,
      color: '#4CAF50',
    },
  ];

  const faqs = [
    {
      question: 'How do I book a tempo?',
      answer: 'Open the app, select your pickup and drop locations, choose your parcel category, and submit your booking request. We will find nearby drivers for you.',
    },
    {
      question: 'How is the price determined?',
      answer: 'Prices are negotiated directly between you and the driver. The app facilitates communication and booking, but pricing is agreed upon by both parties.',
    },
    {
      question: 'Can I cancel my booking?',
      answer: 'Yes, you can cancel your booking before the driver accepts it. After acceptance, cancellation may incur charges as per the agreement with the driver.',
    },
    {
      question: 'How do I track my trip?',
      answer: 'Once your booking is confirmed, you can track your trip in real-time through the trip tracking screen in the app.',
    },
    {
      question: 'What if I have issues with my trip?',
      answer: 'You can contact our support team via email or phone. We are available 24/7 to assist you with any issues.',
    },
  ];

  const handleAction = async (action: string | null) => {
    if (!action) return;
    try {
      const canOpen = await Linking.canOpenURL(action);
      if (canOpen) {
        await Linking.openURL(action);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#4CAF50" />
      
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
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Support Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Get Help</Text>
          <View style={styles.optionsGrid}>
            {supportOptions.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={styles.optionCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleAction(option.action);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIconContainer, { backgroundColor: `${option.color}20` }]}>
                  <Icon name={option.icon} size={32} color={option.color} />
                </View>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* FAQs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          {faqs.map((faq, index) => (
            <View key={index} style={styles.faqCard}>
              <View style={styles.faqHeader}>
                <Icon name="help-outline" size={20} color="#4CAF50" />
                <Text style={styles.faqQuestion}>{faq.question}</Text>
              </View>
              <Text style={styles.faqAnswer}>{faq.answer}</Text>
            </View>
          ))}
        </View>

        {/* Contact Info */}
        <View style={styles.contactSection}>
          <Text style={styles.contactTitle}>Contact Information</Text>
          <View style={styles.contactCard}>
            <View style={styles.contactItem}>
              <Icon name="email" size={24} color="#4CAF50" />
              <View style={styles.contactDetails}>
                <Text style={styles.contactLabel}>Email</Text>
                <Text style={styles.contactValue}>support@krushiexpress.com</Text>
              </View>
            </View>
            <View style={styles.contactItem}>
              <Icon name="phone" size={24} color="#4CAF50" />
              <View style={styles.contactDetails}>
                <Text style={styles.contactLabel}>Phone</Text>
                <Text style={styles.contactValue}>+91 9876543210</Text>
              </View>
            </View>
            <View style={styles.contactItem}>
              <Icon name="schedule" size={24} color="#4CAF50" />
              <View style={styles.contactDetails}>
                <Text style={styles.contactLabel}>Support Hours</Text>
                <Text style={styles.contactValue}>24/7 Available</Text>
              </View>
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
    backgroundColor: '#4CAF50',
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
  },
  container: {
    flex: 1,
  },
  section: {
    padding: 16,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  optionCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  optionIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
    textAlign: 'center',
  },
  optionDescription: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  faqCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  faqQuestion: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  faqAnswer: {
    fontSize: 14,
    lineHeight: 20,
    color: '#666',
    paddingLeft: 28,
  },
  contactSection: {
    padding: 16,
    paddingTop: 0,
  },
  contactTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  contactCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  contactDetails: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  contactValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
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
