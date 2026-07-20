type RuntimePlatform = {
  OS: string;
  Version: string | number;
};

function isNodeTestRuntime(): boolean {
  return (
    typeof process !== 'undefined' &&
    !!process.versions?.node &&
    typeof navigator === 'undefined'
  );
}

function detectFallbackPlatform(): RuntimePlatform {
  if ((globalThis as { window?: unknown }).window !== undefined) {
    return { OS: 'web', Version: 'test' };
  }

  return { OS: 'node', Version: process?.versions?.node ?? 'test' };
}

export function getRuntimePlatform(): RuntimePlatform {
  if (isNodeTestRuntime()) {
    return detectFallbackPlatform();
  }

  try {
    // Delay loading react-native so Node-based tests never parse its source.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native').Platform as RuntimePlatform;
  } catch {
    return detectFallbackPlatform();
  }
}
