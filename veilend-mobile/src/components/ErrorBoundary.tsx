import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { reportError } from '../utils/errorReporting';

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    reportError(error, {
      metadata: {
        componentStack: errorInfo.componentStack,
      },
      severity: 'fatal',
      source: 'react-error-boundary',
    });
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="warning-outline" size={32} color="#FF6363" />
        </View>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          The app captured a sanitized crash report. Try again or reconnect your wallet if the issue continues.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={this.reset}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 99, 99, 0.12)',
    borderColor: 'rgba(255, 99, 99, 0.3)',
    borderRadius: 28,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    marginBottom: 18,
    width: 56,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    color: '#A1A1A1',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 22,
    maxWidth: 320,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#A855F7',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
