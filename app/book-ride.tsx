import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef, useMemo } from 'react';
import React from 'react';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tripsAPI } from '../services/tripsAPI';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../lib/env';

const { width } = Dimensions.get('window');

const GOODS_CATEGORIES = [
  { id: 'Farm Produce',          label: 'Farm Produce',          emoji: '🌾', icon: 'agriculture' },
  { id: 'Furniture',             label: 'Furniture',             emoji: '🪑', icon: 'chair' },
  { id: 'Construction Material', label: 'Construction',          emoji: '🧱', icon: 'construction' },
  { id: 'Household Shifting',    label: 'Household',             emoji: '📦', icon: 'home' },
  { id: 'Grains & Seeds',        label: 'Grains & Seeds',        emoji: '🌽', icon: 'grass' },
  { id: 'Other',                 label: 'Other',                 emoji: '✏️', icon: 'category' },
];

const VEHICLE_TYPES = [
  { id: 'Any',          label: 'Any',          icon: 'local-shipping' },
  { id: 'Pickup',       label: 'Pickup',       icon: 'airport-shuttle' },
  { id: 'Tata Ace',     label: 'Tata Ace',     icon: 'local-shipping' },
  { id: 'Bolero Pickup',label: 'Bolero',       icon: 'directions-car' },
  { id: 'Eicher Mini',  label: 'Eicher Mini',  icon: 'local-shipping' },
  { id: 'Tempo',        label: 'Tempo',        icon: 'time-to-leave' },
  { id: 'Mini Truck',   label: 'Mini Truck',   icon: 'local-shipping' },
  { id: 'Other',        label: 'Other',        icon: 'edit' },
];

const STEPS = [
  { n: 1, label: 'Locations',  icon: 'place' },
  { n: 2, label: 'Goods',      icon: 'inventory-2' },
  { n: 3, label: 'Details',    icon: 'receipt-long' },
];

export default function BookRide() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams();
  const scrollRef       = useRef<ScrollView>(null);
  const weightRef       = useRef<TextInput>(null);
  const descRef         = useRef<TextInput>(null);
  const customCatRef    = useRef<TextInput>(null);
  const customVehRef    = useRef<TextInput>(null);

  // Y offsets inside the ScrollView — captured via onLayout on each wrapper View
  const weightY         = useRef(0);
  const descY           = useRef(0);
  const customCatY      = useRef(0);
  const customVehY      = useRef(0);

  const scrollToY = (y: number) => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }), 100);
  };

  const initialStep = params.step === '2' && params.pickupLat && params.dropLat ? 2 : 1;
  const [step, setStep]               = useState(initialStep);
  const [loading, setLoading]         = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  const [pickupLocation, setPickupLocation] = useState<{ latitude: number; longitude: number; address: string } | null>(null);
  const [dropLocation,   setDropLocation]   = useState<{ latitude: number; longitude: number; address: string } | null>(null);

  const [selectedCategory, setSelectedCategory]   = useState('');
  const [customCategory,   setCustomCategory]     = useState('');
  const [selectedVehicle,  setSelectedVehicle]    = useState('');
  const [customVehicle,    setCustomVehicle]      = useState('');
  const [weight,           setWeight]             = useState('');
  const [description,      setDescription]        = useState('');
  const [budget,           setBudget]             = useState('');
  const [goodsImages,      setGoodsImages]        = useState<string[]>([]);

  const paramsProcessedRef = useRef(false);
  const lastParamsKeyRef   = useRef('');
  const paramsKey = useMemo(() => `${params.step || ''}-${params.pickupLat || ''}-${params.dropLat || ''}`, [params.step, params.pickupLat, params.dropLat]);

  useEffect(() => {
    if (paramsKey === lastParamsKeyRef.current) return;
    lastParamsKeyRef.current = paramsKey;
    if (params.pickupLat && params.pickupLng) {
      setPickupLocation({ latitude: parseFloat(params.pickupLat as string), longitude: parseFloat(params.pickupLng as string), address: (params.pickupAddress as string) || 'Pickup Location' });
    }
    if (params.dropLat && params.dropLng) {
      setDropLocation({ latitude: parseFloat(params.dropLat as string), longitude: parseFloat(params.dropLng as string), address: (params.dropAddress as string) || 'Drop Location' });
    }
    if (params.step) {
      const s = parseInt(params.step as string, 10);
      if (s === 2 && params.pickupLat && params.dropLat) { setStep(cur => cur !== 2 ? 2 : cur); paramsProcessedRef.current = true; }
    }
    if (!paramsProcessedRef.current) loadStoredLocations();
  }, [paramsKey]);

  const loadStoredLocations = async () => {
    try {
      if (!params.pickupLat || !params.dropLat) {
        const sp = await AsyncStorage.getItem('pickupLocation');
        const sd = await AsyncStorage.getItem('dropLocation');
        if (sp && !params.pickupLat) setPickupLocation(JSON.parse(sp));
        if (sd && !params.dropLat)   setDropLocation(JSON.parse(sd));
      }
    } catch (e) { console.error(e); }
  };

  // ── image helpers ──────────────────────────────────────────────────────────
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Denied', 'Camera roll permission is required.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.8 });
      if (!result.canceled && result.assets) {
        setUploadingImages(true);
        const urls = await Promise.all(result.assets.map(a => uploadImage(a.uri)));
        setGoodsImages(prev => [...prev, ...urls]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch { Alert.alert('Error', 'Failed to pick image.'); }
    finally { setUploadingImages(false); }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Denied', 'Camera permission is required.'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        setUploadingImages(true);
        const url = await uploadImage(result.assets[0].uri);
        setGoodsImages(prev => [...prev, url]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch { Alert.alert('Error', 'Failed to take photo.'); }
    finally { setUploadingImages(false); }
  };

  const uploadImage = async (uri: string): Promise<string> => {
    // Compress: resize to max 1200px wide, 80% JPEG quality (goods photos need some detail)
    const compressed = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    const formData = new FormData();
    const filename = compressed.uri.split('/').pop() || 'image.jpg';
    const ext = /\.(\w+)$/.exec(filename);
    formData.append('file', { uri: compressed.uri, name: filename, type: ext ? `image/${ext[1]}` : 'image/jpeg' } as any);
    const token = await AsyncStorage.getItem('userToken');
    const res = await fetch(`${API_URL}/api/cloudinary/upload?type=public`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
    const data = await res.json();
    if (data.ok && data.data?.secure_url) return data.data.secure_url;
    throw new Error('Upload failed');
  };

  const removeImage = (i: number) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setGoodsImages(prev => prev.filter((_, idx) => idx !== i)); };

  // ── navigation ─────────────────────────────────────────────────────────────
  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 1) {
      if (!pickupLocation || !dropLocation) { Alert.alert('Required', 'Please select both pickup and drop locations.'); return; }
      setStep(2);
    } else if (step === 2) {
      if (!selectedCategory) { Alert.alert('Required', 'Please select a goods category.'); return; }
      if (selectedCategory === 'Other' && !customCategory.trim()) { Alert.alert('Required', 'Please describe your goods category.'); return; }
      if (!selectedVehicle) { Alert.alert('Required', 'Please select a vehicle type.'); return; }
      if (selectedVehicle === 'Other' && !customVehicle.trim()) { Alert.alert('Required', 'Please specify the vehicle type.'); return; }
      setStep(3);
    }
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step > 1) { setStep(step - 1); scrollRef.current?.scrollTo({ y: 0, animated: true }); }
    else router.back();
  };

  const handleSubmit = async () => {
    if (!pickupLocation || !dropLocation) { Alert.alert('Error', 'Locations missing.'); return; }
    if (!selectedCategory || !selectedVehicle) { Alert.alert('Error', 'Please fill in all required fields.'); return; }
    if (!goodsImages.length) { Alert.alert('Required', 'Please upload at least one goods image.'); return; }
    if (!budget || parseFloat(budget) <= 0) { Alert.alert('Required', 'Please enter your budget.'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/searching-drivers',
      params: {
        pickupLocation: JSON.stringify(pickupLocation),
        dropLocation:   JSON.stringify(dropLocation),
        tripDetails: JSON.stringify({
          category:    selectedCategory === 'Other' ? customCategory.trim() : selectedCategory,
          weight:      weight || 'Not specified',
          description: description || '',
          budget:      parseFloat(budget),
          images:      goodsImages,
          vehicleType: selectedVehicle === 'Other' ? customVehicle.trim() : selectedVehicle,
        }),
      },
    });
  };

  // ── Step 1: Locations ───────────────────────────────────────────────────────
  const renderStep1 = () => (
    <View style={s.stepWrap}>
      <Text style={s.stepHeading}>Where are you sending?</Text>
      <Text style={s.stepSub}>Set the pickup and drop points for your goods</Text>

      {/* Route card */}
      <View style={s.routeCard}>
        {/* Pickup row */}
        <TouchableOpacity
          style={s.routeRow}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/select-location?type=pickup'); }}
          activeOpacity={0.75}
        >
          <View style={s.routeDotGreen} />
          <View style={s.routeInfo}>
            <Text style={s.routeLabel}>PICKUP</Text>
            <Text style={[s.routeAddr, !pickupLocation && s.routeAddrEmpty]} numberOfLines={2}>
              {pickupLocation?.address || 'Tap to set pickup location'}
            </Text>
          </View>
          <View style={[s.routeEditBtn, { backgroundColor: '#E8F5E9' }]}>
            <Icon name="edit-location" size={18} color="#2E7D32" />
          </View>
        </TouchableOpacity>

        {/* Connector line */}
        <View style={s.routeConnector}>
          <View style={s.routeLine} />
          <View style={s.routeLineArrow}>
            <Icon name="arrow-downward" size={14} color="#ccc" />
          </View>
        </View>

        {/* Drop row */}
        <TouchableOpacity
          style={s.routeRow}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/select-location?type=drop'); }}
          activeOpacity={0.75}
        >
          <View style={s.routeDotOrange} />
          <View style={s.routeInfo}>
            <Text style={s.routeLabel}>DROP</Text>
            <Text style={[s.routeAddr, !dropLocation && s.routeAddrEmpty]} numberOfLines={2}>
              {dropLocation?.address || 'Tap to set drop location'}
            </Text>
          </View>
          <View style={[s.routeEditBtn, { backgroundColor: '#FFF3E0' }]}>
            <Icon name="edit-location" size={18} color="#E65100" />
          </View>
        </TouchableOpacity>
      </View>

      {/* tip */}
      <View style={s.tipCard}>
        <Icon name="info-outline" size={16} color="#1565C0" />
        <Text style={s.tipText}>Both locations are required to find nearby drivers for your route.</Text>
      </View>
    </View>
  );

  // ── Step 2: Goods & Vehicle ─────────────────────────────────────────────────
  const renderStep2 = () => (
    <View style={s.stepWrap}>
      <Text style={s.stepHeading}>What are you shipping?</Text>
      <Text style={s.stepSub}>Select the goods type and your preferred vehicle</Text>

      {/* Category */}
      <Text style={s.sectionTitle}>Goods Category <Text style={s.req}>*</Text></Text>
      <View style={s.categoryGrid}>
        {GOODS_CATEGORIES.map(cat => {
          const sel = selectedCategory === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[s.catCard, sel && s.catCardSel]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedCategory(cat.id); }}
              activeOpacity={0.75}
            >
              <Text style={s.catEmoji}>{cat.emoji}</Text>
              <Text style={[s.catLabel, sel && s.catLabelSel]} numberOfLines={2}>{cat.label}</Text>
              {sel && <View style={s.catCheck}><Icon name="check" size={10} color="#fff" /></View>}
            </TouchableOpacity>
          );
        })}
      </View>
      {selectedCategory === 'Other' && (
        <View style={s.customWrap} onLayout={e => { customCatY.current = e.nativeEvent.layout.y; }}>
          <Icon name="edit" size={17} color="#2E7D32" />
          <TextInput
            ref={customCatRef}
            style={s.customInput}
            placeholder="e.g., Electronics, Medicines…"
            placeholderTextColor="#aaa"
            value={customCategory}
            onChangeText={setCustomCategory}
            autoFocus
            returnKeyType="done"
            onFocus={() => scrollToY(customCatY.current)}
          />
        </View>
      )}

      {/* Vehicle */}
      <Text style={[s.sectionTitle, { marginTop: 24 }]}>Vehicle Type <Text style={s.req}>*</Text></Text>
      <View style={s.vehicleGrid}>
        {VEHICLE_TYPES.map(v => {
          const sel = selectedVehicle === v.id;
          return (
            <TouchableOpacity
              key={v.id}
              style={[s.vehChip, sel && s.vehChipSel]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedVehicle(v.id); }}
              activeOpacity={0.75}
            >
              <Icon name={v.icon as any} size={15} color={sel ? '#fff' : '#555'} />
              <Text style={[s.vehLabel, sel && s.vehLabelSel]}>{v.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {selectedVehicle === 'Other' && (
        <View style={s.customWrap} onLayout={e => { customVehY.current = e.nativeEvent.layout.y; }}>
          <Icon name="local-shipping" size={17} color="#2E7D32" />
          <TextInput
            ref={customVehRef}
            style={s.customInput}
            placeholder="e.g., Tractor, Bullock Cart…"
            placeholderTextColor="#aaa"
            value={customVehicle}
            onChangeText={setCustomVehicle}
            autoFocus
            returnKeyType="done"
            onFocus={() => scrollToY(customVehY.current)}
          />
        </View>
      )}

      {/* Weight */}
      <Text style={[s.sectionTitle, { marginTop: 24 }]}>Approximate Weight</Text>
      <View style={s.inputRow} onLayout={e => { weightY.current = e.nativeEvent.layout.y; }}>
        <Icon name="monitor-weight" size={18} color="#aaa" style={{ marginRight: 10 }} />
        <TextInput
          ref={weightRef}
          style={s.inlineInput}
          placeholder="e.g., 500 kg, 2 tons"
          placeholderTextColor="#aaa"
          value={weight}
          onChangeText={setWeight}
          returnKeyType="next"
          onFocus={() => scrollToY(weightY.current)}
          onSubmitEditing={() => descRef.current?.focus()}
        />
      </View>

      {/* Description */}
      <Text style={[s.sectionTitle, { marginTop: 20 }]}>Description</Text>
      <View onLayout={e => { descY.current = e.nativeEvent.layout.y; }}>
        <TextInput
          ref={descRef}
          style={s.textArea}
          placeholder="Any special instructions or details about your goods…"
          placeholderTextColor="#aaa"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          onFocus={() => scrollToY(descY.current)}
        />
      </View>
    </View>
  );

  // ── Step 3: Images & Budget ─────────────────────────────────────────────────
  const renderStep3 = () => (
    <View style={s.stepWrap}>
      <Text style={s.stepHeading}>Almost done!</Text>
      <Text style={s.stepSub}>Upload photos of your goods and set your budget</Text>

      {/* Summary pill */}
      <View style={s.summaryRow}>
        <View style={s.summaryPill}>
          <Icon name="inventory-2" size={13} color="#2E7D32" />
          <Text style={s.summaryText}>{selectedCategory === 'Other' ? customCategory || 'Other' : selectedCategory}</Text>
        </View>
        <View style={s.summaryPill}>
          <Icon name="local-shipping" size={13} color="#2E7D32" />
          <Text style={s.summaryText}>{selectedVehicle === 'Other' ? customVehicle || 'Other' : selectedVehicle}</Text>
        </View>
        {!!weight && (
          <View style={s.summaryPill}>
            <Icon name="monitor-weight" size={13} color="#2E7D32" />
            <Text style={s.summaryText}>{weight}</Text>
          </View>
        )}
      </View>

      {/* Images */}
      <Text style={s.sectionTitle}>Goods Photos <Text style={s.req}>*</Text></Text>
      <Text style={s.sectionSub}>Upload clear photos so drivers know what to expect (max 5)</Text>

      <View style={s.imageGrid}>
        {goodsImages.map((uri, i) => (
          <View key={i} style={s.imgThumb}>
            <Image source={{ uri }} style={s.imgThumbImg} />
            <TouchableOpacity style={s.imgRemove} onPress={() => removeImage(i)}>
              <Icon name="close" size={13} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
        {goodsImages.length < 5 && (
          <>
            <TouchableOpacity style={s.imgAddBtn} onPress={pickImage} disabled={uploadingImages}>
              {uploadingImages
                ? <ActivityIndicator color="#4CAF50" />
                : <>
                    <Icon name="photo-library" size={26} color="#4CAF50" />
                    <Text style={s.imgAddLabel}>Gallery</Text>
                  </>
              }
            </TouchableOpacity>
            <TouchableOpacity style={s.imgAddBtn} onPress={takePhoto} disabled={uploadingImages}>
              <Icon name="camera-alt" size={26} color="#4CAF50" />
              <Text style={s.imgAddLabel}>Camera</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Budget */}
      <Text style={[s.sectionTitle, { marginTop: 24 }]}>Your Budget <Text style={s.req}>*</Text></Text>
      <Text style={s.sectionSub}>Set the amount you're willing to pay — drivers will negotiate</Text>
      <View style={s.budgetCard}>
        <Text style={s.budgetSymbol}>₹</Text>
        <TextInput
          style={s.budgetInput}
          placeholder="0"
          placeholderTextColor="#ccc"
          value={budget}
          onChangeText={setBudget}
          keyboardType="numeric"
          returnKeyType="done"
        />
        <Text style={s.budgetUnit}>total</Text>
      </View>
    </View>
  );

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.safe, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerCircle} />
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={handleBack}>
            <Icon name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Book Tempo</Text>
            <Text style={s.headerSub}>Step {step} of 3 — {STEPS[step - 1].label}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={s.progressBar}>
          {STEPS.map((st, i) => {
            const done    = step > st.n;
            const active  = step === st.n;
            return (
              <React.Fragment key={st.n}>
                <View style={s.progressStep}>
                  <View style={[s.progressDot, done && s.progressDotDone, active && s.progressDotActive]}>
                    {done
                      ? <Icon name="check" size={13} color="#fff" />
                      : <Text style={[s.progressNum, active && s.progressNumActive]}>{st.n}</Text>
                    }
                  </View>
                  <Text style={[s.progressLabel, (done || active) && s.progressLabelActive]}>{st.label}</Text>
                </View>
                {i < STEPS.length - 1 && (
                  <View style={[s.progressLine, step > st.n && s.progressLineDone]} />
                )}
              </React.Fragment>
            );
          })}
        </View>
      </View>

      {/* ── Content ── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 80}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Footer ── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 8 }]}>
        {step < 3 ? (
          <TouchableOpacity style={s.nextBtn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={s.nextBtnText}>Continue</Text>
            <Icon name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.nextBtn, s.submitBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Icon name="send" size={18} color="#fff" />
                  <Text style={s.nextBtnText}>Send Booking Request</Text>
                </>
            }
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────
const CARD_GAP = 12;
const THUMB = (width - 40 - CARD_GAP * 3) / 4;

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#F4F6F9' },

  // Header
  header:       { backgroundColor: '#1B5E20', paddingHorizontal: 16, paddingBottom: 20, overflow: 'hidden' },
  headerCircle: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.06)', top: -80, right: -60 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, marginBottom: 20 },
  backBtn:      { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  headerTitle:  { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSub:    { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },

  // Progress
  progressBar:        { flexDirection: 'row', alignItems: 'center' },
  progressStep:       { alignItems: 'center', gap: 5 },
  progressDot:        { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  progressDotActive:  { backgroundColor: '#fff' },
  progressDotDone:    { backgroundColor: '#4CAF50' },
  progressNum:        { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  progressNumActive:  { color: '#2E7D32' },
  progressLabel:      { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  progressLabelActive:{ color: 'rgba(255,255,255,0.9)' },
  progressLine:       { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 16, marginHorizontal: 4 },
  progressLineDone:   { backgroundColor: '#4CAF50' },

  // Step wrapper
  stepWrap:    { padding: 20 },
  stepHeading: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 4 },
  stepSub:     { fontSize: 13, color: '#888', marginBottom: 24, lineHeight: 18 },

  // ── Step 1 ─────────────────────────────────────────────────────
  routeCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 4 },
  routeRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routeDotGreen:  { width: 14, height: 14, borderRadius: 7, backgroundColor: '#2E7D32', borderWidth: 3, borderColor: '#C8E6C9' },
  routeDotOrange: { width: 14, height: 14, borderRadius: 4, backgroundColor: '#E65100', borderWidth: 3, borderColor: '#FFE0B2' },
  routeInfo:    { flex: 1 },
  routeLabel:   { fontSize: 10, fontWeight: '800', color: '#aaa', letterSpacing: 0.8, marginBottom: 3 },
  routeAddr:    { fontSize: 14, fontWeight: '600', color: '#111', lineHeight: 20 },
  routeAddrEmpty: { color: '#bbb', fontStyle: 'italic' },
  routeEditBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  routeConnector: { flexDirection: 'row', alignItems: 'center', marginLeft: 5, paddingVertical: 2 },
  routeLine:    { width: 2, height: 28, backgroundColor: '#E0E0E0', marginLeft: 6, marginRight: 0 },
  routeLineArrow: { position: 'absolute', left: -3, top: 14 },

  tipCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#E3F2FD', borderRadius: 12, padding: 12, marginTop: 16 },
  tipText: { flex: 1, fontSize: 12, color: '#1565C0', lineHeight: 17 },

  // ── Step 2 ─────────────────────────────────────────────────────
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#222', marginBottom: 10 },
  sectionSub:   { fontSize: 12, color: '#999', marginBottom: 12, marginTop: -6 },
  req:          { color: '#E53935' },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catCard: {
    width: (width - 40 - 30) / 3,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  catCardSel:  { borderColor: '#2E7D32', backgroundColor: '#F1F8F1' },
  catEmoji:    { fontSize: 26 },
  catLabel:    { fontSize: 11, fontWeight: '600', color: '#777', textAlign: 'center' },
  catLabelSel: { color: '#2E7D32' },
  catCheck:    { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center' },

  vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vehChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 30, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E8E8E8' },
  vehChipSel: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  vehLabel:   { fontSize: 13, fontWeight: '600', color: '#444' },
  vehLabelSel:{ color: '#fff' },

  customWrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F1F8F1', borderRadius: 12, borderWidth: 1.5, borderColor: '#4CAF50', paddingHorizontal: 14, paddingVertical: 2, marginTop: 10 },
  customInput: { flex: 1, fontSize: 14, color: '#111', paddingVertical: 11 },

  inputRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E8E8E8', paddingHorizontal: 14 },
  inlineInput: { flex: 1, fontSize: 14, color: '#111', paddingVertical: 13 },
  textArea:    { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E8E8E8', padding: 14, fontSize: 14, color: '#111', minHeight: 90, textAlignVertical: 'top', marginTop: 0 },

  // ── Step 3 ─────────────────────────────────────────────────────
  summaryRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  summaryPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  summaryText: { fontSize: 12, fontWeight: '600', color: '#2E7D32' },

  imageGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  imgThumb:    { width: THUMB, height: THUMB, borderRadius: 12, overflow: 'visible', position: 'relative' },
  imgThumbImg: { width: THUMB, height: THUMB, borderRadius: 12 },
  imgRemove:   { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#E53935', justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  imgAddBtn:   { width: THUMB, height: THUMB, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#C8E6C9', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 4 },
  imgAddLabel: { fontSize: 11, color: '#4CAF50', fontWeight: '600' },

  budgetCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: '#2E7D32', paddingHorizontal: 18, paddingVertical: 4 },
  budgetSymbol: { fontSize: 26, fontWeight: '800', color: '#2E7D32', marginRight: 4 },
  budgetInput:  { flex: 1, fontSize: 28, fontWeight: '700', color: '#111', paddingVertical: 14 },
  budgetUnit:   { fontSize: 14, color: '#aaa', fontWeight: '500', alignSelf: 'flex-end', marginBottom: 16 },

  // Footer
  footer:      { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  nextBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2E7D32', borderRadius: 16, paddingVertical: 16 },
  nextBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  submitBtn:   { backgroundColor: '#1B5E20' },
});
