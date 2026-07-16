# PR Documentation

## Issue

**Replace hardcoded mobile API hosts with env-driven runtime configuration** (#199)

## Summary

This PR introduces environment-driven runtime configuration for the mobile app API base URL, removing hardcoded localhost assumptions and enabling contributors to target the correct backend without code changes.

## What this PR addresses

- Hardcoded mobile API host values that only work on local emulators or a specific development setup
- Runtime configuration for both development and physical device scenarios
- Clear validation and failure behavior when configuration is invalid or missing

## Acceptance Criteria

- API base URLs are sourced from environment-aware configuration
- Development and device setup behavior is documented
- Invalid configuration fails clearly and predictably

## Expected changes

- A mobile runtime config layer that reads the API base URL from environment variables or platform-specific runtime settings
- Support for distinguishing between emulator/local host and device-hosted backend endpoints
- Documentation updates in `veilend-mobile/README.md` or related onboarding docs describing how to configure the mobile app at runtime
- Validation logic that surfaces misconfiguration during startup instead of silently failing

## Validation

- Verify the app uses the configured API host at runtime instead of hardcoded values
- Confirm the mobile app can connect to backend services on both emulator and device environments when configured correctly
- Check that invalid or missing configuration produces a clear error message and prevents ambiguous failures

## Notes

The mobile API host configuration change aligns with the current mobile architecture goal of making VeilLend easy to run in contributor environments while preserving Stellar-native privacy-first UX.
