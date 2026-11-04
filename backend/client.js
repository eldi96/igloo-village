import { supabaseConfig } from './config.js';

// 마을의 3D 화면과 분리한 데이터 연결부. 권한은 DB의 RLS에서 검사한다.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
const HOME_COLUMNS = 'id,owner_id,is_public,claimed_at';
const PROJECT_COLUMNS = 'id,igloo_id,owner_id,title,description,url,created_at';
const MAIL_COLUMNS = 'id,sender_id,recipient_id,body,link,created_at,read_at';
const CHAT_COLUMNS = 'id,sender_id,body,created_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Supabase 로그인은 이메일 형식을 요구한다. 아이디를 메일이 오가지 않는 주소로 바꿔 쓴다.
const ID_PATTERN = /^[a-z0-9_]{3,20}$/;
function idToEmail(id) {
  const clean = String(id ?? '').trim().toLowerCase();
  if (!ID_PATTERN.test(clean)) throw new Error('아이디는 영문 소문자, 숫자, _로 3~20자여야 해요.');
  return `${clean}@igloo-village.eldi96.github.io`;
}

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
    async currentUser() { const api = await ready(); return (await api.auth.getUser()).data.user; },
    async signIn(id, password) {
      const api = await ready();
      return unwrap(await api.auth.signInWithPassword({ email: idToEmail(id), password }));
    },
    // 코드를 먼저 확인해 잘못된 코드로 계정만 생기는 일을 막는다. 실제 승인은 joinWithInvite가 DB에서 한다.
    async signUp({ id, password, displayName, code }) {
      const api = await ready();
      const email = idToEmail(id);
      if (!unwrap(await api.rpc('check_invite', { p_code: code }))) throw new Error('초대 코드가 맞지 않아요.');
      // 이메일 인증이 켜져 있으면 없는 주소로 메일이 나가므로 가입을 막는다.
      const settings = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.publishableKey } }).then(r => r.json());
      if (!settings.mailer_autoconfirm) throw new Error('가입이 아직 준비되지 않았어요. 강사님께 알려주세요.');
      const { session } = unwrap(await api.auth.signUp({ email, password }));
      if (!session) throw new Error('이미 쓰고 있는 아이디예요.');
      return unwrap(await api.rpc('join_with_invite', { p_code: code, p_display_name: displayName }));
    },
    async joinWithInvite(code, displayName) {
      const api = await ready();
      return unwrap(await api.rpc('join_with_invite', { p_code: code, p_display_name: displayName }));
    },
    async signOut() { const api = await ready(); const { error } = await api.auth.signOut(); if (error) throw error; },
    // 로그인 상태가 바뀔 때마다 호출한다. 반환한 함수로 구독을 끊는다.
    async onAuthChange(callback) {
      const api = await ready();
      const { data } = api.auth.onAuthStateChange((_event, session) => {
        // 인증 콜백 안에서 다른 Supabase 호출을 기다리면 멈출 수 있어 다음 틱으로 넘긴다.
        setTimeout(() => callback(session?.user ?? null), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    // 이름은 승인된 회원에게만 보인다(RLS). 그 외에는 빈 목록이다.
    async getMemberNames() {
      const api = await ready();
      return unwrap(await api.from('members').select('id,display_name'));
    },
    async updateDisplayName(displayName) {
      const name = String(displayName ?? '').trim();
      if (name.length < 1 || name.length > 40) throw new Error('이름은 1~40자로 입력해주세요.');
      const { api, member } = await requireMember();
      return unwrap(await api.from('members').update({ display_name: name }).eq('id', member.id).select('id,display_name,role,approved').single());
    },
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
    async deleteProject(id) {
      if (!UUID.test(id)) throw new Error('존재하지 않는 프로젝트입니다.');
      const { api, member } = await requireMember('student');
      const { error } = await api.from('projects').delete().eq('id', id).eq('owner_id', member.id);
      if (error) throw error;
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
    // 대화. 읽고 쓰는 권한은 지정된 계정으로 DB에서 제한한다.
    async canUseChat() {
      const api = await ready();
      return Boolean(unwrap(await api.rpc('can_use_chat')));
    },
    async getChat(limit = 100) {
      const api = await ready();
      return unwrap(await api.from('chat_messages').select(CHAT_COLUMNS).order('created_at', { ascending: false }).limit(limit)).reverse();
    },
    async sendChat(body) {
      const text = String(body ?? '').trim();
      if (text.length < 1 || text.length > 500) throw new Error('메시지는 1~500자로 입력해주세요.');
      const api = await ready();
      return unwrap(await api.from('chat_messages').insert({ body: text }).select(CHAT_COLUMNS).single());
    },
    async deleteChat(id) {
      if (!UUID.test(id)) throw new Error('존재하지 않는 메시지입니다.');
      const api = await ready();
      const { error } = await api.from('chat_messages').delete().eq('id', id);
      if (error) throw error;
    },
    // onStatus로 연결 상태를 알려 재연결 때 놓친 메시지를 다시 읽게 한다.
    async subscribeChat(callback, onStatus = () => {}) {
      const api = await ready();
      const channel = api.channel('igloo-village-chat')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, callback)
        .subscribe(onStatus);
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
