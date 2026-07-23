import Constants from 'expo-constants';
import { Platform } from 'react-native';

const CONFIG_KEYS = {
  web: 'API_URL_WEB',
  default: 'API_URL_MOBILE',
};

function getRawConfigValue(key: string): string | undefined {
  const extraConfig = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const extraValue = extraConfig[key];

  if (typeof extraValue === 'string' && extraValue.trim()) {
    return extraValue.trim();
  }

  const envValue = process.env[key];
  if (typeof envValue === 'string' && envValue.trim()) {
    return envValue.trim();
  }

  return undefined;
}

function validateUrl(url: string, key: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error();
    }
    return url;
  } catch {
    throw new Error(`Invalid ${key} value: ${url}. Use a valid http:// or https:// URL.`);
  }
}

export function getApiBaseUrl(): string {
  const key = Platform.OS === 'web' ? CONFIG_KEYS.web : CONFIG_KEYS.default;
  const apiUrl = getRawConfigValue(key);

  if (!apiUrl) {
    throw new Error(
      `${key} is not configured. Set ${key} in veilend-mobile/.env or via your EAS/build environment variables.`
    );
  }

  return validateUrl(apiUrl, key);
}
