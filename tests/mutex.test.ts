import { wait } from 'utilium';
import { Mutexed } from '../src/mixins/mutexed.ts';
import { StoreFS } from '../src/backends/store/fs.ts';
import { InMemoryStore } from '../src/backends/memory.ts';

import assert from 'node:assert';
import type { MutexLock } from '../src/index.ts';

const fs = new (Mutexed(StoreFS))(new InMemoryStore('test'));
fs._fs.checkRootSync();

Deno.test('lock/unlock', () => {
	const lock = fs.lockSync('/test', 'lock');
	assert(fs.isLocked);
	lock.unlock();
	assert(!fs.isLocked);
});

Deno.test('queueing multiple locks', async () => {
	let lock1Resolved = false;
	let lock2Resolved = false;

	const lock1 = fs.lock('/queued', 'test').then((lock: MutexLock) => {
		lock1Resolved = true;
		lock.unlock();
	});
	const lock2 = fs.lock('/queued', 'test').then((lock: MutexLock) => {
		lock2Resolved = true;
		lock.unlock();
	});

	// Both locks are queued, so neither should be resolved initially
	assert(!lock1Resolved);
	assert(!lock2Resolved);

	// Wait for the first lock to be resolved
	await lock1;

	assert(lock1Resolved);
	assert(!lock2Resolved);

	// Wait for the second lock to be resolved
	await lock2;

	assert(lock1Resolved);
	assert(lock2Resolved);
});

Deno.test('test race conditions', async () => {
	let x = 1;

	async function foo() {
		const lock = await fs.lock('raceConditions', 'test');
		await wait(100);
		x++;
		lock.unlock();
	}

	await Promise.all([foo(), foo(), foo()]);
	assert(x === 4);
});
