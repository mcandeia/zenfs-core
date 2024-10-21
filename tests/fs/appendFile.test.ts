import assert from 'node:assert';

import { fs } from '../common.ts';

const content = 'Sample content',
	original = 'ABCD';

Deno.test('create an empty file and add content', async () => {
	const filename = 'append.txt';
	await fs.promises.appendFile(filename, content);
	const data = await fs.promises.readFile(filename, 'utf8');
	assert(data == content);
});

Deno.test('append data to a non-empty file', async () => {
	const filename = 'append2.txt';

	await fs.promises.writeFile(filename, original);
	await fs.promises.appendFile(filename, content);
	const data = await fs.promises.readFile(filename, 'utf8');
	assert(data == original + content);
});

Deno.test('append a buffer to the file', async () => {
	const filename = 'append3.txt';

	await fs.promises.writeFile(filename, original);
	await fs.promises.appendFile(filename, content);
	const data = await fs.promises.readFile(filename, 'utf8');
	assert(data == original + content);
});
