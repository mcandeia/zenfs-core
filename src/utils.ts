import type * as fs from 'node:fs';
import type { ClassLike, OptionalTuple } from 'utilium';
import { Errno, ErrnoError } from './internal/error.js';
import { log_deprecated } from './internal/log.js';
import type { AbsolutePath } from './vfs/path.js';
import { resolve } from './vfs/path.js';

declare global {
	function atob(data: string): string;
	function btoa(data: string): string;
}

/**
 * Encodes a string into a buffer
 * @internal
 */
export function encodeRaw(input: string): Uint8Array {
	if (typeof input != 'string') {
		throw new ErrnoError(Errno.EINVAL, 'Can not encode a non-string');
	}
	return new Uint8Array(Array.from(input).map(char => char.charCodeAt(0)));
}

/**
 * Decodes a string from a buffer
 * @internal
 */
export function decodeRaw(input?: Uint8Array): string {
	if (!(input instanceof Uint8Array)) {
		throw new ErrnoError(Errno.EINVAL, 'Can not decode a non-Uint8Array');
	}

	return Array.from(input)
		.map(char => String.fromCharCode(char))
		.join('');
}

const encoder = new TextEncoder();

/**
 * Encodes a string into a buffer
 * @internal
 */
export function encodeUTF8(input: string): Uint8Array {
	if (typeof input != 'string') {
		throw new ErrnoError(Errno.EINVAL, 'Can not encode a non-string');
	}
	return encoder.encode(input);
}

/* node:coverage disable */
export { /** @deprecated @hidden */ encodeUTF8 as encode };
/* node:coverage enable */

const decoder = new TextDecoder();

/**
 * Decodes a string from a buffer
 * @internal
 */
export function decodeUTF8(input?: Uint8Array): string {
	if (!(input instanceof Uint8Array)) {
		throw new ErrnoError(Errno.EINVAL, 'Can not decode a non-Uint8Array');
	}

	return decoder.decode(input);
}

/* node:coverage disable */
export { /** @deprecated @hidden */ decodeUTF8 as decode };
/* node:coverage enable */

/**
 * Decodes a directory listing
 * @hidden
 */
export function decodeDirListing(data: Uint8Array): Record<string, number> {
	return JSON.parse(decodeUTF8(data), (k, v) =>
		k == '' ? v : typeof v == 'string' ? BigInt(v).toString(16).slice(0, Math.min(v.length, 8)) : (v as number)
	);
}

/**
 * Encodes a directory listing
 * @hidden
 */
export function encodeDirListing(data: Record<string, number>): Uint8Array {
	return encodeUTF8(JSON.stringify(data));
}

export type Callback<Args extends unknown[] = [], NoError = undefined | void> = (e: ErrnoError | NoError, ...args: OptionalTuple<Args>) => unknown;

/**
 * Normalizes a mode
 * @param def default
 * @internal
 */
export function normalizeMode(mode: unknown, def?: number): number {
	if (typeof mode == 'number') return mode;

	if (typeof mode == 'string') {
		const parsed = parseInt(mode, 8);
		if (!isNaN(parsed)) {
			return parsed;
		}
	}

	if (typeof def == 'number') return def;

	throw new ErrnoError(Errno.EINVAL, 'Invalid mode: ' + mode?.toString());
}

/**
 * Normalizes a time
 * @internal
 */
export function normalizeTime(time: string | number | Date): number {
	if (time instanceof Date) return time.getTime();

	try {
		return Number(time);
	} catch {
		throw new ErrnoError(Errno.EINVAL, 'Invalid time.');
	}
}

/**
 * Normalizes a path
 * @internal
 */
export function normalizePath(p: fs.PathLike): AbsolutePath {
	p = p.toString();
	if (p.includes('\x00')) {
		throw new ErrnoError(Errno.EINVAL, 'Path can not contain null character');
	}
	if (p.length == 0) {
		throw new ErrnoError(Errno.EINVAL, 'Path can not be empty');
	}
	return resolve(p.replaceAll(/[/\\]+/g, '/'));
}

/**
 * Normalizes options
 * @param options options to normalize
 * @param encoding default encoding
 * @param flag default flag
 * @param mode default mode
 * @internal
 */
export function normalizeOptions(
	options: fs.WriteFileOptions | (fs.EncodingOption & { flag?: fs.OpenMode }) | undefined,
	encoding: BufferEncoding | null = 'utf8',
	flag: string,
	mode: number = 0
): { encoding?: BufferEncoding | null; flag: string; mode: number } {
	if (typeof options != 'object' || options === null) {
		return {
			encoding: typeof options == 'string' ? options : (encoding ?? null),
			flag,
			mode,
		};
	}

	return {
		encoding: typeof options?.encoding == 'string' ? options.encoding : (encoding ?? null),
		flag: typeof options?.flag == 'string' ? options.flag : flag,
		mode: normalizeMode('mode' in options ? options?.mode : null, mode),
	};
}

export type Concrete<T extends ClassLike> = Pick<T, keyof T> & (new (...args: any[]) => InstanceType<T>);

/* node:coverage disable */
import { randomHex } from 'utilium';
/**
 * Generate a random ino
 * @internal @deprecated @hidden
 */
export function randomBigInt(): bigint {
	log_deprecated('randomBigInt');
	return BigInt('0x' + randomHex(8));
}

/**
 * Prevents infinite loops
 * @internal
 * @deprecated Use `canary` from Utilium
 */
export function canary(path?: string, syscall?: string) {
	log_deprecated('canary');
	const timeout = setTimeout(() => {
		throw ErrnoError.With('EDEADLK', path, syscall);
	}, 5000);

	return () => clearTimeout(timeout);
}
/* node:coverage enable */
