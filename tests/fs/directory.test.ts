import assert from 'node:assert';

import { ErrnoError } from '../../src/error.ts';
import { fs } from '../common.ts';

Deno.test('mkdir', async () => {
	await fs.promises.mkdir('/one', 0o755);
	assert(await fs.promises.exists('/one'));
	await assert.rejects(fs.promises.mkdir('/one', 0o755), /EEXIST/);
});

Deno.test('mkdirSync', () => fs.mkdirSync('/two', 0o000));

Deno.test('mkdir, nested', async () => {
	try {
		await fs.promises.mkdir('/nested/dir');
	} catch (error: any) {
		assert(error instanceof ErrnoError);
		assert(error.code === 'ENOENT');
	}
	assert(!(await fs.promises.exists('/nested/dir')));
});

Deno.test('mkdir, recursive', async () => {
	assert((await fs.promises.mkdir('/recursiveP/A/B', { recursive: true, mode: 0o755 })) == '/recursiveP');
	assert((await fs.promises.mkdir('/recursiveP/A/B/C/D', { recursive: true, mode: 0o777 })) == '/recursiveP/A/B/C');
	assert((await fs.promises.mkdir('/recursiveP/A/B/C/D', { recursive: true, mode: 0o700 })) == undefined);

	assert((await fs.promises.stat('/recursiveP')).mode == (fs.constants.S_IFDIR | 0o755));
	assert((await fs.promises.stat('/recursiveP/A')).mode == (fs.constants.S_IFDIR | 0o755));
	assert((await fs.promises.stat('/recursiveP/A/B')).mode == (fs.constants.S_IFDIR | 0o755));
	assert((await fs.promises.stat('/recursiveP/A/B/C')).mode == (fs.constants.S_IFDIR | 0o777));
	assert((await fs.promises.stat('/recursiveP/A/B/C/D')).mode == (fs.constants.S_IFDIR | 0o777));
});

Deno.test('mkdirSync, recursive', () => {
	assert(fs.mkdirSync('/recursiveS/A/B', { recursive: true, mode: 0o755 }) === '/recursiveS');
	assert(fs.mkdirSync('/recursiveS/A/B/C/D', { recursive: true, mode: 0o777 }) === '/recursiveS/A/B/C');
	assert(fs.mkdirSync('/recursiveS/A/B/C/D', { recursive: true, mode: 0o700 }) === undefined);

	assert(fs.statSync('/recursiveS').mode == (fs.constants.S_IFDIR | 0o755));
	assert(fs.statSync('/recursiveS/A').mode == (fs.constants.S_IFDIR | 0o755));
	assert(fs.statSync('/recursiveS/A/B').mode == (fs.constants.S_IFDIR | 0o755));
	assert(fs.statSync('/recursiveS/A/B/C').mode == (fs.constants.S_IFDIR | 0o777));
	assert(fs.statSync('/recursiveS/A/B/C/D').mode == (fs.constants.S_IFDIR | 0o777));
});

Deno.test('readdirSync without permission', () => {
	try {
		fs.readdirSync('/two');
	} catch (error: any) {
		assert(error instanceof ErrnoError);
		assert(error.code === 'EACCES');
	}
});

Deno.test('rmdir (non-empty)', async () => {
	await fs.promises.mkdir('/rmdirTest');
	await fs.promises.mkdir('/rmdirTest/rmdirTest2');

	try {
		await fs.promises.rmdir('/rmdirTest');
	} catch (error: any) {
		assert(error instanceof ErrnoError);
		assert(error.code === 'ENOTEMPTY');
	}
});

Deno.test('readdirSync on file', () => {
	assert.throws(() => fs.readdirSync('a.js'), { code: 'ENOTDIR' });
});

Deno.test('readdir on file', async () => {
	try {
		await fs.promises.readdir('a.js');
	} catch (error: any) {
		assert(error instanceof ErrnoError);
		assert(error.code === 'ENOTDIR');
	}
});

Deno.test('readdirSync on non-existant directory', () => {
	assert.throws(() => fs.readdirSync('/does/not/exist'), { code: 'ENOENT' });
});

Deno.test('readdir on non-existant directory', async () => {
	try {
		await fs.promises.readdir('/does/not/exist');
	} catch (error: any) {
		assert(error instanceof ErrnoError);
		assert(error.code === 'ENOENT');
	}
});

Deno.test('rm recursively asynchronously', async () => {
	await fs.promises.mkdir('/rmDirRecusrively');
	await fs.promises.mkdir('/rmDirRecusrively/rmDirNested');
	await fs.promises.writeFile('/rmDirRecusrively/rmDirNested/test.txt', 'hello world!');

	await fs.promises.rm('/rmDirRecusrively', { recursive: true });
});

Deno.test('rm recursively synchronously', () => {
	fs.mkdirSync('/rmDirRecusrively');
	fs.mkdirSync('/rmDirRecusrively/rmDirNested');
	fs.writeFileSync('/rmDirRecusrively/rmDirNested/test.txt', 'hello world!');

	fs.rmSync('/rmDirRecusrively', { recursive: true });
});
