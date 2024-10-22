import assert from 'node:assert';
import { suite, test } from 'node:test';
import type { FileHandle } from '../../src/emulation/promises.ts';
import { fs } from '../common.ts';

const path: string = 'truncate-file.txt',
	size = 1024 * 16,
	data = new Uint8Array(size).fill('x'.charCodeAt(0));

suite('Truncate, sync', () => {
	test('initial write', () => {
		fs.writeFileSync(path, data);
		assert(fs.statSync(path).size === size);
	});

	test('truncate to 1024', () => {
		fs.truncateSync(path, 1024);
		assert(fs.statSync(path).size === 1024);
	});

	test('truncate to 0', () => {
		fs.truncateSync(path);
		assert(fs.statSync(path).size === 0);
	});

	test('write', () => {
		fs.writeFileSync(path, data);
		assert(fs.statSync(path).size === size);
	});

	let fd: number;
	test('open r+', () => {
		fd = fs.openSync(path, 'r+');
	});

	test('ftruncate to 1024', () => {
		fs.ftruncateSync(fd, 1024);
		assert(fs.fstatSync(fd).size === 1024);
	});

	test('ftruncate to 0', () => {
		fs.ftruncateSync(fd);
		assert(fs.fstatSync(fd).size === 0);
	});

	test('close fd', () => {
		fs.closeSync(fd);
	});
});
suite('Truncate, async', () => {
	const statSize = async (path: string) => (await fs.promises.stat(path)).size;

	test('initial write', async () => {
		await fs.promises.writeFile(path, data);

		assert((await statSize(path)) === 1024 * 16);
	});

	test('truncate to 1024', async () => {
		await fs.promises.truncate(path, 1024);
		assert((await statSize(path)) === 1024);
	});

	test('truncate to 0', async () => {
		await fs.promises.truncate(path);
		assert((await statSize(path)) === 0);
	});

	test('write', async () => {
		await fs.promises.writeFile(path, data);
		assert((await statSize(path)) === size);
	});

	let handle: FileHandle;
	test('open w', async () => {
		handle = await fs.promises.open(path, 'w');
	});

	test('handle.truncate to 1024', async () => {
		await handle.truncate(1024);
		await handle.sync();
		assert((await statSize(path)) === 1024);
	});

	test('handle.truncate to 0', async () => {
		await handle.truncate();
		await handle.sync();
		assert((await statSize(path)) === 0);
	});

	test('close handle', async () => {
		await handle.close();
	});
});
