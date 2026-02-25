import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'en' | 'mr' | 'hi';

export interface Translations {
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
      description: 'कृषी एक्सप्रेस हे शेतकरी-केंद्रित टेंपो बुकिंग प्लॅटफॉर्म आहे जे महाराष्ट्रातील शेतकरी आणि व्यवसायांना विश्वासार्ह वाहतूक सेवांशी जोडण्यासाठी डिझाइन केले आहे. आम्ही कृषी वस्तूंच्या वाहतुकीमध्ये विशेषज्ञ आहोत, शेतकऱ्यांना त्यांच्या उत्पादनांची कार्यक्षम आणि किफायतशीर वाहतूक करण्यात मदत करतो.',
      mission: 'आमचे मिशन',
      vision: 'आमचे दृष्टीकोन',
      contact: 'आमच्याशी संपर्क साधा',
      email: 'ईमेल: support@krushiexpress.com',
      phone: 'फोन: +91 9876543210',
    },
    privacy: {
      title: 'गोपनीयता धोरण',
      lastUpdated: 'शेवटचे अद्यतन: जानेवारी 2024',
      introduction: 'कृषी एक्सप्रेस मध्ये, आम्ही तुमच्या गोपनीयतेचे संरक्षण करण्यासाठी वचनबद्ध आहोत. हे गोपनीयता धोरण स्पष्ट करते की तुम्ही आमच्या मोबाइल अॅप्लिकेशनचा वापर करता तेव्हा आम्ही तुमची वैयक्तिक माहिती कशी गोळा करतो, वापरतो आणि संरक्षित करतो.',
      dataCollection: 'डेटा संग्रह\n\nआम्ही खालील माहिती गोळा करतो:\n• नाव आणि संपर्क तपशील\n• बुकिंग आणि ट्रॅकिंगसाठी स्थान डेटा\n• ट्रिप इतिहास आणि प्राधान्ये\n• अॅप कार्यक्षमतेसाठी डिव्हाइस माहिती',
      dataUsage: 'आम्ही तुमचा डेटा कसा वापरतो\n\n• आमच्या सेवा प्रदान करण्यासाठी आणि सुधारण्यासाठी\n• तुमच्या बुकिंग प्रक्रिया करण्यासाठी आणि तुम्हाला ड्रायव्हर्सशी जोडण्यासाठी\n• तुमच्या ट्रिप्सबद्दल महत्त्वाच्या सूचना पाठवण्यासाठी\n• वापरकर्ता अनुभव आणि अॅप कार्यक्षमता वाढवण्यासाठी',
      dataSharing: 'डेटा सामायिकरण\n\nआम्ही तुमचा वैयक्तिक डेटा विकत नाही. आम्ही माहिती सामायिक करू शकतो:\n• ट्रिप समन्वयासाठी सत्यापित ड्रायव्हर्स\n• अॅप ऑपरेशन्समध्ये मदत करणारे सेवा प्रदाते\n• कायद्याने आवश्यक असल्यास कायदेशीर अधिकारी',
      dataSecurity: 'डेटा सुरक्षा\n\nआम्ही तुमच्या डेटाचे संरक्षण करण्यासाठी उद्योग-मानक सुरक्षा उपाय लागू करतो, यासह एन्क्रिप्शन आणि सुरक्षित स्टोरेज पद्धती.',
      userRights: 'तुमचे अधिकार\n\nतुम्हाला अधिकार आहे:\n• तुमच्या वैयक्तिक डेटाला प्रवेश\n• डेटा सुधारणा किंवा हटवण्याची विनंती\n• नॉन-आवश्यक संप्रेषणांमधून बाहेर पडणे\n• कोणत्याही वेळी संमती मागे घेणे',
      contactUs: 'या गोपनीयता धोरणाबद्दल प्रश्न असल्यास, कृपया support@krushiexpress.com वर आमच्याशी संपर्क साधा',
    },
    terms: {
      title: 'अटी आणि नियम',
      lastUpdated: 'शेवटचे अद्यतन: जानेवारी 2024',
      acceptance: 'अटींची स्वीकृती\n\nकृषी एक्सप्रेस वापरून, तुम्ही या अटी आणि नियमांशी सहमत आहात. आमच्या सेवा वापरण्यापूर्वी कृपया त्या काळजीपूर्वक वाचा.',
      services: 'आमच्या सेवा\n\nकृषी एक्सप्रेस कृषी वस्तूंच्या वाहतुकीसाठी ग्राहकांना टेंपो ड्रायव्हर्सशी जोडणारे प्लॅटफॉर्म प्रदान करते. आम्ही बुकिंग सुलभ करतो परंतु आम्ही स्वतः वाहतूक सेवा प्रदाते नाही.',
      userAccount: 'वापरकर्ता खाते\n\n• नोंदणी दरम्यान तुम्ही अचूक माहिती प्रदान करणे आवश्यक आहे\n• खाते सुरक्षा राखण्यासाठी तुम्ही जबाबदार आहात\n• आमच्या सेवा वापरण्यासाठी तुम्ही किमान 18 वर्षांचे असले पाहिजे',
      booking: 'बुकिंग अटी\n\n• बुकिंग ड्रायव्हर उपलब्धतेवर अवलंबून आहेत\n• किंमती तुम्ही आणि ड्रायव्हर यांच्यात थेट वाटाघाट केल्या जातात\n• तुम्ही अचूक पिकअप आणि डिलिव्हरी स्थान प्रदान करणे आवश्यक आहे\n• वस्तू कायदेशीर आणि योग्यरित्या पॅकेज केलेल्या असल्या पाहिजेत',
      payment: 'पेमेंट\n\n• पेमेंट थेट ड्रायव्हर्सना केले जातात\n• आम्ही अॅपद्वारे पेमेंट प्रक्रिया करत नाही\n• पेमेंट वाद थेट ड्रायव्हरसोबत सोडवले जावेत',
      cancellation: 'रद्दीकरण धोरण\n\n• तुम्ही ड्रायव्हर स्वीकृतीपूर्वी बुकिंग रद्द करू शकता\n• स्वीकृतीनंतर रद्दीकरणास शुल्क लागू शकते\n• अनपेक्षित परिस्थितीमुळे ड्रायव्हर्स रद्द करू शकतात',
      liability: 'जबाबदारी\n\n• कृषी एक्सप्रेस केवळ प्लॅटफॉर्म सुविधाकर्ता म्हणून कार्य करते\n• वाहतुकीदरम्यान वस्तूंच्या नुकसान किंवा हानीसाठी आम्ही जबाबदार नाही\n• वापरकर्ते मौल्यवान वस्तूंची विमा करण्यासाठी जबाबदार आहेत\n• ड्रायव्हर्स सुरक्षित वाहतुकीसाठी जबाबदार आहेत',
      contactUs: 'या अटींबद्दल प्रश्नांसाठी, support@krushiexpress.com वर आमच्याशी संपर्क साधा',
    },
  },
  hi: {
    common: {
      back: 'वापस',
      save: 'सहेजें',
      cancel: 'रद्द करें',
      ok: 'ठीक है',
      yes: 'हाँ',
      no: 'नहीं',
      loading: 'लोड हो रहा है...',
      error: 'त्रुटि',
      success: 'सफल',
    },
    settings: {
      title: 'सेटिंग्स',
      notifications: 'सूचनाएं',
      location: 'स्थान',
      general: 'सामान्य',
      language: 'भाषा',
      about: 'के बारे में',
      privacyPolicy: 'गोपनीयता नीति',
      termsConditions: 'नियम और शर्तें',
      pushNotifications: 'पुश सूचनाएं',
      sound: 'ध्वनि',
      locationServices: 'स्थान सेवाएं',
      shareLiveLocation: 'लाइव स्थान साझा करें',
    },
    about: {
      title: 'कृषि एक्सप्रेस के बारे में',
      version: 'संस्करण 1.0.0',
      description: 'कृषि एक्सप्रेस एक किसान-केंद्रित टेम्पो बुकिंग प्लेटफॉर्म है जो महाराष्ट्र में किसानों और व्यवसायों को विश्वसनीय परिवहन सेवाओं से जोड़ने के लिए डिज़ाइन किया गया है। हम कृषि सामान परिवहन में विशेषज्ञ हैं, किसानों को अपने उत्पादों को कुशलतापूर्वक और किफायती रूप से परिवहन करने में मदद करते हैं।',
      mission: 'हमारा मिशन',
      vision: 'हमारा दृष्टिकोण',
      contact: 'हमसे संपर्क करें',
      email: 'ईमेल: support@krushiexpress.com',
      phone: 'फोन: +91 9876543210',
    },
    privacy: {
      title: 'गोपनीयता नीति',
      lastUpdated: 'अंतिम अपडेट: जनवरी 2024',
      introduction: 'कृषि एक्सप्रेस में, हम आपकी गोपनीयता की सुरक्षा के लिए प्रतिबद्ध हैं। यह गोपनीयता नीति बताती है कि जब आप हमारे मोबाइल एप्लिकेशन का उपयोग करते हैं तो हम आपकी व्यक्तिगत जानकारी कैसे एकत्र, उपयोग और सुरक्षित करते हैं।',
      dataCollection: 'डेटा संग्रह\n\nहम निम्नलिखित जानकारी एकत्र करते हैं:\n• नाम और संपर्क विवरण\n• बुकिंग और ट्रैकिंग के लिए स्थान डेटा\n• यात्रा इतिहास और प्राथमिकताएं\n• ऐप कार्यक्षमता के लिए डिवाइस जानकारी',
      dataUsage: 'हम आपके डेटा का उपयोग कैसे करते हैं\n\n• हमारी सेवाएं प्रदान करने और सुधारने के लिए\n• आपकी बुकिंग प्रक्रिया करने और आपको ड्राइवरों से जोड़ने के लिए\n• आपकी यात्राओं के बारे में महत्वपूर्ण सूचनाएं भेजने के लिए\n• उपयोगकर्ता अनुभव और ऐप कार्यक्षमता बढ़ाने के लिए',
      dataSharing: 'डेटा साझाकरण\n\nहम आपका व्यक्तिगत डेटा नहीं बेचते। हम जानकारी साझा कर सकते हैं:\n• यात्रा समन्वय के लिए सत्यापित ड्राइवर\n• सेवा प्रदाता जो ऐप संचालन में सहायता करते हैं\n• कानूनी अधिकारी जब कानून द्वारा आवश्यक हो',
      dataSecurity: 'डेटा सुरक्षा\n\nहम आपके डेटा की सुरक्षा के लिए उद्योग-मानक सुरक्षा उपाय लागू करते हैं, जिसमें एन्क्रिप्शन और सुरक्षित भंडारण प्रथाएं शामिल हैं।',
      userRights: 'आपके अधिकार\n\nआपको अधिकार है:\n• अपने व्यक्तिगत डेटा तक पहुंच\n• डेटा सुधार या हटाने का अनुरोध\n• गैर-आवश्यक संचार से बाहर निकलना\n• किसी भी समय सहमति वापस लेना',
      contactUs: 'इस गोपनीयता नीति के बारे में प्रश्न होने पर, कृपया support@krushiexpress.com पर हमसे संपर्क करें',
    },
    terms: {
      title: 'नियम और शर्तें',
      lastUpdated: 'अंतिम अपडेट: जनवरी 2024',
      acceptance: 'नियमों की स्वीकृति\n\nकृषि एक्सप्रेस का उपयोग करके, आप इन नियमों और शर्तों से सहमत हैं। कृपया हमारी सेवाओं का उपयोग करने से पहले उन्हें ध्यान से पढ़ें।',
      services: 'हमारी सेवाएं\n\nकृषि एक्सप्रेस कृषि सामान परिवहन के लिए ग्राहकों को टेम्पो ड्राइवरों से जोड़ने वाला प्लेटफॉर्म प्रदान करता है। हम बुकिंग सुविधाजनक बनाते हैं लेकिन स्वयं परिवहन सेवा प्रदाता नहीं हैं।',
      userAccount: 'उपयोगकर्ता खाता\n\n• आपको पंजीकरण के दौरान सटीक जानकारी प्रदान करनी होगी\n• आप खाता सुरक्षा बनाए रखने के लिए जिम्मेदार हैं\n• हमारी सेवाओं का उपयोग करने के लिए आपकी आयु कम से कम 18 वर्ष होनी चाहिए',
      booking: 'बुकिंग नियम\n\n• बुकिंग ड्राइवर उपलब्धता पर निर्भर हैं\n• कीमतें आप और ड्राइवर के बीच सीधे बातचीत की जाती हैं\n• आपको सटीक पिकअप और डिलीवरी स्थान प्रदान करना होगा\n• सामान कानूनी और उचित रूप से पैक किया जाना चाहिए',
      payment: 'भुगतान\n\n• भुगतान सीधे ड्राइवरों को किया जाता है\n• हम ऐप के माध्यम से भुगतान प्रक्रिया नहीं करते\n• भुगतान विवादों को सीधे ड्राइवर के साथ हल किया जाना चाहिए',
      cancellation: 'रद्दीकरण नीति\n\n• आप ड्राइवर स्वीकृति से पहले बुकिंग रद्द कर सकते हैं\n• स्वीकृति के बाद रद्दीकरण पर शुल्क लग सकता है\n• अप्रत्याशित परिस्थितियों के कारण ड्राइवर रद्द कर सकते हैं',
      liability: 'दायित्व\n\n• कृषि एक्सप्रेस केवल एक प्लेटफॉर्म सुविधाकर्ता के रूप में कार्य करता है\n• परिवहन के दौरान सामान की क्षति या हानि के लिए हम जिम्मेदार नहीं हैं\n• उपयोगकर्ता मूल्यवान सामान का बीमा करने के लिए जिम्मेदार हैं\n• ड्राइवर सुरक्षित परिवहन के लिए जिम्मेदार हैं',
      contactUs: 'इन नियमों के बारे में प्रश्नों के लिए, support@krushiexpress.com पर हमसे संपर्क करें',
    },
  },
};

const LANGUAGE_STORAGE_KEY = '@krushi_express_language';

export class I18n {
  private static currentLanguage: Language = 'en';

  static async init(): Promise<void> {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'mr' || savedLanguage === 'hi')) {
        this.currentLanguage = savedLanguage as Language;
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
    return translations[this.currentLanguage];
  }

  static getLanguageName(language: Language): string {
    const names = {
      en: 'English',
      mr: 'मराठी',
      hi: 'हिन्दी',
    };
    return names[language];
  }
}
