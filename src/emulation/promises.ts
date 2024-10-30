/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Buffer } from 'buffer';
import type * as fs from 'node:fs';
import type * as promises from 'node:fs/promises';
import type { Stream } from 'node:stream';
import type { ReadableStreamController, ReadableStream as TReadableStream } from 'node:stream/web';
import type { Interface as ReadlineInterface } from 'readline';
import { Errno, ErrnoError } from '../error.js';
import type { File } from '../file.js';
import { isAppendable, isReadable, isWriteable, parseFlag } from '../file.js';
import type { FileContents } from '../filesystem.js';
import '../polyfills.js';
import { BigIntStats, type Stats } from '../stats.js';
import { normalizeMode, normalizeOptions, normalizeTime } from '../utils.js';
import * as constants from './constants.js';
import type { Dir, Dirent } from './dir.js';
import { FileSystemCall } from './fscall.js';
import { fd2file, fdMap, file2fd } from './shared.js';
import { ReadStream, WriteStream } from './streams.js';
import { emitChange } from './watchers.js';
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

	public constructor(fdOrFile: number | File) {
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
	public read<TBuffer extends NodeJS.ArrayBufferView>(buffer: TBuffer, offset?: number, length?: number, position?: number | null): Promise<promises.FileReadResult<TBuffer>> {
		if (isNaN(+position!)) {
			position = this.file.position;
		}
		return this.file.read(buffer, offset, length, position!);
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
	 *
	 * @since v17.0.0
	 * @experimental
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
		if (!stats.hasAccess(constants.R_OK)) {
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
	public async write(
		data: FileContents,
		posOrOff?: number | null,
		lenOrEnc?: BufferEncoding | number,
		position?: number | null
	): Promise<{ bytesWritten: number; buffer: FileContents }>;
	public async write<TBuffer extends Uint8Array>(buffer: TBuffer, offset?: number, length?: number, position?: number): Promise<{ bytesWritten: number; buffer: TBuffer }>;
	public async write(data: string, position?: number, encoding?: BufferEncoding): Promise<{ bytesWritten: number; buffer: string }>;
	public async write(
		data: FileContents,
		posOrOff?: number,
		lenOrEnc?: BufferEncoding | number,
		position?: number | null
	): Promise<{ bytesWritten: number; buffer: FileContents }> {
		let buffer: Uint8Array, offset: number | null | undefined, length: number;
		if (typeof data === 'string') {
			// Signature 1: (fd, string, [position?, [encoding?]])
			position = typeof posOrOff === 'number' ? posOrOff : null;
			const encoding = typeof lenOrEnc === 'string' ? lenOrEnc : ('utf8' as BufferEncoding);
			offset = 0;
			buffer = Buffer.from(data, encoding);
			length = buffer.length;
		} else {
			// Signature 2: (fd, buffer, offset, length, position?)
			buffer = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
			offset = posOrOff;
			length = lenOrEnc as number;
			position = typeof position === 'number' ? position : null;
		}
		position ??= this.file.position;
		const bytesWritten = await this.file.write(buffer, offset, length, position);
		emitChange('change', this.file.path);
		return { buffer, bytesWritten };
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

export async function rename(oldPath: fs.PathLike, newPath: fs.PathLike): Promise<void> {
	using fs = new FileSystemCall();
	return fs.rename(oldPath, newPath);
}
rename satisfies typeof promises.rename;

/**
 * Test whether or not `path` exists by checking with the file system.
 */
export async function exists(path: fs.PathLike): Promise<boolean> {
	using fs = new FileSystemCall();
	return fs.exists(path);
}

export async function stat(path: fs.PathLike, options: fs.BigIntOptions): Promise<BigIntStats>;
export async function stat(path: fs.PathLike, options?: { bigint?: false }): Promise<Stats>;
export async function stat(path: fs.PathLike, options?: fs.StatOptions): Promise<Stats | BigIntStats>;
export async function stat(path: fs.PathLike, options?: fs.StatOptions): Promise<Stats | BigIntStats> {
	using fs = new FileSystemCall();
	return fs.stat(path, options);
}
stat satisfies typeof promises.stat;

// FILE-ONLY METHODS

export async function truncate(path: fs.PathLike, len: number = 0): Promise<void> {
	using fs = new FileSystemCall();
	return fs.truncate(path, len);
}
truncate satisfies typeof promises.truncate;

export async function unlink(path: fs.PathLike): Promise<void> {
	using fs = new FileSystemCall();
	return fs.unlink(path);
}
unlink satisfies typeof promises.unlink;

/**
 * Asynchronous file open.
 * @see http://www.manpagez.com/man/2/open/
 * @param flag Handles the complexity of the various file modes. See its API for more details.
 * @param mode Mode to use to open the file. Can be ignored if the filesystem doesn't support permissions.
 */
export async function open(path: fs.PathLike, flag: fs.OpenMode = 'r', mode: fs.Mode = 0o644): Promise<FileHandle> {
	using fs = new FileSystemCall();
	return fs.open(path, flag, mode);
}
open satisfies typeof promises.open;

/**
 * Asynchronously reads the entire contents of a file.
 * @option encoding The string encoding for the file contents. Defaults to `null`.
 * @option flag Defaults to `'r'`.
 * @returns the file data
 */
export async function readFile(path: fs.PathLike | promises.FileHandle, options?: { encoding?: null; flag?: fs.OpenMode } | null): Promise<Buffer>;
export async function readFile(path: fs.PathLike | promises.FileHandle, options: { encoding: BufferEncoding; flag?: fs.OpenMode } | BufferEncoding): Promise<string>;
export async function readFile(
	path: fs.PathLike | promises.FileHandle,
	options?: (fs.ObjectEncodingOptions & { flag?: fs.OpenMode }) | BufferEncoding | null
): Promise<string | Buffer>;
export async function readFile(
	path: fs.PathLike | promises.FileHandle,
	_options?: (fs.ObjectEncodingOptions & { flag?: fs.OpenMode }) | BufferEncoding | null
): Promise<Buffer | string> {
	const fs = new FileSystemCall();
	return fs.readFile(path, _options);
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
	path: fs.PathLike | promises.FileHandle,
	data: FileContents | Stream | Iterable<string | ArrayBufferView> | AsyncIterable<string | ArrayBufferView>,
	_options?: (fs.ObjectEncodingOptions & { mode?: fs.Mode; flag?: fs.OpenMode; flush?: boolean }) | BufferEncoding | null
): Promise<void> {
	using fs = new FileSystemCall();
	return fs.writeFile(path, data, _options);
}
writeFile satisfies typeof promises.writeFile;

/**
 * Asynchronously append data to a file, creating the file if it not yet exists.
 * @option encoding Defaults to `'utf8'`.
 * @option mode Defaults to `0644`.
 * @option flag Defaults to `'a'`.
 */
export async function appendFile(
	path: fs.PathLike | promises.FileHandle,
	data: FileContents,
	_options?: BufferEncoding | (fs.EncodingOption & { mode?: fs.Mode; flag?: fs.OpenMode }) | null
): Promise<void> {
	using fs = new FileSystemCall();
	return fs.appendFile(path, data, _options);
}
appendFile satisfies typeof promises.appendFile;

// DIRECTORY-ONLY METHODS

export async function rmdir(path: fs.PathLike): Promise<void> {
	using fs = new FileSystemCall();
	return fs.rmdir(path);
}
rmdir satisfies typeof promises.rmdir;

/**
 * Asynchronous mkdir(2) - create a directory.
 * @param path A path to a file. If a URL is provided, it must use the `file:` protocol.
 * @param options Either the file mode, or an object optionally specifying the file mode and whether parent folders
 * should be created. If a string is passed, it is parsed as an octal integer. If not specified, defaults to `0o777`.
 */
export async function mkdir(path: fs.PathLike, options: fs.MakeDirectoryOptions & { recursive: true }): Promise<string | undefined>;
export async function mkdir(path: fs.PathLike, options?: fs.Mode | (fs.MakeDirectoryOptions & { recursive?: false | undefined }) | null): Promise<void>;
export async function mkdir(path: fs.PathLike, options?: fs.Mode | fs.MakeDirectoryOptions | null): Promise<string | undefined>;
export async function mkdir(path: fs.PathLike, options?: fs.Mode | fs.MakeDirectoryOptions | null): Promise<string | undefined | void> {
	const fs = new FileSystemCall();
	return fs.mkdir(path, options);
}
mkdir satisfies typeof promises.mkdir;

/**
 * Asynchronous readdir(3) - read a directory.
 * @param path A path to a file. If a URL is provided, it must use the `file:` protocol.
 * @param options The encoding (or an object specifying the encoding), used as the encoding of the result. If not provided, `'utf8'`.
 */
export async function readdir(path: fs.PathLike, options?: (fs.ObjectEncodingOptions & { withFileTypes?: false; recursive?: boolean }) | BufferEncoding | null): Promise<string[]>;
export async function readdir(path: fs.PathLike, options: fs.BufferEncodingOption & { withFileTypes?: false; recursive?: boolean }): Promise<Buffer[]>;
export async function readdir(
	path: fs.PathLike,
	options?: (fs.ObjectEncodingOptions & { withFileTypes?: false; recursive?: boolean }) | BufferEncoding | null
): Promise<string[] | Buffer[]>;
export async function readdir(path: fs.PathLike, options: fs.ObjectEncodingOptions & { withFileTypes: true; recursive?: boolean }): Promise<Dirent[]>;
export async function readdir(
	path: fs.PathLike,
	options?: { withFileTypes?: boolean; recursive?: boolean; encoding?: BufferEncoding | 'buffer' | null } | BufferEncoding | 'buffer' | null
): Promise<string[] | Dirent[] | Buffer[]>;
export async function readdir(
	path: fs.PathLike,
	options?: { withFileTypes?: boolean; recursive?: boolean; encoding?: BufferEncoding | 'buffer' | null } | BufferEncoding | 'buffer' | null
): Promise<string[] | Dirent[] | Buffer[]> {
	using fs = new FileSystemCall();
	return fs.readdir(path, options);
}

readdir satisfies typeof promises.readdir;

export async function link(targetPath: fs.PathLike, linkPath: fs.PathLike): Promise<void> {
	using fs = new FileSystemCall();
	return fs.link(targetPath, linkPath);
}
link satisfies typeof promises.link;

/**
 * `symlink`.
 * @param target target path
 * @param path link path
 * @param type can be either `'dir'` or `'file'` (default is `'file'`)
 */
export async function symlink(target: fs.PathLike, path: fs.PathLike, type: fs.symlink.Type | string | null = 'file'): Promise<void> {
	using fs = new FileSystemCall();
	return fs.symlink(target, path, type);
}
symlink satisfies typeof promises.symlink;

export async function readlink(path: fs.PathLike, options: fs.BufferEncodingOption): Promise<Buffer>;
export async function readlink(path: fs.PathLike, options?: fs.EncodingOption | null): Promise<string>;
export async function readlink(path: fs.PathLike, options?: fs.BufferEncodingOption | fs.EncodingOption | string | null): Promise<string | Buffer>;
export async function readlink(path: fs.PathLike, options?: fs.BufferEncodingOption | fs.EncodingOption | string | null): Promise<string | Buffer> {
	using fs = new FileSystemCall();
	return fs.readlink(path, options);
}
readlink satisfies typeof promises.readlink;

// PROPERTY OPERATIONS

export async function chown(path: fs.PathLike, uid: number, gid: number): Promise<void> {
	using fs = new FileSystemCall();
	return fs.chown(path, uid, gid);
}
chown satisfies typeof promises.chown;

export async function lchown(path: fs.PathLike, uid: number, gid: number): Promise<void> {
	using fs = new FileSystemCall();
	return fs.lchown(path, uid, gid);
}
lchown satisfies typeof promises.lchown;

export async function chmod(path: fs.PathLike, mode: fs.Mode): Promise<void> {
	using fs = new FileSystemCall();
	return fs.chmod(path, mode);
}
chmod satisfies typeof promises.chmod;

export async function lchmod(path: fs.PathLike, mode: fs.Mode): Promise<void> {
	using fs = new FileSystemCall();
	return fs.lchmod(path, mode);
}
lchmod satisfies typeof promises.lchmod;

/**
 * Change file timestamps of the file referenced by the supplied path.
 */
export async function utimes(path: fs.PathLike, atime: string | number | Date, mtime: string | number | Date): Promise<void> {
	using fs = new FileSystemCall();
	return fs.utimes(path, atime, mtime);
}
utimes satisfies typeof promises.utimes;

/**
 * Change file timestamps of the file referenced by the supplied path.
 */
export async function lutimes(path: fs.PathLike, atime: fs.TimeLike, mtime: fs.TimeLike): Promise<void> {
	using fs = new FileSystemCall();
	return fs.lutimes(path, atime, mtime);
}
lutimes satisfies typeof promises.lutimes;

/**
 * Asynchronous realpath(3) - return the canonicalized absolute pathname.
 * @param path A path to a file. If a URL is provided, it must use the `file:` protocol.
 * @param options The encoding (or an object specifying the encoding), used as the encoding of the result. Defaults to `'utf8'`.
 * @todo handle options
 */
export async function realpath(path: fs.PathLike, options: fs.BufferEncodingOption): Promise<Buffer>;
export async function realpath(path: fs.PathLike, options?: fs.EncodingOption | BufferEncoding): Promise<string>;
export async function realpath(path: fs.PathLike, options?: fs.EncodingOption | BufferEncoding | fs.BufferEncodingOption): Promise<string | Buffer> {
	using fs = new FileSystemCall();
	return fs.realpath(path, options as fs.EncodingOption);
}
realpath satisfies typeof promises.realpath;

export function watch(filename: fs.PathLike, options?: fs.WatchOptions | BufferEncoding): AsyncIterable<promises.FileChangeInfo<string>>;
export function watch(filename: fs.PathLike, options: fs.WatchOptions | fs.BufferEncodingOption): AsyncIterable<promises.FileChangeInfo<Buffer>>;
export function watch(filename: fs.PathLike, options?: fs.WatchOptions | string): AsyncIterable<promises.FileChangeInfo<string>> | AsyncIterable<promises.FileChangeInfo<Buffer>>;
export function watch<T extends string | Buffer>(filename: fs.PathLike, options: fs.WatchOptions | string = {}): AsyncIterable<promises.FileChangeInfo<T>> {
	using fs = new FileSystemCall();
	return fs.watch(filename, options) as AsyncIterable<promises.FileChangeInfo<T>>;
}
watch satisfies typeof promises.watch;

export async function access(path: fs.PathLike, mode: number = constants.F_OK): Promise<void> {
	using fs = new FileSystemCall();
	return fs.access(path, mode);
}
access satisfies typeof promises.access;

/**
 * Asynchronous `rm`. Removes files or directories (recursively).
 * @param path The path to the file or directory to remove.
 */
export async function rm(path: fs.PathLike, options?: fs.RmOptions) {
	using fs = new FileSystemCall();
	return fs.rm(path, options);
}
rm satisfies typeof promises.rm;

/**
 * Asynchronous `mkdtemp`. Creates a unique temporary directory.
 * @param prefix The directory prefix.
 * @param options The encoding (or an object including `encoding`).
 * @returns The path to the created temporary directory, encoded as a string or buffer.
 */
export async function mkdtemp(prefix: string, options?: fs.EncodingOption): Promise<string>;
export async function mkdtemp(prefix: string, options?: fs.BufferEncodingOption): Promise<Buffer>;
export async function mkdtemp(prefix: string, options?: fs.EncodingOption | fs.BufferEncodingOption): Promise<string | Buffer> {
	using fs = new FileSystemCall();
	return fs.mkdtemp(prefix, options as fs.EncodingOption);
}
mkdtemp satisfies typeof promises.mkdtemp;

/**
 * Asynchronous `copyFile`. Copies a file.
 * @param src The source file.
 * @param dest The destination file.
 * @param mode Optional flags for the copy operation. Currently supports these flags:
 *    * `fs.constants.COPYFILE_EXCL`: If the destination file already exists, the operation fails.
 */
export async function copyFile(src: fs.PathLike, dest: fs.PathLike, mode?: number): Promise<void> {
	using fs = new FileSystemCall();
	return fs.copyFile(src, dest, mode);
}
copyFile satisfies typeof promises.copyFile;

/**
 * Asynchronous `opendir`. Opens a directory.
 * @param path The path to the directory.
 * @param options Options for opening the directory.
 * @returns A `Dir` object representing the opened directory.
 * @todo Use options
 */
export function opendir(path: fs.PathLike, options?: fs.OpenDirOptions): Promise<Dir> {
	using fs = new FileSystemCall();
	return fs.opendir(path, options);
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
export async function cp(source: fs.PathLike, destination: fs.PathLike, opts?: fs.CopyOptions): Promise<void> {
	using fs = new FileSystemCall();
	return fs.cp(source, destination, opts);
}
cp satisfies typeof promises.cp;

/**
 * @since Node v18.15.0
 * @returns Fulfills with an {fs.StatFs} for the file system.
 */
export async function statfs(path: fs.PathLike, opts?: fs.StatFsOptions & { bigint?: false }): Promise<fs.StatsFs>;
export async function statfs(path: fs.PathLike, opts: fs.StatFsOptions & { bigint: true }): Promise<fs.BigIntStatsFs>;
export async function statfs(path: fs.PathLike, opts?: fs.StatFsOptions): Promise<fs.StatsFs | fs.BigIntStatsFs>;
export function statfs(path: fs.PathLike, opts?: fs.StatFsOptions): Promise<fs.StatsFs | fs.BigIntStatsFs> {
	using fs = new FileSystemCall();
	return fs.statfs(path, opts);
}

/**
 * `lstat`.
 * `lstat()` is identical to `stat()`, except that if path is a symbolic link,
 * then the link itself is stat-ed, not the file that it refers to.
 */
export async function lstat(path: fs.PathLike, options?: { bigint?: boolean }): Promise<Stats>;
export async function lstat(path: fs.PathLike, options: { bigint: true }): Promise<BigIntStats>;
export async function lstat(path: fs.PathLike, options?: fs.StatOptions): Promise<Stats | BigIntStats> {
	using fs = new FileSystemCall();
	return fs.lstat(path, options);
}
lstat satisfies typeof promises.lstat;
