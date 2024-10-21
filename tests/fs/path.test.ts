import assert from 'node:assert';

import { basename, dirname, extname, join, normalize, resolve } from '../../src/emulation/path.ts';

Deno.test('resolve', () => {
	assert(resolve('somepath') === '/somepath');
	assert(resolve('/another', 'path') === '/another/path');
});

Deno.test('join', () => {
	assert(join('/path', 'to', 'file.txt') === '/path/to/file.txt');
	assert(join('/path/', 'to', '/file.txt') === '/path/to/file.txt');
});

Deno.test('normalize', () => {
	assert(normalize('/path/to/../file.txt') === '/path/file.txt');
	assert(normalize('/path/to/./file.txt') === '/path/to/file.txt');
});

Deno.test('basename', () => {
	assert(basename('/path/to/file.txt') === 'file.txt');
	assert(basename('/path/to/file.txt', '.txt') === 'file');
});

Deno.test('dirname', () => {
	assert(dirname('/path/to/file.txt') === '/path/to');
});

Deno.test('extname', () => {
	assert(extname('/path/to/file.txt') === '.txt');
	assert(extname('/path/to/file') === '');
});
