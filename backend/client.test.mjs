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

test('visit analytics checks its window and rejects unauthenticated callers', async () => {
  const sdk = mockSdk();
  const backend = createVillageBackend({ config, loadSdk: sdk.loadSdk });
  await assert.rejects(backend.getVisitTrend(0), /1~90/);
  await assert.rejects(backend.getVisitTrend(91), /1~90/);
  await assert.rejects(backend.getVisitTrend(1.5), /1~90/);
  await assert.rejects(backend.recordVisit(), /로그인/);
});

test('visit analytics uses approved member RPCs without reading raw visit rows', async () => {
  const member = { id: '11111111-1111-4111-8111-111111111111', role: 'student', approved: true };
  const calls = [];
  const client = {
    from(table) {
      if (table === 'igloos') return { select: () => ({ order: async () => ({ data: homes, error: null }) }) };
      if (table === 'members') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: member, error: null }) }) }) };
      throw new Error(`unexpected direct table read: ${table}`);
    },
    auth: { getUser: async () => ({ data: { user: { id: member.id } }, error: null }) },
    rpc: async (name, args) => {
      calls.push([name, args ?? null]);
      return { data: name === 'record_visit' ? true : [{ visit_date: '2026-11-05', baseline_total: 5, baseline_active: 3, baseline_rate: 60 }], error: null };
    }
  };
  const backend = createVillageBackend({ config, loadSdk: async () => ({ createClient: () => client }) });
  assert.equal(await backend.recordVisit(), true);
  const trend = await backend.getVisitTrend(14);
  assert.equal(trend[0].baseline_rate, 60);
  assert.deepEqual(calls, [['record_visit', null], ['get_visit_trend', { p_days: 14 }]]);
});


test('visit counts RPC supplies daily and cumulative visits without exposing raw visit rows', async () => {
  const member = { id: '11111111-1111-4111-8111-111111111111', role: 'student', approved: true };
  const calls = [];
  const api = {
    from(table) {
      if (table === 'igloos') return { select: () => ({ order: async () => ({ data: homes, error: null }) }) };
      if (table === 'members') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: member, error: null }) }) }) };
      throw new Error(`unexpected raw table access: ${table}`);
    },
    auth: { getUser: async () => ({ data: { user: { id: member.id } }, error: null }) },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name !== 'get_visit_counts') throw new Error(`unexpected RPC: ${name}`);
      return { data: [{ visit_date: '2026-11-05', baseline_daily_visits: 5, total_daily_visits: 5,
        baseline_cumulative_visits: 5, total_cumulative_visits: 5,
        baseline_active: 5, total_active: 5, baseline_participants: 5, total_participants: 5 }], error: null };
    }
  };
  const backend = createVillageBackend({ config, loadSdk: async () => ({ createClient: () => api }) });
  for (const invalid of [0, 91, 1.5]) await assert.rejects(backend.getVisitCounts(invalid), /1~90/);
  const counts = await backend.getVisitCounts(14);
  assert.equal(counts[0].baseline_cumulative_visits, 5);
  assert.equal(counts[0].total_daily_visits, 5);
  assert.deepEqual(calls, [['get_visit_counts', { p_days: 14 }]]);
});


test('experiment dashboard validates the window and uses the authenticated RPC', async () => {
  const member={id:'11111111-1111-4111-8111-111111111111',role:'student',approved:true};const calls=[];
  const api={auth:{getUser:async()=>({data:{user:{id:member.id}}})},from(table){
    if(table==='igloos')return {select:()=>({order:async()=>({data:homes})})};
    if(table==='members')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:member})})})};
    throw Error('raw table read forbidden');
  },rpc:async(name,args)=>{calls.push([name,args]);return {data:{members:[],daily:[]}};}};
  const backend=createVillageBackend({config,loadSdk:async()=>({createClient:()=>api})});
  for(const invalid of [0,91,1.5])await assert.rejects(backend.getVisitExperiment(invalid),/1~90/);
  await backend.getVisitExperiment(30);
  assert.deepEqual(calls,[['get_visit_experiment',{p_days:30}]]);
});

test('observatory access follows server membership and propagates errors', async () => {
  const member={id:'11111111-1111-4111-8111-111111111111',role:'student',approved:true};
  let allowed=false, failure=null;
  const calls=[];
  const api={auth:{getUser:async()=>({data:{user:{id:member.id}}})},from(table){
    if(table==='igloos')return {select:()=>({order:async()=>({data:homes})})};
    if(table==='members')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:member})})})};
    throw Error('developer roster must remain private');
  },rpc:async name=>{calls.push(name);return {data:allowed,error:failure};}};
  const backend=createVillageBackend({config,loadSdk:async()=>({createClient:()=>api})});
  assert.equal(await backend.canViewObservatory(),false);
  allowed=true;
  assert.equal(await backend.canViewObservatory(),true);
  failure=new Error('permission lookup failed');
  await assert.rejects(backend.canViewObservatory(),/permission lookup failed/);
  assert.deepEqual(calls,Array(3).fill('can_view_observatory'));
});


test('card themes validate input and use verified member RPCs', async () => {
  const member={id:'11111111-1111-4111-8111-111111111111',role:'student',approved:true},calls=[];
  const api={auth:{getUser:async()=>({data:{user:{id:member.id}}})},from(table){if(table==='igloos')return {select:()=>({order:async()=>({data:homes})})};if(table==='members')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:member})})})};throw Error('unexpected table');},rpc:async(name,args)=>{calls.push([name,args]);return {data:{theme:'mint',unlocked:true,is_owner:true}};}};
  const backend=createVillageBackend({config,loadSdk:async()=>({createClient:()=>api})});
  await assert.rejects(backend.setCardTheme('neon'),/테마/);await assert.rejects(backend.getCardTheme(31),/이글루/);
  assert.equal((await backend.getCardTheme(21)).theme,'mint');await backend.setCardTheme('mint');
  assert.deepEqual(calls,[['get_igloo_card_theme',{p_home:21}],['set_card_theme',{p_theme:'mint'}]]);
});


test('exterior light RPCs allow only warm and blue for verified students', async()=>{
 const member={id:'11111111-1111-4111-8111-111111111111',role:'student',approved:true},calls=[];
 const api={auth:{getUser:async()=>({data:{user:{id:member.id}}})},from(table){if(table==='igloos')return {select:()=>({order:async()=>({data:homes})})};if(table==='members')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:member})})})};throw Error('unexpected table');},rpc:async(name,args)=>{calls.push([name,args]);return {data:{color:'blue',unlocked:true}};}};
 const backend=createVillageBackend({config,loadSdk:async()=>({createClient:()=>api})});
 await assert.rejects(backend.setExteriorLight('pink'),/색상/);await backend.setExteriorLight('mint').catch(()=>{});calls.length=0;await backend.getExteriorLight();await backend.setExteriorLight('blue');
 assert.deepEqual(calls,[['get_exterior_light',undefined],['set_exterior_light',{p_color:'blue'}]]);
});

test('board moderator check uses the member RPC, needs an exact true, and propagates errors', async () => {
  const member={id:'11111111-1111-4111-8111-111111111111',role:'student',approved:true};
  let result=false, failure=null;
  const calls=[];
  const api={auth:{getUser:async()=>({data:{user:{id:member.id}}})},from(table){
    if(table==='igloos')return {select:()=>({order:async()=>({data:homes})})};
    if(table==='members')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:member})})})};
    throw Error('moderator roster must remain private');
  },rpc:async(name,args)=>{calls.push([name,args]);return {data:result,error:failure};}};
  const backend=createVillageBackend({config,loadSdk:async()=>({createClient:()=>api})});
  assert.equal(await backend.canModerateVillageBoard(),false);
  result='true';
  assert.equal(await backend.canModerateVillageBoard(),false);
  result=true;
  assert.equal(await backend.canModerateVillageBoard(),true);
  failure=new Error('moderator lookup failed');
  await assert.rejects(backend.canModerateVillageBoard(),/moderator lookup failed/);
  assert.deepEqual(calls,Array(4).fill(['can_moderate_village_board',undefined]));
});

function projectMock({ failUpdateColumns = false } = {}) {
  const member = { id: '11111111-1111-4111-8111-111111111111', role: 'student', approved: true };
  const ids = { a: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', b: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', c: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' };
  const seen = [];
  const created = [{ id: ids.a, igloo_id: 3, image_path: null, created_at: '2026-01-03T00:00:00Z' },
                   { id: ids.b, igloo_id: 5, image_path: 'x.jpg', created_at: '2026-01-02T00:00:00Z', announced_at: null }];
  const announcedRows = [{ id: ids.c, igloo_id: 7, image_path: null, created_at: '2025-12-01T00:00:00Z', announced_at: '2026-01-05T00:00:00Z', update_note: '새 화면' },
                         { id: ids.a, igloo_id: 3, image_path: null, created_at: '2026-01-03T00:00:00Z', announced_at: '2026-01-04T00:00:00Z' }];
  const comments = [{ project_id: ids.b, created_at: '2026-01-02T05:00:00Z' }, { project_id: ids.b, created_at: '2026-01-02T06:00:00Z' },
                    { project_id: ids.c, created_at: '2025-12-02T00:00:00Z' }, { project_id: ids.c, created_at: '2026-01-06T00:00:00Z' }];
  const api = {
    auth: { getUser: async () => ({ data: { user: { id: member.id } } }) },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://img' } }) }) },
    from(table) {
      if (table === 'igloos') return { select: () => ({ order: async () => ({ data: homes }) }) };
      if (table === 'members') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: member }) }) }) };
      if (table === 'projects') return { select: columns => {
        const hasUpdates = columns.includes('announced_at'), chain = { announced: false };
        chain.not = () => { chain.announced = true; return chain; };
        chain.order = () => chain;
        chain.limit = async () => {
          seen.push([hasUpdates ? 'with-updates' : 'plain', chain.announced ? 'announced' : 'created']);
          if (hasUpdates && failUpdateColumns) return { data: null, error: new Error('column announced_at does not exist') };
          return { data: chain.announced ? announcedRows : created.map(row => ({ ...row })), error: null };
        };
        return chain;
      } };
      if (table === 'project_comments') return { select: () => ({ in: () => ({ is: () => ({ limit: async () => ({ data: comments }) }) }) }) };
      throw Error('unexpected table ' + table);
    }, rpc: async (name, args) => { seen.push([name, args]); return { data: '2026-01-07T00:00:00Z', error: null }; } };
  return { api, ids, seen, backend: createVillageBackend({ config, loadSdk: async () => ({ createClient: () => api }) }) };
}

test('recent projects put announced updates first and count only feedback made after the last update', async () => {
  const { backend, ids } = projectMock();
  await assert.rejects(backend.listRecentProjects(0), /개수/);
  await assert.rejects(backend.listRecentProjects(21), /개수/);
  const rows = await backend.listRecentProjects(8);
  // c는 오래된 프로젝트지만 가장 최근에 업데이트를 알렸다. a는 알린 뒤(01-04)가 아니라 등록(01-03) 기준이 아니라 알림 기준으로 정렬된다.
  assert.deepEqual(rows.map(row => row.id), [ids.c, ids.a, ids.b]);
  assert.deepEqual(rows.map(row => [row.comment_count, row.fresh_comment_count]), [[2, 1], [0, 0], [2, 2]]);
  assert.equal(rows.find(row => row.id === ids.b).image_url, 'https://img');
  assert.equal(rows[0].update_note, '새 화면');
});

test('recent projects fall back to creation order while the update columns are not in the database yet', async () => {
  const { backend, ids, seen } = projectMock({ failUpdateColumns: true });
  const rows = await backend.listRecentProjects(8);
  assert.deepEqual(rows.map(row => row.id), [ids.a, ids.b]);
  assert.deepEqual(rows.map(row => row.fresh_comment_count), [0, 2]);
  assert.deepEqual(seen, [['with-updates', 'created'], ['plain', 'created']]);
});

test('announcing a project update validates input before connecting and sends a trimmed optional note', async () => {
  const { backend, ids, seen } = projectMock();
  await assert.rejects(backend.announceProjectUpdate('bad'), /프로젝트/);
  await assert.rejects(backend.announceProjectUpdate(ids.a, '가'.repeat(121)), /120자/);
  await backend.announceProjectUpdate(ids.a, '  새 화면  ');
  await backend.announceProjectUpdate(ids.a);
  assert.deepEqual(seen, [['announce_project_update', { p_id: ids.a, p_note: '새 화면' }], ['announce_project_update', { p_id: ids.a, p_note: null }]]);
});

test('improvement ideas validate input before connecting and use the member RPCs', async () => {
  const member={id:'11111111-1111-4111-8111-111111111111',role:'student',approved:true};
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', calls=[];
  const api={auth:{getUser:async()=>({data:{user:{id:member.id}}})},from(table){
    if(table==='igloos')return {select:()=>({order:async()=>({data:homes})})};
    if(table==='members')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:member})})})};
    throw Error('unexpected table '+table);
  },rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='set_improvement_idea_status'?true:name==='list_improvement_ideas'?[]:args?.p_value,error:null};}};
  const backend=createVillageBackend({config,loadSdk:async()=>({createClient:()=>api})});
  await assert.rejects(backend.reactImprovementIdea('bad',1),/의견/);
  await assert.rejects(backend.reactImprovementIdea(id,2),/반응/);
  await assert.rejects(backend.setImprovementIdeaStatus(id,'bogus'),/상태/);
  assert.deepEqual(await backend.listImprovementIdeas(),[]);
  assert.equal(await backend.reactImprovementIdea(id,-1),-1);
  assert.equal(await backend.setImprovementIdeaStatus(id,'voting'),true);
  assert.deepEqual(calls,[['list_improvement_ideas',undefined],['react_improvement_idea',{p_id:id,p_value:-1}],['set_improvement_idea_status',{p_id:id,p_status:'voting'}]]);
});
