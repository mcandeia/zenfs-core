import assert from 'node:assert';

import { MessageChannel } from 'node:worker_threads';
import { attachFS, Port } from '../../src/backends/port/fs.ts';
import type { StoreFS } from '../../src/index.ts';
import { configureSingle, fs, InMemory, type InMemoryStore, resolveMountConfig } from '../../src/index.ts';

const { port1, port2 } = new MessageChannel(),
	content = 'FS is in a port';
let tmpfs: StoreFS<InMemoryStore>;

Deno.test('configuration', async () => {
	tmpfs = await resolveMountConfig({ backend: InMemory, name: 'tmp' });
	attachFS(port2, tmpfs);
	await configureSingle({ backend: Port, port: port1, disableAsyncCache: true, timeout: 250 });
});

Deno.test('write', async () => {
	await fs.promises.writeFile('/test', content);
});

Deno.test('remote content', () => {
	fs.mount('/tmp', tmpfs);
	assert(fs.readFileSync('/tmp/test', 'utf8') == content);
	fs.umount('/tmp');
});

Deno.test('read', async () => {
	assert((await fs.promises.readFile('/test', 'utf8')) === content);
});

Deno.test('readFileSync should throw', () => {
	assert.throws(() => fs.readFileSync('/test', 'utf8'), { code: 'ENOTSUP' });
});

port1.unref();
port2.unref();
