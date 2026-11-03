import test from 'node:test';
import assert from 'node:assert/strict';
import { createVillageBackend } from './client.js';

const config = { url: 'https://testproject.supabase.co', publishableKey: 'sb_publishable_test' };
const homes = Array.from({ length: 31 }, (_, id) => ({ id, owner_id: null, is_public: false, claimed_at: null }));
function mockSdk({ rows = homes, getError = () => null } = {}) {
  let loads = 0, requests = 0;
  return {
    loadSdk: async () => {
      loads++;
      return { createClient: () => ({
        from: table => {
          assert.equal(table, 'igloos');
          return { select: () => ({ order: async () => { requests++; return { data: rows, error: getError() }; } }) };
        },
        auth: { getUser: async () => ({ data: { user: null }, error: null }) }
      }) };
    },
    counts: () => ({ loads, requests })
  };
}
test('concurrent callers share one connection and verify all 31 stable home IDs', async () => {
  const sdk = mockSdk(); const backend = createVillageBackend({ config, loadSdk: sdk.loadSdk });
  const phases = []; backend.onStatusChange(status => phases.push(status.phase));
  const results = await Promise.all([backend.connect(), backend.connect(), backend.connect()]);
  assert.equal(results[0].homes.length, 31);
  assert.deepEqual(sdk.counts(), { loads: 1, requests: 1 });
  assert.deepEqual(phases, ['connecting', 'connected']);
  assert.equal(backend.status.homeCount, 31);
});
test('secret-like keys and non-HTTPS endpoints never reach the SDK', async () => {
  let loaded = false;
  for (const bad of [{ ...config, publishableKey: 'sb_secret_unsafe' }, { ...config, url: 'http://testproject.supabase.co' }]) {
    const backend = createVillageBackend({ config: bad, loadSdk: async () => { loaded = true; throw new Error('must not load'); } });
    await assert.rejects(backend.connect()); assert.equal(backend.status.phase, 'error');
  }
  assert.equal(loaded, false);
});
test('schema mismatch is an error rather than a false successful connection', async () => {
  const sdk = mockSdk({ rows: homes.slice(1) });
  const backend = createVillageBackend({ config, loadSdk: sdk.loadSdk });
  await assert.rejects(backend.connect(), /일치하지/);
  assert.equal(backend.status.phase, 'error');
});
test('a failed network read can be retried without rebuilding the SDK client', async () => {
  let offline = true;
  const sdk = mockSdk({ getError: () => offline ? new Error('offline') : null });
  const backend = createVillageBackend({ config, loadSdk: sdk.loadSdk });
  await assert.rejects(backend.connect(), /offline/);
  offline = false; await backend.connect();
  assert.equal(backend.status.phase, 'connected');
  assert.deepEqual(sdk.counts(), { loads: 1, requests: 2 });
});
test('claiming without a verified signed-in member never writes', async () => {
  const sdk = mockSdk(); const backend = createVillageBackend({ config, loadSdk: sdk.loadSdk });
  await assert.rejects(backend.claimIgloo(0), /로그인/);
  assert.equal(sdk.counts().requests, 1);
});
test('invalid home IDs and unsafe links fail before connection or mutation', async () => {
  let loaded = false;
  const backend = createVillageBackend({ config, loadSdk: async () => { loaded = true; throw new Error('must not load'); } });
  await assert.rejects(backend.claimIgloo(31), /존재하지/);
  await assert.rejects(backend.addProject(0, { title: 'test', url: 'javascript:alert(1)' }), /http/);
  await assert.rejects(backend.sendMail(['not-a-user'], { body: 'test' }), /수강생/);
  assert.equal(loaded, false);
});
