import { Capacitor } from '@capacitor/core';
import {
  AndroidBiometryStrength,
  BiometricAuth,
  BiometryError,
  BiometryErrorType,
} from '@aparajita/capacitor-biometric-auth';
import {
  KeychainAccess,
  SecureStorage,
} from '@aparajita/capacitor-secure-storage';

const CREDENTIAL_KEY = 'marwaazpn-biometric-login';

export type MobileLoginCredentials = {
  username: string;
  password: string;
};

function isCredential(value: unknown): value is MobileLoginCredentials {
  if (!value || typeof value !== 'object') return false;
  const credential = value as Record<string, unknown>;
  return typeof credential.username === 'string' && typeof credential.password === 'string';
}

export function isNativeMobileApp() {
  return Capacitor.isNativePlatform();
}

export async function isBiometricLoginAvailable() {
  if (!isNativeMobileApp()) return false;
  const result = await BiometricAuth.checkBiometry();
  return result.isAvailable && result.strongBiometryIsAvailable;
}

export async function hasBiometricCredentials() {
  if (!isNativeMobileApp()) return false;
  return isCredential(await SecureStorage.get(CREDENTIAL_KEY));
}

async function requestBiometricAuthentication(reason: string) {
  await BiometricAuth.authenticate({
    reason,
    cancelTitle: 'Ka noqo',
    allowDeviceCredential: false,
    iosFallbackTitle: '',
    androidTitle: 'Fingerprint Login',
    androidSubtitle: 'Isticmaal fingerprint-kaaga si aad u gasho',
    androidConfirmationRequired: false,
    androidBiometryStrength: AndroidBiometryStrength.strong,
  });
}

export async function enableBiometricLogin(credentials: MobileLoginCredentials) {
  if (!isNativeMobileApp()) return;
  await requestBiometricAuthentication('Xaqiiji fingerprint-ka si login-ka loo xafido');
  await SecureStorage.set(
    CREDENTIAL_KEY,
    credentials,
    true,
    false,
    KeychainAccess.whenPasscodeSetThisDeviceOnly,
  );
}

export async function getBiometricLoginCredentials() {
  if (!isNativeMobileApp()) return null;
  await requestBiometricAuthentication('Isticmaal fingerprint-ka si aad u gasho Marwaazpn');
  const credentials = await SecureStorage.get(CREDENTIAL_KEY);
  return isCredential(credentials) ? credentials : null;
}

export async function removeBiometricCredentials() {
  if (!isNativeMobileApp()) return;
  await SecureStorage.remove(CREDENTIAL_KEY);
}

export function wasBiometricPromptCancelled(error: unknown) {
  return (
    error instanceof BiometryError &&
    [
      BiometryErrorType.appCancel,
      BiometryErrorType.systemCancel,
      BiometryErrorType.userCancel,
      BiometryErrorType.userFallback,
    ].includes(error.code)
  );
}
