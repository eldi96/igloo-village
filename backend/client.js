import { supabaseConfig } from './config.js';

// 마을의 3D 화면과 분리한 데이터 연결부. 권한은 DB의 RLS에서 검사한다.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
const HOME_COLUMNS = 'id,owner_id,is_public,claimed_at';
const PROJECT_COLUMNS = 'id,igloo_id,owner_id,title,description,url,created_at';
const MAIL_COLUMNS = 'id,sender_id,recipient_id,body,link,created_at,read_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createVillageBackend({ config = supabaseConfig, loadSdk = () => import(SDK_URL) } = {}) {
  const events = new EventTarget();
  const status = { phase: 'idle', projectRef: null, homeCount: 0, error: null };
  let client = null, connection = null;
  function report(phase, error = null) {
    status.phase = phase; status.error = error ? error.message : null;
    events.dispatchEvent(new Event('change'));
  }
  function validateConfig() {
    const url = new URL(config.url);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.pathname !== '/') throw new Error('Supabase 프로젝트 URL을 확인해주세요.');
    if (!config.publishableKey?.startsWith('sb_publishable_')) throw new Error('브라우저에는 publishable 키만 사용할 수 있습니다.');
    status.projectRef = url.hostname.split('.')[0];
  }
  const unwrap = result => { if (result.error) throw result.error; return result.data; };
  const homeId = id => { if (!Number.isInteger(id) || id < 0 || id > 30) throw new Error('존재하지 않는 이글루입니다.'); return id; };
  const checkLink = (value, optional = false) => {
    const link = String(value ?? '').trim();
    if (!link && optional) return '';
    if (link.length > 2048) throw new Error('링크가 너무 깁니다.');
    let parsed;
    try { parsed = new URL(link); } catch { throw new Error('올바른 링크를 입력해주세요.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('http 또는 https 링크만 사용할 수 있습니다.');
    return link;
  };
  async function connect() {
    if (connection) return connection;
    connection = (async () => {
      report('connecting');
      try {
        validateConfig();
        if (!client) {
          const { createClient } = await loadSdk();
          client = createClient(config.url, config.publishableKey, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'igloo-village-auth' }
          });
        }
        const homes = unwrap(await client.from('igloos').select(HOME_COLUMNS).order('id'));
        if (homes.length !== 31 || !homes.every((home, i) => home.id === i)) throw new Error('DB의 이글루 배치가 현재 마을과 일치하지 않습니다.');
        status.homeCount = homes.length;
        report('connected');
        return { homes };
      } catch (error) {
        report('error', error); connection = null; throw error;
      }
    })();
    // 동기 설정 오류에서도 재시도가 가능하도록 실패한 promise를 해제한다.
    try { return await connection; } catch (error) { connection = null; throw error; }
  }
  async function ready() { await connect(); return client; }
  async function requireMember(role = null) {
    const api = await ready();
    const { data, error } = await api.auth.getUser();
    if (error || !data.user) throw new Error('먼저 로그인해주세요.');
    const member = unwrap(await api.from('members').select('id,display_name,role,approved').eq('id', data.user.id).maybeSingle());
    if (!member?.approved) throw new Error('수강생 가입 승인이 필요합니다.');
    if (role && member.role !== role) throw new Error(role === 'instructor' ? '강사 계정만 사용할 수 있습니다.' : '수강생 계정만 사용할 수 있습니다.');
    return { api, member };
  }
  return {
    status, connect,
    onStatusChange(callback) {
      const listener = () => callback({ ...status }); events.addEventListener('change', listener);
      return () => events.removeEventListener('change', listener);
    },
    async getMap() { const api = await ready(); return unwrap(await api.from('igloos').select(HOME_COLUMNS).order('id')); },
    async getMembership() {
      const api = await ready();
      const { data } = await api.auth.getUser();
      if (!data.user) return null;
      return unwrap(await api.from('members').select('id,display_name,role,approved').eq('id', data.user.id).maybeSingle());
    },
    async signInWithGoogle() {
      const api = await ready();
      // Google 제공자와 URL 허용 목록을 대시보드에서 설정한 후 호출한다.
      return unwrap(await api.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: new URL(location.pathname, location.origin).href } }));
    },
    async signOut() { const api = await ready(); const { error } = await api.auth.signOut(); if (error) throw error; },
    async claimIgloo(id) {
      homeId(id); const { api } = await requireMember('student');
      return unwrap(await api.rpc('claim_igloo', { p_igloo_id: id }));
    },
    async setIglooPublic(id, isPublic) {
      homeId(id); const { api, member } = await requireMember('student');
      return unwrap(await api.from('igloos').update({ is_public: Boolean(isPublic) }).eq('id', id).eq('owner_id', member.id).select(HOME_COLUMNS).single());
    },
    async getProjects(id) {
      homeId(id); const { api } = await requireMember();
      return unwrap(await api.from('projects').select(PROJECT_COLUMNS).eq('igloo_id', id).order('created_at', { ascending: false }).limit(100));
    },
    async addProject(id, { title, description = '', url }) {
      homeId(id); const safeUrl = checkLink(url);
      if (!title?.trim() || title.trim().length > 120 || description.length > 5000) throw new Error('제목과 설명 길이를 확인해주세요.');
      const { api, member } = await requireMember('student');
      return unwrap(await api.from('projects').insert({ igloo_id: id, owner_id: member.id, title: title.trim(), description, url: safeUrl }).select(PROJECT_COLUMNS).single());
    },
    async getInbox() {
      const { api, member } = await requireMember();
      return unwrap(await api.from('mail_messages').select(MAIL_COLUMNS).eq('recipient_id', member.id).order('created_at', { ascending: false }).limit(100));
    },
    async markMailRead(id) {
      if (!UUID.test(id)) throw new Error('존재하지 않는 우편입니다.');
      const { api, member } = await requireMember();
      return unwrap(await api.from('mail_messages').update({ read_at: new Date().toISOString() }).eq('id', id).eq('recipient_id', member.id).select('id,read_at').single());
    },
    async sendMail(recipientIds, { body = '', link = '' }) {
      const recipients = [...new Set(recipientIds)];
      if (!recipients.length || recipients.length > 31 || recipients.some(id => !UUID.test(id))) throw new Error('받는 수강생을 선택해주세요.');
      const safeLink = checkLink(link, true);
      if ((!body.trim() && !safeLink) || body.length > 5000) throw new Error('메시지 또는 링크를 입력해주세요.');
      const { api } = await requireMember('instructor');
      return unwrap(await api.rpc('send_mail', { p_recipient_ids: recipients, p_body: body.trim(), p_link: safeLink }));
    },
    async subscribeMap(callback) {
      const api = await ready();
      const channel = api.channel('igloo-village-map').on('postgres_changes', { event: '*', schema: 'public', table: 'igloos' }, callback).subscribe();
      return () => api.removeChannel(channel);
    },
    async subscribeInbox(callback) {
      const { api, member } = await requireMember();
      const channel = api.channel('igloo-village-inbox-' + member.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mail_messages', filter: 'recipient_id=eq.' + member.id }, callback).subscribe();
      return () => api.removeChannel(channel);
    }
  };
}

export const villageBackend = createVillageBackend();
