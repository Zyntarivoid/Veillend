import { Platform, ToastAndroid, Alert } from 'react-native';

type ToastOpts = { type?: string; text1?: string; text2?: string };

const show = (opts: ToastOpts) => {
  const text1 = opts?.text1 || '';
  const text2 = opts?.text2 || '';
  const message = text1 + (text2 ? '\n' + text2 : '');
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    // iOS fallback: simple alert-style notification
    Alert.alert(text1 || 'Notice', text2 || undefined);
  }
};

export const showSuccess = (text1: string, text2?: string) => show({ type: 'success', text1, text2 });
export const showError = (text1: string, text2?: string) => show({ type: 'error', text1, text2 });
export const showInfo = (text1: string, text2?: string) => show({ type: 'info', text1, text2 });

// Minimal React component placeholder so App.tsx can mount <Toast /> safely.
import React from 'react';
const ToastComponent: React.FC = () => null;
(ToastComponent as any).show = show;

export default ToastComponent as unknown as {
  (props: any): JSX.Element;
  show: (opts: ToastOpts) => void;
};
