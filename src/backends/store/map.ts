import type { Store } from './store.js';
import { AsyncTransaction, SyncTransaction } from './store.js';

/**
 * An interface for simple synchronous stores that don't have special support for transactions and such, based on `Map`
 */
export interface SyncMapStore extends Store {
	keys(): Iterable<number>;
	get(id: number): Uint8Array | undefined;
	getAsync?(id: number): Promise<Uint8Array | undefined>;
	set(id: number, data: Uint8Array): void;
	delete(id: number): void;
}

/**
 * Transaction for map stores.
 * @see SyncMapStore
 */
export class SyncMapTransaction extends SyncTransaction<SyncMapStore> {
	declare public readonly store: SyncMapStore;

	public keysSync(): Iterable<number> {
		return this.store.keys();
	}

	public async get(id: number): Promise<Uint8Array | undefined> {
		return await (this.store.getAsync?.(id) ?? this.store.get(id));
	}

	public getSync(id: number): Uint8Array | undefined {
		return this.store.get(id);
	}

	public setSync(id: number, data: Uint8Array): void {
		this.store.set(id, data);
	}

	public removeSync(id: number): void {
		this.store.delete(id);
	}
}

/**
 * An interface for simple asynchronous stores that don't have special support for transactions and such, based on `Map`.
 */
export interface AsyncMap {
	keys(): Iterable<number>;
	get(id: number, offset?: number, end?: number): Promise<Uint8Array | undefined>;
	cached(id: number, offset?: number, end?: number): Uint8Array | undefined;
	set(id: number, data: Uint8Array, offset?: number): Promise<void>;
	delete(id: number): Promise<void>;
}

export class AsyncMapTransaction<T extends Store & AsyncMap = Store & AsyncMap> extends AsyncTransaction<T> {
	public keysSync(): Iterable<number> {
		return this.store.keys();
	}

	public async keys(): Promise<Iterable<number>> {
		await this.asyncDone;
		return this.store.keys();
	}

	public async get(id: number, offset?: number, end?: number): Promise<Uint8Array | undefined> {
		await this.asyncDone;
		return await this.store.get(id, offset, end);
	}

	public getSync(id: number, offset?: number, end?: number): Uint8Array | undefined {
		return this.store.cached(id, offset, end);
	}

	public async set(id: number, data: Uint8Array, offset = 0): Promise<void> {
		await this.asyncDone;
		await this.store.set(id, data, offset);
	}

	public async remove(id: number): Promise<void> {
		await this.asyncDone;
		await this.store.delete(id);
	}
}
