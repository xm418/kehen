import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kedu.app',
  appName: '刻痕',
  webDir: 'dist',
  android: {
    // 页面源是 https://localhost，请求 http:// 的自建服务器需要允许混合内容
    allowMixedContent: true,
    // 单词卡片自动发音没有用户手势，需允许自动播放
    mediaPlaybackRequiresUserGesture: false
  }
};

export default config;
