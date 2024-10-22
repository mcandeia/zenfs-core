import type * as Node from 'node:fs';
import { Readable, Writable } from 'readable-stream';
import { Errno, ErrnoError } from '../error.ts';
import type { Callback } from '../utils.ts';

export class ReadStream extends Readable implements Node.ReadStream {
	close(callback: Callback = () => null): void {
		try {
			super.destroy();
			super.emit('close');
			callback();
		} catch (err) {
			callback(new ErrnoError(Errno.EIO, (err as Error).toString()));
		}
	}
	declare bytesRead: number;
	declare path: string | Buffer;
	declare pending: boolean;
}

export class WriteStream extends Writable implements Node.WriteStream {
	close(callback: Callback = () => null): void {
		try {
			super.destroy();
			super.emit('close');
			callback();
		} catch (err) {
			callback(new ErrnoError(Errno.EIO, (err as Error).toString()));
		}
	}
	declare bytesWritten: number;
	declare path: string | Buffer;
	declare pending: boolean;
}
