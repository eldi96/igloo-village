import { createHash, createHmac, randomBytes } from 'node:crypto';
import { supabaseConfig } from '../backend/config.js';
import { PASSWORD_RESET_ADMIN_ID } from '../backend/recovery-config.js';
const ID=/^[a-z0-9_]{3,20}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTICE='요청을 접수했어요. 관리자에게 직접 연락해 본인 확인을 받아주세요.';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createPasswordResetHandler({env=process.env,fetchImpl=fetch,adminId=PASSWORD_RESET_ADMIN_ID}={}) {
  return async function handler(req,res) {
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    const secret=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
    const base=env.SUPABASE_URL||supabaseConfig.url;
    const json=async(path,body,{token=secret,method='POST',publicKey=false}={})=>{
      const response=await fetchImpl(base+path,{method,headers:{apikey:publicKey?supabaseConfig.publishableKey:secret,...(String(token).startsWith('sb_secret_')?{}:{Authorization:`Bearer ${token}`}),'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
      if(!response.ok){
        let code='';
        try { const detail=await response.json(); if(/^[A-Z0-9_]{1,24}$/.test(detail.code||'')) code='_'+detail.code; } catch {}
        throw Object.assign(fail(502,'서버 요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'),{supportCode:`UPSTREAM_${response.status}${code}`});
      }
      if (response.status===204) return null;
      const text=await response.text();
      return text ? JSON.parse(text) : null;
    };
    const rpc=(name,body)=>json('/rest/v1/rpc/'+name,body);
    try {
      if(req.method!=='POST')throw fail(405,'사용할 수 없는 요청이에요.');
      if(!String(req.headers?.['content-type']||'').startsWith('application/json'))throw fail(400,'요청 형식을 확인해 주세요.');
      const origin=req.headers?.origin;
      if(origin&&new URL(origin).host!==req.headers.host)throw fail(403,'다른 사이트에서 보낸 요청은 사용할 수 없어요.');
      const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
      if(!b||JSON.stringify(b).length>12000)throw fail(400,'입력 내용을 확인해 주세요.');
      const login=String(b.login||'').trim().toLowerCase();
      if(['request','redeem'].includes(b.action)&&!ID.test(login))throw fail(400,'아이디 형식을 확인해 주세요.');
      if(!secret||!adminId||!UUID.test(adminId)||!base.startsWith('https://'))throw fail(503,'비밀번호 초기화 기능이 아직 준비되지 않았어요. 관리자에게 직접 문의해 주세요.');
      const hash=value=>createHash('sha256').update(value).digest('hex');
      const source=req.headers?.['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown';
      const bucket=createHmac('sha256',secret).update(String(source)).digest('hex');
      // 계정 존재 여부와 무관하게 서버에서 요청 횟수를 제한한다. 원본 IP는 저장하지 않는다.
      const admitted=await rpc('password_reset_rate_limit',{p_bucket:bucket,p_action:b.action});
      if(admitted!==true)throw fail(429,'요청이 많아요. 잠시 후 다시 시도해 주세요.');
      if(b.action==='request'){
        await rpc('request_password_reset',{p_login:login});
        return res.status(200).json({message:NOTICE});
      }
      if(['list','issue','reject'].includes(b.action)){
        const bearer=String(req.headers?.authorization||'');
        if(!bearer.startsWith('Bearer '))throw fail(401,'로그인이 필요해요.');
        const user=await json('/auth/v1/user',null,{token:bearer.slice(7),method:'GET',publicKey:true});
        if(user.id!==adminId)throw fail(403,'초기화 요청은 지정된 관리자만 처리할 수 있어요.');
        if(await rpc('password_reset_admin_authorized',{p_admin:adminId})!==true)throw fail(403,'초기화 요청은 승인된 지정 관리자만 처리할 수 있어요.');
        if(b.action==='list')return res.status(200).json({requests:await rpc('list_password_reset_requests',{p_admin:adminId})});
        if(!UUID.test(b.requestId||''))throw fail(400,'요청을 다시 선택해 주세요.');
        if(b.action==='reject'){
          await rpc('reject_password_reset',{p_id:b.requestId,p_admin:adminId});
          return res.status(200).json({message:'요청을 반려했어요.'});
        }
        if(b.verified!==true)throw fail(400,'먼저 수강생 본인 확인을 완료해 주세요.');
        const temporaryPassword=randomBytes(18).toString('base64url');
        const issued=await rpc('issue_password_reset',{p_id:b.requestId,p_hash:hash(temporaryPassword),p_admin:adminId});
        if(issued!==true)throw fail(409,'발급할 수 없는 요청이에요. 목록을 다시 불러와 주세요.');
        return res.status(200).json({temporaryPassword,expiresInMinutes:30});
      }
      if(b.action==='redeem'){
        if(typeof b.temporaryPassword!=='string'||b.temporaryPassword.length<20||b.temporaryPassword.length>128||typeof b.newPassword!=='string'||b.newPassword.length<12||b.newPassword.length>128||b.newPassword===b.temporaryPassword)throw fail(400,'임시 비밀번호와 새 비밀번호(12~128자)를 확인해 주세요.');
        const claim=randomBytes(24).toString('hex');
        const member=await rpc('claim_password_reset',{p_login:login,p_hash:hash(b.temporaryPassword),p_claim:claim});
        if(!UUID.test(member||''))throw fail(400,'임시 비밀번호가 올바르지 않거나 만료됐어요. 다시 발급받아 주세요.');
        try { await json('/auth/v1/admin/users/'+member,{password:b.newPassword},{method:'PUT'}); }
        catch { throw fail(502,'변경 결과를 확인하지 못했어요. 새 비밀번호로 로그인해 보고, 안 되면 관리자에게 재발급을 요청해 주세요.'); }
        // Auth 변경 후 상태 저장 실패 시 재사용은 막힌 상태로 유지한다.
        await rpc('finish_password_reset',{p_login:login,p_claim:claim,p_success:true}).catch(()=>{});
        return res.status(200).json({message:'비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요.'});
      }
      throw fail(400,'요청을 확인해 주세요.');
    }catch(error){return res.status(error.status||500).json({error:error.status?error.message:'처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',...(error.supportCode?{code:error.supportCode}:{})});}
  };
}
export default createPasswordResetHandler();
