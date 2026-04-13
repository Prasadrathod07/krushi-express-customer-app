/**
 * VehicleMarker — renders a vehicle-specific SVG map pin
 * Supported types: Tempo, Rickshaw, Auto, Tractor, Mini Truck, Truck, default
 *
 * Used inside react-native-maps <Marker> as a custom callout.
 * The outer circle rotates with driverHeading so the vehicle faces its direction.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  G,
  Rect,
  Circle,
  Ellipse,
  Path,
  Polygon,
  Line,
} from 'react-native-svg';

type VehicleType = string; // intentionally loose — falls back to truck

interface Props {
  vehicleType?: VehicleType;
  heading?: number; // degrees 0-360
  size?: number;
}

/* ─── individual vehicle SVG drawers ─────────────────────── */

/** Tempo (Tata Ace / Pickup style) — facing up */
function TempoSvg({ s }: { s: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 48 48">
      {/* Cabin */}
      <Rect x="14" y="10" width="20" height="16" rx="3" fill="#1D4ED8" />
      {/* Windshield */}
      <Rect x="17" y="12" width="14" height="8" rx="2" fill="#BFDBFE" />
      {/* Cargo bed */}
      <Rect x="10" y="25" width="28" height="14" rx="2" fill="#2563EB" />
      {/* Wheels */}
      <Circle cx="15" cy="39" r="4" fill="#1E293B" />
      <Circle cx="15" cy="39" r="2" fill="#94A3B8" />
      <Circle cx="33" cy="39" r="4" fill="#1E293B" />
      <Circle cx="33" cy="39" r="2" fill="#94A3B8" />
      {/* Head lights */}
      <Rect x="16" y="9" width="5" height="2" rx="1" fill="#FEF08A" />
      <Rect x="27" y="9" width="5" height="2" rx="1" fill="#FEF08A" />
      {/* Direction arrow */}
      <Polygon points="24,4 20,10 28,10" fill="#60A5FA" />
    </Svg>
  );
}

/** Auto-Rickshaw / E-Rickshaw — 3-wheeler facing up */
function RickshawSvg({ s }: { s: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 48 48">
      {/* Canopy */}
      <Path d="M13 22 Q13 10 24 9 Q35 10 35 22 Z" fill="#F97316" />
      {/* Body */}
      <Rect x="13" y="22" width="22" height="14" rx="2" fill="#EA580C" />
      {/* Windshield */}
      <Path d="M16 22 Q16 15 24 14 Q32 15 32 22 Z" fill="#FFEDD5" opacity="0.9" />
      {/* Rear wheel left */}
      <Circle cx="14" cy="38" r="4.5" fill="#1E293B" />
      <Circle cx="14" cy="38" r="2" fill="#94A3B8" />
      {/* Rear wheel right */}
      <Circle cx="34" cy="38" r="4.5" fill="#1E293B" />
      <Circle cx="34" cy="38" r="2" fill="#94A3B8" />
      {/* Front wheel (single, centre) */}
      <Circle cx="24" cy="39" r="3.5" fill="#1E293B" />
      <Circle cx="24" cy="39" r="1.5" fill="#94A3B8" />
      {/* Direction arrow */}
      <Polygon points="24,4 20,10 28,10" fill="#FED7AA" />
    </Svg>
  );
}

/** Tractor — facing up */
function TractorSvg({ s }: { s: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 48 48">
      {/* Cabin / hood */}
      <Rect x="16" y="12" width="16" height="14" rx="2" fill="#16A34A" />
      {/* Windshield */}
      <Rect x="19" y="14" width="10" height="7" rx="1" fill="#BBF7D0" />
      {/* Body */}
      <Rect x="12" y="25" width="24" height="10" rx="2" fill="#15803D" />
      {/* Big rear wheels */}
      <Circle cx="13" cy="38" r="6" fill="#1E293B" />
      <Circle cx="13" cy="38" r="3" fill="#6B7280" />
      <Circle cx="35" cy="38" r="6" fill="#1E293B" />
      <Circle cx="35" cy="38" r="3" fill="#6B7280" />
      {/* Small front wheels */}
      <Circle cx="18" cy="36" r="3" fill="#374151" />
      <Circle cx="30" cy="36" r="3" fill="#374151" />
      {/* Exhaust pipe */}
      <Rect x="27" y="8" width="3" height="6" rx="1" fill="#9CA3AF" />
      {/* Direction arrow */}
      <Polygon points="24,3 20,9 28,9" fill="#4ADE80" />
    </Svg>
  );
}

/** Mini Truck (Mahindra Bolero / small truck) — facing up */
function MiniTruckSvg({ s }: { s: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 48 48">
      {/* Cabin */}
      <Rect x="10" y="13" width="16" height="14" rx="3" fill="#7C3AED" />
      {/* Windshield */}
      <Rect x="12" y="15" width="12" height="8" rx="1.5" fill="#DDD6FE" />
      {/* Cargo box */}
      <Rect x="25" y="10" width="14" height="17" rx="2" fill="#6D28D9" />
      {/* Cargo top bar */}
      <Rect x="25" y="10" width="14" height="3" rx="1" fill="#5B21B6" />
      {/* Base / chassis */}
      <Rect x="8" y="27" width="32" height="8" rx="2" fill="#4C1D95" />
      {/* Wheels */}
      <Circle cx="14" cy="38" r="4.5" fill="#1E293B" />
      <Circle cx="14" cy="38" r="2" fill="#94A3B8" />
      <Circle cx="34" cy="38" r="4.5" fill="#1E293B" />
      <Circle cx="34" cy="38" r="2" fill="#94A3B8" />
      {/* Headlights */}
      <Rect x="11" y="12" width="4" height="2" rx="1" fill="#FEF08A" />
      <Rect x="20" y="12" width="4" height="2" rx="1" fill="#FEF08A" />
      {/* Direction arrow */}
      <Polygon points="24,4 20,10 28,10" fill="#C4B5FD" />
    </Svg>
  );
}

/** Large Truck — facing up */
function TruckSvg({ s }: { s: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 48 48">
      {/* Cabin */}
      <Rect x="8" y="14" width="14" height="16" rx="3" fill="#B45309" />
      {/* Windshield */}
      <Rect x="10" y="16" width="10" height="9" rx="1.5" fill="#FEF3C7" />
      {/* Cargo container */}
      <Rect x="21" y="8" width="20" height="22" rx="2" fill="#D97706" />
      {/* Cargo lines */}
      <Line x1="25" y1="8" x2="25" y2="30" stroke="#B45309" strokeWidth="1" />
      <Line x1="29" y1="8" x2="29" y2="30" stroke="#B45309" strokeWidth="1" />
      <Line x1="33" y1="8" x2="33" y2="30" stroke="#B45309" strokeWidth="1" />
      <Line x1="37" y1="8" x2="37" y2="30" stroke="#B45309" strokeWidth="1" />
      {/* Chassis */}
      <Rect x="6" y="29" width="36" height="7" rx="2" fill="#92400E" />
      {/* Wheels - 3 axles */}
      <Circle cx="12" cy="39" r="4.5" fill="#1E293B" />
      <Circle cx="12" cy="39" r="2" fill="#9CA3AF" />
      <Circle cx="24" cy="39" r="4.5" fill="#1E293B" />
      <Circle cx="24" cy="39" r="2" fill="#9CA3AF" />
      <Circle cx="36" cy="39" r="4.5" fill="#1E293B" />
      <Circle cx="36" cy="39" r="2" fill="#9CA3AF" />
      {/* Headlights */}
      <Rect x="9" y="13" width="3" height="2" rx="1" fill="#FEF08A" />
      <Rect x="17" y="13" width="3" height="2" rx="1" fill="#FEF08A" />
      {/* Direction arrow */}
      <Polygon points="24,3 20,9 28,9" fill="#FCD34D" />
    </Svg>
  );
}

/* ─── helper: pick SVG by vehicle type string ─────────────── */

function pickVehicleSvg(vehicleType: string | undefined, size: number): React.ReactElement {
  const t = (vehicleType || '').toLowerCase();

  if (t.includes('rickshaw') || t.includes('auto') || t.includes('e-rick') || t.includes('erick')) {
    return <RickshawSvg s={size} />;
  }
  if (t.includes('tractor')) {
    return <TractorSvg s={size} />;
  }
  if (t.includes('mini') || t.includes('bolero') || t.includes('pickup')) {
    return <MiniTruckSvg s={size} />;
  }
  if (t.includes('truck') || t.includes('lorry')) {
    return <TruckSvg s={size} />;
  }
  // default: tempo (Tata Ace / most common for this platform)
  return <TempoSvg s={size} />;
}

/* ─── exported component ──────────────────────────────────── */

export default function VehicleMarker({ vehicleType, heading = 0, size = 56 }: Props) {
  return (
    <View
      style={[
        mkStyles.shadow,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ rotate: `${heading}deg` }],
        },
      ]}
    >
      {pickVehicleSvg(vehicleType, size)}
    </View>
  );
}

const mkStyles = StyleSheet.create({
  shadow: {
    backgroundColor: 'transparent',
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
});
