// 새 비밀번호는 Auth로만 보내며 화면을 닫거나 계정이 바뀌면 입력을 비운다.
export { PASSWORD_RESET_ADMIN_ID } from './backend/recovery-config.js';
export function createPasswordResetUi(backend, { onLogin = () => {} } = {}) {
  const veil = document.createElement('div'); veil.className = 'auth-veil'; veil.hidden = true;
  const card = document.createElement('div'); card.className = 'auth-card'; card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label','비밀번호 초기화');veil.append(card);document.body.append(veil);
  let busy=false,opener=null,revision=0;
  const button=(text,click)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=click;return b;};
  const paragraph=text=>{const p=document.createElement('p');p.textContent=text;return p;};
  function clear(){revision++;busy=false;veil.hidden=true;card.replaceChildren();}
  function close(){if(busy)return;clear();opener?.focus();}
  function show(title,text){revision++;opener=veil.hidden?document.activeElement:opener;card.replaceChildren();const h=document.createElement('h2');h.textContent=title;card.append(h,paragraph(text));veil.hidden=false;}
  function input(label,name,type='text',attrs={}){const wrap=document.createElement('label');wrap.textContent=label;const field=document.createElement('input');Object.assign(field,{name,type,required:true,...attrs});wrap.append(field);return wrap;}
  function form(fields,label,submit){const f=document.createElement('form'),actions=document.createElement('div'),err=paragraph('');err.className='auth-error';err.setAttribute('role','alert');const go=button(label);go.type='submit';go.className='auth-main';actions.className='auth-actions';actions.append(go,button('닫기',close));f.append(...fields,actions,err);f.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;go.disabled=true;err.textContent='';try{await submit(new FormData(f));}catch(error){err.textContent=error.message||'처리하지 못했어요.';}finally{busy=false;go.disabled=false;}};card.append(f);f.querySelector('input')?.focus();return f;}
  function done(title,text){show(title,text);const actions=document.createElement('div');actions.className='auth-actions';actions.append(button('확인',close));card.append(actions);actions.querySelector('button').focus();}
  function openRequest(){show('비밀번호 초기화 요청','가입한 아이디를 입력해 주세요. 요청 후 관리자에게 직접 본인 확인을 받아야 해요.');form([input('아이디','login','text',{pattern:'[a-z0-9_]{3,20}',maxLength:20,autocomplete:'username',autocapitalize:'none'})],'요청하기',async data=>{const result=await backend.passwordReset('request',{login:data.get('login')});done('요청 접수',result.message);});}
  function openChange() {
    show('비밀번호 변경','로그인한 계정의 비밀번호를 바꿔요. 관리자에게 임시 비밀번호를 받았다면 새 비밀번호로 변경해 주세요.');
    form([input('새 비밀번호 (12자 이상)','newPassword','password',{minLength:12,maxLength:128,autocomplete:'new-password'}),input('새 비밀번호 확인','confirm','password',{minLength:12,maxLength:128,autocomplete:'new-password'})],'변경하기',async data=>{
      if(data.get('newPassword')!==data.get('confirm')) throw new Error('새 비밀번호가 서로 달라요.');
      const ticket=revision;
      const result=await backend.changePassword(data.get('newPassword'));
      if(ticket===revision&&!veil.hidden) done('변경 완료',result.message);
    });
  }
  async function openAdmin() {
    show('비밀번호 초기화 요청','본인 확인 후 관리자 SQL을 실행해 주세요. 실행 후 새로고침하면 완료로 표시돼요.');
    card.append(button('새로고침',openAdmin),button('닫기',close));
    const loading=paragraph('불러오는 중…');loading.setAttribute('role','status');card.append(loading);
    const ticket=revision;
    try {
      const {requests}=await backend.passwordReset('list');
      if(veil.hidden||ticket!==revision)return;
      loading.textContent=requests.length?'':'접수된 요청이 없어요.';
      for(const row of requests) {
        const section=document.createElement('section');section.style.cssText='margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.2);text-align:left';
        const title=document.createElement('strong');title.textContent=`${row.display_name} · ${row.login}`;
        section.append(title,paragraph(`${({pending:'처리 대기',issued:'기존 발급 요청',processing:'기존 처리 확인 필요',completed:'관리자 처리 완료',rejected:'반려됨',locked:'관리자 확인 필요'})[row.status]||'상태 확인 필요'} · ${new Date(row.created_at).toLocaleString('ko-KR')}`));
        if(!['completed','rejected'].includes(row.status)) {
          const id=input('요청 번호 · 관리자 SQL에 사용','requestId','text',{value:row.id,readOnly:true});
          section.append(id);
          id.querySelector('input').addEventListener('click',event=>event.target.select());
          section.append(button('처리 상태 변경',()=>openResolve(row)));
        }
        card.append(section);
      }
    } catch(error) {if(ticket===revision&&!veil.hidden)loading.textContent=error.message;}
  }
  function openResolve(row) {
    show('초기화 요청 처리',`${row.display_name} (${row.login})의 비밀번호를 별도로 변경했다면 전달 후 완료를 표시해 주세요. 관리자 SQL로 처리했다면 새로고침하면 돼요.`);
    const checked=input('본인 확인과 비밀번호 전달을 완료했습니다.','verified','checkbox');
    checked.querySelector('input').style.cssText='display:inline-block;width:18px;height:18px;margin-left:8px';
    const f=form([checked],'처리 완료 표시',async()=>{await backend.passwordReset('complete',{requestId:row.id});await openAdmin();});
    f.querySelector('.auth-actions').append(button('요청 반려',async event=>{
      if(busy)return;busy=true;const target=event.currentTarget;target.disabled=true;
      try{await backend.passwordReset('reject',{requestId:row.id});await openAdmin();}
      catch(error){f.querySelector('.auth-error').textContent=error.message;}
      finally{busy=false;target.disabled=false;}
    }));
  }
  veil.addEventListener('click',e=>{if(e.target===veil)close();});window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!veil.hidden)close();});
  return {openRequest,openChange,openAdmin,clear};
}
