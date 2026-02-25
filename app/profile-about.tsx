import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '../contexts/LanguageContext';

const { width } = Dimensions.get('window');

export default function ProfileAbout() {
  const router = useRouter();
  const { t } = useLanguage();
  const [selectedTab, setSelectedTab] = useState('mission');

  const tabs = [
    { id: 'mission', label: t.about.mission, icon: 'flag' },
    { id: 'vision', label: t.about.vision, icon: 'visibility' },
    { id: 'values', label: 'Our Values', icon: 'favorite' },
    { id: 'features', label: 'What Makes Us Different', icon: 'star' },
  ];

  const content = {
    mission: {
      title: t.about.mission,
      description: 'To revolutionize agricultural transportation in Latur by connecting farmers with reliable, affordable, and efficient transport services. We aim to bridge the gap between rural producers and urban markets through technology-driven solutions.',
      points: [
        'Empowering farmers with accessible transport',
        'Reducing transportation costs through shared services',
        'Building a trusted network of verified drivers',
        'Supporting local agricultural economy',
      ],
      color: '#4CAF50',
    },
    vision: {
      title: t.about.vision,
      description: 'To become the leading agricultural logistics platform in Maharashtra, transforming how goods are transported from farms to markets while ensuring fair compensation for drivers and affordable services for farmers.',
      points: [
        'Expanding to all districts of Maharashtra',
        'Creating sustainable transport ecosystem',
        'Supporting rural development initiatives',
        'Building long-term partnerships',
      ],
      color: '#667eea',
    },
    values: {
      title: 'Our Values',
      description: 'We operate on principles of transparency, reliability, and community support. Our commitment to fair pricing, quality service, and local development drives everything we do.',
      points: [
        'Transparency in pricing and operations',
        'Reliability in service delivery',
        'Community-first approach',
        'Sustainable business practices',
      ],
      color: '#facc15',
    },
    features: {
      title: 'What Makes Us Different',
      description: 'Krushi Express stands out with unique features designed specifically for the agricultural community in Maharashtra.',
      features: [
        {
          icon: 'handshake',
          title: 'Direct Communication',
          description: 'Farmers and drivers can negotiate directly for fair pricing and specific requirements',
          color: '#4CAF50',
        },
        {
          icon: 'eco',
          title: 'Agricultural Focus',
          description: 'Specialized services designed for agricultural goods and rural transportation needs',
          color: '#facc15',
        },
        {
          icon: 'verified-user',
          title: 'Verified Drivers',
          description: 'All drivers are background verified and experienced in goods transportation',
          color: '#667eea',
        },
        {
          icon: 'people',
          title: 'Community Driven',
          description: 'Built by the community, for the community - understanding local needs and challenges',
          color: '#4CAF50',
        },
      ],
      color: '#667eea',
    },
  };

  const currentContent = content[selectedTab as keyof typeof content];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#4CAF50" />
      
      {/* Header with Gradient */}
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
              <Icon name="local-shipping" size={48} color="#4CAF50" />
            </View>
          </View>
          <Text style={styles.heroTitle}>Krushi Express</Text>
          <Text style={styles.heroSubtitle}>{t.about.description}</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>{t.about.version}</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScroll}
          >
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tab,
                  selectedTab === tab.id && styles.tabActive,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedTab(tab.id);
                }}
              >
                <Icon
                  name={tab.icon}
                  size={20}
                  color={selectedTab === tab.id ? '#fff' : '#666'}
                />
                <Text
                  style={[
                    styles.tabText,
                    selectedTab === tab.id && styles.tabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Content Section */}
        <View style={styles.contentSection}>
          <View style={[styles.contentCard, { borderTopColor: currentContent.color }]}>
            <View style={styles.contentHeader}>
              <View style={[styles.iconCircle, { backgroundColor: `${currentContent.color}20` }]}>
                <Icon
                  name={
                    selectedTab === 'mission'
                      ? 'flag'
                      : selectedTab === 'vision'
                      ? 'visibility'
                      : selectedTab === 'values'
                      ? 'favorite'
                      : 'star'
                  }
                  size={32}
                  color={currentContent.color}
                />
              </View>
              <Text style={styles.contentTitle}>{currentContent.title}</Text>
            </View>

            <Text style={styles.contentDescription}>{currentContent.description}</Text>

            {selectedTab === 'features' ? (
              <View style={styles.featuresGrid}>
                {currentContent.features.map((feature, index) => (
                  <View key={index} style={styles.featureCard}>
                    <View
                      style={[
                        styles.featureIconContainer,
                        { backgroundColor: `${feature.color}20` },
                      ]}
                    >
                      <Icon name={feature.icon} size={28} color={feature.color} />
                    </View>
                    <Text style={styles.featureTitle}>{feature.title}</Text>
                    <Text style={styles.featureDescription}>{feature.description}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.pointsContainer}>
                {currentContent.points.map((point, index) => (
                  <View key={index} style={styles.pointItem}>
                    <View
                      style={[
                        styles.pointIcon,
                        { backgroundColor: `${currentContent.color}20` },
                      ]}
                    >
                      <Icon name="check-circle" size={20} color={currentContent.color} />
                    </View>
                    <Text style={styles.pointText}>{point}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Contact Section */}
        <View style={styles.contactSection}>
          <Text style={styles.contactTitle}>{t.about.contact}</Text>
          <View style={styles.contactCard}>
            <View style={styles.contactItem}>
              <Icon name="email" size={24} color="#4CAF50" />
              <Text style={styles.contactText}>support@krushiexpress.com</Text>
            </View>
            <View style={styles.contactItem}>
              <Icon name="phone" size={24} color="#4CAF50" />
              <Text style={styles.contactText}>+91 9876543210</Text>
            </View>
            <View style={styles.contactItem}>
              <Icon name="location-on" size={24} color="#4CAF50" />
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
  },
  container: {
    flex: 1,
  },
  heroSection: {
    backgroundColor: '#fff',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  logoContainer: {
    marginBottom: 16,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
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
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 24,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  versionBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  tabsContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tabsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    marginRight: 8,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#4CAF50',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  contentSection: {
    padding: 16,
  },
  contentCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderTopWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  contentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  contentDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: '#666',
    marginBottom: 20,
  },
  pointsContainer: {
    gap: 12,
  },
  pointItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  pointIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  pointText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
    flex: 1,
  },
  featuresGrid: {
    gap: 16,
  },
  featureCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  featureIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  featureDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#666',
  },
  contactSection: {
    padding: 16,
    paddingTop: 0,
  },
  contactTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  contactCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactText: {
    fontSize: 15,
    color: '#333',
    flex: 1,
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
