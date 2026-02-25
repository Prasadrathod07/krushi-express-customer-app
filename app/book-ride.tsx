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
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { tripsAPI } from '../services/tripsAPI';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../lib/env';

const { width } = Dimensions.get('window');

const GOODS_CATEGORIES = [
  { id: 'Farm Produce', label: 'Farm Produce 🌾', icon: 'agriculture' },
  { id: 'Furniture', label: 'Furniture 🚪', icon: 'chair' },
  { id: 'Construction Material', label: 'Construction Material 🧱', icon: 'construction' },
  { id: 'Household Shifting', label: 'Household Shifting 📦', icon: 'home' },
  { id: 'Other Items', label: 'Other Items', icon: 'category' },
];

const VEHICLE_TYPES = [
  'Any',
  'Pickup',
  'Tata Ace',
  'Bolero Pickup',
  'Eicher Mini',
  'Tempo',
  'Mini Truck',
];

export default function BookRide() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const scrollViewRef = useRef<ScrollView>(null);
  const weightInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  
  // Initialize step from params if available
  const initialStep = params.step === '2' && params.pickupLat && params.dropLat ? 2 : 1;
  const [step, setStep] = useState(initialStep);
  const [loading, setLoading] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  
  // Location data
  const [pickupLocation, setPickupLocation] = useState<{
    latitude: number;
    longitude: number;
    address: string;
  } | null>(null);
  const [dropLocation, setDropLocation] = useState<{
    latitude: number;
    longitude: number;
    address: string;
  } | null>(null);
  
  // Goods data
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [weight, setWeight] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [goodsImages, setGoodsImages] = useState<string[]>([]);
  
  // Vehicle selection
  const [selectedVehicleType, setSelectedVehicleType] = useState<string>('');
  
  // Track if params have been processed to prevent infinite loop
  const paramsProcessedRef = useRef(false);
  const lastParamsKeyRef = useRef<string>('');
  
  // Create a stable key from params to detect actual changes
  const paramsKey = useMemo(() => {
    return `${params.step || ''}-${params.pickupLat || ''}-${params.dropLat || ''}`;
  }, [params.step, params.pickupLat, params.dropLat]);
  
  useEffect(() => {
    // Skip if params haven't actually changed
    if (paramsKey === lastParamsKeyRef.current) {
      return;
    }
    
    lastParamsKeyRef.current = paramsKey;
    
    // Load location data from params first (takes priority)
    if (params.pickupLat && params.pickupLng) {
      const pickup = {
        latitude: parseFloat(params.pickupLat as string),
        longitude: parseFloat(params.pickupLng as string),
        address: (params.pickupAddress as string) || 'Pickup Location',
      };
      setPickupLocation(pickup);
    }
    if (params.dropLat && params.dropLng) {
      const drop = {
        latitude: parseFloat(params.dropLat as string),
        longitude: parseFloat(params.dropLng as string),
        address: (params.dropAddress as string) || 'Drop Location',
      };
      setDropLocation(drop);
    }
    
    // Check if step parameter is provided (for direct navigation to step 2)
    // Use functional update to avoid depending on step state (prevents infinite loop)
    if (params.step) {
      const stepNum = parseInt(params.step as string, 10);
      if (stepNum === 2 && params.pickupLat && params.dropLat) {
        // Use functional update to avoid infinite loop
        setStep((currentStep) => {
          if (currentStep !== 2) {
            return 2;
          }
          return currentStep;
        });
        paramsProcessedRef.current = true;
      }
    }
    
    // Load from AsyncStorage only if params not provided (only once)
    if (!paramsProcessedRef.current) {
      loadStoredLocations();
    }
  }, [paramsKey]);

  const loadStoredLocations = async () => {
    try {
      // Only load from AsyncStorage if params are not provided
      if (!params.pickupLat || !params.dropLat) {
        const storedPickup = await AsyncStorage.getItem('pickupLocation');
        const storedDrop = await AsyncStorage.getItem('dropLocation');
        
        if (storedPickup && !params.pickupLat) {
          setPickupLocation(JSON.parse(storedPickup));
        }
        if (storedDrop && !params.dropLat) {
          setDropLocation(JSON.parse(storedDrop));
        }
      }
    } catch (error) {
      console.error('Error loading stored locations:', error);
    }
  };


  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need camera roll permissions to upload images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets) {
        setUploadingImages(true);
        const uploadPromises = result.assets.map((asset) => uploadImage(asset.uri));
        const uploadedUrls = await Promise.all(uploadPromises);
        setGoodsImages([...goodsImages, ...uploadedUrls]);
        setUploadingImages(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      setUploadingImages(false);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need camera permissions to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingImages(true);
        const uploadedUrl = await uploadImage(result.assets[0].uri);
        setGoodsImages([...goodsImages, uploadedUrl]);
        setUploadingImages(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      setUploadingImages(false);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const uploadImage = async (uri: string): Promise<string> => {
    try {
      const formData = new FormData();
      const filename = uri.split('/').pop() || 'image.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      formData.append('file', {
        uri,
        name: filename,
        type,
      } as any);

      const token = await AsyncStorage.getItem('userToken');
      // Upload to Cloudinary (public folder for trip goods images)
      const response = await fetch(`${API_URL}/api/cloudinary/upload?type=public`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type header - let fetch set it with boundary
        },
        body: formData,
      });

      const data = await response.json();
      if (data.ok && data.data?.secure_url) {
        // Return Cloudinary URL (stored in MongoDB as string)
        return data.data.secure_url;
      }
      throw new Error('Upload failed');
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const removeImage = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGoodsImages(goodsImages.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (step === 1) {
      if (!pickupLocation || !dropLocation) {
        Alert.alert('Required', 'Please select both pickup and drop locations.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!selectedCategory) {
        Alert.alert('Required', 'Please select a goods category.');
        return;
      }
      if (!selectedVehicleType || selectedVehicleType === '') {
        Alert.alert('Required', 'Please select a vehicle type.');
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step > 1) {
      setStep(step - 1);
    } else {
      router.back();
    }
  };

  const handleSubmit = async () => {
    if (!pickupLocation || !dropLocation) {
      Alert.alert('Error', 'Please select both pickup and drop locations.');
      return;
    }
    if (!selectedCategory || !selectedVehicleType || selectedVehicleType === '') {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
    // Validate images - at least one image is required
    if (!goodsImages || goodsImages.length === 0) {
      Alert.alert('Required', 'Please upload at least one goods image.');
      return;
    }
    // Validate budget - budget is mandatory
    if (!budget || parseFloat(budget) <= 0) {
      Alert.alert('Required', 'Please enter your budget amount.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Navigate to searching drivers screen
    router.push({
      pathname: '/searching-drivers',
      params: {
        pickupLocation: JSON.stringify(pickupLocation),
        dropLocation: JSON.stringify(dropLocation),
        tripDetails: JSON.stringify({
          category: selectedCategory,
          weight: weight || 'Not specified',
          description: description || '',
          budget: parseFloat(budget),
          images: goodsImages,
          vehicleType: selectedVehicleType,
        }),
      },
    });
  };

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Select Locations</Text>
      
      <TouchableOpacity
        style={styles.locationCard}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/select-location?type=pickup');
        }}
      >
        <View style={[styles.locationIcon, { backgroundColor: '#E8F5E9' }]}>
          <Icon name="location-on" size={24} color="#4CAF50" />
        </View>
        <View style={styles.locationInfo}>
          <Text style={styles.locationLabel}>Pickup Location</Text>
          <Text style={styles.locationText} numberOfLines={2}>
            {pickupLocation?.address || 'Tap to select pickup location'}
          </Text>
        </View>
        <Icon name="chevron-right" size={24} color="#ccc" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.locationCard}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/select-location?type=drop');
        }}
      >
        <View style={[styles.locationIcon, { backgroundColor: '#FFF3E0' }]}>
          <Icon name="place" size={24} color="#FF9800" />
        </View>
        <View style={styles.locationInfo}>
          <Text style={styles.locationLabel}>Drop Location</Text>
          <Text style={styles.locationText} numberOfLines={2}>
            {dropLocation?.address || 'Tap to select drop location'}
          </Text>
        </View>
        <Icon name="chevron-right" size={24} color="#ccc" />
      </TouchableOpacity>

    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Goods Details</Text>

      <Text style={styles.sectionLabel}>Goods Category *</Text>
      <View style={styles.categoryGrid}>
        {GOODS_CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryCard,
              selectedCategory === category.id && styles.categoryCardSelected,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedCategory(category.id);
            }}
          >
            <Icon
              name={category.icon}
              size={32}
              color={selectedCategory === category.id ? '#4CAF50' : '#666'}
            />
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category.id && styles.categoryTextSelected,
              ]}
            >
              {category.label.split(' ')[0]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Vehicle Type *</Text>
      <View style={styles.vehicleGrid}>
        {VEHICLE_TYPES.map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.vehicleCard,
              selectedVehicleType === type && styles.vehicleCardSelected,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedVehicleType(type);
            }}
          >
            <Text
              style={[
                styles.vehicleText,
                selectedVehicleType === type && styles.vehicleTextSelected,
              ]}
            >
              {type}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.sectionLabel}>Weight (Optional)</Text>
        <TextInput
          ref={weightInputRef}
          style={styles.input}
          placeholder="e.g., 500 kg, 2 tons"
          placeholderTextColor="#999"
          value={weight}
          onChangeText={setWeight}
          keyboardType="default"
          returnKeyType="next"
          onFocus={() => {
            // Scroll to weight input when focused
            setTimeout(() => {
              weightInputRef.current?.measureInWindow((x, y, width, height) => {
                const scrollY = Math.max(0, y - 200);
                scrollViewRef.current?.scrollTo({ y: scrollY, animated: true });
              });
            }, 300);
          }}
          onSubmitEditing={() => {
            // Move to description when done
            descriptionInputRef.current?.focus();
          }}
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.sectionLabel}>Description (Optional)</Text>
        <TextInput
          ref={descriptionInputRef}
          style={[styles.input, styles.textArea]}
          placeholder="Describe your goods..."
          placeholderTextColor="#999"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          returnKeyType="done"
          onFocus={() => {
            // Scroll to description input when focused
            setTimeout(() => {
              descriptionInputRef.current?.measureInWindow((x, y, width, height) => {
                const scrollY = Math.max(0, y - 200);
                scrollViewRef.current?.scrollTo({ y: scrollY, animated: true });
              });
            }, 300);
          }}
        />
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Upload Images & Budget</Text>

      <Text style={styles.sectionLabel}>Goods Images *</Text>
      <View style={styles.imageUploadContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {goodsImages.map((uri, index) => (
            <View key={index} style={styles.imagePreview}>
              <Image source={{ uri }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => removeImage(index)}
              >
                <Icon name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {goodsImages.length < 5 && (
            <>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={pickImage}
                disabled={uploadingImages}
              >
                {uploadingImages ? (
                  <ActivityIndicator color="#4CAF50" />
                ) : (
                  <>
                    <Icon name="photo-library" size={32} color="#4CAF50" />
                    <Text style={styles.uploadButtonText}>Gallery</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={takePhoto}
                disabled={uploadingImages}
              >
                <Icon name="camera-alt" size={32} color="#4CAF50" />
                <Text style={styles.uploadButtonText}>Camera</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>

      <Text style={styles.sectionLabel}>Your Budget *</Text>
      <View style={styles.budgetContainer}>
        <Text style={styles.budgetLabel}>₹</Text>
        <TextInput
          style={styles.budgetInput}
          placeholder="Enter your budget"
          value={budget}
          onChangeText={setBudget}
          keyboardType="numeric"
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book Tempo</Text>
        <View style={styles.backButton} />
      </View>

      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={styles.progressStep}>
            <View
              style={[
                styles.progressCircle,
                step >= s && styles.progressCircleActive,
              ]}
            >
              {step > s ? (
                <Icon name="check" size={16} color="#fff" />
              ) : (
                <Text style={styles.progressNumber}>{s}</Text>
              )}
            </View>
            {s < 3 && (
              <View
                style={[
                  styles.progressLine,
                  step > s && styles.progressLineActive,
                ]}
              />
            )}
          </View>
        ))}
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={styles.footer}>
        {step < 3 ? (
          <TouchableOpacity
            style={[styles.button, styles.nextButton]}
            onPress={handleNext}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Next</Text>
            <Icon name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.submitButton, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.buttonText}>Send Booking Request</Text>
                <Icon name="send" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
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
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 40,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCircleActive: {
    backgroundColor: '#4CAF50',
  },
  progressNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
  },
  progressLine: {
    width: 60,
    height: 2,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 8,
  },
  progressLineActive: {
    backgroundColor: '#4CAF50',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 250, // Extra padding to ensure inputs are visible above keyboard
  },
  inputContainer: {
    marginBottom: 24,
  },
  stepContainer: {
    padding: 20,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 24,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  locationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  locationText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 20,
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: (width - 64) / 3,
    aspectRatio: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryCardSelected: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  categoryTextSelected: {
    color: '#4CAF50',
  },
  vehicleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  vehicleCard: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  vehicleCardSelected: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  vehicleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  vehicleTextSelected: {
    color: '#4CAF50',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minHeight: 50,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 16,
  },
  imageUploadContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  uploadButton: {
    width: 100,
    height: 100,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 8,
    fontWeight: '600',
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginRight: 12,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f44336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  budgetContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  budgetLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4CAF50',
    marginRight: 8,
  },
  budgetInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 16,
    padding: 18,
    gap: 8,
  },
  nextButton: {
    backgroundColor: '#4CAF50',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
});

