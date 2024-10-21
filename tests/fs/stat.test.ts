import assert from 'node:assert';

import { Stats } from '../../src/stats.ts';
import { fs } from '../common.ts';

const existing_file = 'x.txt';

Deno.test('stat empty path', () => {
	assert.rejects(fs.promises.stat(''));
});

Deno.test('stat directory', async () => {
	const stats = await fs.promises.stat('/');
	assert(stats instanceof Stats);
});

Deno.test('lstat directory', async () => {
	const stats = await fs.promises.lstat('/');
	assert(stats instanceof Stats);
});

Deno.test('FileHandle.stat', async () => {
	const handle = await fs.promises.open(existing_file, 'r');
	const stats = await handle.stat();
	assert(stats instanceof Stats);
	await handle.close();
});

Deno.test('fstatSync file', () => {
	const fd = fs.openSync(existing_file, 'r');
	const stats = fs.fstatSync(fd);
	assert(stats instanceof Stats);
	fs.close(fd);
});

Deno.test('stat file', async () => {
	const stats = await fs.promises.stat(existing_file);
	assert(!stats.isDirectory());
	assert(stats.isFile());
	assert(!stats.isSocket());
	assert(!stats.isBlockDevice());
	assert(!stats.isCharacterDevice());
	assert(!stats.isFIFO());
	assert(!stats.isSymbolicLink());
	assert(stats instanceof Stats);
});
