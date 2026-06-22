import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type FormValidationMessageProps = {
  error?: string | null;
  warning?: string | null;
};

export default function FormValidationMessage({ error, warning }: FormValidationMessageProps) {
  const message = error ?? warning;
  if (!message) return null;

  const isError = Boolean(error);

  return (
    <View style={[styles.container, isError ? styles.errorContainer : styles.warningContainer]}>
      <Ionicons
        name={isError ? 'alert-circle-outline' : 'information-circle-outline'}
        size={18}
        color={isError ? '#FF6363' : '#FBBF24'}
      />
      <Text style={[styles.message, isError ? styles.errorText : styles.warningText]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 99, 99, 0.12)',
    borderColor: 'rgba(255, 99, 99, 0.3)',
  },
  warningContainer: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  message: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: '#FFB4B4',
  },
  warningText: {
    color: '#FDE68A',
  },
});
