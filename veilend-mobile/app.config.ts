import 'dotenv/config';

const requiredEnv = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable ${key}. Copy veilend-mobile/.env.example to veilend-mobile/.env and set ${key}.`
    );
  }
  return value;
};

export default ({ config }: any) => ({
  ...config,
  extra: {
    ...config.extra,
    API_URL_WEB: requiredEnv('API_URL_WEB'),
    API_URL_MOBILE: requiredEnv('API_URL_MOBILE'),
  },
});
