import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';

/**
 * Placeholder cards rendered while backend data is loading.
 * Uses the existing ActivityIndicator treatment (dark card, #A855F7 spinner)
 * so screens never flash empty lists before data arrives.
 */
export function SkeletonCard({ height = 96 }: { height?: number }) {
  return (
    <View style={[styles.card, { height }]}>
      <ActivityIndicator color="#A855F7" />
    </View>
  );
}

export function ListSkeleton({
  count = 3,
  height = 96,
}: {
  count?: number;
  height?: number;
}) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 16,
  },
  card: {
    backgroundColor: '#121212',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
