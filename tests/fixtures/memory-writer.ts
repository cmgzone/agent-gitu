import { MemoryStore } from '../../src/memory/memory-store.js';
import { withMemoryFileLock } from '../../src/memory/file-lock.js';

const file = process.argv[2]!;
const worker = process.argv[3]!;
process.send?.('ready');
process.once('message', async () => {
  for (let i = 0; i < 10; i++) {
    await withMemoryFileLock(file, async () => {
      const store = new MemoryStore(file);
      store.add({ type: 'observation', scope: 'project', claim: `Worker ${worker} checkout finding ${i}` });
      store.add({ type: 'observation', scope: 'project', claim: 'Shared checkout finding' });
      store.retrieve('checkout', 'project', 100);
    });
  }
  process.disconnect?.();
});

