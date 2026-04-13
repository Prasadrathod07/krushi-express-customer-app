import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setIsAuthenticated(false);
        return;
      }

      // Decode JWT locally to check expiry — no network call needed
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (Date.now() > payload.exp * 1000) {
          // Token expired — clear all auth data and send to login
          await AsyncStorage.multiRemove(['userToken', 'userId', 'userName', 'userEmail']);
          setIsAuthenticated(false);
          return;
        }
      } catch {
        // Malformed token — clear and send to login
        await AsyncStorage.multiRemove(['userToken', 'userId', 'userName', 'userEmail']);
        setIsAuthenticated(false);
        return;
      }

      setIsAuthenticated(true);
    } catch (error) {
      console.error('Auth check error:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/login" />;
}



