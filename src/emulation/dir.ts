import type { Dir as _Dir, Dirent as _Dirent } from 'node:fs';
import { Errno, ErrnoError } from '../error.ts';
import type { Stats } from '../stats.ts';
import type { Callback } from '../utils.ts';
import { basename } from './path.ts';
import { readdir } from './promises.ts';
import { readdirSync } from './sync.ts';

export class Dirent implements _Dirent {
	public get name(): string {
		return basename(this.path);
	}

	public constructor(
		public path: string,
		protected stats: Stats
	) {}

	get parentPath(): string {
		return this.path;
	}

	isFile(): boolean {
		return this.stats.isFile();
	}
	isDirectory(): boolean {
		return this.stats.isDirectory();
	}
	isBlockDevice(): boolean {
		return this.stats.isBlockDevice();
	}
	isCharacterDevice(): boolean {
		return this.stats.isCharacterDevice();
	}
	isSymbolicLink(): boolean {
		return this.stats.isSymbolicLink();
	}
	isFIFO(): boolean {
		return this.stats.isFIFO();
	}
	isSocket(): boolean {
		return this.stats.isSocket();
	}
}

/**
 * A class representing a directory stream.
 */
export class Dir implements _Dir {
	protected closed = false;

	protected checkClosed(): void {
		if (this.closed) {
			throw new ErrnoError(Errno.EBADF, 'Can not use closed Dir');
		}
	}

	protected _entries?: Dirent[];

	public constructor(public readonly path: string) {}

	/**
	 * Asynchronously close the directory's underlying resource handle.
	 * Subsequent reads will result in errors.
	 */
	public close(): Promise<void>;
	public close(cb: Callback): void;
	public close(cb?: Callback): void | Promise<void> {
		this.closed = true;
		if (!cb) {
			return Promise.resolve();
		}
		cb();
	}

	/**
	 * Synchronously close the directory's underlying resource handle.
	 * Subsequent reads will result in errors.
	 */
	public closeSync(): void {
		this.closed = true;
	}

	protected async _read(): Promise<Dirent | null> {
		this.checkClosed();
		this._entries ??= await readdir(this.path, { withFileTypes: true });
		if (!this._entries.length) {
			return null;
		}
		return this._entries.shift() ?? null;
	}

	/**
	 * Asynchronously read the next directory entry via `readdir(3)` as an `Dirent`.
	 * After the read is completed, a value is returned that will be resolved with an `Dirent`, or `null` if there are no more directory entries to read.
	 * Directory entries returned by this function are in no particular order as provided by the operating system's underlying directory mechanisms.
	 */
	public read(): Promise<Dirent | null>;
	public read(cb: Callback<[Dirent | null]>): void;
	public read(cb?: Callback<[Dirent | null]>): void | Promise<Dirent | null> {
		if (!cb) {
			return this._read();
		}

		void this._read().then(value => cb(undefined, value));
	}

	/**
	 * Synchronously read the next directory entry via `readdir(3)` as a `Dirent`.
	 * If there are no more directory entries to read, null will be returned.
	 * Directory entries returned by this function are in no particular order as provided by the operating system's underlying directory mechanisms.
	 */
	public readSync(): Dirent | null {
		this.checkClosed();
		this._entries ??= readdirSync(this.path, { withFileTypes: true });
		if (!this._entries.length) {
			return null;
		}
		return this._entries.shift() ?? null;
	}

	async next(): Promise<IteratorResult<Dirent>> {
		const value = await this._read();
		if (value) {
			return { done: false, value };
		}

		await this.close();
		return { done: true, value: undefined };
	}

	/**
	 * Asynchronously iterates over the directory via `readdir(3)` until all entries have been read.
	 */
	public [Symbol.asyncIterator](): AsyncIterableIterator<Dirent> {
		return this;
	}
}
