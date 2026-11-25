import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './api/password-reset.mjs';
import {createVillageBackend} from './backend/client.js';
test('retired automatic endpoint cannot change credentials',async()=>{
 let status,body;
 await handler({method:'POST',headers:{'content-type':'application/json'},body:{action:'redeem',login:'test_user'}},{setHeader(){},status(v){status=v;return this;},json(v){body=v;}});
 assert.equal(status,410);assert.match(body.error,/수동/);
});
const config={url:'https://testproject.supabase.co',publishableKey:'sb_publishable_test'};
const homes=Array.from({length:31},(_,id)=>({id}));
function setup(){const calls=[];const backend=createVillageBackend({config,loadSdk:async()=>({createClient:()=>({from:()=>({select:()=>({order:async()=>({data:homes,error:null})})}),rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:null};},auth:{getUser:async()=>({data:{user:null}})}})})});return {backend,calls};}
test('manual request uses public RPC and validates input before writing',async()=>{
 const {backend,calls}=setup();
 assert.match((await backend.passwordReset('request',{login:' TEST_USER '})).message,/접수/);
 assert.deepEqual(calls,[{name:'request_manual_password_reset',args:{p_login:'test_user'}}]);
 await assert.rejects(backend.passwordReset('request',{login:'bad@id'}),/아이디/);
 await assert.rejects(backend.passwordReset('issue'),/지원/);
 assert.equal(calls.length,1);
});
test('signed-out users cannot change passwords or read requests',async()=>{
 const {backend}=setup();
 await assert.rejects(backend.changePassword('valid-new-password'),/로그인/);
 await assert.rejects(backend.passwordReset('list'),/로그인/);
});

test('signed-in members change only their own Auth password and errors propagate',async()=>{
 let password,fail=false;
 const backend=createVillageBackend({config,loadSdk:async()=>({createClient:()=>({
  from:table=>table==='igloos'?{select:()=>({order:async()=>({data:homes,error:null})})}:{select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'11111111-1111-4111-8111-111111111111',approved:true},error:null})})})},
  auth:{getUser:async()=>({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}}),updateUser:async value=>{password=value;return {data:{},error:fail?new Error('Auth refused'):null};}}
 })})});
 await assert.rejects(backend.changePassword('short'),/12/);assert.equal(password,undefined);
 await backend.changePassword('valid-new-password');assert.deepEqual(password,{password:'valid-new-password'});
 fail=true;await assert.rejects(backend.changePassword('another-new-password'),/Auth refused/);
});
