import assert from 'node:assert';

import { ErrnoError } from '../../src/error.ts';
import { fs } from '../common.ts';

const existingFile = '/exit.js';

async function expectError(fn: (...args: any[]) => unknown, path: string, ...args: any[]) {
	let error: ErrnoError | undefined;
	try {
		await fn(path, ...args);
	} catch (err: any) {
		assert(err instanceof ErrnoError);
		error = err;
	}
	assert(error != undefined);
	assert(error.path === path);
	assert(error.message.includes(path));
}

const path = '/non-existent';

fs.promises.stat(path).catch((error: ErrnoError) => {
	assert(error.toString() === error.message);
	assert(error.bufferSize() === 4 + JSON.stringify(error.toJSON()).length);
});

Deno.test('stat', () => expectError(fs.promises.stat, path));
Deno.test('mkdir', () => expectError(fs.promises.mkdir, existingFile, 0o666));
Deno.test('rmdir', () => expectError(fs.promises.rmdir, path));
Deno.test('rmdir', () => expectError(fs.promises.rmdir, existingFile));
Deno.test('rename', () => expectError(fs.promises.rename, path, 'foo'));
Deno.test('open', () => expectError(fs.promises.open, path, 'r'));
Deno.test('readdir', () => expectError(fs.promises.readdir, path));
Deno.test('unlink', () => expectError(fs.promises.unlink, path));
Deno.test('link', () => expectError(fs.promises.link, path, 'foo'));
Deno.test('chmod', () => expectError(fs.promises.chmod, path, 0o666));
Deno.test('lstat', () => expectError(fs.promises.lstat, path));
Deno.test('readlink', () => expectError(fs.promises.readlink, path));
Deno.test('statSync', () => expectError(fs.statSync, path));
Deno.test('mkdirSync', () => expectError(fs.mkdirSync, existingFile, 0o666));
Deno.test('rmdirSync', () => expectError(fs.rmdirSync, path));
Deno.test('rmdirSync', () => expectError(fs.rmdirSync, existingFile));
Deno.test('renameSync', () => expectError(fs.renameSync, path, 'foo'));
Deno.test('openSync', () => expectError(fs.openSync, path, 'r'));
Deno.test('readdirSync', () => expectError(fs.readdirSync, path));
Deno.test('unlinkSync', () => expectError(fs.unlinkSync, path));
Deno.test('linkSync', () => expectError(fs.linkSync, path, 'foo'));
Deno.test('chmodSync', () => expectError(fs.chmodSync, path, 0o666));
Deno.test('lstatSync', () => expectError(fs.lstatSync, path));
Deno.test('readlinkSync', () => expectError(fs.readlinkSync, path));
