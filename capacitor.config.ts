
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.e6a60d97425a426db134cbc745dc5c2e',
  appName: 'iyanjupay',
  webDir: 'dist',
  server: {
    url: 'https://e6a60d97-425a-426d-b134-cbc745dc5c2e.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#16a34a',
      showSpinner: false
    }
  }
};

export default config;
