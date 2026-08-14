import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.marwaazpn.app',
  appName: 'Marwaazpn App',
  webDir: 'capacitor-web',
  loggingBehavior: 'none',
  backgroundColor: '#ffffff',
  server: {
    url: 'https://app.marwaazpn.com',
    cleartext: false,
  },
  android: {
    backgroundColor: '#ffffff',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
