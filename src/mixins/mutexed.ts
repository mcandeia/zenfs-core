import { ErrnoError } from '../error.ts';
import type { File } from '../file.ts';
import type { FileSystem, FileSystemMetadata } from '../filesystem.ts';
import '../polyfills.ts';
import type { Stats } from '../stats.ts';
import type { Concrete } from '../utils.ts';

export class MutexLock {
	protected current = Promise.withResolvers<void>();

	protected _isLocked: boolean = true;
	public get isLocked(): boolean {
		return this._isLocked;
	}

	public constructor(protected readonly previous?: MutexLock) {}

	public async done(): Promise<void> {
		await this.previous?.done();
		await this.current.promise;
	}

	public unlock(): void {
		this.current.resolve();
		this._isLocked = false;
	}

	public [Symbol.dispose](): void {
		this.unlock();
	}
}

/**
 * @hidden
 */
export class _MutexedFS<T extends FileSystem> implements FileSystem {
	/**
	 * @internal
	 */
	public _fs!: T;

	public async ready(): Promise<void> {
		return await this._fs.ready();
	}

	public metadata(): FileSystemMetadata {
		return this._fs.metadata();
	}

	/**
	 * The current locks
	 */
	private currentLock?: MutexLock;

	/**
	 * Adds a lock for a path
	 */
	protected addLock(): MutexLock {
		const lock = new MutexLock(this.currentLock);
		this.currentLock = lock;
		return lock;
	}

	/**
	 * Locks `path` asynchronously.
	 * If the path is currently locked, waits for it to be unlocked.
	 * @internal
	 */
	public async lock(path: string, syscall: string): Promise<MutexLock> {
		const previous = this.currentLock;
		const lock = this.addLock();
		const stack = new Error().stack;
		setTimeout(() => {
			if (lock.isLocked) {
				const error = ErrnoError.With('EDEADLK', path, syscall);
				error.stack += stack?.slice('Error'.length);
				throw error;
			}
		}, 5000);
		await previous?.done();
		return lock;
	}

	/**
	 * Locks `path` asynchronously.
	 * If the path is currently locked, an error will be thrown
	 * @internal
	 */
	public lockSync(path: string, syscall: string): MutexLock {
		if (this.currentLock?.isLocked) {
			throw ErrnoError.With('EBUSY', path, syscall);
		}

		return this.addLock();
	}

	/**
	 * Whether `path` is locked
	 * @internal
	 */
	public get isLocked(): boolean {
		return !!this.currentLock?.isLocked;
	}

	/* eslint-disable @typescript-eslint/no-unused-vars */
	public async rename(oldPath: string, newPath: string): Promise<void> {
		using _ = await this.lock(oldPath, 'rename');
		await this._fs.rename(oldPath, newPath);
	}

	public renameSync(oldPath: string, newPath: string): void {
		using _ = this.lockSync(oldPath, 'rename');
		return this._fs.renameSync(oldPath, newPath);
	}

	public async stat(path: string): Promise<Stats> {
		using _ = await this.lock(path, 'stat');
		return await this._fs.stat(path);
	}

	public statSync(path: string): Stats {
		using _ = this.lockSync(path, 'stat');
		return this._fs.statSync(path);
	}

	public async openFile(path: string, flag: string): Promise<File> {
		using _ = await this.lock(path, 'openFile');
		const file = await this._fs.openFile(path, flag);
		file.fs = this;
		return file;
	}

	public openFileSync(path: string, flag: string): File {
		using _ = this.lockSync(path, 'openFile');
		const file = this._fs.openFileSync(path, flag);
		file.fs = this;
		return file;
	}

	public async createFile(path: string, flag: string, mode: number): Promise<File> {
		using _ = await this.lock(path, 'createFile');
		const file = await this._fs.createFile(path, flag, mode);
		file.fs = this;
		return file;
	}

	public createFileSync(path: string, flag: string, mode: number): File {
		using _ = this.lockSync(path, 'createFile');
		const file = this._fs.createFileSync(path, flag, mode);
		file.fs = this;
		return file;
	}

	public async unlink(path: string): Promise<void> {
		using _ = await this.lock(path, 'unlink');
		await this._fs.unlink(path);
	}

	public unlinkSync(path: string): void {
		using _ = this.lockSync(path, 'unlink');
		return this._fs.unlinkSync(path);
	}

	public async rmdir(path: string): Promise<void> {
		using _ = await this.lock(path, 'rmdir');
		await this._fs.rmdir(path);
	}

	public rmdirSync(path: string): void {
		using _ = this.lockSync(path, 'rmdir');
		return this._fs.rmdirSync(path);
	}

	public async mkdir(path: string, mode: number): Promise<void> {
		using _ = await this.lock(path, 'mkdir');
		await this._fs.mkdir(path, mode);
	}

	public mkdirSync(path: string, mode: number): void {
		using _ = this.lockSync(path, 'mkdir');
		return this._fs.mkdirSync(path, mode);
	}

	public async readdir(path: string): Promise<string[]> {
		using _ = await this.lock(path, 'readdir');
		return await this._fs.readdir(path);
	}

	public readdirSync(path: string): string[] {
		using _ = this.lockSync(path, 'readdir');
		return this._fs.readdirSync(path);
	}

	public async exists(path: string): Promise<boolean> {
		using _ = await this.lock(path, 'exists');
		return await this._fs.exists(path);
	}

	public existsSync(path: string): boolean {
		using _ = this.lockSync(path, 'exists');
		return this._fs.existsSync(path);
	}

	public async link(srcpath: string, dstpath: string): Promise<void> {
		using _ = await this.lock(srcpath, 'link');
		await this._fs.link(srcpath, dstpath);
	}

	public linkSync(srcpath: string, dstpath: string): void {
		using _ = this.lockSync(srcpath, 'link');
		return this._fs.linkSync(srcpath, dstpath);
	}

	public async sync(path: string, data: Uint8Array, stats: Readonly<Stats>): Promise<void> {
		using _ = await this.lock(path, 'sync');
		await this._fs.sync(path, data, stats);
	}

	public syncSync(path: string, data: Uint8Array, stats: Readonly<Stats>): void {
		using _ = this.lockSync(path, 'sync');
		return this._fs.syncSync(path, data, stats);
	}
	/* eslint-enable @typescript-eslint/no-unused-vars */
}

/**
 * This serializes access to an underlying async filesystem.
 * For example, on an OverlayFS instance with an async lower
 * directory operations like rename and rmdir may involve multiple
 * requests involving both the upper and lower file systems -- they
 * are not executed in a single atomic step. OverlayFS uses this
 * to avoid having to reason about the correctness of
 * multiple requests interleaving.
 *
 * @privateRemarks
 * Instead of extending the passed class, `MutexedFS` stores it internally.
 * This is to avoid a deadlock caused when a method calls another one
 * The problem is discussed extensively in [#78](https://github.com/zen-fs/core/issues/78)
 * Instead of extending `FileSystem`,
 * `MutexedFS` implements it in order to make sure all of the methods are passed through
 *
 * @todo Change `using _` to `using void` pending https://github.com/tc39/proposal-discard-binding
 * @internal
 */
export function Mutexed<const T extends Concrete<typeof FileSystem>>(
	FS: T
): typeof _MutexedFS<InstanceType<T>> & {
	new (...args: ConstructorParameters<T>): _MutexedFS<InstanceType<T>>;
} {
	class MutexedFS extends _MutexedFS<InstanceType<T>> {
		public constructor(...args: ConstructorParameters<T>) {
			super();
			this._fs = new FS(...args) as InstanceType<T>;
		}
	}
	return MutexedFS;
}
