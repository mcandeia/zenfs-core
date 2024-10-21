import assert from 'node:assert';
import { suite, test } from 'node:test';
import { fs } from '../common.ts';
import { Buffer } from 'node:buffer';

const filepath: string = 'x.txt';
const expected: string = 'xyz\n';

suite('read', () => {
	test('read file asynchronously', async () => {
		const handle = await fs.promises.open(filepath, 'r');
		const { bytesRead, buffer } = await handle.read(Buffer.alloc(expected.length), 0, expected.length, 0);

		assert(bytesRead == expected.length);
		assert(buffer.toString() == expected);
	});

	test('read file synchronously', () => {
		const fd = fs.openSync(filepath, 'r');
		const buffer = Buffer.alloc(expected.length);
		const bytesRead = fs.readSync(fd, buffer, 0, expected.length, 0);

		assert(bytesRead == expected.length);
		assert(buffer.toString() == expected);
	});
});

suite('read binary', () => {
	test('Read a file and check its binary bytes (asynchronous)', async () => {
		const buff = await fs.promises.readFile('elipses.txt');
		assert(((buff[1] << 8) | buff[0]) === 32994);
	});

	test('Read a file and check its binary bytes (synchronous)', () => {
		const buff = fs.readFileSync('elipses.txt');
		assert(((buff[1] << 8) | buff[0]) === 32994);
	});
});

suite('read buffer', () => {
	const bufferAsync = Buffer.alloc(expected.length);
	const bufferSync = Buffer.alloc(expected.length);

	test('read file asynchronously', async () => {
		const handle = await fs.promises.open(filepath, 'r');
		const { bytesRead } = await handle.read(bufferAsync, 0, expected.length, 0);

		assert(bytesRead === expected.length);
		assert(bufferAsync.toString() === expected);
	});

	test('read file synchronously', () => {
		const fd = fs.openSync(filepath, 'r');
		const bytesRead = fs.readSync(fd, bufferSync, 0, expected.length, 0);

		assert(bufferSync.toString() === expected);
		assert(bytesRead === expected.length);
	});

	test('read file synchronously to non-zero offset', () => {
		const fd = fs.openSync(filepath, 'r');
		const buffer = Buffer.alloc(expected.length + 10);
		const bytesRead = fs.readSync(fd, buffer, 10, expected.length, 0);

		assert(buffer.subarray(10, buffer.length).toString() === expected);
		assert(bytesRead === expected.length);
	});
});
