/* Note: this file is named file_index.ts because Typescript has special behavior regarding index.ts which can't be disabled. */

import { isJSON, randomInt } from 'utilium';
import { Errno, ErrnoError } from '../../error.js';
import { S_IFDIR, S_IFMT, size_max } from '../../vfs/constants.js';
import { basename, dirname } from '../../vfs/path.js';
import type { InodeLike } from './inode.js';
import { Inode } from './inode.js';

/**
 * An Index in JSON form
 * @internal
 */
export interface IndexData {
	version: number;
	entries: Record<string, InodeLike>;
}

export const version = 1;

/**
 * An index of files
 * @internal
 */
export class Index extends Map<string, Readonly<Inode>> {
	protected _directories?: Map<string, Record<string, number>>;

	/**
	 * Converts the index to JSON
	 */
	public toJSON(): IndexData {
		return {
			version,
			entries: Object.fromEntries([...this].map(([k, v]) => [k, v.toJSON()])),
		};
	}

	/**
	 * Converts the index to a string
	 */
	public toString(): string {
		return JSON.stringify(this.toJSON());
	}

	/**
	 * Gets a list of entries for each directory in the index. Memoized.
	 */
	public directories(): Map<string, Record<string, number>> {
		if (this._directories) return this._directories;

		const dirs = new Map<string, Record<string, number>>();
		for (const [path, node] of this) {
			if ((node.mode & S_IFMT) != S_IFDIR) continue;

			const entries: Record<string, number> = {};

			for (const entry of this.keys()) {
				if (dirname(entry) == path && entry != path) entries[basename(entry)] = this.get(entry)!.ino;
			}

			dirs.set(path, entries);
		}

		this._directories = dirs;

		return dirs;
	}

	/**
	 * Loads the index from JSON data
	 */
	public fromJSON(json: IndexData): void {
		if (json.version != version) {
			throw new ErrnoError(Errno.EINVAL, 'Index version mismatch');
		}

		this.clear();

		for (const [path, node] of Object.entries(json.entries)) {
			node.data ??= randomInt(1, size_max);

			if (path == '/') node.ino = 0;

			this.set(path, new Inode(node));
		}
	}

	/**
	 * Parses an index from a string
	 */
	public static parse(data: string): Index {
		if (!isJSON(data)) {
			throw new ErrnoError(Errno.EINVAL, 'Invalid JSON');
		}

		const json = JSON.parse(data) as IndexData;
		const index = new Index();
		index.fromJSON(json);
		return index;
	}
}
