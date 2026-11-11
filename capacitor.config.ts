import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.iyanjupay.app',
  appName: 'IyanjuPay',
  webDir: 'dist',

  plugins: {
    SplashScreen: {
      launchShowDuration: 650,
      launchAutoHide: true,
      launchFadeOutDuration: 150,
      backgroundColor: '#080638',
      showSpinner: false
    }
  }
};

export default config;
