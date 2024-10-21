import assert from 'node:assert';

import { fs } from '../common.ts';

// Top-level initialization
const testFilePath = 'test-file.txt';
const testData = 'Hello, World!';
await fs.promises.writeFile(testFilePath, testData);

const testFilePathWrite = 'test-file-write.txt';
await fs.promises.writeFile(testFilePathWrite, ''); // Ensure the file exists

Deno.test('ReadStream reads data correctly', () => {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const readStream = fs.createReadStream(testFilePath);
	let data = '';
	readStream.on('data', (chunk) => {
		data += chunk;
	});
	readStream.on('end', () => {
		assert(data == testData);
		resolve();
	});
	readStream.on('error', (err) => {
		reject(err);
	});
	return promise;
});

Deno.test('ReadStream close method works', () => {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const readStream = fs.createReadStream(testFilePath);
	let closed = false;
	readStream.on('close', () => {
		closed = true;
	});
	readStream.close((err) => {
		assert(err === undefined);
		assert(closed);
		resolve();
	});
	setTimeout(reject, 1000);
	return promise;
});

Deno.test('ReadStream declared properties', () => {
	const readStream = new fs.ReadStream();
	assert(readStream.bytesRead === undefined);
	assert(readStream.path === undefined);
	assert(readStream.pending === undefined);

	// Assign values
	readStream.bytesRead = 10;
	readStream.path = testFilePath;
	readStream.pending = false;

	assert(readStream.bytesRead === 10);
	assert(readStream.path === testFilePath);
	assert(!readStream.pending);
});

Deno.test('ReadStream close method can be called multiple times', () => {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const readStream = new fs.ReadStream();
	readStream.close((err) => {
		assert(err === undefined);
		// Call close again
		readStream.close((err2) => {
			assert(err2 === undefined);
			resolve();
		});
	});
	return promise;
});

Deno.test('WriteStream writes data correctly', { ignore: true }, () => {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const writeStream = fs.createWriteStream(testFilePathWrite);
	writeStream.write(testData, 'utf8', (err) => {
		if (err) {
			reject(err);
			return;
		}
		writeStream.end();
	});
	writeStream.on('finish', () => {
		assert(fs.readFileSync(testFilePathWrite, 'utf8') == testData);
		resolve();
	});
	writeStream.on('error', (err) => {
		reject(err);
	});
	return promise;
});

Deno.test('WriteStream close method works', () => {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const writeStream = fs.createWriteStream(testFilePathWrite);
	let closed = false;
	writeStream.on('close', () => {
		closed = true;
	});
	writeStream.close((err) => {
		assert(err === undefined);
		assert(closed);
		resolve();
	});
	return promise;
});

Deno.test('WriteStream declared properties', () => {
	const writeStream = new fs.WriteStream();
	assert(writeStream.bytesWritten === undefined);
	assert(writeStream.path === undefined);
	assert(writeStream.pending === undefined);

	// Assign values
	writeStream.bytesWritten = 20;
	writeStream.path = testFilePathWrite;
	writeStream.pending = true;

	assert(writeStream.bytesWritten === 20);
	assert(writeStream.path === testFilePathWrite);
	assert(writeStream.pending);
});

Deno.test('WriteStream close method can be called multiple times', () => {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const writeStream = new fs.WriteStream();
	writeStream.close((err) => {
		assert(err === undefined);
		// Call close again
		writeStream.close((err2) => {
			assert(err2 === undefined);
			resolve();
		});
	});
	return promise;
});

Deno.test('FileHandle.createReadStream reads data correctly', { ignore: true }, async () => {
	const fileHandle = await fs.promises.open(testFilePath, 'r');
	const readStream = fileHandle.createReadStream();
	let data = '';
	await new Promise<void>((resolve, reject) => {
		readStream.on('data', (chunk) => {
			data += chunk;
		});
		readStream.on('end', () => {
			assert(data == testData);
			resolve();
		});
		readStream.on('error', reject);
	});
	await fileHandle.close();
});

Deno.test('FileHandle.createWriteStream writes data correctly', { ignore: true }, async () => {
	const fileHandle = await fs.promises.open(testFilePathWrite, 'w');
	const writeStream = fileHandle.createWriteStream();
	await new Promise<void>((resolve, reject) => {
		writeStream.write(testData, 'utf8', (err) => {
			if (err) return reject(err);
			writeStream.end();
		});
		writeStream.on('finish', resolve);
		writeStream.on('error', reject);
	});
	const data = await fs.promises.readFile(testFilePathWrite, 'utf8');
	assert(data == testData);
	await fileHandle.close();
});

Deno.test('FileHandle.createReadStream after close should throw', async () => {
	const fileHandle = await fs.promises.open(testFilePath, 'r');
	await fileHandle.close();
	assert.throws(() => fileHandle.createReadStream());
});

Deno.test('FileHandle.createWriteStream after close should throw', { ignore: true }, async () => {
	const fileHandle = await fs.promises.open(testFilePathWrite, 'w');
	await fileHandle.close();
	assert.throws(() => fileHandle.createWriteStream());
});
