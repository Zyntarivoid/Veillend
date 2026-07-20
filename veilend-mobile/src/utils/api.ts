import axios from 'axios';
import { useStore } from '../store/store';
import { reportError } from './errorReporting';
import { getRuntimePlatform } from './runtimePlatform';

const platform = getRuntimePlatform();

const API_URL = platform.OS === 'web' 
  ? 'http://localhost:3000' 
  : 'http://10.0.2.2:3000';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = useStore.getState().authToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: capture API errors with structured reporting
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Build a structured error report for API failures
    const status = error?.response?.status;
    const url = error?.config?.url;
    const method = error?.config?.method?.toUpperCase();

    // Determine severity based on HTTP status
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    if (status === 401) severity = 'critical';
    else if (status === 403) severity = 'high';
    else if (status >= 500) severity = 'high';
    else if (!status) severity = 'high'; // Network error (no response)

    // Report to crash instrumentation (PII is auto-scrubbed)
    reportError(error, {
      severity,
      component: 'ApiClient',
      metadata: {
        url,
        method,
        status,
        hasResponse: !!error?.response,
      },
    });

    return Promise.reject(error);
  }
);

export default api;
