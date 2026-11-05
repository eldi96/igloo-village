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
  await assert.rejects(backend.updateDisplayName('   '), /이름/);
  await assert.rejects(backend.updateDisplayName('가'.repeat(41)), /이름/);
  await assert.rejects(backend.sendChat('   '), /메시지/);
  await assert.rejects(backend.sendChat('가'.repeat(501)), /메시지/);
  await assert.rejects(backend.deleteChat('not-a-message'), /메시지/);
  await assert.rejects(backend.deleteProject('not-a-project'), /프로젝트/);
  assert.equal(loaded, false);
});


function projectSdk({ insertError = null, uploadError = null } = {}) {
  const member = { id: '11111111-1111-4111-8111-111111111111', role: 'student', approved: true };
  const calls = { uploads: [], removed: [], inserted: null };
  let stored;
  const api = {
    auth: { getUser: async () => ({ data: { user: { id: member.id } } }) },
    from(table) {
      if (table === 'igloos') return { select: () => ({ order: async () => ({ data: homes }) }) };
      if (table === 'members') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: member }) }) }) };
      assert.equal(table, 'projects');
      return { insert(payload) {
        calls.inserted = payload;
        stored = { ...payload, id: '22222222-2222-4222-8222-222222222222' };
        return { select: () => ({ single: async () => ({ data: stored, error: insertError }) }) };
      } };
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'project-images');
      return {
        upload: async (path, blob) => { calls.uploads.push({ path, blob }); return { error: uploadError }; },
        remove: async paths => { calls.removed.push(...paths); return { error: null }; },
        createSignedUrl: async () => ({ data: { signedUrl: 'https://testproject.supabase.co/signed-image' } })
      };
    } }
  };
  return { calls, backend: createVillageBackend({ config, loadSdk: async () => ({ createClient: () => api }) }) };
}
const manualProject = () => ({ title: '내 프로젝트', url: 'https://example.com', description: '소개', instructions: '1. 시작\n2. 사용', image: new Blob(['image'], { type: 'image/jpeg' }) });
test('manual project saves text and owner-scoped image and returns its display URL', async () => {
  const { backend, calls } = projectSdk();
  const project = await backend.addProject(0, manualProject());
  assert.equal(calls.inserted.instructions, '1. 시작\n2. 사용');
  assert.equal(calls.inserted.description, '소개');
  assert.match(calls.uploads[0].path, /^11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\.jpg$/);
  assert.equal(calls.inserted.image_path, calls.uploads[0].path);
  assert.equal(project.image_url, 'https://testproject.supabase.co/signed-image');
});
test('failed project insertion cleans up the already uploaded image', async () => {
  const { backend, calls } = projectSdk({ insertError: new Error('insert failed') });
  await assert.rejects(backend.addProject(0, manualProject()), /insert failed/);
  assert.deepEqual(calls.removed, [calls.uploads[0].path]);
});
test('failed image upload never creates a project', async () => {
  const { backend, calls } = projectSdk({ uploadError: new Error('upload failed') });
  await assert.rejects(backend.addProject(0, manualProject()), /이미지를 저장/);
  assert.equal(calls.inserted, null);
});
test('oversized instructions and non-JPEG images fail before loading SDK', async () => {
  let loaded = false;
  const backend = createVillageBackend({ config, loadSdk: async () => { loaded = true; throw new Error('unexpected'); } });
  await assert.rejects(backend.addProject(0, { ...manualProject(), instructions: 'a'.repeat(5001) }), /길이/);
  await assert.rejects(backend.addProject(0, { ...manualProject(), image: new Blob(['svg'], { type: 'image/svg+xml' }) }), /JPEG/);
  assert.equal(loaded, false);
});


test('feedback rejects invalid IDs, blank or oversized comments and unsupported reactions before connection', async () => {
  let loaded = false;
  const backend = createVillageBackend({ config, loadSdk: async () => { loaded = true; throw new Error('unexpected'); } });
  const id = '11111111-1111-4111-8111-111111111111';
  await assert.rejects(backend.getProjectFeedback('invalid'), /프로젝트/);
  await assert.rejects(backend.addProjectComment(id, '   '), /댓글/);
  await assert.rejects(backend.addProjectComment(id, 'a'.repeat(1001)), /댓글/);
  await assert.rejects(backend.setProjectReaction(id, 'invalid', true), /반응/);
  assert.equal(loaded, false);
});


test('reply and deletion reject malformed comment IDs before connecting', async () => {
  let loaded = false;
  const backend = createVillageBackend({ config, loadSdk: async () => { loaded = true; throw new Error('unexpected'); } });
  const id = '11111111-1111-4111-8111-111111111111';
  await assert.rejects(backend.addProjectComment(id, 'reply', 'invalid'), /답글/);
  await assert.rejects(backend.deleteProjectComment('invalid'), /댓글/);
  assert.equal(loaded, false);
});

test('comment deletion empties text and filters by verified owner and undeleted state', async () => {
  const member = { id: '11111111-1111-4111-8111-111111111111', role: 'student', approved: true };
  const commentId = '22222222-2222-4222-8222-222222222222';
  const calls = [];
  const query = {
    eq: (key, value) => { calls.push(['eq', key, value]); return query; },
    is: (key, value) => { calls.push(['is', key, value]); return query; },
    select: () => query,
    single: async () => ({ data: { id: commentId } })
  };
  const api = {
    auth: { getUser: async () => ({ data: { user: { id: member.id } } }) },
    from(table) {
      if (table === 'igloos') return { select: () => ({ order: async () => ({ data: homes }) }) };
      if (table === 'members') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: member }) }) }) };
      assert.equal(table, 'project_comments');
      return { update: payload => { calls.push(['update', payload]); return query; } };
    }
  };
  const backend = createVillageBackend({ config, loadSdk: async () => ({ createClient: () => api }) });
  await backend.deleteProjectComment(commentId);
  assert.equal(calls[0][1].body, '');
  assert.ok(Number.isFinite(Date.parse(calls[0][1].deleted_at)));
  assert.deepEqual(calls.slice(1), [['eq', 'id', commentId], ['eq', 'member_id', member.id], ['is', 'deleted_at', null]]);
});


test('notification read rejects malformed project and cutoff before connecting', async () => {
  let loaded = false;
  const backend = createVillageBackend({ config, loadSdk: async () => { loaded = true; throw new Error('unexpected'); } });
  await assert.rejects(backend.markCommentNotificationsRead('invalid', new Date().toISOString()), /프로젝트/);
  await assert.rejects(backend.markCommentNotificationsRead('11111111-1111-4111-8111-111111111111', 'invalid'), /프로젝트/);
  assert.equal(loaded, false);
});


test('public mailbox glow reads only home IDs without requiring an account', async () => {
  let rpcCalls = 0;
  const api = {
    from: table => { assert.equal(table, 'igloos'); return { select: () => ({ order: async () => ({ data: homes }) }) }; },
    rpc: async name => { assert.equal(name, 'get_unread_mailbox_homes'); rpcCalls++; return { data: [{ igloo_id: 22 }] }; }
  };
  const backend = createVillageBackend({ config, loadSdk: async () => ({ createClient: () => api }) });
  assert.deepEqual(await backend.getUnreadMailboxHomes(), [22]);
  assert.equal(rpcCalls, 1);
});
