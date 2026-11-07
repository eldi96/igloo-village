import { supabaseConfig } from './config.js';

// 마을의 3D 화면과 분리한 데이터 연결부. 권한은 DB의 RLS에서 검사한다.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
const HOME_COLUMNS = 'id,owner_id,is_public,claimed_at,latest_project_at,exterior_light';
const PROJECT_COLUMNS = 'id,igloo_id,owner_id,title,description,url,instructions,image_path,created_at';
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
  async function withImage(api, row) {
    if (!row.image_path) return { ...row, image_url: null };
    const { data, error } = await api.storage.from('project-images').createSignedUrl(row.image_path, 3600);
    if (error) console.warn('대표 이미지를 불러오지 못했어요:', error.message);
    return { ...row, image_url: data?.signedUrl || null };
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
    async getCardTheme(id) {
      homeId(id); const { api } = await requireMember();
      return unwrap(await api.rpc('get_igloo_card_theme', { p_home: id }));
    },
    async getExteriorLight() {
      const { api } = await requireMember('student');
      return unwrap(await api.rpc('get_exterior_light'));
    },
    async setExteriorLight(color) {
      if (!['warm','blue'].includes(color)) throw new Error('불빛 색상을 확인해 주세요.');
      const { api } = await requireMember('student');
      return unwrap(await api.rpc('set_exterior_light', { p_color: color }));
    },
    async setCardTheme(theme) {
      if (!['glass','rose','cream','graphite','mint'].includes(theme)) throw new Error('테마를 확인해 주세요.');
      const { api } = await requireMember('student');
      return unwrap(await api.rpc('set_card_theme', { p_theme: theme }));
    },
    // 동의한 실험 대상자의 오늘 방문을 서버 시간(한국) 기준으로 한 번 기록한다.
    async recordVisit() {
      const { api } = await requireMember();
      return unwrap(await api.rpc('record_visit'));
    },

    // 공개 목록은 작성자 ID를 반환하지 않는다. 커서가 없으면 최신 메모부터 조회한다.
    async listVillageBoardPosts(limit = 20, cursor = null) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new Error('조회 개수를 확인해 주세요.');
      const api = await ready();
      return unwrap(await api.rpc('list_village_board_posts', {
        p_limit: limit,
        p_before_created_at: cursor?.created_at ?? null,
        p_before_id: cursor?.id ?? null
      }));
    },
    async createVillageBoardPost(content) {
      const text = String(content ?? '').trim();
      if (!text || text.length > 500) throw new Error('메모는 1~500자로 작성해 주세요.');
      const { api } = await requireMember();
      return unwrap(await api.rpc('create_village_board_post', {p_content: text}));
    },
    // 운영자 삭제 버튼 표시용. 실제 삭제 권한은 delete_village_board_post가 다시 검사한다.
    async canModerateVillageBoard() {
      const { api } = await requireMember();
      return unwrap(await api.rpc('can_moderate_village_board')) === true;
    },
    async deleteVillageBoardPost(id) {
      if (!UUID.test(id)) throw new Error('삭제할 메모가 올바르지 않습니다.');
      const { api } = await requireMember();
      return unwrap(await api.rpc('delete_village_board_post', {p_id: id}));
    },
    async getMemberVisitCounts() {
      const { api } = await requireMember();
      return unwrap(await api.rpc('get_member_visit_counts'));
    },
    async canViewObservatory() {
      const { api } = await requireMember();
      return Boolean(unwrap(await api.rpc('can_view_observatory')));
    },
    async getVisitExperiment(days = 14) {
      if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('조회 기간은 1~90일이어야 합니다.');
      const { api } = await requireMember();
      return unwrap(await api.rpc('get_visit_experiment', { p_days: days }));
    },

    // 개인별 기록 대신 날짜별 집계만 반환한다. 비로그인은 접근할 수 없다.
    // 개별 로그가 아닌 한국 날짜 기준 방문 횟수/누적 횟수 집계만 제공한다.
    async getVisitCounts(days = 14) {
      if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('조회 기간은 1~90일이어야 합니다.');
      const { api } = await requireMember();
      return unwrap(await api.rpc('get_visit_counts', { p_days: days }));
    },
    async getVisitTrend(days = 14) {
      if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('조회 기간은 1~90일이어야 합니다.');
      const { api } = await requireMember();
      return unwrap(await api.rpc('get_visit_trend', { p_days: days }));
    },
    async getProjects(id) {
      homeId(id); const { api } = await requireMember();
      let result = await api.from('projects').select(PROJECT_COLUMNS).eq('igloo_id', id).order('created_at', { ascending: false }).limit(100);
      // 공유 DB의 추가 열 적용 전에도 기존 프로젝트는 읽을 수 있게 한다.
      const rows = unwrap(result);
      return Promise.all(rows.map(row => withImage(api, row)));
    },
    async addProject(id, { title, description = '', instructions = '', url, image = null }) {
      homeId(id); const safeUrl = checkLink(url);
      if (!title?.trim() || title.trim().length > 120 || description.length > 5000 || instructions.length > 5000) throw new Error('제목, 설명과 사용법 길이를 확인해주세요.');
      if (image && (!(image instanceof Blob) || image.type !== 'image/jpeg' || image.size > 5 * 1024 * 1024)) throw new Error('5MB 이하의 JPEG 이미지만 저장할 수 있어요.');
      const { api, member } = await requireMember('student');
      let imagePath = null;
      if (image) {
        imagePath = `${member.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await api.storage.from('project-images').upload(imagePath, image, { contentType: 'image/jpeg', upsert: false });
        if (error) throw new Error('이미지를 저장하지 못했어요. 이미지 저장소 설정과 연결을 확인해 주세요.');
      }
      let row;
      try {
        row = unwrap(await api.from('projects').insert({ igloo_id: id, owner_id: member.id, title: title.trim(), description: description.trim(), instructions: instructions.trim(), url: safeUrl, image_path: imagePath }).select(PROJECT_COLUMNS).single());
      } catch (error) {
        if (imagePath) await api.storage.from('project-images').remove([imagePath]).catch(() => {});
        if (['42703', 'PGRST204'].includes(error.code)) throw new Error('프로젝트 저장 항목이 아직 준비되지 않았어요. 관리자에게 DB 업데이트를 요청해 주세요.');
        throw error;
      }
      return withImage(api, row);
    },
    async updateProject(id, { title, description = '', instructions = '', url, image = null }) {
      if (!UUID.test(id)) throw new Error('존재하지 않는 프로젝트입니다.');
      const safeUrl = checkLink(url);
      if (!title?.trim() || title.trim().length > 120 || description.length > 5000 || instructions.length > 5000) throw new Error('제목, 설명과 사용법 길이를 확인해주세요.');
      if (image && (!(image instanceof Blob) || image.type !== 'image/jpeg' || image.size > 5 * 1024 * 1024)) throw new Error('5MB 이하의 JPEG 이미지만 저장할 수 있어요.');
      const { api, member } = await requireMember('student');
      const previous = unwrap(await api.from('projects').select('id,image_path').eq('id', id).eq('owner_id', member.id).single());
      const changes = { title: title.trim(), description: description.trim(), instructions: instructions.trim(), url: safeUrl };
      let uploaded = null;
      if (image) {
        uploaded = `${member.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await api.storage.from('project-images').upload(uploaded, image, { contentType: 'image/jpeg', upsert: false });
        if (error) throw new Error('새 이미지를 저장하지 못했어요. 다시 시도해 주세요.');
        changes.image_path = uploaded;
      }
      let row;
      try {
        row = unwrap(await api.from('projects').update(changes).eq('id', id).eq('owner_id', member.id).select(PROJECT_COLUMNS).single());
      } catch (error) {
        if (uploaded) await api.storage.from('project-images').remove([uploaded]).catch(() => {});
        throw error;
      }
      if (uploaded && previous.image_path) {
        const { error } = await api.storage.from('project-images').remove([previous.image_path]);
        if (error) console.warn('이전 이미지 정리가 필요해요:', error.message);
      }
      return withImage(api, row);
    },
    async deleteProject(id) {
      if (!UUID.test(id)) throw new Error('존재하지 않는 프로젝트입니다.');
      const { api, member } = await requireMember('student');
      const rows = unwrap(await api.from('projects').delete().eq('id', id).eq('owner_id', member.id).select('image_path'));
      const paths = rows.map(row => row.image_path).filter(Boolean);
      if (paths.length) {
        const { error } = await api.storage.from('project-images').remove(paths);
        if (error) console.warn('남은 대표 이미지 정리가 필요해요:', error.message);
      }
    },
    // 게시판의 새 프로젝트·피드백 요청 타일용. 공개 이글루(또는 내) 프로젝트만 RLS로 보이고, 댓글 수는 삭제되지 않은 것만 센다.
    async listRecentProjects(limit = 8) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('조회 개수를 확인해 주세요.');
      const { api } = await requireMember();
      const rows = unwrap(await api.from('projects').select(PROJECT_COLUMNS).order('created_at', { ascending: false }).limit(limit));
      const counts = new Map(rows.map(row => [row.id, 0]));
      if (rows.length) {
        const comments = unwrap(await api.from('project_comments').select('project_id')
          .in('project_id', rows.map(row => row.id)).is('deleted_at', null).limit(5000));
        for (const { project_id } of comments) counts.set(project_id, (counts.get(project_id) || 0) + 1);
      }
      return Promise.all(rows.map(async row => ({ ...await withImage(api, row), comment_count: counts.get(row.id) || 0 })));
    },
    // 서비스 개선 의견(좋아요/싫어요). 목록은 누구나, 반응은 승인 회원만, 상태 변경은 운영자만(DB가 검사).
    async listImprovementIdeas() {
      const api = await ready();
      return unwrap(await api.rpc('list_improvement_ideas'));
    },
    async reactImprovementIdea(id, value) {
      if (!UUID.test(id)) throw new Error('의견이 올바르지 않습니다.');
      if (![-1, 0, 1].includes(value)) throw new Error('반응 값이 올바르지 않습니다.');
      const { api } = await requireMember();
      return unwrap(await api.rpc('react_improvement_idea', { p_id: id, p_value: value }));
    },
    async setImprovementIdeaStatus(id, status) {
      if (!UUID.test(id)) throw new Error('의견이 올바르지 않습니다.');
      if (!['review', 'voting', 'in_progress', 'done', 'hidden'].includes(status)) throw new Error('상태 값이 올바르지 않습니다.');
      const { api } = await requireMember();
      return unwrap(await api.rpc('set_improvement_idea_status', { p_id: id, p_status: status })) === true;
    },
    async getProjectFeedback(projectId) {
      if (!UUID.test(projectId)) throw new Error('존재하지 않는 프로젝트입니다.');
      const { api } = await requireMember();
      const columns = 'id,member_id,body,created_at,parent_id,deleted_at,members!project_comments_member_id_fkey(display_name)';
      const [comments, reactions] = await Promise.all([
        api.from('project_comments').select(columns).eq('project_id', projectId).is('parent_id', null).order('created_at', { ascending: false }).order('id').limit(100),
        api.from('project_reactions').select('member_id,emoji').eq('project_id', projectId).limit(1000)
      ]);
      const roots = unwrap(comments), all = [...roots];
      // 원댓글을 먼저 고른 뒤 답글을 읽어, 답글만 남거나 중간에 잘리는 것을 막는다.
      if (roots.length) {
        for (let offset = 0; ; offset += 1000) {
          const replies = unwrap(await api.from('project_comments').select(columns).eq('project_id', projectId)
            .in('parent_id', roots.map(row => row.id)).order('created_at').order('id').range(offset, offset + 999));
          all.push(...replies);
          if (replies.length < 1000) break;
        }
      }
      return { comments: all, reactions: unwrap(reactions) };
    },
    async addProjectComment(projectId, body, parentId = null) {
      const text = String(body ?? '').trim();
      if (!UUID.test(projectId) || !text || text.length > 1000) throw new Error('댓글은 1~1,000자로 작성해 주세요.');
      if (parentId !== null && !UUID.test(parentId)) throw new Error('답글을 남길 댓글을 확인해 주세요.');
      const { api, member } = await requireMember();
      const row = unwrap(await api.from('project_comments').insert({ project_id: projectId, member_id: member.id, body: text, parent_id: parentId }).select('id').single());
      events.dispatchEvent(new Event('comments'));
      return row;
    },
    async deleteProjectComment(id) {
      if (!UUID.test(id)) throw new Error('삭제할 댓글을 확인해 주세요.');
      const { api, member } = await requireMember();
      const row = unwrap(await api.from('project_comments').update({ body: '', deleted_at: new Date().toISOString() })
        .eq('id', id).eq('member_id', member.id).is('deleted_at', null).select('id').single());
      events.dispatchEvent(new Event('comments'));
      return row;
    },
    async setProjectReaction(projectId, emoji, active) {
      if (!UUID.test(projectId) || !['👍', '❤️'].includes(emoji)) throw new Error('올바른 프로젝트와 반응을 선택해 주세요.');
      const { api, member } = await requireMember();
      if (active) {
        const { error } = await api.from('project_reactions').insert({ project_id: projectId, member_id: member.id, emoji });
        if (error && error.code !== '23505') throw error;
      } else {
        const { error } = await api.from('project_reactions').delete().eq('project_id', projectId).eq('member_id', member.id).eq('emoji', emoji);
        if (error) throw error;
      }
    },
    onCommentChange(callback) {
      events.addEventListener('comments', callback);
      return () => events.removeEventListener('comments', callback);
    },
    async getUnreadMailboxHomes() {
      const api = await ready();
      return unwrap(await api.rpc('get_unread_mailbox_homes')).map(row => row.igloo_id);
    },
    async getCommentNotifications() {
      const { api, member } = await requireMember();
      return unwrap(await api.from('comment_notifications')
        .select('id,project_id,created_at,projects(title,igloo_id),project_comments(body,parent_id,members!project_comments_member_id_fkey(display_name))')
        .eq('recipient_id', member.id).is('read_at', null).order('created_at', { ascending: false }).limit(100));
    },
    async markCommentNotificationsRead(projectId, before) {
      if (!UUID.test(projectId) || !Number.isFinite(Date.parse(before))) throw new Error('알림을 확인할 프로젝트를 선택해 주세요.');
      const { api, member } = await requireMember();
      return unwrap(await api.from('comment_notifications').update({ read_at: new Date().toISOString() })
        .eq('recipient_id', member.id).eq('project_id', projectId).is('read_at', null).lte('created_at', before).select('id'));
    },
    async subscribeCommentNotifications(callback, onStatus = () => {}) {
      const { api, member } = await requireMember();
      const channel = api.channel('igloo-comment-notifications-' + member.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_notifications', filter: 'recipient_id=eq.' + member.id }, callback)
        .subscribe(onStatus);
      return () => api.removeChannel(channel);
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
