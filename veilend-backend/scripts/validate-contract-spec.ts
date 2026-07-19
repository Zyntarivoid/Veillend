import * as fs from 'fs';
import * as path from 'path';

// This script validates that the backend indexer service handles
// the contract shape appropriately without relying on external contract spec files.
// It statically analyzes the indexer to ensure drift hasn't removed required event handlers.

const REQUIRED_EVENTS = ['deposit', 'borrow', 'repay', 'withdraw', 'asset_configured'];

function validateContractShape() {
  const indexerPath = path.join(__dirname, '..', 'src', 'indexer', 'indexer.service.ts');
  
  if (!fs.existsSync(indexerPath)) {
    console.error(`❌ Indexer service not found at ${indexerPath}`);
    process.exit(1);
  }

  const indexerContent = fs.readFileSync(indexerPath, 'utf8');
  let missingEvents: string[] = [];

  for (const event of REQUIRED_EVENTS) {
    // Check if the event string exists in the indexer source
    if (!indexerContent.includes(`'${event}'`) && !indexerContent.includes(`"${event}"`)) {
      missingEvents.push(event);
    }
  }

  if (missingEvents.length > 0) {
    console.error(`❌ Contract Shape Drift Detected!`);
    console.error(`The following contract events are missing handlers in the indexer: ${missingEvents.join(', ')}`);
    process.exit(1);
  }

  console.log(`✅ Contract shape validation passed. Indexer handles all required events: ${REQUIRED_EVENTS.join(', ')}`);
}

validateContractShape();
