/**
 * useResponsive
 *
 * Returns responsive helpers derived from the current window dimensions.
 * Re-renders when the device rotates or the window size changes (e.g. on
 * foldables or when running in a split-screen context).
 *
 * Usage:
 *   const { isSmallScreen, width } = useResponsive();
 */
import { useWindowDimensions } from 'react-native';

export type ResponsiveValues = {
  /** Current window width in dp */
  width: number;
  /** Current window height in dp */
  height: number;
  /** True when the screen is narrower than 380 dp */
  isSmallScreen: boolean;
};

export function useResponsive(): ResponsiveValues {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isSmallScreen: width < 380,
  };
}
