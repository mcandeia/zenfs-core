import assert from 'node:assert';

import { fs } from '../common.ts';

const f = 'x.txt';

Deno.test('return true for an existing file', async () => {
	const exists = await fs.promises.exists(f);
	assert(exists);
});

Deno.test('return false for a non-existent file', async () => {
	const exists = await fs.promises.exists(f + '-NO');
	assert(!exists);
});

Deno.test('have sync methods that behave the same', () => {
	assert(fs.existsSync(f));
	assert(!fs.existsSync(f + '-NO'));
});
