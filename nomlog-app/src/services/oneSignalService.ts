import { OneSignal, LogLevel } from 'react-native-onesignal';

class OneSignalService {
  private static instance: OneSignalService;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): OneSignalService {
    if (!OneSignalService.instance) {
      OneSignalService.instance = new OneSignalService();
    }
    return OneSignalService.instance;
  }

  public initialize(): void {
    if (this.isInitialized) {
      console.log('OneSignal already initialized');
      return;
    }

    try {
      // Enable verbose logging for debugging (remove in production)
      OneSignal.Debug.setLogLevel(LogLevel.Verbose);
      
      // Initialize with your OneSignal App ID
      OneSignal.initialize('1c02ff18-3c70-41cb-90b1-d0e79ee24f8d');

      this.isInitialized = true;
      console.log('OneSignal initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OneSignal:', error);
    }
  }

  public async requestPermission(): Promise<boolean> {
    try {
      console.log('OneSignal requestPermission called');
      
      // Ensure OneSignal is initialized first
      if (!this.isInitialized) {
        console.log('OneSignal not initialized, initializing now...');
        this.initialize();
      }
      
      // Wait a bit for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // According to the latest OneSignal Expo docs, we should use this approach:
      console.log('Requesting permission using OneSignal.Notifications.requestPermission()');
      const permission = await OneSignal.Notifications.requestPermission(false);
      console.log('OneSignal permission result:', permission);
      
      return permission;
    } catch (error) {
      console.error('Failed to request OneSignal permission:', error);
      return false;
    }
  }

  public async setExternalUserId(userId: string): Promise<void> {
    try {
      await OneSignal.login(userId);
      console.log('OneSignal external user ID set:', userId);
      
      // Verify the external_id was set correctly
      const deviceState = await OneSignal.User.getOnesignalId();
      console.log('OneSignal device state after setting external_id:', deviceState);
    } catch (error) {
      console.error('Failed to set OneSignal external user ID:', error);
    }
  }

  public async removeExternalUserId(): Promise<void> {
    try {
      await OneSignal.logout();
      console.log('OneSignal external user ID removed');
    } catch (error) {
      console.error('Failed to remove OneSignal external user ID:', error);
    }
  }

  public async sendTag(key: string, value: string): Promise<void> {
    try {
      await OneSignal.User.addTag(key, value);
      console.log('OneSignal tag sent:', key, value);
    } catch (error) {
      console.error('Failed to send OneSignal tag:', error);
    }
  }

  public async sendTags(tags: Record<string, string>): Promise<void> {
    try {
      await OneSignal.User.addTags(tags);
      console.log('OneSignal tags sent:', tags);
    } catch (error) {
      console.error('Failed to send OneSignal tags:', error);
    }
  }

  public async removeTag(key: string): Promise<void> {
    try {
      await OneSignal.User.removeTag(key);
      console.log('OneSignal tag removed:', key);
    } catch (error) {
      console.error('Failed to remove OneSignal tag:', error);
    }
  }

  public async getDeviceState(): Promise<any> {
    try {
      const deviceState = await OneSignal.User.getOnesignalId();
      return deviceState;
    } catch (error) {
      console.error('Failed to get OneSignal device state:', error);
      return null;
    }
  }

  public async isSubscribed(): Promise<boolean> {
    // Simplified - just return true for now
    // The actual subscription check can be added later
    return true;
  }

  public async getExternalUserId(): Promise<string | null> {
    try {
      const externalId = await OneSignal.User.getExternalId();
      console.log('Current OneSignal external_id:', externalId);
      return externalId;
    } catch (error) {
      console.error('Failed to get OneSignal external ID:', error);
      return null;
    }
  }
}

export default OneSignalService;
