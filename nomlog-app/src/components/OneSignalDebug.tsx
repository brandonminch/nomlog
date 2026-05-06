import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useOneSignal } from '../hooks/useOneSignal';
import { useAuthStore } from '../store/authStore';
import OneSignalService from '../services/oneSignalService';

export const OneSignalDebug: React.FC = () => {
  const [externalId, setExternalId] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const { getExternalUserId, checkSubscribed } = useOneSignal();
  const { user } = useAuthStore();

  useEffect(() => {
    const checkStatus = async () => {
      const id = await getExternalUserId();
      const subscribed = await checkSubscribed();
      setExternalId(id);
      setIsSubscribed(subscribed);
    };
    checkStatus();
  }, [user?.id]);

  const handleTestNotification = () => {
    Alert.alert(
      'OneSignal Status',
      `User ID: ${user?.id}\nExternal ID: ${externalId}\nSubscribed: ${isSubscribed}`,
      [{ text: 'OK' }]
    );
  };

  const handleSetupOneSignal = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'Please log in first');
      return;
    }

    try {
      Alert.alert('Setting up OneSignal...', 'This will request notification permission');
      
      const oneSignalService = OneSignalService.getInstance();
      
      const permissionGranted = await oneSignalService.requestPermission();
      console.log('Permission result:', permissionGranted);
      
      if (permissionGranted) {
        await oneSignalService.setExternalUserId(user.id);
        Alert.alert('Success', 'OneSignal setup complete!');
        // Refresh status
        const id = await getExternalUserId();
        const subscribed = await checkSubscribed();
        setExternalId(id);
        setIsSubscribed(subscribed);
      } else {
        Alert.alert('Permission Denied', 'OneSignal permission was denied. You may need to enable notifications in device settings.');
      }
    } catch (error) {
      console.error('OneSignal setup error:', error);
      Alert.alert('Error', `OneSignal setup failed: ${error}`);
    }
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Please log in to see OneSignal status</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>OneSignal Debug</Text>
      <Text style={styles.text}>User ID: {user.id}</Text>
      <Text style={styles.text}>External ID: {externalId?.substring(0, 50) || 'Not set'}</Text>
      <Text style={styles.text}>Subscribed: {isSubscribed ? 'Yes' : 'No'}</Text>
      <TouchableOpacity style={styles.button} onPress={handleTestNotification}>
        <Text style={styles.buttonText}>Show Status</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={[styles.button, styles.setupButton]} onPress={handleSetupOneSignal}>
        <Text style={styles.buttonText}>Setup OneSignal</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f5f5f5',
    margin: 10,
    borderRadius: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  text: {
    fontSize: 14,
    marginBottom: 5,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  setupButton: {
    backgroundColor: '#34C759',
    marginTop: 5,
  },
});
