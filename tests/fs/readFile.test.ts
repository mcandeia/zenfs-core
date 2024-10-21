import assert from 'node:assert';

import { fs } from '../common.ts';

Deno.test('Cannot read a file with an invalid encoding', () => {
	assert.throws(() => fs.readFileSync('a.js', 'wrongencoding' as NodeJS.BufferEncoding));
});

Deno.test('Reading past the end of a file should not be an error', async () => {
	const handle = await fs.promises.open('a.js', 'r');
	const { bytesRead } = await handle.read(new Uint8Array(10), 0, 10, 10000);
	assert.strictEqual(bytesRead, 0);
});

const dir = 'test-readfile-unlink';
const file = 'test-readfile-unlink/test.bin';
const data = new Uint8Array(512).fill(42);

Deno.test('create directory and write file', async () => {
	await fs.promises.mkdir(dir);
	await fs.promises.writeFile(file, data);
});

Deno.test('read file and verify its content', async () => {
	const read: Uint8Array = await fs.promises.readFile(file);
	assert.equal(read.length, data.length);
	assert.equal(read[0], 42);
});

Deno.test('unlink file and remove directory', async () => {
	await fs.promises.unlink(file);
	await fs.promises.rmdir(dir);
});

const fn = 'empty.txt';

Deno.test('read file asynchronously', async () => {
	const data: Uint8Array = await fs.promises.readFile(fn);
	assert(data != undefined);
});

Deno.test('read file with utf-8 encoding asynchronously', async () => {
	const data: string = await fs.promises.readFile(fn, 'utf8');
	assert.strictEqual(data, '');
});

Deno.test('read file synchronously', () => {
	const data: Uint8Array = fs.readFileSync(fn);
	assert(data != undefined);
});

Deno.test('read file with utf-8 encoding synchronously', () => {
	const data: string = fs.readFileSync(fn, 'utf8');
	assert.strictEqual(data, '');
});

Deno.test('read file synchronously and verify the content', () => {
	const content = fs.readFileSync('elipses.txt', 'utf8');

	for (let i = 0; i < content.length; i++) {
		assert(content[i] === '…');
	}

	assert(content.length === 10000);
});
