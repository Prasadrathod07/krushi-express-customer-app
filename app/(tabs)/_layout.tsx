import { Tabs, useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Platform, View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '../../contexts/NotificationContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTrip } from '../../contexts/TripContext';
import { useRef, useEffect } from 'react';

const ACCENT = '#16a34a';
const INACTIVE = '#9ca3af';

const TAB_ICONS: Record<string, { icon: string; center?: boolean }> = {
  home:          { icon: 'home' },
  rides:         { icon: 'directions-car' },
  drivers:       { icon: 'badge', center: true },
  notifications: { icon: 'notifications' },
  profile:       { icon: 'person' },
};

// ─── Custom Tab Bar ────────────────────────────────────────────────────────────
function CustomTabBar({ state, navigation, unreadCount }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const TAB_LABELS: Record<string, string> = {
    home:          t.tabs.home,
    rides:         t.tabs.rides,
    drivers:       t.tabs.drivers,
    notifications: t.tabs.alerts,
    profile:       t.tabs.profile,
  };
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 6 : 0);

  return (
    <View style={[s.outerWrap, { paddingBottom: bottomPad }]}>
      {/* Raised center button sits above the bar */}
      <View style={s.bar}>
        {state.routes.map((route: any, index: number) => {
          const cfg = TAB_ICONS[route.name];
          if (!cfg) return null;
          const label   = TAB_LABELS[route.name] ?? route.name;
          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          // ── Center "Drivers" tab ──
          if (cfg.center) {
            return (
              <TouchableOpacity
                key={route.key}
                style={s.centerTab}
                onPress={onPress}
                activeOpacity={0.85}
              >
                <View style={[s.centerCircle, focused && s.centerCircleFocused]}>
                  <Icon name={cfg.icon} size={26} color="#fff" />
                </View>
                <Text style={[s.centerLabel, focused && s.centerLabelActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          }

          // ── Regular tab ──
          return (
            <TouchableOpacity
              key={route.key}
              style={s.tab}
              onPress={onPress}
              activeOpacity={0.7}
            >
              {focused && <View style={s.activePill} />}

              <View style={s.iconWrap}>
                <Icon name={cfg.icon} size={24} color={focused ? ACCENT : INACTIVE} />
                {route.name === 'notifications' && unreadCount > 0 && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[s.label, focused && s.labelActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Pulsing dot for the negotiation banner ─────────────────────────────────
function PulseDot() {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.2, duration: 650, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 650, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={[s.pulseDot, { opacity: anim }]} />;
}

// ─── Layout ────────────────────────────────────────────────────────────────────
export default function TabLayout() {
  const { unreadCount } = useNotifications();
  const { activeTrip } = useTrip();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const hasNegotiation = activeTrip?.currentTripState === 'NEGOTIATING';

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{ headerShown: false }}
        initialRouteName="home"
        tabBar={(props) => <CustomTabBar {...props} unreadCount={unreadCount} />}
      >
        <Tabs.Screen name="home"          options={{ title: 'Home'          }} />
        <Tabs.Screen name="rides"         options={{ title: 'Rides'         }} />
        <Tabs.Screen name="drivers"       options={{ title: 'Drivers'       }} />
        <Tabs.Screen name="notifications" options={{ title: 'Alerts'        }} />
        <Tabs.Screen name="profile"       options={{ title: 'Profile'       }} />
      </Tabs>

      {hasNegotiation && (
        <TouchableOpacity
          style={[s.negotiationBanner, { bottom: 84 + insets.bottom }]}
          onPress={() => router.push({ pathname: '/trip-negotiation', params: { tripId: activeTrip!._id } })}
          activeOpacity={0.88}
        >
          <PulseDot />
          <Icon name="chat" size={18} color="#fff" style={{ marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.bannerTitle}>Negotiation in progress</Text>
            <Text style={s.bannerSub}>Tap to continue chatting →</Text>
          </View>
          <Icon name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const BAR_HEIGHT = 62;
const CENTER_SIZE = 56;
const CENTER_LIFT = 18; // how many px the circle rises above bar top

const s = StyleSheet.create({
  outerWrap: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    // extra top padding so the raised center button has room
    paddingTop: CENTER_LIFT,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 12,
  },
  bar: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    alignItems: 'flex-end',
    paddingBottom: 6,
  },

  // ── Regular tab ──
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    gap: 3,
  },
  activePill: {
    position: 'absolute',
    top: 0,
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
  iconWrap: {
    position: 'relative',
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: INACTIVE,
  },
  labelActive: {
    color: ACCENT,
    fontWeight: '700',
  },

  // ── Badge ──
  badge: {
    position: 'absolute',
    top: -5,
    right: -7,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },

  // ── Center tab ──
  centerTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    // the circle overflows upward, so we need space at the top
    marginTop: -(CENTER_LIFT + CENTER_SIZE - BAR_HEIGHT + 10),
    gap: 3,
  },
  centerCircle: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    backgroundColor: ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 3,
    borderColor: '#fff',
  },
  centerCircleFocused: {
    backgroundColor: '#15803d',
    shadowOpacity: 0.65,
    elevation: 14,
    transform: [{ scale: 1.05 }],
  },
  centerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: INACTIVE,
  },
  centerLabelActive: {
    color: ACCENT,
  },

  // ── Negotiation banner ──
  negotiationBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16a34a',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 14,
  },
  pulseDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#86efac',
    marginRight: 8,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  bannerSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
});
