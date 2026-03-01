import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

global.Buffer = Buffer;

// Polyfill for UserAgent
if (typeof window === 'undefined') {
  // @ts-ignore
  global.window = {};
}
if (!global.window.navigator) {
  // @ts-ignore
  global.window.navigator = {};
}
if (!global.window.navigator.userAgent) {
  global.window.navigator.userAgent = 'ReactNative';
}
if (!global.navigator) {
  // @ts-ignore
  global.navigator = global.window.navigator;
}

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
