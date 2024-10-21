import assert, { rejects } from 'node:assert';

import { fs } from '../common.ts';

const testFile = 'test-file.txt';
await fs.promises.writeFile(testFile, 'Sample content');
await fs.promises.mkdir('test-directory');
await fs.promises.symlink(testFile, 'test-symlink');
const testDirPath = 'test-dir';
const testFiles = ['file1.txt', 'file2.txt'];
await fs.promises.mkdir(testDirPath);
for (const file of testFiles) {
	await fs.promises.writeFile(`${testDirPath}/${file}`, 'Sample content');
}

Deno.test('Dirent name and parentPath getters', async () => {
	const stats = await fs.promises.lstat(testFile);
	const dirent = new fs.Dirent(testFile, stats);

	assert(dirent.name === testFile);
	assert(dirent.parentPath === testFile);
});

Deno.test('Dirent.isFile', async () => {
	const fileStats = await fs.promises.lstat(testFile);
	const fileDirent = new fs.Dirent(testFile, fileStats);

	assert(fileDirent.isFile());
	assert(!fileDirent.isDirectory());
});

Deno.test('Dirent.isDirectory', async () => {
	const dirStats = await fs.promises.lstat('test-directory');
	const dirDirent = new fs.Dirent('test-directory', dirStats);

	assert(!dirDirent.isFile());
	assert(dirDirent.isDirectory());
});

Deno.test('Dirent.isSymbolicLink', async () => {
	const symlinkStats = await fs.promises.lstat('test-symlink');
	const symlinkDirent = new fs.Dirent('test-symlink', symlinkStats);

	assert(symlinkDirent.isSymbolicLink());
});

Deno.test('Dirent other methods return false', async () => {
	const fileStats = await fs.promises.lstat(testFile);
	const fileDirent = new fs.Dirent(testFile, fileStats);

	assert(!fileDirent.isBlockDevice());
	assert(!fileDirent.isCharacterDevice());
	assert(!fileDirent.isSocket());
});

Deno.test('Dir read() method (Promise varient)', async () => {
	const dir = new fs.Dir(testDirPath);

	const dirent1 = await dir.read();
	assert(dirent1 instanceof fs.Dirent);
	assert(testFiles.includes(dirent1?.name));

	const dirent2 = await dir.read();
	assert(dirent2 instanceof fs.Dirent);
	assert(testFiles.includes(dirent2?.name));

	const dirent3 = await dir.read();
	assert(dirent3 === null);

	await dir.close();
});

Deno.test('Dir read() method (Callback varient)', () => {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const dir = new fs.Dir(testDirPath);
	dir.read((err, dirent) => {
		assert(err === undefined);
		assert(dirent != undefined);
		assert(dirent instanceof fs.Dirent);
		assert(testFiles.includes(dirent?.name));
		dir.closeSync();
		resolve();
	});

	setTimeout(reject, 1000);
	return promise;
});

Deno.test('Dir readSync() method', () => {
	const dir = new fs.Dir(testDirPath);

	const dirent1 = dir.readSync();
	assert(dirent1 instanceof fs.Dirent);
	assert(testFiles.includes(dirent1?.name));

	const dirent2 = dir.readSync();
	assert(dirent2 instanceof fs.Dirent);
	assert(testFiles.includes(dirent2?.name));

	const dirent3 = dir.readSync();
	assert(dirent3 === null);

	dir.closeSync();
});

Deno.test('Dir close() method (Promise version)', async () => {
	const dir = new fs.Dir(testDirPath);
	await dir.close();
	rejects(dir.read(), 'Can not use closed Dir');
});

Deno.test('Dir closeSync() method', () => {
	const dir = new fs.Dir(testDirPath);
	dir.closeSync();
	assert.throws(() => dir.readSync(), 'Can not use closed Dir');
});

Deno.test('Dir asynchronous iteration', async () => {
	const dir = new fs.Dir(testDirPath);
	const dirents: fs.Dirent[] = [];

	for await (const dirent of dir) {
		dirents.push(dirent);
	}

	assert(dirents.length === 2);
	assert(dirents[0] instanceof fs.Dirent);
	assert(testFiles.includes(dirents[0].name));
	assert(testFiles.includes(dirents[1].name));
});

Deno.test('Dir read after directory is closed', async () => {
	const dir = new fs.Dir(testDirPath);
	await dir.close();
	await assert.rejects(dir.read(), 'Can not use closed Dir');
});

Deno.test('Dir readSync after directory is closed', () => {
	const dir = new fs.Dir(testDirPath);
	dir.closeSync();
	assert.throws(() => dir.readSync(), 'Can not use closed Dir');
});

Deno.test('Dir close multiple times', async () => {
	const dir = new fs.Dir(testDirPath);
	await dir.close();
	await dir.close(); // Should not throw an error
	assert(dir['closed']);
});

Deno.test('Dir closeSync multiple times', () => {
	const dir = new fs.Dir(testDirPath);
	dir.closeSync();
	dir.closeSync(); // Should not throw an error
	assert(dir['closed']);
});
