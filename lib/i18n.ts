import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'en' | 'mr';

export interface Translations {
  // Tab bar
  tabs: {
    home: string;
    rides: string;
    drivers: string;
    alerts: string;
    profile: string;
  };
  // Home page
  home: {
    hello: string;
    pickupLocation: string;
    dropLocation: string;
    whereFrom: string;
    whereTo: string;
    bookNow: string;
    selectVehicle: string;
    permanentDrivers: string;
    nearbyDrivers: string;
    activeTrip: string;
    trackDriver: string;
    searching: string;
    viewAll: string;
    noDriversNearby: string;
  };
  // Trips / Rides page
  trips: {
    title: string;
    tripCount: string;
    all: string;
    active: string;
    done: string;
    cancelled: string;
    noTrips: string;
    noActiveTrips: string;
    noCompletedTrips: string;
    noCancelledTrips: string;
    bookTrip: string;
    estimatedFare: string;
    view: string;
    negotiate: string;
    from: string;
    to: string;
    refresh: string;
  };
  // Notifications / Alerts page
  notifications: {
    title: string;
    today: string;
    yesterday: string;
    earlier: string;
    noNotifications: string;
    noNotificationsSub: string;
    markAllRead: string;
    trip: string;
    offer: string;
    update: string;
    system: string;
  };
  // Drivers page
  drivers: {
    title: string;
    searchPlaceholder: string;
    noDrivers: string;
    noDriversSub: string;
    call: string;
    whatsapp: string;
    featured: string;
    all: string;
    perKm: string;
    package: string;
    both: string;
  };
  // Common
  common: {
    back: string;
    save: string;
    cancel: string;
    ok: string;
    yes: string;
    no: string;
    loading: string;
    error: string;
    success: string;
  };
  // Profile
  profile: {
    verifiedMember: string;
    totalTrips: string;
    rating: string;
    memberSince: string;
    preferences: string;
    pushNotifications: string;
    tripUpdatesAlerts: string;
    locationServices: string;
    accuratePickup: string;
    account: string;
    editProfile: string;
    tripHistory: string;
    support: string;
    helpSupport: string;
    aboutApp: string;
    language: string;
    chooseLanguage: string;
    logOut: string;
    logOutTitle: string;
    logOutConfirm: string;
    version: string;
  };
  // Settings
  settings: {
    title: string;
    notifications: string;
    location: string;
    general: string;
    language: string;
    about: string;
    privacyPolicy: string;
    termsConditions: string;
    pushNotifications: string;
    sound: string;
    locationServices: string;
    shareLiveLocation: string;
  };
  // About
  about: {
    title: string;
    version: string;
    description: string;
    mission: string;
    vision: string;
    contact: string;
    email: string;
    phone: string;
  };
  // Privacy Policy
  privacy: {
    title: string;
    lastUpdated: string;
    introduction: string;
    dataCollection: string;
    dataUsage: string;
    dataSharing: string;
    dataSecurity: string;
    userRights: string;
    contactUs: string;
  };
  // Terms & Conditions
  terms: {
    title: string;
    lastUpdated: string;
    acceptance: string;
    services: string;
    userAccount: string;
    booking: string;
    payment: string;
    cancellation: string;
    liability: string;
    contactUs: string;
  };
}

const translations: Record<Language, Translations> = {
  en: {
    tabs: {
      home: 'Home',
      rides: 'Rides',
      drivers: 'Drivers',
      alerts: 'Alerts',
      profile: 'Profile',
    },
    home: {
      hello: 'Hello',
      pickupLocation: 'Pickup Location',
      dropLocation: 'Drop Location',
      whereFrom: 'Where from?',
      whereTo: 'Where to?',
      bookNow: 'Book Now',
      selectVehicle: 'Select Vehicle',
      permanentDrivers: 'Permanent Drivers',
      nearbyDrivers: 'Nearby Drivers',
      activeTrip: 'Active Trip',
      trackDriver: 'Track Driver',
      searching: 'Searching...',
      viewAll: 'View All',
      noDriversNearby: 'No drivers nearby',
    },
    trips: {
      title: 'My Trips',
      tripCount: 'trip',
      all: 'All',
      active: 'Active',
      done: 'Done',
      cancelled: 'Cancelled',
      noTrips: 'No trips found',
      noActiveTrips: 'You have no active trips right now',
      noCompletedTrips: 'Completed trips will appear here',
      noCancelledTrips: 'No cancelled trips found',
      bookTrip: 'Book a Trip',
      estimatedFare: 'Estimated Fare',
      view: 'View',
      negotiate: 'Negotiate',
      from: 'FROM',
      to: 'TO',
      refresh: 'Refresh',
    },
    notifications: {
      title: 'Notifications',
      today: 'Today',
      yesterday: 'Yesterday',
      earlier: 'Earlier',
      noNotifications: 'No notifications yet',
      noNotificationsSub: 'Trip updates and alerts will appear here',
      markAllRead: 'Mark all read',
      trip: 'Trip',
      offer: 'Offer',
      update: 'Update',
      system: 'System',
    },
    drivers: {
      title: 'Permanent Drivers',
      searchPlaceholder: 'Search drivers...',
      noDrivers: 'No drivers found',
      noDriversSub: 'Try a different search or vehicle filter',
      call: 'Call',
      whatsapp: 'WhatsApp',
      featured: 'Featured',
      all: 'All',
      perKm: 'Per KM',
      package: 'Package',
      both: 'Both',
    },
    common: {
      back: 'Back',
      save: 'Save',
      cancel: 'Cancel',
      ok: 'OK',
      yes: 'Yes',
      no: 'No',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
    },
    profile: {
      verifiedMember: 'Verified Member',
      totalTrips: 'Total Trips',
      rating: 'Rating',
      memberSince: 'Member',
      preferences: 'Preferences',
      pushNotifications: 'Push Notifications',
      tripUpdatesAlerts: 'Trip updates & alerts',
      locationServices: 'Location Services',
      accuratePickup: 'Accurate pickup detection',
      account: 'Account',
      editProfile: 'Edit Profile',
      tripHistory: 'Trip History',
      support: 'Support',
      helpSupport: 'Help & Support',
      aboutApp: 'About Krushi Express',
      language: 'Language',
      chooseLanguage: 'Choose Language',
      logOut: 'Log Out',
      logOutTitle: 'Log Out',
      logOutConfirm: 'Are you sure you want to log out?',
      version: 'Version 1.0.0 · © 2024',
    },
    settings: {
      title: 'Settings',
      notifications: 'Notifications',
      location: 'Location',
      general: 'General',
      language: 'Language',
      about: 'About',
      privacyPolicy: 'Privacy Policy',
      termsConditions: 'Terms & Conditions',
      pushNotifications: 'Push Notifications',
      sound: 'Sound',
      locationServices: 'Location Services',
      shareLiveLocation: 'Share Live Location',
    },
    about: {
      title: 'About Krushi Express',
      version: 'Version 1.0.0',
      description: 'Krushi Express is a farmer-centric tempo booking platform designed to connect farmers and businesses in Maharashtra with reliable transport services. We specialize in agricultural goods transportation, helping farmers transport their produce efficiently and affordably.',
      mission: 'Our Mission',
      vision: 'Our Vision',
      contact: 'Contact Us',
      email: 'Email: support@krushiexpress.com',
      phone: 'Phone: +91 9876543210',
    },
    privacy: {
      title: 'Privacy Policy',
      lastUpdated: 'Last Updated: January 2024',
      introduction: 'At Krushi Express, we are committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your personal information when you use our mobile application.',
      dataCollection: 'Data Collection\n\nWe collect the following information:\n• Name and contact details\n• Location data for booking and tracking\n• Trip history and preferences\n• Device information for app functionality',
      dataUsage: 'How We Use Your Data\n\n• To provide and improve our services\n• To process your bookings and connect you with drivers\n• To send important notifications about your trips\n• To enhance user experience and app functionality',
      dataSharing: 'Data Sharing\n\nWe do not sell your personal data. We may share information with:\n• Verified drivers for trip coordination\n• Service providers who assist in app operations\n• Legal authorities when required by law',
      dataSecurity: 'Data Security\n\nWe implement industry-standard security measures to protect your data, including encryption and secure storage practices.',
      userRights: 'Your Rights\n\nYou have the right to:\n• Access your personal data\n• Request data correction or deletion\n• Opt-out of non-essential communications\n• Withdraw consent at any time',
      contactUs: 'If you have questions about this Privacy Policy, please contact us at support@krushiexpress.com',
    },
    terms: {
      title: 'Terms & Conditions',
      lastUpdated: 'Last Updated: January 2024',
      acceptance: 'Acceptance of Terms\n\nBy using Krushi Express, you agree to these Terms & Conditions. Please read them carefully before using our services.',
      services: 'Our Services\n\nKrushi Express provides a platform connecting customers with tempo drivers for agricultural goods transportation. We facilitate bookings but are not a transport service provider ourselves.',
      userAccount: 'User Account\n\n• You must provide accurate information during registration\n• You are responsible for maintaining account security\n• You must be at least 18 years old to use our services',
      booking: 'Booking Terms\n\n• Bookings are subject to driver availability\n• Prices are negotiated directly between you and the driver\n• You must provide accurate pickup and delivery locations\n• Goods must be legal and properly packaged',
      payment: 'Payment\n\n• Payments are made directly to drivers\n• We do not process payments through the app\n• Payment disputes should be resolved directly with the driver',
      cancellation: 'Cancellation Policy\n\n• You may cancel bookings before driver acceptance\n• Cancellation after acceptance may incur charges\n• Drivers may cancel due to unforeseen circumstances',
      liability: 'Liability\n\n• Krushi Express acts as a platform facilitator only\n• We are not liable for goods damage or loss during transport\n• Users are responsible for insuring valuable goods\n• Drivers are responsible for safe transportation',
      contactUs: 'For questions about these Terms, contact us at support@krushiexpress.com',
    },
  },
  mr: {
    tabs: {
      home: 'होम',
      rides: 'प्रवास',
      drivers: 'ड्रायव्हर्स',
      alerts: 'सूचना',
      profile: 'प्रोफाइल',
    },
    home: {
      hello: 'नमस्कार',
      pickupLocation: 'पिकअप स्थान',
      dropLocation: 'ड्रॉप स्थान',
      whereFrom: 'कुठून?',
      whereTo: 'कुठे?',
      bookNow: 'आता बुक करा',
      selectVehicle: 'वाहन निवडा',
      permanentDrivers: 'कायमचे ड्रायव्हर्स',
      nearbyDrivers: 'जवळचे ड्रायव्हर्स',
      activeTrip: 'सक्रिय प्रवास',
      trackDriver: 'ड्रायव्हर ट्रॅक करा',
      searching: 'शोधत आहे...',
      viewAll: 'सर्व पहा',
      noDriversNearby: 'जवळपास ड्रायव्हर नाही',
    },
    trips: {
      title: 'माझे प्रवास',
      tripCount: 'प्रवास',
      all: 'सर्व',
      active: 'सक्रिय',
      done: 'पूर्ण',
      cancelled: 'रद्द',
      noTrips: 'कोणतेही प्रवास सापडले नाही',
      noActiveTrips: 'सध्या कोणतेही सक्रिय प्रवास नाहीत',
      noCompletedTrips: 'पूर्ण झालेले प्रवास येथे दिसतील',
      noCancelledTrips: 'कोणतेही रद्द प्रवास सापडले नाहीत',
      bookTrip: 'प्रवास बुक करा',
      estimatedFare: 'अंदाजित भाडे',
      view: 'पहा',
      negotiate: 'वाटाघाटी',
      from: 'कुठून',
      to: 'कुठे',
      refresh: 'रिफ्रेश करा',
    },
    notifications: {
      title: 'सूचना',
      today: 'आज',
      yesterday: 'काल',
      earlier: 'आधी',
      noNotifications: 'अद्याप कोणत्याही सूचना नाहीत',
      noNotificationsSub: 'प्रवास अपडेट आणि सूचना येथे दिसतील',
      markAllRead: 'सर्व वाचले म्हणून चिन्हांकित करा',
      trip: 'प्रवास',
      offer: 'ऑफर',
      update: 'अपडेट',
      system: 'सिस्टम',
    },
    drivers: {
      title: 'कायमचे ड्रायव्हर्स',
      searchPlaceholder: 'ड्रायव्हर शोधा...',
      noDrivers: 'कोणतेही ड्रायव्हर्स सापडले नाहीत',
      noDriversSub: 'वेगळा शोध किंवा वाहन फिल्टर वापरून पहा',
      call: 'कॉल करा',
      whatsapp: 'व्हॉट्सअॅप',
      featured: 'वैशिष्ट्यीकृत',
      all: 'सर्व',
      perKm: 'प्रति किमी',
      package: 'पॅकेज',
      both: 'दोन्ही',
    },
    common: {
      back: 'मागे',
      save: 'जतन करा',
      cancel: 'रद्द करा',
      ok: 'ठीक आहे',
      yes: 'होय',
      no: 'नाही',
      loading: 'लोड होत आहे...',
      error: 'त्रुटी',
      success: 'यशस्वी',
    },
    profile: {
      verifiedMember: 'सत्यापित सदस्य',
      totalTrips: 'एकूण प्रवास',
      rating: 'रेटिंग',
      memberSince: 'सदस्य',
      preferences: 'प्राधान्ये',
      pushNotifications: 'पुश सूचना',
      tripUpdatesAlerts: 'प्रवास अपडेट आणि सूचना',
      locationServices: 'स्थान सेवा',
      accuratePickup: 'अचूक पिकअप ओळख',
      account: 'खाते',
      editProfile: 'प्रोफाइल संपादित करा',
      tripHistory: 'प्रवास इतिहास',
      support: 'सहाय्य',
      helpSupport: 'मदत आणि सहाय्य',
      aboutApp: 'कृषी एक्सप्रेस बद्दल',
      language: 'भाषा',
      chooseLanguage: 'भाषा निवडा',
      logOut: 'लॉग आउट',
      logOutTitle: 'लॉग आउट',
      logOutConfirm: 'तुम्हाला खरोखर लॉग आउट करायचे आहे का?',
      version: 'आवृत्ती 1.0.0 · © 2024',
    },
    settings: {
      title: 'सेटिंग्ज',
      notifications: 'सूचना',
      location: 'स्थान',
      general: 'सामान्य',
      language: 'भाषा',
      about: 'बद्दल',
      privacyPolicy: 'गोपनीयता धोरण',
      termsConditions: 'अटी आणि नियम',
      pushNotifications: 'पुश सूचना',
      sound: 'आवाज',
      locationServices: 'स्थान सेवा',
      shareLiveLocation: 'थेट स्थान सामायिक करा',
    },
    about: {
      title: 'कृषी एक्सप्रेस बद्दल',
      version: 'आवृत्ती 1.0.0',
      description: 'कृषी एक्सप्रेस हे शेतकरी-केंद्रित टेंपो बुकिंग प्लॅटफॉर्म आहे जे महाराष्ट्रातील शेतकरी आणि व्यवसायांना विश्वासार्ह वाहतूक सेवांशी जोडण्यासाठी डिझाइन केले आहे.',
      mission: 'आमचे मिशन',
      vision: 'आमचे दृष्टीकोन',
      contact: 'आमच्याशी संपर्क साधा',
      email: 'ईमेल: support@krushiexpress.com',
      phone: 'फोन: +91 9876543210',
    },
    privacy: {
      title: 'गोपनीयता धोरण',
      lastUpdated: 'शेवटचे अद्यतन: जानेवारी 2024',
      introduction: 'कृषी एक्सप्रेस मध्ये, आम्ही तुमच्या गोपनीयतेचे संरक्षण करण्यासाठी वचनबद्ध आहोत.',
      dataCollection: 'डेटा संग्रह\n\nआम्ही खालील माहिती गोळा करतो:\n• नाव आणि संपर्क तपशील\n• बुकिंग आणि ट्रॅकिंगसाठी स्थान डेटा\n• ट्रिप इतिहास आणि प्राधान्ये\n• अॅप कार्यक्षमतेसाठी डिव्हाइस माहिती',
      dataUsage: 'आम्ही तुमचा डेटा कसा वापरतो\n\n• आमच्या सेवा प्रदान करण्यासाठी\n• तुमच्या बुकिंग प्रक्रिया करण्यासाठी\n• महत्त्वाच्या सूचना पाठवण्यासाठी\n• वापरकर्ता अनुभव वाढवण्यासाठी',
      dataSharing: 'डेटा सामायिकरण\n\nआम्ही तुमचा वैयक्तिक डेटा विकत नाही.',
      dataSecurity: 'डेटा सुरक्षा\n\nआम्ही उद्योग-मानक सुरक्षा उपाय लागू करतो.',
      userRights: 'तुमचे अधिकार\n\nतुम्हाला तुमच्या वैयक्तिक डेटाला प्रवेश आणि हटवण्याचा अधिकार आहे.',
      contactUs: 'या गोपनीयता धोरणाबद्दल प्रश्न असल्यास, support@krushiexpress.com वर संपर्क साधा',
    },
    terms: {
      title: 'अटी आणि नियम',
      lastUpdated: 'शेवटचे अद्यतन: जानेवारी 2024',
      acceptance: 'अटींची स्वीकृती\n\nकृषी एक्सप्रेस वापरून, तुम्ही या अटी आणि नियमांशी सहमत आहात.',
      services: 'आमच्या सेवा\n\nकृषी एक्सप्रेस कृषी वस्तूंच्या वाहतुकीसाठी ग्राहकांना टेंपो ड्रायव्हर्सशी जोडणारे प्लॅटफॉर्म प्रदान करते.',
      userAccount: 'वापरकर्ता खाते\n\n• नोंदणी दरम्यान अचूक माहिती द्या\n• खाते सुरक्षा राखणे तुमची जबाबदारी आहे\n• सेवा वापरण्यासाठी किमान 18 वर्षे असणे आवश्यक',
      booking: 'बुकिंग अटी\n\n• बुकिंग ड्रायव्हर उपलब्धतेवर अवलंबून\n• किंमती थेट वाटाघाट केल्या जातात\n• अचूक पिकअप आणि डिलिव्हरी स्थान द्या',
      payment: 'पेमेंट\n\n• पेमेंट थेट ड्रायव्हर्सना केले जाते\n• आम्ही अॅपद्वारे पेमेंट प्रक्रिया करत नाही',
      cancellation: 'रद्दीकरण धोरण\n\n• ड्रायव्हर स्वीकृतीपूर्वी बुकिंग रद्द करू शकता\n• स्वीकृतीनंतर रद्दीकरणास शुल्क लागू शकते',
      liability: 'जबाबदारी\n\n• कृषी एक्सप्रेस केवळ प्लॅटफॉर्म सुविधाकर्ता\n• वाहतुकीदरम्यान वस्तूंच्या नुकसानीसाठी जबाबदार नाही',
      contactUs: 'या अटींबद्दल प्रश्नांसाठी, support@krushiexpress.com वर संपर्क साधा',
    },
  },
};

const LANGUAGE_STORAGE_KEY = '@krushi_express_language';

export class I18n {
  private static currentLanguage: Language = 'en';

  static async init(): Promise<void> {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (savedLanguage === 'en' || savedLanguage === 'mr') {
        this.currentLanguage = savedLanguage as Language;
      } else {
        // Legacy hi or any unknown value → reset to English
        this.currentLanguage = 'en';
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
      }
    } catch (error) {
      console.error('Error loading language:', error);
    }
  }

  static async setLanguage(language: Language): Promise<void> {
    try {
      this.currentLanguage = language;
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch (error) {
      console.error('Error saving language:', error);
    }
  }

  static getLanguage(): Language {
    return this.currentLanguage;
  }

  static t(): Translations {
    return translations[this.currentLanguage] || translations['en'];
  }

  static getLanguageName(language: Language): string {
    const names: Record<Language, string> = {
      en: 'English',
      mr: 'मराठी',
    };
    return names[language] ?? 'English';
  }
}
