// Firebase Configuration - Customer App V2
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBPhc8ppFiNGMWWh_XaDhlFr6iYytCGUQk",
  authDomain: "krushi-express-mh24.firebaseapp.com",
  databaseURL: "https://krushi-express-mh24-default-rtdb.firebaseio.com",
  projectId: "krushi-express-mh24",
  storageBucket: "krushi-express-mh24.firebasestorage.app",
  messagingSenderId: "358550702473",
  appId: "1:358550702473:web:81e74411a6d6345e593958",
  measurementId: "G-TCWWCBS6TY"
};

const app = initializeApp(firebaseConfig);

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

const db = getFirestore(app);

export { auth, db };



