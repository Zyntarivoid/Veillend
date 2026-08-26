---
kind: external_dependency
name: Expo-based React Native mobile application runtime
slug: expo-react-native
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

### Expo / React Native
- Role: Cross-platform mobile client (iOS/Android/Web) for deposit, borrow, repay flows and privacy-mode dashboard.
- Framework behavior: Uses Expo Dev Client (`expo-dev-client`) for local dev and OTA updates; `eas.json` controls build profiles; `expo-secure-store` guards sensitive keys on device.
- Verify exact Expo/EAS commands against current Expo docs.