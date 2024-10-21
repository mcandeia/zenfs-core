import assert from 'node:assert';
import { dirname } from 'node:path';

import { fileURLToPath } from 'node:url';
import type { Worker } from 'node:worker_threads';
import { Port } from '../../src/backends/port/fs.ts';
import { configureSingle, fs } from '../../src/index.ts';
import { createTSWorker } from '../common.ts';

const dir = dirname(fileURLToPath(import.meta.url));

const port: Worker = createTSWorker(dir + '/config.worker.ts');

const content = 'FS is in a port';

Deno.test('Configuration', async () => {
	await configureSingle({ backend: Port, port, timeout: 500 });
});

Deno.test('Write', async () => {
	await fs.promises.writeFile('/test', content);
});

Deno.test('Read', async () => {
	assert((await fs.promises.readFile('/test', 'utf8')) === content);
});

await port?.terminate();
port.unref();
