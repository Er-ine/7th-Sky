import { createServer } from 'vite';
import { server } from './server.js';

const apiReady = new Promise((resolve, reject) => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
  server.once('error', reject);
});
const vite = await createServer({ server: { host: '127.0.0.1' } });
await apiReady;
await vite.listen();

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  try {
    await vite.close();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  } catch (error) {
    console.error('Could not shut down the development servers cleanly.', error);
    process.exitCode = 1;
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    shutdown().finally(() => process.exit(process.exitCode || 0));
  });
}
