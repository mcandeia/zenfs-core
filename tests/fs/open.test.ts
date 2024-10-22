import assert from 'node:assert';
import { suite, test } from 'node:test';
import { ErrnoError } from '../../src/error.ts';
import { fs } from '../common.ts';

suite('fs file opening', () => {
	const filename = 'a.ts';

	test('throw ENOENT when opening non-existent file (sync)', () => {
		let caughtException = false;
		try {
			fs.openSync('/path/to/file/that/does/not/exist', 'r');
		} catch (error: any) {
			assert(error instanceof ErrnoError);
			assert(error?.code === 'ENOENT');
			caughtException = true;
		}
		assert(caughtException);
	});

	test('throw ENOENT when opening non-existent file (async)', async () => {
		try {
			await fs.promises.open('/path/to/file/that/does/not/exist', 'r');
		} catch (error: any) {
			assert(error instanceof ErrnoError);
			assert(error?.code === 'ENOENT');
		}
	});

	test('open file with mode "r"', async () => {
		const { fd } = await fs.promises.open(filename, 'r');
		assert(fd >= -Infinity);
	});

	test('open file with mode "rs"', async () => {
		const { fd } = await fs.promises.open(filename, 'rs');
		assert(fd >= -Infinity);
	});
});
