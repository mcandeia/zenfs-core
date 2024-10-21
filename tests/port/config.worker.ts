import { parentPort } from 'node:worker_threads';
import { resolveRemoteMount } from '../../src/backends/port/fs.ts';
import { InMemory } from '../../src/backends/memory.ts';

await resolveRemoteMount(parentPort!, { backend: InMemory });
