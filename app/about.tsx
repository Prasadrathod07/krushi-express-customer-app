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

export default function About() {
  const router = useRouter();
  const { t } = useLanguage();

  const features = [
    {
      icon: 'handshake',
      title: 'Direct Communication',
      description: 'Farmers and drivers negotiate directly for fair pricing',
      color: '#4CAF50',
    },
    {
      icon: 'eco',
      title: 'Agricultural Focus',
      description: 'Specialized services for agricultural goods transportation',
      color: '#facc15',
    },
    {
      icon: 'verified-user',
      title: 'Verified Drivers',
      description: 'All drivers are background verified and experienced',
      color: '#667eea',
    },
    {
      icon: 'people',
      title: 'Community Driven',
      description: 'Built by the community, for the community',
      color: '#4CAF50',
    },
  ];

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
        <Text style={styles.headerTitle}>{t.about.title}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Icon name="local-shipping" size={40} color="#4CAF50" />
            </View>
          </View>
          <Text style={styles.heroTitle}>Krushi Express</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>{t.about.version}</Text>
          </View>
        </View>

        {/* Description Card */}
        <View style={styles.card}>
          <Text style={styles.description}>{t.about.description}</Text>
        </View>

        {/* Mission Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconContainer, { backgroundColor: '#E8F5E9' }]}>
              <Icon name="flag" size={24} color="#4CAF50" />
            </View>
            <Text style={styles.cardTitle}>{t.about.mission}</Text>
          </View>
          <Text style={styles.cardContent}>
            To revolutionize agricultural transportation in Latur by connecting farmers with reliable, affordable, and efficient transport services. We aim to bridge the gap between rural producers and urban markets through technology-driven solutions.
          </Text>
          <View style={styles.pointsList}>
            {[
              'Empowering farmers with accessible transport',
              'Reducing transportation costs through shared services',
              'Building a trusted network of verified drivers',
              'Supporting local agricultural economy',
            ].map((point, index) => (
              <View key={index} style={styles.pointItem}>
                <Icon name="check-circle" size={18} color="#4CAF50" />
                <Text style={styles.pointText}>{point}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Vision Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconContainer, { backgroundColor: '#E8EAF6' }]}>
              <Icon name="visibility" size={24} color="#667eea" />
            </View>
            <Text style={styles.cardTitle}>{t.about.vision}</Text>
          </View>
          <Text style={styles.cardContent}>
            To become the leading platform for agricultural goods transportation in Maharashtra, empowering farmers and businesses with seamless, cost-effective transport solutions while building a trusted network of verified drivers.
          </Text>
        </View>

        {/* Features Grid */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>What Makes Us Different</Text>
          <View style={styles.featuresGrid}>
            {features.map((feature, index) => (
              <View key={index} style={styles.featureCard}>
                <View style={[styles.featureIcon, { backgroundColor: `${feature.color}15` }]}>
                  <Icon name={feature.icon} size={28} color={feature.color} />
                </View>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Contact Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconContainer, { backgroundColor: '#E8F5E9' }]}>
              <Icon name="contact-mail" size={24} color="#4CAF50" />
            </View>
            <Text style={styles.cardTitle}>{t.about.contact}</Text>
          </View>
          <View style={styles.contactList}>
            <View style={styles.contactItem}>
              <Icon name="email" size={22} color="#4CAF50" />
              <Text style={styles.contactText}>support@krushiexpress.com</Text>
            </View>
            <View style={styles.contactItem}>
              <Icon name="phone" size={22} color="#4CAF50" />
              <Text style={styles.contactText}>+91 9876543210</Text>
            </View>
            <View style={styles.contactItem}>
              <Icon name="location-on" size={22} color="#4CAF50" />
              <Text style={styles.contactText}>Latur, Maharashtra, India</Text>
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
    letterSpacing: 0.5,
  },
  container: {
    flex: 1,
  },
  heroSection: {
    backgroundColor: '#fff',
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  logoContainer: {
    marginBottom: 16,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  versionBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  versionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4CAF50',
    letterSpacing: 0.3,
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
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: 0.3,
  },
  description: {
    fontSize: 16,
    lineHeight: 26,
    color: '#333',
    textAlign: 'left',
    letterSpacing: 0.2,
  },
  cardContent: {
    fontSize: 15,
    lineHeight: 24,
    color: '#555',
    marginBottom: 16,
    letterSpacing: 0.1,
  },
  pointsList: {
    gap: 12,
    marginTop: 8,
  },
  pointItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  pointText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
    flex: 1,
    letterSpacing: 0.1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 20,
    letterSpacing: 0.3,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  featureCard: {
    width: '47%',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  featureIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  featureDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: '#666',
    letterSpacing: 0.1,
  },
  contactList: {
    gap: 16,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 4,
  },
  contactText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
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
