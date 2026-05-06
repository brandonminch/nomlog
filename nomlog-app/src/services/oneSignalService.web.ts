/**
 * Push notifications are not used on web; keep the same API as native.
 */
class OneSignalService {
  private static instance: OneSignalService;

  private constructor() {}

  public static getInstance(): OneSignalService {
    if (!OneSignalService.instance) {
      OneSignalService.instance = new OneSignalService();
    }
    return OneSignalService.instance;
  }

  public initialize(): void {}

  public async requestPermission(): Promise<boolean> {
    return false;
  }

  public async setExternalUserId(_userId: string): Promise<void> {}

  public async removeExternalUserId(): Promise<void> {}

  public async sendTag(_key: string, _value: string): Promise<void> {}

  public async sendTags(_tags: Record<string, string>): Promise<void> {}

  public async removeTag(_key: string): Promise<void> {}

  public async getDeviceState(): Promise<null> {
    return null;
  }

  public async isSubscribed(): Promise<boolean> {
    return false;
  }

  public async getExternalUserId(): Promise<string | null> {
    return null;
  }
}

export default OneSignalService;
