import { Async, FileSystem, type FileSystemMetadata } from '@zenfs/core/filesystem.js';
import { ApiError, ErrorCode } from '@zenfs/core/ApiError.js';
import { File, FileFlag } from '@zenfs/core/file.js';
import { Stats } from '@zenfs/core/stats.js';
import { Cred } from '@zenfs/core/cred.js';
import type { Backend } from '@zenfs/core/backends/backend.js';
import type { Worker as NodeWorker } from 'worker_threads';
import { type RPCResponse, type WorkerRequest, isRPCMessage, type RPCRequest } from './rpc.js';

/**
 * @hidden
 */
declare const importScripts: (...path: string[]) => unknown;

export interface WorkerFSOptions {
	/**
	 * The target worker that you want to connect to, or the current worker if in a worker context.
	 */
	worker: Worker | NodeWorker;
}

type _RPCExtractReturnValue<T extends RPCResponse['method']> = Promise<Extract<RPCResponse, { method: T }>['value']>;

/**
 * WorkerFS lets you access a ZenFS instance that is running in a worker, or the other way around.
 *
 * Note that synchronous operations are not permitted on the WorkerFS, regardless
 * of the configuration option of the remote FS.
 */
export class WorkerFS extends Async(FileSystem) {
	protected _worker: Worker | NodeWorker;
	protected _currentID: number = 0;
	protected _requests: Map<number, WorkerRequest> = new Map();

	protected _isInitialized: boolean = false;
	protected _metadata: FileSystemMetadata;

	private _handleMessage(event: MessageEvent) {
		if (!isRPCMessage(event.data)) {
			return;
		}
		const { id, method, value } = event.data as RPCResponse;

		if (method === 'metadata') {
			this._metadata = value;
			this._isInitialized = true;
			return;
		}

		const { resolve, reject } = this._requests.get(id);
		this._requests.delete(id);
		if (value instanceof Error) {
			reject(value);
			return;
		}
		resolve(value);
	}

	protected get handleMessage(): typeof this._handleMessage {
		return this._handleMessage.bind(this);
	}

	/**
	 * Constructs a new WorkerFS instance that connects with ZenFS running on
	 * the specified worker.
	 */
	public constructor({ worker }: WorkerFSOptions) {
		super();
		this._worker = worker;
		worker['on' in worker ? 'on' : 'addEventListener'](this.handleMessage);
	}

	public metadata(): FileSystemMetadata {
		return {
			...super.metadata(),
			...this._metadata,
			name: 'WorkerFS',
			synchronous: false,
		};
	}

	protected async _rpc<T extends RPCRequest['method']>(method: T, ...args: Extract<RPCRequest, { method: T }>['args']): _RPCExtractReturnValue<T> {
		return new Promise((resolve, reject) => {
			const id = this._currentID++;
			this._requests.set(id, { resolve, reject });
			this._worker.postMessage({
				isBFS: true,
				id,
				method,
				args,
			});
		});
	}
	public async ready(): Promise<this> {
		await this._rpc('ready');
		return this;
	}

	public rename(oldPath: string, newPath: string, cred: Cred): Promise<void> {
		return this._rpc('rename', oldPath, newPath, cred);
	}
	public stat(p: string, cred: Cred): Promise<Stats> {
		return this._rpc('stat', p, cred);
	}
	public sync(path: string, data: Uint8Array, stats: Readonly<Stats>): Promise<void> {
		return this._rpc('sync', path, data, stats);
	}
	public openFile(p: string, flag: FileFlag, cred: Cred): Promise<File> {
		return this._rpc('openFile', p, flag, cred);
	}
	public createFile(p: string, flag: FileFlag, mode: number, cred: Cred): Promise<File> {
		return this._rpc('createFile', p, flag, mode, cred);
	}
	public unlink(p: string, cred: Cred): Promise<void> {
		return this._rpc('unlink', p, cred);
	}
	public rmdir(p: string, cred: Cred): Promise<void> {
		return this._rpc('rmdir', p, cred);
	}
	public mkdir(p: string, mode: number, cred: Cred): Promise<void> {
		return this._rpc('mkdir', p, mode, cred);
	}
	public readdir(p: string, cred: Cred): Promise<string[]> {
		return this._rpc('readdir', p, cred);
	}
	public exists(p: string, cred: Cred): Promise<boolean> {
		return this._rpc('exists', p, cred);
	}
	public link(srcpath: string, dstpath: string, cred: Cred): Promise<void> {
		return this._rpc('link', srcpath, dstpath, cred);
	}

	public syncClose(method: string, fd: File): Promise<void> {
		return this._rpc('syncClose', method, fd);
	}
}

export const Worker: Backend = {
	name: 'WorkerFS',

	options: {
		worker: {
			type: 'object',
			description: 'The target worker that you want to connect to, or the current worker if in a worker context.',
			validator(worker: Worker) {
				// Check for a `postMessage` function.
				if (typeof worker?.postMessage != 'function') {
					throw new ApiError(ErrorCode.EINVAL, 'option must be a Web Worker instance.');
				}
			},
		},
	},

	isAvailable(): boolean {
		return typeof importScripts !== 'undefined' || typeof Worker !== 'undefined';
	},

	create(options: WorkerFSOptions) {
		return new WorkerFS(options);
	},
};
