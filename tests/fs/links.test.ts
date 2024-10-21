import assert from 'node:assert';

import { join } from '../../src/emulation/path.ts';
import { fs } from '../common.ts';

const target = '/a1.js',
	symlink = 'symlink1.js',
	hardlink = 'link1.js';

Deno.test('symlink', async () => {
	await fs.promises.symlink(target, symlink);
});

Deno.test('lstat', async () => {
	const stats = await fs.promises.lstat(symlink);
	assert(stats.isSymbolicLink());
});

Deno.test('readlink', async () => {
	const destination = await fs.promises.readlink(symlink);
	assert(destination === target);
});

Deno.test('unlink', async () => {
	await fs.promises.unlink(symlink);
	assert(!(await fs.promises.exists(symlink)));
	assert(await fs.promises.exists(target));
});

Deno.test('link', async () => {
	await fs.promises.link(target, hardlink);
	const targetContent = await fs.promises.readFile(target, 'utf8');
	const linkContent = await fs.promises.readFile(hardlink, 'utf8');
	assert(targetContent === linkContent);
});

Deno.test('file inside symlinked directory', async () => {
	await fs.promises.symlink('.', 'link');
	const targetContent = await fs.promises.readFile(target, 'utf8');
	const link = join('link', target);
	assert((await fs.promises.realpath(link)) === target);
	const linkContent = await fs.promises.readFile(link, 'utf8');
	assert(targetContent === linkContent);
});
