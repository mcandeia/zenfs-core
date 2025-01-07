/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import type * as fs from 'node:fs';
import type * as promises from 'node:fs/promises';
import type { Stream } from 'node:stream';
import type { ReadableStreamController, ReadableStream as TReadableStream } from 'node:stream/web';
import type { Interface as ReadlineInterface } from 'readline';
import type { V_Context } from '../context.js';
import type { File } from '../file.js';
import type { FileContents } from '../filesystem.js';
import type { Stats } from '../stats.js';
import type { GlobOptionsU, InternalOptions, NullEnc, ReaddirOptions, ReaddirOptsI, ReaddirOptsU } from './types.js';

import { Buffer } from 'buffer';
import { credentials } from '../credentials.js';
import { Errno, ErrnoError } from '../error.js';
import { flagToMode, isAppendable, isExclusive, isReadable, isTruncating, isWriteable, parseFlag } from '../file.js';
import '../polyfills.js';
import { BigIntStats } from '../stats.js';
import { decodeUTF8, normalizeMode, normalizeOptions, normalizePath, normalizeTime } from '../utils.js';
import * as cache from './cache.js';
import { config } from './config.js';
import * as constants from './constants.js';
import { Dir, Dirent } from './dir.js';
import { dirname, join, parse, resolve } from './path.js';
import { _statfs, fd2file, fdMap, file2fd, fixError, resolveMount } from './shared.js';
import { ReadStream, WriteStream } from './streams.js';
import { FSWatcher, emitChange } from './watchers.js';
export * as constants from './constants.js';

export class FileHandle implements promises.FileHandle {
	/**
	 * The file descriptor for this file handle.
	 */
	public readonly fd: number;

	/**
	 * @internal
	 * The file for this file handle
	 */
	public readonly file: File;

	public constructor(
		fdOrFile: number | File,
		protected context?: V_Context
	) {
		const isFile = typeof fdOrFile != 'number';
		this.fd = isFile ? file2fd(fdOrFile) : fdOrFile;
		this.file = isFile ? fdOrFile : fd2file(fdOrFile);
	}

	/**
	 * Asynchronous fchown(2) - Change ownership of a file.
	 */
	public async chown(uid: number, gid: number): Promise<void> {
		await this.file.chown(uid, gid);
		emitChange('change', this.file.path);
	}

	/**
	 * Asynchronous fchmod(2) - Change permissions of a file.
	 * @param mode A file mode. If a string is passed, it is parsed as an octal integer.
	 */
	public async chmod(mode: fs.Mode): Promise<void> {
		const numMode = normalizeMode(mode, -1);
		if (numMode < 0) {
			throw new ErrnoError(Errno.EINVAL, 'Invalid mode.');
		}
		await this.file.chmod(numMode);
		emitChange('change', this.file.path);
	}

	/**
	 * Asynchronous fdatasync(2) - synchronize a file's in-core state with storage device.
	 */
	public datasync(): Promise<void> {
		return this.file.datasync();
	}

	/**
	 * Asynchronous fsync(2) - synchronize a file's in-core state with the underlying storage device.
	 */
	public sync(): Promise<void> {
		return this.file.sync();
	}

	/**
	 * Asynchronous ftruncate(2) - Truncate a file to a specified length.
	 * @param length If not specified, defaults to `0`.
	 */
	public async truncate(length?: number | null): Promise<void> {
		length ||= 0;
		if (length < 0) {
			throw new ErrnoError(Errno.EINVAL);
		}
		await this.file.truncate(length);
		emitChange('change', this.file.path);
	}

	/**
	 * Asynchronously change file timestamps of the file.
	 * @param atime The last access time. If a string is provided, it will be coerced to number.
	 * @param mtime The last modified time. If a string is provided, it will be coerced to number.
	 */
	public async utimes(atime: string | number | Date, mtime: string | number | Date): Promise<void> {
		await this.file.utimes(normalizeTime(atime), normalizeTime(mtime));
		emitChange('change', this.file.path);
	}

	/**
	 * Asynchronously append data to a file, creating the file if it does not exist. The underlying file will _not_ be closed automatically.
	 * The `FileHandle` must have been opened for appending.
	 * @param data The data to write. If something other than a `Buffer` or `Uint8Array` is provided, the value is coerced to a string.
	 * @param _options Either the encoding for the file, or an object optionally specifying the encoding, file mode, and flag.
	 * - `encoding` defaults to `'utf8'`.
	 * - `mode` defaults to `0o666`.
	 * - `flag` defaults to `'a'`.
	 */
	public async appendFile(data: string | Uint8Array, _options: (fs.ObjectEncodingOptions & promises.FlagAndOpenMode) | BufferEncoding = {}): Promise<void> {
		const options = normalizeOptions(_options, 'utf8', 'a', 0o644);
		const flag = parseFlag(options.flag);
		if (!isAppendable(flag)) {
			throw new ErrnoError(Errno.EINVAL, 'Flag passed to appendFile must allow for appending.');
		}
		if (typeof data != 'string' && !options.encoding) {
			throw new ErrnoError(Errno.EINVAL, 'Encoding not specified');
		}
		const encodedData = typeof data == 'string' ? Buffer.from(data, options.encoding!) : data;
		await this.file.write(encodedData, 0, encodedData.length);
		emitChange('change', this.file.path);
	}

	/**
	 * Asynchronously reads data from the file.
	 * The `FileHandle` must have been opened for reading.
	 * @param buffer The buffer that the data will be written to.
	 * @param offset The offset in the buffer at which to start writing.
	 * @param length The number of bytes to read.
	 * @param position The offset from the beginning of the file from which data should be read. If `null`, data will be read from the current position.
	 */
	public async read<T extends NodeJS.ArrayBufferView>(buffer: T, offset?: number, length?: number, position?: number | null): Promise<promises.FileReadResult<T>>;
	public async read<T extends NodeJS.ArrayBufferView = Buffer>(buffer: T, options?: promises.FileReadOptions<T>): Promise<promises.FileReadResult<T>>;
	public async read<T extends NodeJS.ArrayBufferView = Buffer>(options?: promises.FileReadOptions<T>): Promise<promises.FileReadResult<T>>;
	public async read<T extends NodeJS.ArrayBufferView = Buffer>(
		buffer?: T | promises.FileReadOptions<T>,
		offset?: number | null | promises.FileReadOptions<T>,
		length?: number | null,
		position?: number | null
	) {
		if (typeof offset == 'object' && offset != null) {
			position = offset.position;
			length = offset.length;
			offset = offset.offset;
		}

		if (!ArrayBuffer.isView(buffer) && typeof buffer == 'object') {
			position = buffer.position;
			length = buffer.length;
			offset = buffer.offset;
			buffer = buffer.buffer;
		}

		if (isNaN(+position!)) {
			position = this.file.position;
		}
		buffer ||= new Uint8Array((await this.file.stat()).size) as T;
		return this.file.read(buffer, offset ?? undefined, length ?? undefined, position ?? undefined);
	}

	/**
	 * Asynchronously reads the entire contents of a file. The underlying file will _not_ be closed automatically.
	 * The `FileHandle` must have been opened for reading.
	 * @param _options An object that may contain an optional flag.
	 * If a flag is not provided, it defaults to `'r'`.
	 */
	public async readFile(_options?: { flag?: fs.OpenMode }): Promise<Buffer>;
	public async readFile(_options: (fs.ObjectEncodingOptions & promises.FlagAndOpenMode) | BufferEncoding): Promise<string>;
	public async readFile(_options?: (fs.ObjectEncodingOptions & promises.FlagAndOpenMode) | BufferEncoding): Promise<string | Buffer> {
		const options = normalizeOptions(_options, null, 'r', 0o444);
		const flag = parseFlag(options.flag);
		if (!isReadable(flag)) {
			throw new ErrnoError(Errno.EINVAL, 'Flag passed must allow for reading.');
		}

		const { size } = await this.stat();
		const { buffer: data } = await this.file.read(new Uint8Array(size), 0, size, 0);
		const buffer = Buffer.from(data);
		return options.encoding ? buffer.toString(options.encoding) : buffer;
	}

	/**
	 * Returns a `ReadableStream` that may be used to read the files data.
	 *
	 * An error will be thrown if this method is called more than once or is called after the `FileHandle` is closed or closing.
	 *
	 * While the `ReadableStream` will read the file to completion,
	 * it will not close the `FileHandle` automatically.
	 * User code must still call the `fileHandle.close()` method.
	 */
	public readableWebStream(options: promises.ReadableWebStreamOptions = {}): TReadableStream<Uint8Array> {
		// Note: using an arrow function to preserve `this`
		const start = async (controller: ReadableStreamController<Uint8Array>) => {
			try {
				const chunkSize = 64 * 1024,
					maxChunks = 1e7;
				let i = 0,
					position = 0,
					bytesRead = NaN;

				while (bytesRead > 0) {
					const result = await this.read(new Uint8Array(chunkSize), 0, chunkSize, position);
					if (!result.bytesRead) {
						controller.close();
						return;
					}
					controller.enqueue(result.buffer.slice(0, result.bytesRead));
					position += result.bytesRead;
					if (++i >= maxChunks) {
						throw new ErrnoError(Errno.EFBIG, 'Too many iterations on readable stream', this.file.path, 'FileHandle.readableWebStream');
					}
					bytesRead = result.bytesRead;
				}
			} catch (e) {
				controller.error(e);
			}
		};

		const _gt = globalThis;
		if (!('ReadableStream' in _gt)) {
			throw new ErrnoError(Errno.ENOSYS, 'ReadableStream is missing on globalThis');
		}
		return new (_gt as { ReadableStream: new (...args: unknown[]) => TReadableStream<Uint8Array> }).ReadableStream({ start, type: options.type });
	}

	/**
	 * @todo Implement
	 */
	public readLines(options?: promises.CreateReadStreamOptions): ReadlineInterface {
		throw ErrnoError.With('ENOSYS', this.file.path, 'FileHandle.readLines');
	}

	public [Symbol.asyncDispose](): Promise<void> {
		return this.close();
	}

	/**
	 * Asynchronous fstat(2) - Get file status.
	 */
	public async stat(opts: fs.BigIntOptions): Promise<BigIntStats>;
	public async stat(opts?: fs.StatOptions & { bigint?: false }): Promise<Stats>;
	public async stat(opts?: fs.StatOptions): Promise<Stats | BigIntStats> {
		const stats = await this.file.stat();
		if (config.checkAccess && !stats.hasAccess(constants.R_OK, this.context)) {
			throw ErrnoError.With('EACCES', this.file.path, 'stat');
		}
		return opts?.bigint ? new BigIntStats(stats) : stats;
	}

	/**
	 * Asynchronously writes `string` to the file.
	 * The `FileHandle` must have been opened for writing.
	 * It is unsafe to call `write()` multiple times on the same file without waiting for the `Promise`
	 * to be resolved (or rejected). For this scenario, `fs.createWriteStream` is strongly recommended.
	 */
	public async write<T extends FileContents>(
		data: T,
		options?: number | null | { offset?: number; length?: number; position?: number },
		lenOrEnc?: BufferEncoding | number | null,
		position?: number | null
	): Promise<{ bytesWritten: number; buffer: T }> {
		let buffer: Uint8Array, offset: number | null | undefined, length: number;
		if (typeof options == 'object') {
			lenOrEnc = options?.length;
			position = options?.position;
			options = options?.offset;
		}
		if (typeof data === 'string') {
			position = typeof options === 'number' ? options : null;
			const encoding = typeof lenOrEnc === 'string' ? lenOrEnc : ('utf8' as BufferEncoding);
			offset = 0;
			buffer = Buffer.from(data, encoding);
			length = buffer.length;
		} else {
			buffer = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
			offset = options;
			length = lenOrEnc as number;
			position = typeof position === 'number' ? position : null;
		}
		position ??= this.file.position;
		const bytesWritten = await this.file.write(buffer, offset, length, position);
		emitChange('change', this.file.path);
		return { buffer: data, bytesWritten };
	}

	/**
	 * Asynchronously writes data to a file, replacing the file if it already exists. The underlying file will _not_ be closed automatically.
	 * The `FileHandle` must have been opened for writing.
	 * It is unsafe to call `writeFile()` multiple times on the same file without waiting for the `Promise` to be resolved (or rejected).
	 * @param data The data to write. If something other than a `Buffer` or `Uint8Array` is provided, the value is coerced to a string.
	 * @param _options Either the encoding for the file, or an object optionally specifying the encoding, file mode, and flag.
	 * - `encoding` defaults to `'utf8'`.
	 * - `mode` defaults to `0o666`.
	 * - `flag` defaults to `'w'`.
	 */
	public async writeFile(data: string | Uint8Array, _options: fs.WriteFileOptions = {}): Promise<void> {
		const options = normalizeOptions(_options, 'utf8', 'w', 0o644);
		const flag = parseFlag(options.flag);
		if (!isWriteable(flag)) {
			throw new ErrnoError(Errno.EINVAL, 'Flag passed must allow for writing.');
		}
		if (typeof data != 'string' && !options.encoding) {
			throw new ErrnoError(Errno.EINVAL, 'Encoding not specified');
		}
		const encodedData = typeof data == 'string' ? Buffer.from(data, options.encoding!) : data;
		await this.file.write(encodedData, 0, encodedData.length, 0);
		emitChange('change', this.file.path);
	}

	/**
	 * Asynchronous close(2) - close a `FileHandle`.
	 */
	public async close(): Promise<void> {
		await this.file.close();
		fdMap.delete(this.fd);
	}

	/**
	 * Asynchronous `writev`. Writes from multiple buffers.
	 * @param buffers An array of Uint8Array buffers.
	 * @param position The position in the file where to begin writing.
	 * @returns The number of bytes written.
	 */
	public async writev(buffers: Uint8Array[], position?: number): Promise<fs.WriteVResult> {
		let bytesWritten = 0;

		for (const buffer of buffers) {
			bytesWritten += (await this.write(buffer, 0, buffer.length, position! + bytesWritten)).bytesWritten;
		}

		return { bytesWritten, buffers };
	}

	/**
	 * Asynchronous `readv`. Reads into multiple buffers.
	 * @param buffers An array of Uint8Array buffers.
	 * @param position The position in the file where to begin reading.
	 * @returns The number of bytes read.
	 */
	public async readv(buffers: NodeJS.ArrayBufferView[], position?: number): Promise<fs.ReadVResult> {
		let bytesRead = 0;

		for (const buffer of buffers) {
			bytesRead += (await this.read(buffer, 0, buffer.byteLength, position! + bytesRead)).bytesRead;
		}

		return { bytesRead, buffers };
	}

	/**
	 * Creates a stream for reading from the file.
	 * @param options Options for the readable stream
	 */
	public createReadStream(options?: promises.CreateReadStreamOptions): ReadStream {
		const stream = new ReadStream({
			highWaterMark: options?.highWaterMark || 64 * 1024,
			encoding: options!.encoding!,

			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			read: async (size: number) => {
				try {
					const result = await this.read(new Uint8Array(size), 0, size, this.file.position);
					stream.push(!result.bytesRead ? null : result.buffer.slice(0, result.bytesRead)); // Push data or null for EOF
					this.file.position += result.bytesRead;
				} catch (error) {
					stream.destroy(error as Error);
				}
			},
		});

		stream.path = this.file.path;
		return stream;
	}

	/**
	 * Creates a stream for writing to the file.
	 * @param options Options for the writeable stream.
	 */
	public createWriteStream(options?: promises.CreateWriteStreamOptions): WriteStream {
		const streamOptions = {
			highWaterMark: options?.highWaterMark,
			encoding: options?.encoding,

			write: async (chunk: Uint8Array, encoding: BufferEncoding, callback: (error?: Error | null) => void) => {
				try {
					const { bytesWritten } = await this.write(chunk, null, encoding);
					callback(bytesWritten == chunk.length ? null : new Error('Failed to write full chunk'));
				} catch (error) {
					callback(error as Error);
				}
			},
		};

		const stream = new WriteStream(streamOptions);
		stream.path = this.file.path;
		return stream;
	}
}

export async function rename(this: V_Context, oldPath: fs.PathLike, newPath: fs.PathLike): Promise<void> {
	oldPath = normalizePath(oldPath);
	newPath = normalizePath(newPath);
	const src = resolveMount(oldPath, this);
	const dst = resolveMount(newPath, this);
	if (config.checkAccess && !(await stat.call(this, dirname(oldPath))).hasAccess(constants.W_OK, this)) {
		throw ErrnoError.With('EACCES', oldPath, 'rename');
	}
	try {
		if (src.mountPoint == dst.mountPoint) {
			await src.fs.rename(src.path, dst.path);
			emitChange('rename', oldPath.toString());
			emitChange('change', newPath.toString());
			return;
		}
		await writeFile.call(this, newPath, await readFile(oldPath));
		await unlink.call(this, oldPath);
		emitChange('rename', oldPath.toString());
	} catch (e) {
		throw fixError(e as ErrnoError, { [src.path]: oldPath, [dst.path]: newPath });
	}
}
rename satisfies typeof promises.rename;

/**
 * Test whether or not `path` exists by checking with the file system.
 */
export async function exists(this: V_Context, path: fs.PathLike): Promise<boolean> {
	try {
		const { fs, path: resolved } = resolveMount(await realpath.call(this, path), this);
		return await fs.exists(resolved);
	} catch (e) {
		if (e instanceof ErrnoError && e.code == 'ENOENT') {
			return false;
		}

		throw e;
	}
}

export async function stat(this: V_Context, path: fs.PathLike, options: fs.BigIntOptions): Promise<BigIntStats>;
export async function stat(this: V_Context, path: fs.PathLike, options?: { bigint?: false }): Promise<Stats>;
export async function stat(this: V_Context, path: fs.PathLike, options?: fs.StatOptions): Promise<Stats | BigIntStats>;
export async function stat(this: V_Context, path: fs.PathLike, options?: fs.StatOptions): Promise<Stats | BigIntStats> {
	path = normalizePath(path);
	const { fs, path: resolved } = resolveMount(await realpath.call(this, path), this);
	try {
		const stats = await fs.stat(resolved);
		if (config.checkAccess && !stats.hasAccess(constants.R_OK, this)) {
			throw ErrnoError.With('EACCES', resolved, 'stat');
		}
		return options?.bigint ? new BigIntStats(stats) : stats;
	} catch (e) {
		throw fixError(e as ErrnoError, { [resolved]: path });
	}
}
stat satisfies typeof promises.stat;

/**
 * `lstat`.
 * `lstat()` is identical to `stat()`, except that if path is a symbolic link,
 * then the link itself is stat-ed, not the file that it refers to.
 */
export async function lstat(this: V_Context, path: fs.PathLike, options?: { bigint?: boolean }): Promise<Stats>;
export async function lstat(this: V_Context, path: fs.PathLike, options: { bigint: true }): Promise<BigIntStats>;
export async function lstat(this: V_Context, path: fs.PathLike, options?: fs.StatOptions): Promise<Stats | BigIntStats> {
	path = normalizePath(path);
	const { fs, path: resolved } = resolveMount(path, this);
	try {
		const stats = await fs.stat(resolved);
		return options?.bigint ? new BigIntStats(stats) : stats;
	} catch (e) {
		throw fixError(e as ErrnoError, { [resolved]: path });
	}
}
lstat satisfies typeof promises.lstat;

// FILE-ONLY METHODS

export async function truncate(this: V_Context, path: fs.PathLike, len: number = 0): Promise<void> {
	await using handle = await open.call(this, path, 'r+');
	await handle.truncate(len);
}
truncate satisfies typeof promises.truncate;

export async function unlink(this: V_Context, path: fs.PathLike): Promise<void> {
	path = normalizePath(path);
	const { fs, path: resolved } = resolveMount(path, this);
	try {
		if (config.checkAccess && !(await (cache.stats.getAsync(path) || fs.stat(resolved))).hasAccess(constants.W_OK, this)) {
			throw ErrnoError.With('EACCES', resolved, 'unlink');
		}
		await fs.unlink(resolved);
		emitChange('rename', path.toString());
	} catch (e) {
		throw fixError(e as ErrnoError, { [resolved]: path });
	}
}
unlink satisfies typeof promises.unlink;

/**
 * Manually apply setuid/setgid.
 */
async function applySetId(file: File, uid: number, gid: number) {
	if (file.fs.metadata().features?.includes('setid')) return;

	const parent = await file.fs.stat(dirname(file.path));
	await file.chown(
		parent.mode & constants.S_ISUID ? parent.uid : uid, // manually apply setuid/setgid
		parent.mode & constants.S_ISGID ? parent.gid : gid
	);
}

/**
 * Opens a file. This helper handles the complexity of file flags.
 * @internal
 */
async function _open(this: V_Context, path: fs.PathLike, _flag: fs.OpenMode, _mode: fs.Mode = 0o644, resolveSymlinks: boolean): Promise<FileHandle> {
	path = normalizePath(path);
	const mode = normalizeMode(_mode, 0o644),
		flag = parseFlag(_flag);

	path = resolveSymlinks ? await realpath.call(this, path) : path;
	const { fs, path: resolved } = resolveMount(path, this);

	const stats = await fs.stat(resolved).catch(() => null);

	if (!stats) {
		if ((!isWriteable(flag) && !isAppendable(flag)) || flag == 'r+') {
			throw ErrnoError.With('ENOENT', path, '_open');
		}
		// Create the file
		const parentStats: Stats = await fs.stat(dirname(resolved));
		if (config.checkAccess && !parentStats.hasAccess(constants.W_OK, this)) {
			throw ErrnoError.With('EACCES', dirname(path), '_open');
		}
		if (!parentStats.isDirectory()) {
			throw ErrnoError.With('ENOTDIR', dirname(path), '_open');
		}
		const { euid: uid, egid: gid } = this?.credentials ?? credentials;
		const file = await fs.createFile(resolved, flag, mode, { uid, gid });
		await applySetId(file, uid, gid);
		return new FileHandle(file, this);
	}

	if (config.checkAccess && !stats.hasAccess(flagToMode(flag), this)) {
		throw ErrnoError.With('EACCES', path, '_open');
	}

	if (isExclusive(flag)) {
		throw ErrnoError.With('EEXIST', path, '_open');
	}

	const handle = new FileHandle(await fs.openFile(resolved, flag), this);

	/*
		In a previous implementation, we deleted the file and
		re-created it. However, this created a race condition if another
		asynchronous request was trying to read the file, as the file
		would not exist for a small period of time.
	*/
	if (isTruncating(flag)) {
		await handle.truncate(0);
	}

	return handle;
}

/**
 * Asynchronous file open.
 * @see http://www.manpagez.com/man/2/open/
 * @param flag Handles the complexity of the various file modes. See its API for more details.
 * @param mode Mode to use to open the file. Can be ignored if the filesystem doesn't support permissions.
 */
export async function open(this: V_Context, path: fs.PathLike, flag: fs.OpenMode = 'r', mode: fs.Mode = 0o644): Promise<FileHandle> {
	return await _open.call(this, path, flag, mode, true);
}
open satisfies typeof promises.open;

/**
 * Asynchronously reads the entire contents of a file.
 * @option encoding The string encoding for the file contents. Defaults to `null`.
 * @option flag Defaults to `'r'`.
 * @returns the file data
 */
export async function readFile(this: V_Context, path: fs.PathLike | promises.FileHandle, options?: { encoding?: null; flag?: fs.OpenMode } | null): Promise<Buffer>;
export async function readFile(
	this: V_Context,
	path: fs.PathLike | promises.FileHandle,
	options: { encoding: BufferEncoding; flag?: fs.OpenMode } | BufferEncoding
): Promise<string>;
export async function readFile(
	this: V_Context,
	path: fs.PathLike | promises.FileHandle,
	options?: (fs.ObjectEncodingOptions & { flag?: fs.OpenMode }) | BufferEncoding | null
): Promise<string | Buffer>;
export async function readFile(
	this: V_Context,
	path: fs.PathLike | promises.FileHandle,
	_options?: (fs.ObjectEncodingOptions & { flag?: fs.OpenMode }) | BufferEncoding | null
): Promise<Buffer | string> {
	const options = normalizeOptions(_options, null, 'r', 0o644);
	await using handle: FileHandle | promises.FileHandle = typeof path == 'object' && 'fd' in path ? path : await open.call(this, path as string, options.flag, options.mode);
	return await handle.readFile(options);
}
readFile satisfies typeof promises.readFile;

/**
 * Asynchronously writes data to a file, replacing the file if it already exists.
 *
 * The encoding option is ignored if data is a buffer.
 * @option encoding Defaults to `'utf8'`.
 * @option mode Defaults to `0644`.
 * @option flag Defaults to `'w'`.
 */
export async function writeFile(
	this: V_Context,
	path: fs.PathLike | promises.FileHandle,
	data: FileContents | Stream | Iterable<string | ArrayBufferView> | AsyncIterable<string | ArrayBufferView>,
	_options?: (fs.ObjectEncodingOptions & { mode?: fs.Mode; flag?: fs.OpenMode; flush?: boolean }) | BufferEncoding | null
): Promise<void> {
	const options = normalizeOptions(_options, 'utf8', 'w+', 0o644);
	await using handle = path instanceof FileHandle ? path : await open.call(this, (path as fs.PathLike).toString(), options.flag, options.mode);

	const _data = typeof data == 'string' ? data : data instanceof DataView ? new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) : data;
	if (typeof _data != 'string' && !(_data instanceof Uint8Array)) {
		throw new ErrnoError(
			Errno.EINVAL,
			'The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received ' + typeof data,
			handle.file.path,
			'writeFile'
		);
	}
	await handle.writeFile(_data, options);
}
writeFile satisfies typeof promises.writeFile;

/**
 * Asynchronously append data to a file, creating the file if it not yet exists.
 * @option encoding Defaults to `'utf8'`.
 * @option mode Defaults to `0644`.
 * @option flag Defaults to `'a'`.
 */
export async function appendFile(
	this: V_Context,
	path: fs.PathLike | promises.FileHandle,
	data: FileContents,
	_options?: BufferEncoding | (fs.EncodingOption & { mode?: fs.Mode; flag?: fs.OpenMode }) | null
): Promise<void> {
	const options = normalizeOptions(_options, 'utf8', 'a', 0o644);
	const flag = parseFlag(options.flag);
	if (!isAppendable(flag)) {
		throw new ErrnoError(Errno.EINVAL, 'Flag passed to appendFile must allow for appending.');
	}
	if (typeof data != 'string' && !options.encoding) {
		throw new ErrnoError(Errno.EINVAL, 'Encoding not specified');
	}
	const encodedData = typeof data == 'string' ? Buffer.from(data, options.encoding!) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	await using handle: FileHandle | promises.FileHandle = typeof path == 'object' && 'fd' in path ? path : await open.call(this, path as string, options.flag, options.mode);

	await handle.appendFile(encodedData, options);
}
appendFile satisfies typeof promises.appendFile;

// DIRECTORY-ONLY METHODS

export async function rmdir(this: V_Context, path: fs.PathLike): Promise<void> {
	path = await realpath.call(this, path);
	const { fs, path: resolved } = resolveMount(path, this);
	try {
		const stats = await (cache.stats.getAsync(path) || fs.stat(resolved));
		if (!stats) {
			throw ErrnoError.With('ENOENT', path, 'rmdir');
		}
		if (!stats.isDirectory()) {
			throw ErrnoError.With('ENOTDIR', resolved, 'rmdir');
		}
		if (config.checkAccess && !stats.hasAccess(constants.W_OK, this)) {
			throw ErrnoError.With('EACCES', resolved, 'rmdir');
		}
		await fs.rmdir(resolved);
		emitChange('rename', path.toString());
	} catch (e) {
		throw fixError(e as ErrnoError, { [resolved]: path });
	}
}
rmdir satisfies typeof promises.rmdir;

/**
 * Asynchronous mkdir(2) - create a directory.
 * @param path A path to a file. If a URL is provided, it must use the `file:` protocol.
 * @param options Either the file mode, or an object optionally specifying the file mode and whether parent folders
 * should be created. If a string is passed, it is parsed as an octal integer. If not specified, defaults to `0o777`.
 */
export async function mkdir(this: V_Context, path: fs.PathLike, options: fs.MakeDirectoryOptions & { recursive: true }): Promise<string | undefined>;
export async function mkdir(this: V_Context, path: fs.PathLike, options?: fs.Mode | (fs.MakeDirectoryOptions & { recursive?: false | undefined }) | null): Promise<void>;
export async function mkdir(this: V_Context, path: fs.PathLike, options?: fs.Mode | fs.MakeDirectoryOptions | null): Promise<string | undefined>;
export async function mkdir(this: V_Context, path: fs.PathLike, options?: fs.Mode | fs.MakeDirectoryOptions | null): Promise<string | undefined | void> {
	const { euid: uid, egid: gid } = this?.credentials ?? credentials;
	options = typeof options === 'object' ? options : { mode: options };
	const mode = normalizeMode(options?.mode, 0o777);

	path = await realpath.call(this, path);
	const { fs, path: resolved, root } = resolveMount(path, this);
	const errorPaths: Record<string, string> = { [resolved]: path };

	try {
		if (!options?.recursive) {
			if (config.checkAccess && !(await fs.stat(dirname(resolved))).hasAccess(constants.W_OK, this)) {
				throw ErrnoError.With('EACCES', dirname(resolved), 'mkdir');
			}
			await fs.mkdir(resolved, mode, { uid, gid });
			await applySetId(await fs.openFile(resolved, 'r+'), uid, gid);
			emitChange('rename', path.toString());
			return;
		}

		const dirs: string[] = [];
		for (let dir = resolved, origDir = path; !(await fs.exists(dir)); dir = dirname(dir), origDir = dirname(origDir)) {
			dirs.unshift(dir);
			errorPaths[dir] = origDir;
		}
		for (const dir of dirs) {
			if (config.checkAccess && !(await fs.stat(dirname(dir))).hasAccess(constants.W_OK, this)) {
				throw ErrnoError.With('EACCES', dirname(dir), 'mkdir');
			}
			await fs.mkdir(dir, mode, { uid, gid });
			await applySetId(await fs.openFile(dir, 'r+'), uid, gid);
			emitChange('rename', dir);
		}
		return root.length == 1 ? dirs[0] : dirs[0]?.slice(root.length);
	} catch (e) {
		throw fixError(e as ErrnoError, errorPaths);
	}
}
mkdir satisfies typeof promises.mkdir;

/**
 * Asynchronous readdir(3) - read a directory.
 *
 * Note: The order of entries is not guaranteed
 * @param path A path to a file. If a URL is provided, it must use the `file:` protocol.
 * @param options The encoding (or an object specifying the encoding), used as the encoding of the result. If not provided, `'utf8'`.
 */
export async function readdir(this: V_Context, path: fs.PathLike, options?: ReaddirOptsI<{ withFileTypes?: false }> | NullEnc): Promise<string[]>;
export async function readdir(this: V_Context, path: fs.PathLike, options: fs.BufferEncodingOption & ReaddirOptions & { withFileTypes?: false }): Promise<Buffer[]>;
export async function readdir(this: V_Context, path: fs.PathLike, options?: ReaddirOptsI<{ withFileTypes?: false }> | NullEnc): Promise<string[] | Buffer[]>;
export async function readdir(this: V_Context, path: fs.PathLike, options: ReaddirOptsI<{ withFileTypes: true }>): Promise<Dirent[]>;
export async function readdir(this: V_Context, path: fs.PathLike, options?: ReaddirOptsU<fs.BufferEncodingOption> | NullEnc): Promise<string[] | Dirent[] | Buffer[]>;
export async function readdir(this: V_Context, path: fs.PathLike, options?: ReaddirOptsU<fs.BufferEncodingOption> | NullEnc): Promise<string[] | Dirent[] | Buffer[]> {
	options = typeof options === 'object' ? options : { encoding: options };
	path = await realpath.call(this, path);

	const handleError = (e: ErrnoError) => {
		throw fixError(e, { [resolved]: path });
	};

	const { fs, path: resolved } = resolveMount(path, this);

	const _stats = cache.stats.getAsync(path) || fs.stat(resolved).catch(handleError);
	cache.stats.setAsync(path, _stats);
	const stats = await _stats;

	if (!stats) {
		throw ErrnoError.With('ENOENT', path, 'readdir');
	}

	if (config.checkAccess && !stats.hasAccess(constants.R_OK, this)) {
		throw ErrnoError.With('EACCES', path, 'readdir');
	}

	if (!stats.isDirectory()) {
		throw ErrnoError.With('ENOTDIR', path, 'readdir');
	}

	const entries = await fs.readdir(resolved).catch(handleError);

	const values: (string | Dirent | Buffer)[] = [];
	const addEntry = async (entry: string) => {
		let entryStats: Stats | undefined;
		if (options?.recursive || options?.withFileTypes) {
			const _entryStats = cache.stats.getAsync(join(path, entry)) || fs.stat(join(resolved, entry)).catch(handleError);
			cache.stats.setAsync(join(path, entry), _entryStats);
			entryStats = await _entryStats;
		}
		if (options?.withFileTypes) {
			values.push(new Dirent(entry, entryStats!));
		} else if (options?.encoding == 'buffer') {
			values.push(Buffer.from(entry));
		} else {
			values.push(entry);
		}

		if (!options?.recursive || !entryStats?.isDirectory()) return;

		for (const subEntry of await readdir.call(this, join(path, entry), { ...options, _isIndirect: true })) {
			if (subEntry instanceof Dirent) {
				subEntry.path = join(entry, subEntry.path);
				values.push(subEntry);
			} else if (Buffer.isBuffer(subEntry)) {
				// Convert Buffer to string, prefix with the full path
				values.push(Buffer.from(join(entry, decodeUTF8(subEntry))));
			} else {
				values.push(join(entry, subEntry));
			}
		}
	};
	await Promise.all(entries.map(addEntry));
	if (!options?._isIndirect) {
		cache.stats.clear();
	}

	return values as string[] | Dirent[];
}
readdir satisfies typeof promises.readdir;

export async function link(this: V_Context, targetPath: fs.PathLike, linkPath: fs.PathLike): Promise<void> {
	targetPath = normalizePath(targetPath);
	linkPath = normalizePath(linkPath);

	const { fs, path } = resolveMount(targetPath, this);
	const link = resolveMount(linkPath, this);

	if (fs != link.fs) {
		throw ErrnoError.With('EXDEV', linkPath, 'link');
	}

	try {
		if (config.checkAccess && !(await fs.stat(dirname(targetPath))).hasAccess(constants.R_OK, this)) {
			throw ErrnoError.With('EACCES', dirname(path), 'link');
		}

		if (config.checkAccess && !(await stat.call(this, dirname(linkPath))).hasAccess(constants.W_OK, this)) {
			throw ErrnoError.With('EACCES', dirname(linkPath), 'link');
		}

		if (config.checkAccess && !(await fs.stat(path)).hasAccess(constants.R_OK, this)) {
			throw ErrnoError.With('EACCES', path, 'link');
		}
		return await fs.link(path, link.path);
	} catch (e) {
		throw fixError(e as ErrnoError, { [link.path]: linkPath, [path]: targetPath });
	}
}
link satisfies typeof promises.link;

/**
 * `symlink`.
 * @param target target path
 * @param path link path
 * @param type can be either `'dir'` or `'file'` (default is `'file'`)
 */
export async function symlink(this: V_Context, target: fs.PathLike, path: fs.PathLike, type: fs.symlink.Type | string | null = 'file'): Promise<void> {
	if (!['file', 'dir', 'junction'].includes(type!)) {
		throw new ErrnoError(Errno.EINVAL, 'Invalid symlink type: ' + type);
	}

	if (await exists.call(this, path)) {
		throw ErrnoError.With('EEXIST', path.toString(), 'symlink');
	}

	await using handle = await _open.call(this, path, 'w+', 0o644, false);
	await handle.writeFile(target.toString());
	await handle.file.chmod(constants.S_IFLNK);
}
symlink satisfies typeof promises.symlink;

export async function readlink(this: V_Context, path: fs.PathLike, options: fs.BufferEncodingOption): Promise<Buffer>;
export async function readlink(this: V_Context, path: fs.PathLike, options?: fs.EncodingOption | null): Promise<string>;
export async function readlink(this: V_Context, path: fs.PathLike, options?: fs.BufferEncodingOption | fs.EncodingOption | string | null): Promise<string | Buffer>;
export async function readlink(this: V_Context, path: fs.PathLike, options?: fs.BufferEncodingOption | fs.EncodingOption | string | null): Promise<string | Buffer> {
	await using handle = await _open.call(this, normalizePath(path), 'r', 0o644, false);
	const value = await handle.readFile();
	const encoding = typeof options == 'object' ? options?.encoding : options;
	// always defaults to utf-8 to avoid wrangler (cloudflare) worker "unknown encoding" exception
	return encoding == 'buffer' ? value : value.toString((encoding ?? 'utf-8') as BufferEncoding);
}
readlink satisfies typeof promises.readlink;

export async function chown(this: V_Context, path: fs.PathLike, uid: number, gid: number): Promise<void> {
	await using handle = await open.call(this, path, 'r+');
	await handle.chown(uid, gid);
}
chown satisfies typeof promises.chown;

export async function lchown(this: V_Context, path: fs.PathLike, uid: number, gid: number): Promise<void> {
	await using handle: FileHandle = await _open.call(this, path, 'r+', 0o644, false);
	await handle.chown(uid, gid);
}
lchown satisfies typeof promises.lchown;

export async function chmod(this: V_Context, path: fs.PathLike, mode: fs.Mode): Promise<void> {
	await using handle = await open.call(this, path, 'r+');
	await handle.chmod(mode);
}
chmod satisfies typeof promises.chmod;

export async function lchmod(this: V_Context, path: fs.PathLike, mode: fs.Mode): Promise<void> {
	await using handle: FileHandle = await _open.call(this, path, 'r+', 0o644, false);
	await handle.chmod(mode);
}
lchmod satisfies typeof promises.lchmod;

/**
 * Change file timestamps of the file referenced by the supplied path.
 */
export async function utimes(this: V_Context, path: fs.PathLike, atime: string | number | Date, mtime: string | number | Date): Promise<void> {
	await using handle = await open.call(this, path, 'r+');
	await handle.utimes(atime, mtime);
}
utimes satisfies typeof promises.utimes;

/**
 * Change file timestamps of the file referenced by the supplied path.
 */
export async function lutimes(this: V_Context, path: fs.PathLike, atime: fs.TimeLike, mtime: fs.TimeLike): Promise<void> {
	await using handle: FileHandle = await _open.call(this, path, 'r+', 0o644, false);
	await handle.utimes(new Date(atime), new Date(mtime));
}
lutimes satisfies typeof promises.lutimes;

/**
 * Asynchronous realpath(3) - return the canonicalized absolute pathname.
 * @param path A path to a file. If a URL is provided, it must use the `file:` protocol.
 * @param options The encoding (or an object specifying the encoding), used as the encoding of the result. Defaults to `'utf8'`.
 * @todo handle options
 */
export async function realpath(this: V_Context, path: fs.PathLike, options: fs.BufferEncodingOption): Promise<Buffer>;
export async function realpath(this: V_Context, path: fs.PathLike, options?: fs.EncodingOption | BufferEncoding): Promise<string>;
export async function realpath(this: V_Context, path: fs.PathLike, options?: fs.EncodingOption | BufferEncoding | fs.BufferEncodingOption): Promise<string | Buffer> {
	path = normalizePath(path);
	const ctx_path = (this?.root || '') + path;
	if (cache.paths.hasAsync(ctx_path)) return cache.paths.getAsync(ctx_path)!;
	const { base, dir } = parse(path);
	const realDir = dir == '/' ? '/' : await (cache.paths.getAsync((this?.root || '') + dir) || realpath.call(this, dir));
	const lpath = join(realDir, base);
	const { fs, path: resolvedPath } = resolveMount(lpath, this);

	try {
		const _stats = cache.stats.getAsync(lpath) || fs.stat(resolvedPath);
		cache.stats.setAsync(lpath, _stats);
		if (!(await _stats).isSymbolicLink()) {
			cache.paths.set(path, lpath);
			return lpath;
		}

		const target = resolve(realDir, (await readlink.call(this, lpath)).toString());

		const real = cache.paths.getAsync((this?.root || '') + target) || realpath.call(this, target);
		cache.paths.setAsync(ctx_path, real);
		return await real;
	} catch (e) {
		if ((e as ErrnoError).code == 'ENOENT') {
			return path;
		}
		throw fixError(e as ErrnoError, { [resolvedPath]: lpath });
	}
}
realpath satisfies typeof promises.realpath;

export function watch(this: V_Context, filename: fs.PathLike, options?: fs.WatchOptions | BufferEncoding): AsyncIterable<promises.FileChangeInfo<string>>;
export function watch(this: V_Context, filename: fs.PathLike, options: fs.WatchOptions | fs.BufferEncodingOption): AsyncIterable<promises.FileChangeInfo<Buffer>>;
export function watch(
	this: V_Context,
	filename: fs.PathLike,
	options?: fs.WatchOptions | string
): AsyncIterable<promises.FileChangeInfo<string>> | AsyncIterable<promises.FileChangeInfo<Buffer>>;
export function watch<T extends string | Buffer>(this: V_Context, filename: fs.PathLike, options: fs.WatchOptions | string = {}): AsyncIterable<promises.FileChangeInfo<T>> {
	const context = this;
	return {
		[Symbol.asyncIterator](): AsyncIterator<promises.FileChangeInfo<T>> {
			const watcher = new FSWatcher<T>(context, filename.toString(), typeof options !== 'string' ? options : { encoding: options as BufferEncoding | 'buffer' });

			// A queue to hold change events, since we need to resolve them in the async iterator
			const eventQueue: ((value: IteratorResult<promises.FileChangeInfo<T>>) => void)[] = [];

			watcher.on('change', (eventType: promises.FileChangeInfo<T>['eventType'], filename: T) => {
				eventQueue.shift()?.({ value: { eventType, filename }, done: false });
			});

			function cleanup() {
				watcher.close();
				for (const resolve of eventQueue) {
					resolve({ value: null, done: true });
				}
				eventQueue.length = 0; // Clear the queue
				return Promise.resolve({ value: null, done: true as const });
			}

			return {
				async next() {
					const { promise, resolve } = Promise.withResolvers<IteratorResult<promises.FileChangeInfo<T>>>();
					eventQueue.push(resolve);
					return promise;
				},
				return: cleanup,
				throw: cleanup,
				[Symbol.asyncDispose]() {
					return Promise.resolve();
				},
			};
		},
	};
}
watch satisfies typeof promises.watch;

export async function access(this: V_Context, path: fs.PathLike, mode: number = constants.F_OK): Promise<void> {
	if (!config.checkAccess) return;
	const stats = await stat.call(this, path);
	if (!stats.hasAccess(mode, this)) {
		throw new ErrnoError(Errno.EACCES);
	}
}
access satisfies typeof promises.access;

/**
 * Asynchronous `rm`. Removes files or directories (recursively).
 * @param path The path to the file or directory to remove.
 */
export async function rm(this: V_Context, path: fs.PathLike, options?: fs.RmOptions & InternalOptions) {
	path = normalizePath(path);

	const stats = await (cache.stats.getAsync(path) ||
		lstat.call<V_Context, [string], Promise<Stats>>(this, path).catch((error: ErrnoError) => {
			if (error.code == 'ENOENT' && options?.force) return undefined;
			throw error;
		}));

	if (!stats) {
		return;
	}

	cache.stats.set(path, stats);

	switch (stats.mode & constants.S_IFMT) {
		case constants.S_IFDIR:
			if (options?.recursive) {
				for (const entry of await readdir.call<V_Context, [string, any], Promise<string[]>>(this, path, { _isIndirect: true })) {
					await rm.call(this, join(path, entry), { ...options, _isIndirect: true });
				}
			}

			await rmdir.call(this, path);
			break;
		case constants.S_IFREG:
		case constants.S_IFLNK:
		case constants.S_IFBLK:
		case constants.S_IFCHR:
			await unlink.call(this, path);
			break;
		case constants.S_IFIFO:
		case constants.S_IFSOCK:
		default:
			cache.stats.clear();
			throw new ErrnoError(Errno.EPERM, 'File type not supported', path, 'rm');
	}

	if (!options?._isIndirect) {
		cache.stats.clear();
	}
}
rm satisfies typeof promises.rm;

/**
 * Asynchronous `mkdtemp`. Creates a unique temporary directory.
 * @param prefix The directory prefix.
 * @param options The encoding (or an object including `encoding`).
 * @returns The path to the created temporary directory, encoded as a string or buffer.
 */
export async function mkdtemp(this: V_Context, prefix: string, options?: fs.EncodingOption): Promise<string>;
export async function mkdtemp(this: V_Context, prefix: string, options?: fs.BufferEncodingOption): Promise<Buffer>;
export async function mkdtemp(this: V_Context, prefix: string, options?: fs.EncodingOption | fs.BufferEncodingOption): Promise<string | Buffer> {
	const encoding = typeof options === 'object' ? options?.encoding : options || 'utf8';
	const fsName = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const resolvedPath = '/tmp/' + fsName;

	await mkdir.call(this, resolvedPath);

	return encoding == 'buffer' ? Buffer.from(resolvedPath) : resolvedPath;
}
mkdtemp satisfies typeof promises.mkdtemp;

/**
 * Asynchronous `copyFile`. Copies a file.
 * @param src The source file.
 * @param dest The destination file.
 * @param mode Optional flags for the copy operation. Currently supports these flags:
 *    * `fs.constants.COPYFILE_EXCL`: If the destination file already exists, the operation fails.
 */
export async function copyFile(this: V_Context, src: fs.PathLike, dest: fs.PathLike, mode?: number): Promise<void> {
	src = normalizePath(src);
	dest = normalizePath(dest);

	if (mode && mode & constants.COPYFILE_EXCL && (await exists.call(this, dest))) {
		throw new ErrnoError(Errno.EEXIST, 'Destination file already exists.', dest, 'copyFile');
	}

	await writeFile.call(this, dest, await readFile.call(this, src));
	emitChange('rename', dest.toString());
}
copyFile satisfies typeof promises.copyFile;

/**
 * Asynchronous `opendir`. Opens a directory.
 * @param path The path to the directory.
 * @param options Options for opening the directory.
 * @returns A `Dir` object representing the opened directory.
 * @todo Use options
 */
export function opendir(this: V_Context, path: fs.PathLike, options?: fs.OpenDirOptions): Promise<Dir> {
	path = normalizePath(path);
	return Promise.resolve(new Dir(path, this));
}
opendir satisfies typeof promises.opendir;

/**
 * Asynchronous `cp`. Recursively copies a file or directory.
 * @param source The source file or directory.
 * @param destination The destination file or directory.
 * @param opts Options for the copy operation. Currently supports these options from Node.js 'fs.await cp':
 *   * `dereference`: Dereference symbolic links.
 *   * `errorOnExist`: Throw an error if the destination file or directory already exists.
 *   * `filter`: A function that takes a source and destination path and returns a boolean, indicating whether to copy `source` element.
 *   * `force`: Overwrite the destination if it exists, and overwrite existing readonly destination files.
 *   * `preserveTimestamps`: Preserve file timestamps.
 *   * `recursive`: If `true`, copies directories recursively.
 */
export async function cp(this: V_Context, source: fs.PathLike, destination: fs.PathLike, opts?: fs.CopyOptions): Promise<void> {
	source = normalizePath(source);
	destination = normalizePath(destination);

	const srcStats = await lstat.call<V_Context, [string], Promise<Stats>>(this, source); // Use lstat to follow symlinks if not dereferencing

	if (opts?.errorOnExist && (await exists.call(this, destination))) {
		throw new ErrnoError(Errno.EEXIST, 'Destination file or directory already exists.', destination, 'cp');
	}

	switch (srcStats.mode & constants.S_IFMT) {
		case constants.S_IFDIR: {
			if (!opts?.recursive) {
				throw new ErrnoError(Errno.EISDIR, source + ' is a directory (not copied)', source, 'cp');
			}
			const [entries] = await Promise.all(
				[readdir.call<V_Context, [string, any], Promise<Dirent[]>>(this, source, { withFileTypes: true }), mkdir.call(this, destination, { recursive: true })] // Ensure the destination directory exists
			);

			const _cp = async (dirent: Dirent) => {
				if (opts.filter && !opts.filter(join(source, dirent.name), join(destination, dirent.name))) {
					return; // Skip if the filter returns false
				}
				await cp.call(this, join(source, dirent.name), join(destination, dirent.name), opts);
			};
			await Promise.all(entries.map(_cp));
			break;
		}
		case constants.S_IFREG:
		case constants.S_IFLNK:
			await copyFile.call(this, source, destination);
			break;
		case constants.S_IFBLK:
		case constants.S_IFCHR:
		case constants.S_IFIFO:
		case constants.S_IFSOCK:
		default:
			throw new ErrnoError(Errno.EPERM, 'File type not supported', source, 'rm');
	}

	// Optionally preserve timestamps
	if (opts?.preserveTimestamps) {
		await utimes.call(this, destination, srcStats.atime, srcStats.mtime);
	}
}
cp satisfies typeof promises.cp;

/**
 * @since Node v18.15.0
 * @returns Fulfills with an {fs.StatFs} for the file system.
 */
export async function statfs(this: V_Context, path: fs.PathLike, opts?: fs.StatFsOptions & { bigint?: false }): Promise<fs.StatsFs>;
export async function statfs(this: V_Context, path: fs.PathLike, opts: fs.StatFsOptions & { bigint: true }): Promise<fs.BigIntStatsFs>;
export async function statfs(this: V_Context, path: fs.PathLike, opts?: fs.StatFsOptions): Promise<fs.StatsFs | fs.BigIntStatsFs>;
export async function statfs(this: V_Context, path: fs.PathLike, opts?: fs.StatFsOptions): Promise<fs.StatsFs | fs.BigIntStatsFs> {
	path = normalizePath(path);
	const { fs } = resolveMount(path, this);
	return Promise.resolve(_statfs(fs, opts?.bigint));
}

/**
 * Retrieves the files matching the specified pattern.
 */
export function glob(this: V_Context, pattern: string | string[]): NodeJS.AsyncIterator<string>;
export function glob(this: V_Context, pattern: string | string[], opt: fs.GlobOptionsWithFileTypes): NodeJS.AsyncIterator<Dirent>;
export function glob(this: V_Context, pattern: string | string[], opt: fs.GlobOptionsWithoutFileTypes): NodeJS.AsyncIterator<string>;
export function glob(this: V_Context, pattern: string | string[], opt: fs.GlobOptions): NodeJS.AsyncIterator<Dirent | string>;
export function glob(this: V_Context, pattern: string | string[], opt?: GlobOptionsU): NodeJS.AsyncIterator<Dirent | string> {
	pattern = Array.isArray(pattern) ? pattern : [pattern];
	const { cwd = '/', withFileTypes = false, exclude = () => false } = opt || {};

	type Entries = true extends typeof withFileTypes ? Dirent[] : string[];

	// Escape special characters in pattern
	const regexPatterns = pattern.map(p => {
		p = p
			.replace(/([.?+^$(){}|[\]/])/g, '$1')
			.replace(/\*\*/g, '.*')
			.replace(/\*/g, '[^/]*')
			.replace(/\?/g, '.');
		return new RegExp(`^${p}$`);
	});

	async function* recursiveList(dir: string): AsyncGenerator<string | Dirent> {
		const entries = await readdir(dir, { withFileTypes, encoding: 'utf8' });

		for (const entry of entries as Entries) {
			const fullPath = withFileTypes ? entry.path : dir + '/' + entry;
			if (exclude((withFileTypes ? entry : fullPath) as any)) continue;

			/**
			 * @todo it the pattern.source check correct?
			 */
			if ((await stat(fullPath)).isDirectory() && regexPatterns.some(pattern => pattern.source.includes('.*'))) {
				yield* recursiveList(fullPath);
			}

			if (regexPatterns.some(pattern => pattern.test(fullPath.replace(/^\/+/g, '')))) {
				yield withFileTypes ? entry : fullPath.replace(/^\/+/g, '');
			}
		}
	}

	return recursiveList(cwd);
}
glob satisfies typeof promises.glob;