export default () => ({
  pollIntervalMs: parseInt(
    process.env.STELLAR_INDEXER_POLL_INTERVAL_MS || '5000',
    10,
  ),
});
