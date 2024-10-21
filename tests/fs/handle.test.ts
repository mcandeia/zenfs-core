import assert from 'node:assert';

import { constants, type FileHandle, open } from '../../src/emulation/promises.ts';

const content = 'The cake is a lie',
	appended = '\nAnother lie';

let handle: FileHandle;
const filePath = './test.txt';

Deno.test('open', async () => {
	handle = await open(filePath, 'w+');
});

Deno.test('writeFile', async () => {
	await handle.writeFile(content);
	await handle.sync();
});

Deno.test('readFile', async () => {
	assert((await handle.readFile('utf8')) === content);
});

Deno.test('appendFile', async () => {
	await handle.appendFile(appended);
});

Deno.test('readFile after appendFile', async () => {
	assert((await handle.readFile({ encoding: 'utf8' })) === content + appended);
});

Deno.test('truncate', async () => {
	await handle.truncate(5);
	assert((await handle.readFile({ encoding: 'utf8' })) === content.slice(0, 5));
});

Deno.test('stat', async () => {
	const stats = await handle.stat();
	assert(stats.isFile());
});

Deno.test('chmod', async () => {
	await handle.chmod(constants.S_IRUSR | constants.S_IWUSR);
	const stats = await handle.stat();
	assert(stats.mode & constants.S_IRUSR);
	assert(stats.mode & constants.S_IWUSR);
});

Deno.test('chown', async () => {
	await handle.chown(1234, 5678);
	const stats = await handle.stat();
	assert(stats.uid === 1234);
	assert(stats.gid === 5678);
});

Deno.test('close', async () => {
	await handle.close();
});
