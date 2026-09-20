import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.iyanjupay.app',
  appName: 'IyanjuPay',
  webDir: 'dist',

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#f7f8fc',
      showSpinner: false
    }
  }
};

export default config;
