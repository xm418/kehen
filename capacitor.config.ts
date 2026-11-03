import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kedu.app',
  appName: '刻痕',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    mediaPlaybackRequiresUserGesture: false
  }
};

export default config;
