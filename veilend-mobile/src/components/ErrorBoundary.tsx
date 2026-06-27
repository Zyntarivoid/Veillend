import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { reportError, ErrorReport } from '../utils/errorReporting';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  component?: string;
}

interface State {
  hasError: boolean;
  errorReport: ErrorReport | null;
}

/**
 * React Error Boundary that catches rendering errors in the child tree,
 * reports them with structured crash instrumentation, and shows a fallback UI.
 *
 * Usage:
 *   <ErrorBoundary component="DashboardScreen">
 *     <DashboardScreen />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorReport: null };
  }

  static getDerivedStateFromError(_error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const report = reportError(error, {
      severity: 'high',
      component: this.props.component || errorInfo.componentStack?.split('\n')[1]?.trim() || 'Unknown',
      metadata: {
        componentStack: errorInfo.componentStack,
      },
    });

    // The report is a Promise — store it after it resolves
    report.then((r) => {
      this.setState({ errorReport: r });
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorReport: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            The app encountered an unexpected error. This has been reported
            automatically.
          </Text>
          {this.state.errorReport && (
            <Text style={styles.errorId}>
              Error ID: {this.state.errorReport.id}
            </Text>
          )}
          <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#A1A1A1',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  errorId: {
    fontSize: 12,
    color: '#555',
    marginBottom: 24,
    fontFamily: 'monospace',
  },
  retryButton: {
    backgroundColor: '#09cc71',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  retryText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default ErrorBoundary;
