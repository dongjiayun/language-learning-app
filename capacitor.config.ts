import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.doulingo.assist',
  appName: 'LanguageLearner',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
