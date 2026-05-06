import { useEffect, useState } from 'react';
import OneSignalService from '../services/oneSignalService';

export const useOneSignal = () => {
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    const oneSignalService = OneSignalService.getInstance();
    
    // Check subscription status
    const checkSubscriptionStatus = async () => {
      try {
        const subscribed = await oneSignalService.isSubscribed();
        const deviceState = await oneSignalService.getDeviceState();
        
        setIsSubscribed(subscribed);
        setDeviceId(deviceState);
      } catch (error) {
        console.error('Error checking OneSignal subscription status:', error);
      }
    };

    checkSubscriptionStatus();
  }, []);

  const sendTag = async (key: string, value: string) => {
    const oneSignalService = OneSignalService.getInstance();
    await oneSignalService.sendTag(key, value);
  };

  const sendTags = async (tags: Record<string, string>) => {
    const oneSignalService = OneSignalService.getInstance();
    await oneSignalService.sendTags(tags);
  };

  const removeTag = async (key: string) => {
    const oneSignalService = OneSignalService.getInstance();
    await oneSignalService.removeTag(key);
  };

  const setExternalUserId = async (userId: string) => {
    const oneSignalService = OneSignalService.getInstance();
    await oneSignalService.setExternalUserId(userId);
  };

  const removeExternalUserId = async () => {
    const oneSignalService = OneSignalService.getInstance();
    await oneSignalService.removeExternalUserId();
  };

  const getExternalUserId = async () => {
    const oneSignalService = OneSignalService.getInstance();
    return await oneSignalService.getExternalUserId();
  };

  const requestPermission = async () => {
    const oneSignalService = OneSignalService.getInstance();
    return await oneSignalService.requestPermission();
  };

  const initialize = () => {
    const oneSignalService = OneSignalService.getInstance();
    oneSignalService.initialize();
  };

  const checkSubscribed = async () => {
    const oneSignalService = OneSignalService.getInstance();
    return await oneSignalService.isSubscribed();
  };

  return {
    isSubscribed,
    deviceId,
    sendTag,
    sendTags,
    removeTag,
    setExternalUserId,
    removeExternalUserId,
    getExternalUserId,
    requestPermission,
    initialize,
    checkSubscribed,
  };
};
