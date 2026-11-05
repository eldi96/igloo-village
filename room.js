// 일반 이글루 내부. 언리얼 작업이 나오기 전까지 쓰는 임시 3D 방이다.
// 빛과 그림자는 텍스처에 미리 그려 그림자 계산 없이 가볍게 돌린다.
import * as THREE from 'three';
import { mountPrivacyPanel } from './privacy-panel.js';
import { mountCardThemes } from './card-themes.js?v=compact-unlock-notice';
import { mountExteriorLight } from './exterior-light.js?v=lavender';
import { mountProjectFeedback } from './project-feedback.js?v=comment-actions';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const STYLE = `
  .room-ui { font: 400 14px/1.55 "Segoe UI", "Malgun Gothic", system-ui, sans-serif; color: #fff3e4; }
  .room-ui[hidden], .room-ui [hidden] { display: none !important; }
  .room-controls { position: fixed; z-index: 2; left: 24px; bottom: 80px; box-sizing: border-box; width: 224px; padding: 16px; border: 1px solid rgba(194,224,247,.22); border-radius: 16px; background: linear-gradient(135deg,rgba(120,173,211,.18),rgba(15,36,56,.68)); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: inset 0 1px rgba(255,255,255,.16),0 8px 28px rgba(4,17,30,.12); color: #dfedf7; pointer-events: none; }
  .room-controls[hidden] { display: none; }
  .room-controls h2 { margin: 0 0 12px; font-size: 12px; font-weight: 600; letter-spacing: .03em; color: #eaf6ff; }
  .room-control-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; font-size: 11px; line-height: 1.5; }
  .room-key-grid { display: grid; grid-template-columns: repeat(3,24px); gap: 4px; }
  .room-key-grid kbd:first-child { grid-column: 2; }
  .room-key-grid kbd:nth-child(2) { grid-column: 1; }
  .room-controls kbd { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 24px; height: 24px; padding: 0 5px; border: 1px solid rgba(212,235,251,.35); border-bottom-width: 2px; border-radius: 5px; background: rgba(220,239,255,.08); color: #f0f8ff; font: 600 11px/1 system-ui; }
  .room-controls kbd.is-held { background: rgba(187,228,255,.38); border-color: #c3e9ff; box-shadow: 0 0 12px rgba(138,208,255,.25); }
  .room-controls small { font-size: 10px; color: #b3cadc; }
  .room-controls-divider { height: 1px; margin: 12px 0 4px; background: rgba(202,228,247,.13); }
  .room-controls-touch { display: none; font-size: 12px; line-height: 1.8; }
  @media (pointer: coarse) { .room-controls-desktop { display:none; } .room-controls-touch { display:block; } .room-controls { width:auto; max-width:210px; padding:12px 14px; } }
  @media (max-width: 720px) { .room-controls { left:12px; bottom:88px; } }
  @media (max-height: 560px) { .room-controls { bottom:66px; padding:10px 12px; } .room-controls h2 { margin-bottom:5px; } .room-control-row { margin-top:6px; } }
  .room-label { position: fixed; z-index: 3; transform: translate(-50%, -100%); padding: 4px 12px; border: 1px solid rgba(255,226,190,.42); border-radius: 13px; background: rgba(38,18,10,.74); color: #fff3e4; font: 500 12px/1.5 "Segoe UI", "Malgun Gothic", system-ui, sans-serif; white-space: nowrap; pointer-events: none; }
  .room-label[data-empty="true"] { background: rgba(255,232,205,.2); color: #fff3e4; }
  .room-label[data-active="true"] { border-color: #ffe9cf; background: #fff0dd; color: #3a1a0a; }
  .room-veil { position: fixed; z-index: 6; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(18,12,10,.22); }
  .room-form { box-sizing: border-box; width: min(940px, 100%); max-height: calc(100dvh - 40px); overflow-y: auto; padding: 24px; border: 1px solid rgba(255,245,230,.38); border-radius: 26px; background: linear-gradient(135deg, rgba(255,239,219,.2), rgba(38,24,19,.62)); backdrop-filter: blur(18px) saturate(125%); -webkit-backdrop-filter: blur(18px) saturate(125%); box-shadow: 0 24px 72px rgba(16,9,6,.32), inset 0 1px rgba(255,255,255,.45), inset 0 -1px rgba(255,255,255,.06); scrollbar-width: thin; scrollbar-color: rgba(255,239,219,.3) transparent; transition: opacity 160ms cubic-bezier(.23,1,.32,1), transform 160ms cubic-bezier(.23,1,.32,1); }
  @starting-style { .room-form { opacity: 0; transform: translateY(6px) scale(.98); } }
  .room-form h2 { margin: 0 0 8px; font-size: 18px; font-weight: 600; letter-spacing: -.01em; }
  .room-form p { margin: 0; color: #e2c5ab; text-wrap: balance; }
  .room-form label { display: block; margin-top: 16px; color: #e2c5ab; font-size: 12px; }
  .room-form input { display: block; box-sizing: border-box; width: 100%; height: 44px; margin-top: 8px; padding: 0 12px; border: 1px solid rgba(255,226,190,.26); border-radius: 10px; background: rgba(24,16,13,.26); box-shadow: inset 0 1px 3px rgba(0,0,0,.08); color: #fff6ea; font: inherit; font-size: 15px; }
  .room-form :is(input,textarea)::placeholder { color: rgba(241, 235, 227, .68); opacity: 1; }
  .room-form input:focus { outline: 2px solid #ffe9cf; outline-offset: 1px; }
  .room-form textarea { box-sizing: border-box; width: 100%; min-height: 90px; margin-top: 8px; padding: 12px; resize: vertical; border: 1px solid rgba(255,226,190,.26); border-radius: 10px; background: rgba(24,16,13,.26); box-shadow: inset 0 1px 3px rgba(0,0,0,.08); color: #fff6ea; font: inherit; }
  .room-form textarea:focus { outline: 2px solid #ffe9cf; outline-offset: 1px; }
  .room-preview { display: block; width: 100%; max-height: 180px; object-fit: contain; margin-top: 10px; border-radius: 10px; }
  .room-shot img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .room-shot p { color: #704c38; text-align: center; padding: 32px 12px; }
  .room-desc, .room-howto p { white-space: pre-wrap; overflow-wrap: anywhere; }
  .room-error { margin-top: 10px !important; color: #ffb9a4 !important; font-size: 13px; }
  .room-error:empty { display: none; }
  .room-actions { display: flex; gap: 8px; margin-top: 16px; }
  .room-btn { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: 44px; padding: 8px 16px; border: 1px solid rgba(255,226,190,.28); border-radius: 12px; background: transparent; color: #fff3e4; font: inherit; font-weight: 500; text-align: center; text-decoration: none; cursor: pointer; touch-action: manipulation; transition: transform 120ms cubic-bezier(.23,1,.32,1), background-color 120ms ease; }
  .room-btn:active:not(:disabled) { transform: scale(.97); }
  .room-btn:disabled { opacity: .55; cursor: progress; }
  .room-btn.primary { flex: 1; border-color: #fff0dd; background: #fff0dd; color: #3a1a0a; font-weight: 600; }
  .room-card { position: fixed; z-index: 4; top: 24px; right: 24px; bottom: 24px; display: flex; flex-direction: column; box-sizing: border-box; width: min(clamp(440px, 38.1966vw, 960px), calc(100vw - 48px)); padding: 0; overflow: visible; border: 1px solid rgba(255,245,230,.38); border-radius: 26px; background: linear-gradient(145deg, rgba(255,239,219,.22), rgba(47,31,24,.48)); backdrop-filter: blur(18px) saturate(125%); -webkit-backdrop-filter: blur(18px) saturate(125%); box-shadow: 0 24px 64px rgba(16,9,6,.28), inset 0 1px rgba(255,255,255,.45), inset 0 -1px rgba(255,255,255,.06); transition: opacity 260ms ease, transform 260ms cubic-bezier(.23,1,.32,1); }
  @starting-style { .room-card { opacity: 0; transform: translateX(calc(100% + 80px)); } }
  .room-card-top { display: flex; align-items: center; justify-content: space-between; flex: none; }
  .room-pager { display: flex; align-items: center; gap: 4px; color: #e2c5ab; font-size: 13px; font-variant-numeric: tabular-nums; }
  .room-icon { display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 9px; background: transparent; color: #f0d8c2; cursor: pointer; touch-action: manipulation; transition: transform 120ms cubic-bezier(.23,1,.32,1), background-color 120ms ease; }
  .room-icon:active:not(:disabled) { transform: scale(.94); }
  .room-icon:disabled { opacity: .3; cursor: default; }
  .room-shot { flex: none; aspect-ratio: 1.618034 / 1; margin-top: 12px; overflow: hidden; border-radius: 14px; background: #f8f3ec; }
  /* 업로드한 이미지 한 장을 브라우저 모양의 프레임에 표시한다. */
  .room-shot { display: flex; flex-direction: column; }
  .room-browser-bar { flex: none; display: grid; grid-template-columns: 48px minmax(0, 1fr) 48px; align-items: center; gap: 10px; height: 36px; padding: 0 12px; border-bottom: 1px solid rgba(255,255,255,.18); background: linear-gradient(135deg, rgba(255,248,238,.25), rgba(255,248,238,.12)); }
  .room-browser-dots { display: flex; gap: 6px; }
  .room-browser-dots i { width: 9px; height: 9px; border-radius: 50%; background: #ff655b; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); }
  .room-browser-dots i:nth-child(2) { background: #f5c14b; }
  .room-browser-dots i:nth-child(3) { background: #61c554; }
  .room-browser-address { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 10px; border: 1px solid rgba(255,255,255,.16); border-radius: 6px; background: rgba(25,19,16,.28); color: #fff3e4; font-size: 10px; line-height: 1.5; text-align: center; }
  .room-browser-content { position: relative; flex: 1; min-height: 0; overflow: hidden; display: grid; place-items: center; }
  .room-image-frame { position: absolute; inset: 0; }
  .room-browser-content img { position: absolute; inset: 0; }
  .room-shot[data-portrait="true"] { aspect-ratio: auto; }
  .room-shot[data-portrait="true"] .room-browser-bar { display: none; }
  .room-shot[data-portrait="true"] .room-browser-content { flex: none; height: clamp(260px, 46dvh, 440px); box-sizing: border-box; padding: 18px; background: radial-gradient(ellipse at center, rgba(255,244,228,.1), transparent 75%); }
  .room-shot[data-portrait="true"] .room-image-frame { position: absolute; inset: 18px auto 18px 50%; transform: translateX(-50%); height: auto; width: auto; max-width: calc(100% - 36px); aspect-ratio: 1 / 2; box-sizing: border-box; overflow: visible; border: 0; border-radius: 18% / 9%; background: #090a0c; box-shadow: 0 18px 28px -16px rgba(10,7,5,.55), 0 3px 6px rgba(10,7,5,.14); }
  .room-shot[data-portrait="true"] .room-image-frame::before { content: ''; position: absolute; z-index: 2; inset: 0; background: url('./assets/mobile-frame.svg') center / 100% 100% no-repeat; pointer-events: none; }
  .room-shot[data-portrait="true"] .room-image-frame::after { content: ''; position: absolute; top: 10px; left: 50%; width: 27%; height: 9px; transform: translateX(-50%); border-radius: 999px; background: radial-gradient(circle at 88% 50%, #17202c 0 2px, transparent 3px), #010203; box-shadow: 0 0 0 1px rgba(255,255,255,.025); pointer-events: none; }
  .room-shot[data-portrait="true"] .room-image-frame img { position: absolute; inset: 25px 7px 10px; display: block; width: calc(100% - 14px); height: calc(100% - 35px); min-width: 0; min-height: 0; border-radius: 0; background: #090a0c; object-fit: contain; }


  .room-browser-content img[data-landscape="true"] { object-fit: cover; }
  .room-browser-content p { margin: 0; color: #fff0df; font-size: 12px; }

  .room-author { display: flex; align-items: center; gap: 10px; flex: none; margin-top: 16px; color: #f0d8c2; font-size: 13px; }
  .room-avatar { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: #d67030; color: #fff6ea; font-weight: 600; }
  .room-card h2 { flex: none; margin: 12px 0 0; font-size: 25px; font-weight: 600; letter-spacing: -.02em; line-height: 1.3; overflow-wrap: anywhere; }
  .room-link { flex: none; margin-top: 4px; color: #e2c5ab; font-size: 13px; overflow-wrap: anywhere; }
  .room-desc { flex: none; margin: 12px 0 0; color: #f0d8c2; }
  .room-howto { flex: none; margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,226,190,.16); }
  .room-howto h3 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
  .room-howto ol { margin: 0; padding-left: 20px; color: #f0d8c2; }
  .room-card-actions { display: flex; flex-direction: column; gap: 8px; flex: none; margin-top: auto; padding-top: 24px; }
  .room-btn.quiet { min-height: 36px; border-color: transparent; color: #e2c5ab; font-size: 13px; font-weight: 400; }
  .room-ui button:focus-visible, .room-ui a:focus-visible { outline: 2px solid #fff0dd; outline-offset: 2px; }
  @media (hover: hover) and (pointer: fine) { .room-btn:hover:not(:disabled) { background: rgba(255,226,190,.12); } .room-btn.primary:hover:not(:disabled) { background: #fff; } .room-icon:hover:not(:disabled) { background: rgba(255,226,190,.12); color: #fff; } }
  @media (max-width: 720px) { .room-card { top: auto; right: 0; bottom: 0; width: calc(100% - 36px); height: 82dvh; max-height: 82dvh; padding: 0; border-width: 1px 0 0; border-radius: 22px 22px 0 0; } @starting-style { .room-card { opacity: 0; transform: translateX(calc(100% + 80px)); } } }
  .room-form-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .85fr); gap: 24px; margin-top: 24px; }
  .room-form-fields, .room-form-image { min-width: 0; }
  .room-form-fields label { margin-top: 12px; }
  .room-form-fields label:first-child, .room-form-image label { margin-top: 0; }
  .room-form textarea { min-height: 88px; }
  .room-form-image input[type=file] { height: auto; min-height: 44px; padding: 8px; font-size: 12px; }
  .room-form-image input::file-selector-button { padding: 7px 10px; margin-right: 8px; border: 1px solid rgba(255,226,190,.28); border-radius: 7px; background: rgba(255,239,219,.12); color: #fff3e4; cursor: pointer; }
  .room-form-image > p { margin-top: 8px; font-size: 12px; }
  .room-preview-frame { position: relative; display: grid; place-items: center; height: 270px; margin-top: 16px; overflow: hidden; border: 1px dashed rgba(255,245,230,.34); border-radius: 14px; background: linear-gradient(145deg, rgba(255,246,230,.09), rgba(24,16,13,.16)); box-shadow: inset 0 1px rgba(255,255,255,.1); }
  .room-preview-frame > span { color: #cdb29a; font-size: 12px; }
  .room-preview-frame .room-preview { position: absolute; inset: 0; width: 100%; height: 100%; max-height: none; margin: 0; border-radius: 0; background: rgba(24,16,13,.18); object-fit: contain; }
  .room-card .room-shot { border: 1px solid rgba(255,255,255,.2); background: rgba(255,244,228,.09); box-shadow: inset 0 1px rgba(255,255,255,.15); }
  .room-card .room-desc, .room-card .room-howto p { color: #fff0df; }
  .room-card .room-howto { padding: 16px; border: 1px solid rgba(255,255,255,.16); border-radius: 14px; background: rgba(23,15,12,.2); }
  .room-card { scrollbar-width: thin; scrollbar-color: rgba(255,239,219,.3) transparent; }
  @media (max-width: 720px) { .room-form { padding: 16px; } .room-form-layout { grid-template-columns: 1fr; gap: 16px; } .room-preview-frame { height: 190px; } }
  .project-feedback { flex: none; margin-top: 24px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,.2); }
  .feedback-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .feedback-head h3 { margin: 0; font-size: 16px; }
  .feedback-reactions { display: flex; gap: 8px; }
  .feedback-reactions button { display: flex; align-items: center; gap: 8px; padding: 8px 13px; border: 1px solid rgba(255,255,255,.24); border-radius: 999px; background: rgba(255,255,255,.07); color: #fff3e4; font: inherit; cursor: pointer; }
  .feedback-reactions button { transition: background-color 120ms ease, border-color 120ms ease; }
  @media (hover: hover) { .feedback-reactions button:hover:not(:disabled) { background: rgba(255,255,255,.16); border-color: rgba(255,255,255,.5); } }
  .feedback-reactions button[aria-busy=true] { cursor: progress; }
  .feedback-reactions button[aria-pressed=true] { border-color: rgba(255,222,179,.8); background: rgba(255,222,179,.22); }
  .feedback-reactions button:disabled { opacity: .5; cursor: default; }
  .room-author [data-owner] { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .room-author .room-avatar { flex: none; }
  .room-author .feedback-reactions { flex: none; margin-left: auto; gap: 6px; }
  .room-author .feedback-reactions button { min-height: 32px; gap: 5px; padding: 4px 9px; font-size: 12px; line-height: 1.4; }

  .feedback-status { font-size: 12px; color: #ffe2c4; }
  .feedback-status { margin: 8px 0; }
  .feedback-status:empty { display: none; }
  .feedback-list { list-style: none; margin: 8px 0; padding: 0; max-height: 280px; overflow-y: auto; scrollbar-width: thin; }
  .feedback-list li { padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,.12); }
  .feedback-comment-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }
  .feedback-comment-head time, .feedback-empty { color: #e2c5ab; font-size: 12px; }
  .feedback-list p { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .feedback-comment-head strong { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .feedback-menu-delete { display: grid; place-items: center; flex: none; width: 28px; height: 28px; padding: 0; border: 0; background: transparent; color: inherit; opacity: .65; font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
  .feedback-delete-confirm { border-color: var(--ct-border, rgba(255,245,230,.28)); }
  .feedback-menu-delete:hover:not(:disabled) { opacity: 1; }
  .feedback-delete-confirm { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; width: fit-content; max-width: 100%; box-sizing: border-box; margin-top: 8px; padding: 8px; border: 1px solid rgba(255,245,230,.22); border-radius: 12px; background: var(--ct-panel, rgba(38,24,19,.23)); color: var(--ct-text, #fff3e4); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: inset 0 1px rgba(255,255,255,.12); font-size: 12px; }
  .feedback-delete-actions { display: flex; gap: 6px; margin-left: auto; }
  .feedback-confirm-button { min-height: 34px; padding: 6px 12px; border: 1px solid rgba(255,245,230,.2); border-radius: 9px; background: rgba(255,255,255,.04); color: #fff0df; font: inherit; font-size: 12px; cursor: pointer; }
  .feedback-confirm-button:hover:not(:disabled) { background: rgba(255,255,255,.1); }
  .feedback-confirm-danger { border-color: rgba(248,164,147,.4); background: rgba(183,73,56,.17); color: #ffcec3; }
  .feedback-confirm-danger:hover:not(:disabled) { background: rgba(183,73,56,.3); }
  .feedback-menu-delete:disabled, .feedback-confirm-button:disabled { opacity: .5; cursor: progress; }

  .feedback-text-action { padding: 5px 0; border: 0; background: transparent; color: #e8cfb8; font: inherit; font-size: 12px; cursor: pointer; }
  .feedback-text-action:hover:not(:disabled) { color: #fff6eb; text-decoration: underline; }
  .feedback-text-action:disabled { opacity: .5; cursor: default; }
  .feedback-comment-actions { display: flex; gap: 16px; margin-top: 8px; }
  .feedback-replies { display: grid; gap: 8px; list-style: none; margin: 12px 0 0; padding: 0 0 0 14px; border-left: 1px solid rgba(255,255,255,.24); }
  .feedback-list li.feedback-reply { box-sizing: border-box; min-width: 0; margin: 0; padding: 12px; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; background: rgba(255,255,255,.055); }
  .feedback-list > li.feedback-reply { margin: 8px 0; }
  .feedback-deleted { color: #e2c5ab; font-size: 12px; }
  .feedback-reply-form { min-width: 0; margin: 12px 0 0; }
  .feedback-form.feedback-reply-form textarea { min-height: 60px; padding: 12px; font-size: 13px; }
  .feedback-list button:focus-visible { outline: 2px solid #fff0dd; outline-offset: 3px; }
  .feedback-form label { display: block; font-size: 12px; color: #fff0df; }
  .feedback-form textarea { box-sizing: border-box; width: 100%; min-height: 84px; resize: vertical; margin-top: 8px; padding: 12px; border: 1px solid rgba(255,255,255,.24); border-radius: 12px; background: rgba(24,16,13,.22); color: #fff3e4; font: inherit; }
  .feedback-form textarea:focus-visible { outline: 2px solid #fff0dd; outline-offset: 2px; }
  .feedback-form textarea::placeholder { color: rgba(241, 235, 227, .68); opacity: 1; }
  .feedback-submit { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; }
  .feedback-submit > span { color: #e2c5ab; font-size: 11px; }
  .room-card-body { display: flex; flex-direction: column; box-sizing: border-box; height: 100%; min-height: 0; padding: 24px; overflow-y: auto; overscroll-behavior: contain; border-radius: inherit; scrollbar-width: thin; scrollbar-color: rgba(255,239,219,.3) transparent; }
  .room-card.is-closing { opacity: 0; transform: translateX(calc(100% + 80px)); pointer-events: none; transition: opacity 460ms ease, transform 460ms cubic-bezier(.4,0,.2,1); }
  .room-card-dismiss { position: absolute; left: 0; top: 50%; transform: translate(-50%, -50%); display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 1px solid rgba(255,245,230,.38); border-radius: 50%; background: transparent; color: #fff3e4; cursor: pointer; box-shadow: none; }
  .room-card-dismiss:hover { background: rgba(255,255,255,.1); }
  .room-card .feedback-submit .room-btn { transform: none; transition: background-color 120ms ease; }
  @media (max-width: 720px) { .room-card-body { padding: 16px; } }
  .room-privacy { position: fixed; top: 72px; left: 24px; z-index: 5; max-width: calc(100vw - 48px); }
  .igloo-switch { position: relative; display: flex; align-items: center; box-sizing: border-box; width: 96px; height: 46px; padding: 5px; border: 1px solid rgba(255,245,230,.42); border-radius: 999px; background: linear-gradient(135deg, rgba(255,246,230,.19), rgba(255,246,230,.06)); backdrop-filter: blur(14px) saturate(125%); -webkit-backdrop-filter: blur(14px) saturate(125%); box-shadow: inset 0 1px rgba(255,255,255,.4), inset 0 -1px rgba(255,255,255,.08); color: #fff3e4; cursor: pointer; transition: border-color 180ms ease, background-color 180ms ease; }
  .igloo-switch-knob { position: relative; flex: none; box-sizing: border-box; width: 34px; height: 34px; border: 1px solid rgba(255,255,255,.6); border-radius: 50%; background: linear-gradient(145deg, rgba(255,255,255,.65), rgba(255,242,220,.18)); box-shadow: inset 0 1px 2px rgba(255,255,255,.7); transform: translateX(0); transition: transform 200ms cubic-bezier(.23,1,.32,1), background 180ms ease; }
  .igloo-switch[aria-checked=true] { border-color: rgba(165,247,204,.65); background: linear-gradient(135deg, rgba(137,234,183,.22), rgba(137,234,183,.06)); }
  .igloo-switch[aria-checked=true] .igloo-switch-knob { transform: translateX(50px); border-color: rgba(207,255,228,.85); background: linear-gradient(145deg, rgba(209,255,229,.85), rgba(81,202,137,.3)); }
  .igloo-switch-label { position: absolute; right: 14px; font: 600 10px system-ui; letter-spacing: .08em; color: rgba(255,243,228,.75); }
  .igloo-switch[aria-checked=true] .igloo-switch-label { right: auto; left: 16px; color: #d7ffe9; }
  .igloo-switch:focus-visible { outline: 2px solid #fff0dd; outline-offset: 4px; }
  .igloo-switch:disabled { cursor: progress; opacity: .7; }
  @media (hover: hover) { .igloo-switch:hover:not(:disabled) { border-color: rgba(255,255,255,.8); } }
  .igloo-switch-message { white-space: pre-line; box-sizing: border-box; max-width: 245px; margin: 12px 0 0; padding: 12px 16px; border: 1px solid rgba(255,245,230,.26); border-radius: 14px; background: linear-gradient(135deg, rgba(255,239,219,.14), rgba(38,24,19,.22)); backdrop-filter: blur(14px) saturate(125%); -webkit-backdrop-filter: blur(14px) saturate(125%); box-shadow: inset 0 1px rgba(255,255,255,.25); color: #fff3e4; font-size: 12px; line-height: 1.6; }
  @media (prefers-reduced-motion: reduce) { .igloo-switch-knob { transition: none; } }
  .room-project-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
  .room-project-heading h2 { margin: 0; }
  .room-project-heading button { flex: none; min-height: 34px; padding: 5px 10px; border-radius: 999px; font-size: 12px; }
  @media (prefers-reduced-motion: reduce) { .room-form, .room-card { transition-property: opacity; } @starting-style { .room-form, .room-card { transform: none; } } .room-btn:active:not(:disabled), .room-icon:active:not(:disabled) { transform: none; } }
`;

const DOME_R = 12;
const WINDOW_PHI = 2.45;
const ROOM_YAW = 3.5;
// 왼쪽에서 뒤쪽으로 이어지는 벽을 따라 같은 간격으로 놓는다.
const BOX_RING = DOME_R - 1.4;
const BOX_SHAPES = [
  { w: 1.85, h: 1.05, d: 1.85 },
  { w: 2.45, h: 0.70, d: 1.60 },
  { w: 1.65, h: 1.18, d: 1.60 }
];
const BOXES = [-0.95, -0.65, -0.35].map((offset, index) => ({
  angle: ROOM_YAW + Math.PI + offset, ...BOX_SHAPES[index]
}));
// 빛이 들어오는 방향. 창에서 방 안쪽으로 향한다.
const toWindow = new THREE.Vector3(-Math.cos(WINDOW_PHI), 0, Math.sin(WINDOW_PHI));
const boxAt = box => ({
  x: Math.cos(box.angle) * BOX_RING,
  z: Math.sin(box.angle) * BOX_RING,
  // 뒷면은 벽의 접선과 나란히, 앞면은 방 중심을 향한다.
  yaw: -box.angle - Math.PI / 2
});
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}
function texture(canvas) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

// 창틀 그림자가 진 빛 조각을 칸별로 그린다. place(u, v)는 창 안의 위치를 그림 좌표로 바꾼다.
function drawWindowLight(g, place, color) {
  const COLS = 2, ROWS = 2, GAP = 0.035;
  g.fillStyle = color;
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const u0 = (c + GAP) / COLS, u1 = (c + 1 - GAP) / COLS, v0 = (r + GAP) / ROWS, v1 = (r + 1 - GAP) / ROWS;
    g.beginPath();
    [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].forEach(([u, v], i) => {
      const [x, y] = place(u, v);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.closePath();
    g.fill();
  }
}

function makeDomeTexture() {
  const W = 4096, H = 1024, ROWS = 7;
  const [canvas, g] = makeCanvas(W, H);
  for (let r = 0; r < ROWS; r++) {
    const y1 = H - r / ROWS * H, y0 = H - (r + 1) / ROWS * H;
    const phi = (r + 0.5) / ROWS * Math.PI / 2;
    const n = Math.max(5, Math.round(Math.PI * 2 * DOME_R * Math.cos(phi) / 3.1));
    for (let i = -1; i < n; i++) {
      const x = (i + (r % 2) * 0.5) / n * W;
      const tone = Math.abs(Math.sin(i * 7.13 + r * 3.71));
      g.fillStyle = `hsl(${204 + tone * 7}, ${29 + tone * 5}%, ${45 + tone * 6 + (ROWS - r) * -0.8}%)`;
      g.fillRect(x, y0, W / n + 1, y1 - y0);
      g.fillStyle = 'rgba(26,54,76,.36)';
      g.fillRect(x - 3, y0, 6, y1 - y0);
    }
    g.fillStyle = 'rgba(26,54,76,.4)';
    g.fillRect(0, y0 - 3, W, 6);
  }
  // 아래쪽은 바닥에서 튄 빛으로 밝고, 꼭대기는 어둡다.
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(12,31,55,.48)');
  shade.addColorStop(0.55, 'rgba(24,52,78,.06)');
  shade.addColorStop(1, 'rgba(172,218,241,.18)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  // 창 맞은편 벽에 떨어지는 비스듬한 빛.
  const center = ((WINDOW_PHI + Math.PI) % (Math.PI * 2)) / (Math.PI * 2) * W;
  g.save();
  g.filter = 'blur(10px)';
  g.globalCompositeOperation = 'lighter';
  drawWindowLight(g, (u, v) => [center - 340 + u * 620 + v * 240, H * 0.4 + v * H * 0.5 + u * 70], 'rgba(154,208,244,.15)');
  g.restore();
  return texture(canvas);
}

function makeFloorTexture() {
  const S = 2048;
  const [canvas, g] = makeCanvas(S, S);
  const toPx = (x, z) => [(x + DOME_R) / (2 * DOME_R) * S, (z + DOME_R) / (2 * DOME_R) * S];
  g.fillStyle = '#44657e';
  g.fillRect(0, 0, S, S);
  const [cx, cz] = toPx(0, 0);
  const glow = g.createRadialGradient(cx, cz, 0, cx, cz, S * 0.5);
  glow.addColorStop(0, 'rgba(144,190,220,.32)');
  glow.addColorStop(0.6, 'rgba(106,157,190,.16)');
  glow.addColorStop(1, 'rgba(16,35,55,.65)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  // 창에서 방 안쪽으로 길게 뻗는 빛 조각.
  const dir = toWindow.clone().negate();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const start = toWindow.clone().multiplyScalar(8.2);
  g.save();
  g.filter = 'blur(20px)';
  g.globalCompositeOperation = 'lighter';
  drawWindowLight(g, (u, v) => {
    const along = v * 13.5, across = (u - 0.5) * (5 + v * 2.6) + v * 1.6;
    return toPx(start.x + dir.x * along + side.x * across, start.z + dir.z * along + side.z * across);
  }, 'rgba(179,218,255,.23)');
  g.restore();
  // 상자 그림자는 빛 반대쪽으로 길게 늘인다.
  g.save();
  g.filter = 'blur(13px)';
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = 'rgb(133,157,180)';
  for (const box of BOXES) {
    const { x, z, yaw } = boxAt(box);
    const hw = box.w / 2, hd = box.d / 2, reach = box.h * 2.1;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => [x + c * a + s * b, z - s * a + c * b]);
    const shifted = corners.map(([a, b]) => [a + dir.x * reach, b + dir.z * reach]);
    const pts = [...corners, ...shifted].map(([a, b]) => toPx(a, b));
    const mid = pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length], [0, 0]);
    pts.sort((a, b) => Math.atan2(a[1] - mid[1], a[0] - mid[0]) - Math.atan2(b[1] - mid[1], b[0] - mid[0]));
    g.beginPath();
    pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b)));
    g.closePath();
    g.fill();
  }
  g.restore();
  // 바닥에 닿은 곳을 어둡게 해서 상자가 떠 보이지 않게 한다.
  g.save();
  g.filter = 'blur(6px)';
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = 'rgb(85,114,140)';
  for (const box of BOXES) {
    const { x, z, yaw } = boxAt(box);
    const hw = box.w / 2 + 0.04, hd = box.d / 2 + 0.04, c = Math.cos(yaw), s = Math.sin(yaw);
    g.beginPath();
    [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].forEach(([a, b], i) => {
      const [px, py] = toPx(x + c * a + s * b, z - s * a + c * b);
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    });
    g.closePath();
    g.fill();
  }
  g.restore();
  return texture(canvas);
}

// 돔의 창 영역은 면을 만들지 않아 실제로 밖을 볼 수 있다.
function makeOpenDome() {
  const phis = [...Array.from({ length: 97 }, (_, i) => i / 96 * Math.PI * 2), WINDOW_PHI - 0.24, WINDOW_PHI + 0.24].sort((a,b) => a-b);
  const top = Math.PI / 2 - 0.62, bottom = top + 0.5;
  const thetas = [...Array.from({ length: 33 }, (_, i) => i / 32 * Math.PI / 2), top, bottom].sort((a,b) => a-b);
  const positions = [], uvs = [], indices = [];
  for (const theta of thetas) for (const phi of phis) {
    positions.push(-DOME_R * Math.cos(phi) * Math.sin(theta), DOME_R * Math.cos(theta), DOME_R * Math.sin(phi) * Math.sin(theta));
    uvs.push(1 - phi / (Math.PI * 2), 1 - theta / Math.PI);
  }
  for (let y=0; y<thetas.length-1; y++) for (let x=0; x<phis.length-1; x++) {
    const phi = (phis[x]+phis[x+1])/2, theta = (thetas[y]+thetas[y+1])/2;
    if (phi > WINDOW_PHI-0.24 && phi < WINDOW_PHI+0.24 && theta > top && theta < bottom) continue;
    const a=y*phis.length+x, b=a+phis.length;
    indices.push(a,b,a+1,a+1,b,b+1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  return geometry;
}

function addNightLandscape(scene) {
  const moonDirection = toWindow.clone().multiplyScalar(150).setY(60).normalize();
  const hash = n => { const v = Math.sin(n * 127.1 + 19.7) * 43758.5453; return v - Math.floor(v); };
  // 하늘은 지평선의 푸른 안개와 높은 곳의 짙은 남색을 이어 준다.
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { moonDir: { value: moonDirection } },
    vertexShader: 'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 p; uniform vec3 moonDir;
      void main(){vec3 d=normalize(p);float h=clamp(d.y*2.8,0.,1.);
      vec3 c=mix(vec3(.055,.105,.17),vec3(.003,.009,.026),pow(h,.6));
      c+=vec3(.08,.12,.17)*pow(max(dot(d,moonDir),0.),36.);
      gl_FragColor=vec4(c,1.);}`
  })));
  const stars = [], sizes = [], brightness = [];
  for (let i = 0; i < 1700; i++) {
    const a = i * 2.399963, h = 0.025 + hash(i + 3) * 0.97, r = Math.sqrt(1 - h * h) * 245;
    stars.push(Math.cos(a) * r, h * 245, Math.sin(a) * r);
    sizes.push(1.2 + Math.pow(hash(i + 73), 5) * 2.8);
    brightness.push(0.25 + hash(i + 51) * 0.65);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
  starGeo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
  starGeo.setAttribute('brightness', new THREE.Float32BufferAttribute(brightness, 1));
  scene.add(new THREE.Points(starGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `attribute float size;attribute float brightness;varying float light;
      void main(){light=brightness;gl_PointSize=size;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float light;void main(){float r=length(gl_PointCoord-.5)*2.;
      float a=exp(-r*r*4.)*smoothstep(1.,.6,r);gl_FragColor=vec4(vec3(.78,.88,1.)*light,a);}`
  })));
  // 능선과 골짜기를 가진 연속 지형을 여러 거리에 배치한다.
  const moonColor = new THREE.Color(0xc7ddea), shadowColor = new THREE.Color(0x283e58), mistColor = new THREE.Color(0x526e88);
  for (let layer = 0; layer < 3; layer++) {
    const positions = [], indices = [], colors = [], count = 320, rows = 12;
    for (let row = 0; row <= rows; row++) for (let i = 0; i <= count; i++) {
      const a = i / count * Math.PI * 2, t = row / rows;
      const ridge = 8 + Math.pow(Math.abs(Math.sin(a * 5 + layer * 1.3)), 2) * 9
        + Math.abs(Math.sin(a * 13 + layer)) * 6 + Math.sin(a * 29) * 2.1 + Math.sin(a * 53 + layer) * 1.3;
      const distance = 62 + layer * 39 + t * 31;
      const profile = Math.pow(Math.max(0, 1 - Math.abs(t - 0.48) * 2), 1.3);
      const h = (ridge + Math.sin(a * 37 + t * 9) * profile * 1.2) * profile * (1 - layer * 0.13) - 2;
      positions.push(Math.cos(a) * distance, h, Math.sin(a) * distance);
    }
    for (let row = 0; row < rows; row++) for (let i = 0; i < count; i++) {
      const a = row * (count + 1) + i, b = a + count + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(indices);geo.computeVertexNormals();
    const normals = geo.attributes.normal, color = new THREE.Color(), normal = new THREE.Vector3();
    for (let i = 0; i < positions.length / 3; i++) {
      normal.fromBufferAttribute(normals, i); if (normal.y < 0) normal.negate();
      const light = Math.max(0, normal.dot(moonDirection));
      const snow = THREE.MathUtils.smoothstep(normal.y + positions[i * 3 + 1] * 0.018, 0.32, 0.95);
      color.copy(shadowColor).lerp(moonColor, snow * (0.16 + light * 0.84));
      const crevice = Math.pow(Math.abs(Math.sin(positions[i*3] * 0.39 + positions[i*3+2] * 0.22 + positions[i*3+1] * 0.7)), 18);
      color.multiplyScalar(1 - crevice * 0.17);
      color.lerp(mistColor, 0.12 + layer * 0.22);
      colors.push(color.r, color.g, color.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  }
  const ground = new THREE.Mesh(new THREE.CircleGeometry(210, 96), new THREE.MeshBasicMaterial({ color: 0x728fa4 }));
  ground.rotation.x = -Math.PI / 2;ground.position.y = -0.16;scene.add(ground);
  // 눈 쌓인 가지의 가장자리를 불규칙하게 만들고 같은 형태는 한 번에 그린다.
  const treePos = [], treeColors = [];
  const push = (x, y, z, snow, shade) => {
    treePos.push(x, y, z);
    const c = new THREE.Color(snow ? 0xb8d1e0 : 0x1b3b49).multiplyScalar(shade);
    treeColors.push(c.r, c.g, c.b);
  };
  for (let tier = 0; tier < 9; tier++) {
    const y = 0.14 + tier * 0.081, width = (1 - tier / 10) * 0.25;
    for (let j = 0; j < 12; j++) {
      const a = j / 12 * Math.PI * 2, b = (j + 1) / 12 * Math.PI * 2;
      const ra = width * (0.88 + hash(j + tier * 19) * 0.23), rb = width * (0.88 + hash(j + 1 + tier * 19) * 0.23);
      const ya = y + hash(j + tier * 31) * 0.035, yb = y + hash(j + 1 + tier * 31) * 0.035;
      const shade = 0.7 + (Math.cos(a - 1) + 1) * 0.15;
      push(0, y + 0.24, 0, true, 1);push(Math.cos(a)*ra, ya+0.025, Math.sin(a)*ra, true, shade);push(Math.cos(b)*rb, yb+0.025, Math.sin(b)*rb, true, shade);
      push(0, y + 0.18, 0, false, 1);push(Math.cos(b)*rb*1.08, yb-0.02, Math.sin(b)*rb*1.08, false, shade);push(Math.cos(a)*ra*1.08, ya-0.02, Math.sin(a)*ra*1.08, false, shade);
    }
  }
  const treeGeo = new THREE.BufferGeometry();treeGeo.setAttribute('position', new THREE.Float32BufferAttribute(treePos, 3));treeGeo.setAttribute('color', new THREE.Float32BufferAttribute(treeColors, 3));
  const treeCount = 72, trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), treeCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < treeCount; i++) {
    const a = i * 2.399963, distance = 29 + hash(i + 9) * 42, height = 3 + hash(i + 110) * 4.5;
    dummy.position.set(Math.cos(a) * distance, -0.15, Math.sin(a) * distance);dummy.rotation.y = i;
    dummy.scale.set(height * (0.8 + hash(i) * 0.3), height, height);dummy.updateMatrix();trees.setMatrixAt(i, dummy.matrix);
  }
  trees.computeBoundingSphere();scene.add(trees);
  // 달 표면과 달무리는 별도 텍스처로 만들어 강한 흰 원처럼 보이지 않게 한다.
  const [moonCanvas, mg] = makeCanvas(256, 256);mg.fillStyle = '#dce7ec';mg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 95; i++) {
    const x = hash(i + 100) * 256, y = hash(i + 200) * 256, r = 2 + hash(i + 400) * 16;
    const crater = mg.createRadialGradient(x, y, 0, x, y, r);crater.addColorStop(0, 'rgba(105,129,150,.25)');crater.addColorStop(1, 'rgba(105,129,150,0)');mg.fillStyle = crater;mg.fillRect(x-r, y-r, r*2, r*2);
  }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3.6, 32, 24), new THREE.MeshBasicMaterial({ map: texture(moonCanvas), toneMapped: false }));
  moon.position.copy(moonDirection).multiplyScalar(170);scene.add(moon);
  const [haloCanvas, hg] = makeCanvas(128, 128);const halo = hg.createRadialGradient(64,64,2,64,64,64);
  halo.addColorStop(0,'rgba(189,219,255,.22)');halo.addColorStop(.25,'rgba(158,199,248,.075)');halo.addColorStop(1,'rgba(158,199,248,0)');hg.fillStyle=halo;hg.fillRect(0,0,128,128);
  const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({map:texture(haloCanvas),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
  moonHalo.position.copy(moon.position);moonHalo.scale.set(38,38,1);scene.add(moonHalo);
  const top = Math.PI / 2 - 0.62;
  // 풍경은 그대로 보이고 비스듬히 볼 때만 반사가 드러나는 맑은 유리.
  const glass = new THREE.Mesh(new THREE.SphereGeometry(DOME_R - 0.055, 32, 24, WINDOW_PHI - 0.24, 0.48, top, 0.5), new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`varying vec2 v;varying vec3 n;varying vec3 eye;void main(){v=uv;vec4 w=modelMatrix*vec4(position,1.);n=normalize(mat3(modelMatrix)*normal);eye=cameraPosition-w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`varying vec2 v;varying vec3 n;varying vec3 eye;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){float edge=min(min(v.x,1.-v.x),min(v.y,1.-v.y));
      float grain=hash(floor(v*vec2(480.,600.)));float frost=pow(1.-smoothstep(0.,.075,edge),2.)*(.08+grain*.10);
      float fresnel=pow(1.-abs(dot(normalize(n),normalize(eye))),3.);
      float sheen=pow(max(0.,1.-abs(v.x*.8+v.y*.35-.85)*6.),10.)*.025;
      gl_FragColor=vec4(mix(vec3(.44,.68,.85),vec3(.8,.94,1.),frost*2.),.012+fresnel*.15+frost+sheen);}`
  }));
  scene.add(glass);
  const frameMat = new THREE.MeshStandardMaterial({color:0x91acbe,roughness:0.32,metalness:0.18,side:THREE.DoubleSide});
  for(const [p,w,t,h] of [[WINDOW_PHI-0.252,0.012,top-0.012,0.524],[WINDOW_PHI+0.24,0.012,top-0.012,0.524],[WINDOW_PHI-0.252,0.504,top-0.012,0.012],[WINDOW_PHI-0.252,0.504,top+0.5,0.012]]) {
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(DOME_R-0.025,32,16,p,w,t,h),frameMat));
  }
  // 창살과 창짝 테두리는 유리보다 안쪽으로 돌출시켜 두께가 보이게 한다.
  const railMat = new THREE.MeshStandardMaterial({ color: 0x9fb9cc, roughness: 0.38, metalness: 0.25 });
  const point = (phi, theta, radius = DOME_R - 0.15) => new THREE.Vector3(
    -radius * Math.cos(phi) * Math.sin(theta), radius * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta));
  const rail = (p0, t0, p1, t1, thickness) => {
    const points = Array.from({ length: 21 }, (_, i) => point(THREE.MathUtils.lerp(p0, p1, i / 20), THREE.MathUtils.lerp(t0, t1, i / 20)));
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, thickness, 8, false), railMat));
  };
  const left = WINDOW_PHI - 0.24, right = WINDOW_PHI + 0.24, bottom = top + 0.5;
  rail(left, top, left, bottom, 0.075);
  rail(right, top, right, bottom, 0.075);
  rail(left, top, right, top, 0.075);
  rail(left, bottom, right, bottom, 0.075);
  // 가운데 맞댐선은 두 창짝이 만나는 부분이며 가로 창살은 한 줄만 둔다.
  rail(WINDOW_PHI - 0.004, top, WINDOW_PHI - 0.004, bottom, 0.043);
  rail(WINDOW_PHI + 0.004, top, WINDOW_PHI + 0.004, bottom, 0.043);
  rail(left, top + 0.25, right, top + 0.25, 0.045);

}

// 프로젝트 링크로 쓸 수 있는 주소로 정리한다. 형식이 틀리면 null이다.
function normalizeLink(value) {
  let text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = 'https://' + text;
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}
const hostOf = link => {
  try { return new URL(link).hostname.replace(/^www\./, ''); } catch { return link; }
};
const ICON_CLOSE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg>';
const ICON_PREV = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2L4 7l5 5"/></svg>';
const ICON_NEXT = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2l5 5-5 5"/></svg>';
// 첫 화면 캡처가 생기기 전까지 쓰는 예시 그림.


export function createRoom({ canvas, backend, onRoomPublicChange = () => {}, onNotificationsRead = () => {}, onExteriorLightChange = () => {} }) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x152c43);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);

  // 방: 돔과 바닥은 그림을 그대로 보여준다.
  const dome = new THREE.Mesh(
    makeOpenDome(),
    new THREE.MeshBasicMaterial({ map: makeDomeTexture(), side: THREE.BackSide })
  );
  scene.add(dome);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(DOME_R, 64), new THREE.MeshBasicMaterial({ map: makeFloorTexture() }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  addNightLandscape(scene);

  scene.add(new THREE.HemisphereLight(0xd5edff, 0x3a5870, 1.5));
  const sun = new THREE.DirectionalLight(0xb9dcff, 1.8);
  sun.position.copy(toWindow).multiplyScalar(10).setY(60 / 15);
  scene.add(sun);

  // 비어 있을 때는 안쪽이 보이고, 프로젝트가 있으면 리본으로 포장한다.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  // 얇은 종이 섬유와 작은 명도 차이만 넣어 무광 포장지 질감을 만든다.
  const [paperCanvas, paperContext] = makeCanvas(256, 256);
  const paperImage = paperContext.createImageData(256, 256);
  let paperSeed = 43;
  const paperRandom = () => { paperSeed = (Math.imul(paperSeed, 1664525) + 1013904223) >>> 0; return paperSeed / 4294967296; };
  for (let i = 0; i < paperImage.data.length; i += 4) {
    const v = 238 + paperRandom() * 17;
    paperImage.data[i] = paperImage.data[i+1] = paperImage.data[i+2] = v;paperImage.data[i+3] = 255;
  }
  paperContext.putImageData(paperImage, 0, 0);
  paperContext.strokeStyle = 'rgba(125,125,125,.075)';paperContext.lineWidth = 0.5;
  for (let i=0;i<600;i++) {
    const x=paperRandom()*256,y=paperRandom()*256;
    paperContext.beginPath();paperContext.moveTo(x,y);paperContext.lineTo(x+1+paperRandom()*5,y+paperRandom()*2);paperContext.stroke();
  }
  const paperMap = texture(paperCanvas);paperMap.wrapS = paperMap.wrapT = THREE.RepeatWrapping;paperMap.repeat.set(2,2);
  const paperBump = paperMap.clone();paperBump.colorSpace = THREE.NoColorSpace;
  const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const paperColors = [0xb52f45, 0x207452, 0xd0a23b, 0x325d96, 0x8f3d58];
  const ribbonColors = [0x2f9b65, 0xddb85c, 0xe8dfbd, 0xb82f43];
  const colorOffset = Math.floor(Math.random() * paperColors.length);
  const [treasureCanvas, treasureContext] = makeCanvas(128, 128);
  const treasureGradient = treasureContext.createRadialGradient(64,64,0,64,64,64);
  treasureGradient.addColorStop(0,'rgba(255,249,205,1)');
  treasureGradient.addColorStop(0.2,'rgba(255,222,119,.72)');
  treasureGradient.addColorStop(0.55,'rgba(255,182,56,.18)');
  treasureGradient.addColorStop(1,'rgba(255,161,32,0)');
  treasureContext.fillStyle=treasureGradient;treasureContext.fillRect(0,0,128,128);
  const treasureTexture=texture(treasureCanvas);
  const treasureLight=new THREE.PointLight(0xffd47b,0,5,2);scene.add(treasureLight);
  const slots = BOXES.map((box, index) => {
    const { x, z, yaw } = boxAt(box);
    const root = new THREE.Group();root.name = `gift-box-${index}`;root.position.set(x, 0, z);root.rotation.y = yaw;scene.add(root);
    const paper = paperColors[(colorOffset + index) % paperColors.length];
    const ribbons = ribbonColors.filter(color => !(paper === 0x207452 && color === 0x2f9b65) && !(paper === 0xb52f45 && color === 0xb82f43));
    const ribbonColor = ribbons[Math.floor(Math.random() * ribbons.length)];
    const bodyMaterial = new THREE.MeshStandardMaterial({color:paper,roughness:0.98,metalness:0,map:paperMap,bumpMap:paperBump,bumpScale:0.008,emissive:paper,emissiveIntensity:0});
    const ribbonMaterial = new THREE.MeshStandardMaterial({color:ribbonColor,roughness:0.65,metalness:0.04,side:THREE.DoubleSide});
    const part = (parent, material, sx, sy, sz, px, py, pz) => {
      const mesh = new THREE.Mesh(boxGeo, material);mesh.scale.set(sx,sy,sz);mesh.position.set(px,py,pz);parent.add(mesh);return mesh;
    };
    const thickness = 0.026;
    part(root,bodyMaterial,box.w,0.04,box.d,0,0.02,0);
    for (const side of [-1,1]) {
      part(root,bodyMaterial,box.w,box.h,thickness,0,box.h/2,side*(box.d/2-thickness/2));
      part(root,bodyMaterial,thickness,box.h,box.d-thickness*2,side*(box.w/2-thickness/2),box.h/2,0);
    }
    // 옆면에는 포장지를 접어 겹친 선만 가늘게 남긴다.
    const foldPoints = [];
    for (const side of [-1,1]) {
      const x=side*(box.w/2+0.002);
      foldPoints.push(x,box.h, -box.d/2+0.03, x,box.h*0.42,0,
        x,box.h,box.d/2-0.03, x,box.h*0.42,0,
        x,box.h*0.42,0, x,0.04,0);
    }
    const foldGeometry = new THREE.BufferGeometry();foldGeometry.setAttribute('position',new THREE.Float32BufferAttribute(foldPoints,3));
    root.add(new THREE.LineSegments(foldGeometry,new THREE.LineBasicMaterial({color:new THREE.Color(paper).multiplyScalar(0.55),transparent:true,opacity:0.25})));
    const lid = new THREE.Group();lid.name = 'gift-lid';lid.position.set(0,box.h,-box.d/2);root.add(lid);
    part(lid,bodyMaterial,box.w+0.075,0.028,box.d+0.075,0,0.027,box.d/2);
    for (const side of [-1,1]) {
      part(lid,bodyMaterial,box.w+0.075,0.095,thickness,0,-0.023,box.d/2+side*(box.d/2+0.024));
      part(lid,bodyMaterial,thickness,0.095,box.d+0.025,side*(box.w/2+0.024),-0.023,box.d/2);
    }
    const lidRibbon = new THREE.Group();lidRibbon.position.set(0,0.055,box.d/2);lid.add(lidRibbon);
    part(lidRibbon,ribbonMaterial,0.19,0.008,box.d+0.08,0,0,0);
    part(lidRibbon,ribbonMaterial,box.w+0.08,0.008,0.19,0,0.008,0);
    // 평평한 리본을 곡면으로 구부려 나비 매듭을 만든다.
    for (const sign of [-1,1]) {
      const points = [new THREE.Vector3(0,0.035,0),new THREE.Vector3(sign*0.29,0.31,-0.03),new THREE.Vector3(sign*0.52,0.20,0.02),new THREE.Vector3(sign*0.29,0.045,0.12),new THREE.Vector3(0,0.035,0)];
      const curve = new THREE.CatmullRomCurve3(points), positions=[], indices=[];
      for (let i=0;i<=32;i++) {
        const p=curve.getPoint(i/32);positions.push(p.x,p.y,p.z-0.065,p.x,p.y,p.z+0.065);
        if(i<32) {const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      lidRibbon.add(new THREE.Mesh(geometry,ribbonMaterial));
      const tail=part(lidRibbon,ribbonMaterial,0.13,0.008,0.40,sign*0.13,0.023,0.22);tail.rotation.y=sign*0.35;
    }
    part(lidRibbon,ribbonMaterial,0.15,0.075,0.14,0,0.07,0);
    const bodyRibbon = new THREE.Group();bodyRibbon.position.y=box.h/2;root.add(bodyRibbon);
    for (const side of [-1,1]) {
      part(bodyRibbon,ribbonMaterial,0.19,box.h,0.008,0,0,side*(box.d/2+0.012));
      part(bodyRibbon,ribbonMaterial,0.008,box.h,0.19,side*(box.w/2+0.012),0,0);
    }
    // 뚜껑이 열리면 안쪽의 보물 빛과 별 입자가 나타난다.
    const treasure = new THREE.Group();root.add(treasure);treasure.visible=false;
    // 상자 입구를 불투명한 빛으로 채워 빈 바닥이 보이지 않게 한다.
    const treasureFillMaterial = new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,side:THREE.DoubleSide,
      uniforms:{time:{value:0},strength:{value:0}},
      vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 v;uniform float time;uniform float strength;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){vec2 grid=v*vec2(17.,14.);vec2 cell=floor(grid);float seed=hash(cell);
        vec2 p=(fract(grid)-.5)*2.;float pulse=pow(.5+.5*sin(time*(3.+seed*4.)+seed*80.),5.);
        float star=pow(max(0.,1.-min(abs(p.x),abs(p.y))*5.),3.)*pow(max(0.,1.-max(abs(p.x),abs(p.y))),2.);
        float mist=.5+.5*sin(v.x*15.+time*.7)*sin(v.y*13.-time*.5);
        vec3 gold=mix(vec3(1.,.64,.17),vec3(1.,.94,.64),.55+mist*.3);
        gl_FragColor=vec4(gold+vec3(1.,.95,.75)*star*pulse*1.2,strength);}`
    });
    const treasureFill = new THREE.Mesh(new THREE.PlaneGeometry(box.w-0.06,box.d-0.06),treasureFillMaterial);
    treasureFill.rotation.x=-Math.PI/2;treasureFill.position.y=box.h-0.035;treasure.add(treasureFill);
    const glowMaterial=new THREE.SpriteMaterial({map:treasureTexture,color:0xffe3a1,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    const glow=new THREE.Sprite(glowMaterial);glow.position.set(0,box.h*0.6,0);glow.scale.set(box.w*1.65,box.w*1.65,1);treasure.add(glow);
    const poolMaterial=new THREE.MeshBasicMaterial({map:treasureTexture,color:0xffca69,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    const pool=new THREE.Mesh(new THREE.PlaneGeometry(box.w*2.5,box.d*2.5),poolMaterial);pool.rotation.x=-Math.PI/2;pool.position.y=0.045;treasure.add(pool);
    const beamMaterial=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
      uniforms:{strength:{value:0}},
      vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 v;uniform float strength;void main(){float side=pow(max(0.,1.-abs(v.x-.5)*2.),2.);
      float a=side*pow(1.-v.y,2.)*smoothstep(0.,.12,v.y)*strength;
      gl_FragColor=vec4(vec3(1.,.72,.25)*1.5,a*.32);}`
    });
    for (let i=0;i<4;i++) {
      const beam=new THREE.Mesh(new THREE.PlaneGeometry(box.w*0.9,2.6),beamMaterial);
      beam.position.y=box.h+1.05;beam.rotation.y=i*Math.PI/4;treasure.add(beam);
    }
    const sparklePositions=[],sparklePhases=[];
    for (let i=0;i<360;i++) {
      const a=i*2.399963, r=Math.sqrt((i*.618033%1))*.52;
      sparklePositions.push(Math.cos(a)*r*box.w,0,Math.sin(a)*r*box.d);
      sparklePhases.push((i*.381966%1),0.7+(i*.173%1),i%7===0?1:0);
    }
    const sparkleGeometry=new THREE.BufferGeometry();sparkleGeometry.setAttribute('position',new THREE.Float32BufferAttribute(sparklePositions,3));sparkleGeometry.setAttribute('phase',new THREE.Float32BufferAttribute(sparklePhases,3));
    const sparkleMaterial=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{time:{value:0},strength:{value:0},base:{value:box.h+0.02}},
      vertexShader:`attribute vec3 phase;uniform float time;uniform float strength;uniform float base;varying float light;varying float star;
      void main(){float life=fract(phase.x+time*(.12+phase.y*.09));vec3 p=position;
      p.y=base+life*2.8;p.x+=sin(time*1.3+phase.x*31.)*.12*life;p.z+=cos(time+phase.x*23.)*.12*life;
      float twinkle=pow(.5+.5*sin(time*(4.+phase.y*3.)+phase.x*100.),3.);
      light=strength*sin(life*3.14159)*(.16+twinkle*.84);star=phase.z;
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp((star>0.5?100.:48.)/max(1.,-mv.z),1.,22.);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying float light;varying float star;void main(){vec2 p=abs(gl_PointCoord-.5)*2.;
      float core=exp(-dot(p,p)*9.);float rays=pow(max(0.,1.-min(p.x,p.y)*6.),3.)*pow(max(0.,1.-max(p.x,p.y)),2.);
      float a=core+rays*star*.8;gl_FragColor=vec4(mix(vec3(1.,.64,.18),vec3(1.,.98,.76),core),a*light);}`
    });
    treasure.add(new THREE.Points(sparkleGeometry,sparkleMaterial));
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(box.w,box.h,box.d),hitMat);
    mesh.position.set(x,box.h/2,z);mesh.rotation.y=yaw;mesh.userData.slot=index;scene.add(mesh);
    const hit=new THREE.Mesh(new THREE.BoxGeometry(box.w+0.15,0.7,box.d+0.15),hitMat);
    hit.position.set(x,box.h+0.35,z);hit.rotation.y=yaw;hit.userData.slot=index;scene.add(hit);
    const label=document.createElement('div');label.className='room-label';label.hidden=true;
    lid.rotation.x=-1.42;lidRibbon.visible=bodyRibbon.visible=false;
    return {index,box,mesh,hit,root,lid,lidRibbon,bodyRibbon,bodyMaterial,treasure,treasureFillMaterial,glowMaterial,poolMaterial,beamMaterial,sparkleMaterial,label,project:null,
      anchor:new THREE.Vector3(x,box.h+0.45,z),glow:0,wrap:0,pop:0};
  });

  // 공중에 떠다니는 먼지. 빛이 있는 공간처럼 보이게 한다.
  const dust = (() => {
    const n = 140, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (i * 2.399963) % (Math.PI * 2), r = 1.5 + (i * 0.618 % 1) * 7;
      pos.set([Math.cos(a) * r, 0.4 + (i * 0.381 % 1) * 5, Math.sin(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd5eeff, size: 0.03, transparent: true, opacity: 0.32, depthWrite: false }));
  })();
  scene.add(dust);

  // 화면 위 요소.
  const labels = document.createElement('div');
  labels.className = 'room-ui';
  labels.hidden = true;
  slots.forEach(slot => labels.appendChild(slot.label));
  const controls = document.createElement('section');
  controls.className = 'room-ui room-controls';controls.hidden = true;controls.setAttribute('aria-label', '이글루 안 조작 안내');
  controls.innerHTML = `<h2>이글루 안 둘러보기</h2><div class="room-controls-desktop"><div class="room-control-row"><span class="room-key-grid"><kbd data-key="KeyW">W</kbd><kbd data-key="KeyA">A</kbd><kbd data-key="KeyS">S</kbd><kbd data-key="KeyD">D</kbd></span><span>앞뒤 · 좌우 이동</span></div><div class="room-control-row"><span><kbd data-key="KeyQ">Q</kbd> <small>위</small> <kbd data-key="KeyE">E</kbd> <small>아래</small></span><span>높이 조절</span></div><div class="room-controls-divider"></div><div class="room-control-row"><kbd data-mouse="2">오른쪽 누른 채 이동</kbd><span>시선 회전</span></div><div class="room-control-row"><kbd data-mouse="0">왼쪽 클릭</kbd><span>선물상자 열기</span></div></div><div class="room-controls-touch">한 손가락 드래그 · 둘러보기<br>두 손가락 벌리기 · 이동<br>선물상자 터치 · 열기</div>`;
  document.body.append(controls);
  const controlKeys = [...controls.querySelectorAll('[data-key]')];
  const controlMouse = [...controls.querySelectorAll('[data-mouse]')];
  const paintControlKeys = () => controlKeys.forEach(key => key.classList.toggle('is-held', keys.has(key.dataset.key)));
  const formVeil = document.createElement('div');
  formVeil.className = 'room-ui room-veil';
  formVeil.hidden = true;
  formVeil.innerHTML = `<form class="room-form" role="dialog" aria-modal="true" aria-labelledby="room-form-title"><h2 id="room-form-title">이 상자에 프로젝트 넣기</h2><p>직접 작성한 소개와 이미지가 프로젝트 카드에 표시돼요.</p><div class="room-form-layout"><div class="room-form-fields"><label>프로젝트 이름<input name="title" required maxlength="120" placeholder="프로젝트 이름"></label><label>프로젝트 링크<input name="link" type="text" inputmode="url" required autocomplete="off" spellcheck="false" placeholder="https://" maxlength="2048"></label><label>프로젝트 설명<textarea name="description" required maxlength="5000" placeholder="어떤 서비스인지 소개해 주세요."></textarea></label><label>사용법<textarea name="instructions" required maxlength="5000" placeholder="시작 방법과 주요 기능을 순서대로 적어 주세요."></textarea></label></div><section class="room-form-image"><label>대표 이미지<input name="image" type="file" accept="image/png,image/jpeg,image/webp" required></label><p>이미지 1장 · PNG·JPG·WebP, 최대 5MB</p><div class="room-preview-frame"><span>대표 이미지를 선택해 주세요</span><img class="room-preview" alt="선택한 대표 이미지 미리보기" hidden></div></section></div><p class="room-error" role="alert"></p><div class="room-actions"><button type="submit" class="room-btn primary">넣기</button><button type="button" class="room-btn" data-cancel>취소</button></div></form>`;
  const card = document.createElement('aside');
  card.className = 'room-ui room-card';
  card.hidden = true;
  card.setAttribute('aria-label', '프로젝트 상세');
  card.innerHTML = `<div class="room-card-top"><div class="room-pager"><button type="button" class="room-icon" data-prev aria-label="이전 프로젝트">${ICON_PREV}</button><button type="button" class="room-icon" data-next aria-label="다음 프로젝트">${ICON_NEXT}</button></div></div><div class="room-shot"><div class="room-browser-bar"><span class="room-browser-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="room-browser-address" data-browser-host></span><span class="room-browser-end" aria-hidden="true"></span></div><div class="room-browser-content"><div class="room-image-frame"><img data-image alt="" hidden></div><p data-no-image>등록된 이미지가 없어요.</p></div></div><div class="room-author"><span class="room-avatar" data-avatar></span><span data-owner></span></div><div class="room-project-heading"><h2 data-title></h2></div><div class="room-link" data-host></div><p class="room-desc" data-description></p><div class="room-howto"><h3>사용법</h3><p data-instructions></p></div><div class="room-card-actions"><a class="room-btn primary" data-open target="_blank" rel="noopener noreferrer">프로젝트 열기 →</a><button type="button" class="room-btn" data-edit>프로젝트 수정</button><button type="button" class="room-btn quiet" data-remove>이 상자 비우기</button></div><p class="room-error" role="alert" data-card-error></p><section class="project-feedback" aria-label="댓글과 반응"></section>`;
  const cardBody = document.createElement('div');
  cardBody.className = 'room-card-body';
  cardBody.append(...card.childNodes);
  card.append(cardBody);
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'room-card-dismiss';
  dismiss.dataset.close = '';
  dismiss.setAttribute('aria-label', '프로젝트 카드 오른쪽으로 닫기');
  dismiss.innerHTML = '<svg width="14" height="18" viewBox="0 0 18 24" fill="none" aria-hidden="true"><path d="m6 5 7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  card.append(dismiss);
  let closeCardTimer = null;
  document.body.append(labels, formVeil, card);

  const privacyRoot = document.createElement('section');
  privacyRoot.className = 'room-ui room-privacy';
  privacyRoot.hidden = true;
  privacyRoot.setAttribute('aria-label', '방 전체 공개 설정');
  document.body.append(privacyRoot);
  const privacy = mountPrivacyPanel(privacyRoot, backend, { onRoomChange: onRoomPublicChange });
  const rewardRow = document.createElement('div');
  rewardRow.className = 'room-reward-row';
  privacyRoot.append(rewardRow);
  const cardThemes = mountCardThemes(rewardRow, card, backend, [formVeil.querySelector('.room-form')]);
  const exteriorLight = mountExteriorLight(rewardRow, backend, { onChange:onExteriorLightChange });
  const feedback = mountProjectFeedback(card.querySelector('.project-feedback'), backend, { onViewed: async (id, before) => {
    if (!isMine || !active) return;
    await backend.markCommentNotificationsRead(id, before);
    onNotificationsRead();
  } });
  card.querySelector('.room-author').append(card.querySelector('.feedback-reactions'));
  const q = selector => card.querySelector(selector);
  const form = formVeil.querySelector('form');
  const linkInput = form.elements.link;
  const imageInput = form.elements.image;
  const preview = form.querySelector('.room-preview');
  let previewUrl = null, saving = false;
  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    preview.removeAttribute('src');
    preview.hidden = true;
  }
  imageInput.addEventListener('change', () => {
    clearPreview();
    const file = imageInput.files[0];
    if (imageInput.files.length > 1) {
      imageInput.value = '';
      formError.textContent = '대표 이미지는 한 장만 선택해 주세요.';
      return;
    }
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      imageInput.value = '';
      formError.textContent = '5MB 이하의 PNG·JPG·WebP 이미지를 선택해 주세요.';
      return;
    }
    formError.textContent = '';
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.hidden = false;
  });
  async function prepareImage(file) {
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw new Error('이미지를 읽을 수 없어요. 다른 파일을 선택해 주세요.'); }
    try {
      const ratio = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      const imageCanvas = document.createElement('canvas');
      imageCanvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      imageCanvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = imageCanvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
      ctx.drawImage(bitmap, 0, 0, imageCanvas.width, imageCanvas.height);
      const blob = await new Promise(resolve => imageCanvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (!blob) throw new Error('이미지를 준비하지 못했어요.');
      return blob;
    } finally { bitmap.close(); }
  }
  const formError = form.querySelector('.room-error');
  const submitBtn = form.querySelector('[type=submit]');

  // 방 안에서 자유롭게 이동하되 바닥과 얼음 돔 밖으로 나가지 않는다.
  const START = { yaw: ROOM_YAW, pitch: 0.26, radius: 9 };
  const view = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 };
  const position = new THREE.Vector3();
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), movement = new THREE.Vector3();
  const rotation = new THREE.Euler(0, 0, 0, 'YXZ');
  const keys = new Set();
  const typing = () => document.activeElement?.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
  const clampView = () => { view.targetPitch = THREE.MathUtils.clamp(view.targetPitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05); };
  const resetView = () => {
    position.set(Math.cos(START.yaw) * Math.cos(START.pitch) * START.radius,
      1.15 + Math.sin(START.pitch) * START.radius, Math.sin(START.yaw) * Math.cos(START.pitch) * START.radius);
    camera.position.copy(position);
    camera.lookAt(0, 1.15, 0);
    rotation.setFromQuaternion(camera.quaternion, 'YXZ');
    Object.assign(view, { yaw: rotation.y, targetYaw: rotation.y, pitch: rotation.x, targetPitch: rotation.x });
  };
  const placeCamera = () => {
    camera.position.copy(position);
    camera.quaternion.setFromEuler(rotation.set(view.pitch, view.yaw, 0, 'YXZ'));
  };
  const moveCamera = (dx, dy, dz) => {
    const next = position.clone().add(new THREE.Vector3(dx, dy, dz));
    next.y = THREE.MathUtils.clamp(next.y, 0.65, DOME_R - 0.5);
    const maxR = Math.sqrt(Math.max(0, (DOME_R - 0.4) ** 2 - next.y ** 2));
    const radius = Math.hypot(next.x, next.z);
    if (radius > maxR) { next.x *= maxR / radius; next.z *= maxR / radius; }
    // 카메라가 상자 속으로 들어가지 않도록 몸통 높이에서 충돌을 막는다.
    for (const box of BOXES) {
      if (next.y > box.h + 0.3) continue;
      const at = boxAt(box), x = next.x - at.x, z = next.z - at.z;
      const localX = Math.cos(at.yaw) * x - Math.sin(at.yaw) * z;
      const localZ = Math.sin(at.yaw) * x + Math.cos(at.yaw) * z;
      if (Math.abs(localX) < box.w / 2 + 0.25 && Math.abs(localZ) < box.d / 2 + 0.25) return;
    }
    position.copy(next);
  };
  resetView();
  placeCamera();

  let active = false, home = null, isMine = false, ownerName = '', selected = null, formSlot = null, loadToken = 0, removing = false, lastTime = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const screen = new THREE.Vector3();
  const pointers = new Map();
  let dragged = false, pinch = 0, hovered = null;

  const filled = () => slots.filter(slot => slot.project);
  function pick(x, y) {
    const rect = canvas.getBoundingClientRect();
    ndc.set((x - rect.left) / rect.width * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = slots.flatMap(slot => (slot.project ? [slot.hit, slot.mesh] : [slot.mesh]));
    const hit = ray.intersectObjects(targets, false)[0];
    return hit ? slots[hit.object.userData.slot] : null;
  }
  // 빈 상자는 주인만 누를 수 있다. 채워진 상자는 볼 수 있는 사람 모두 누를 수 있다.
  const clickable = slot => Boolean(slot && (slot.project || isMine));
  function setLabels() {
    for (const slot of slots) {
      const show = Boolean(slot.project) || isMine;
      slot.label.hidden = !show;
      slot.label.textContent = slot.project ? slot.project.title : '프로젝트 넣기';
      slot.label.dataset.empty = String(!slot.project);
      slot.label.dataset.active = String(selected === slot);
    }
  }
  function applyProjects(rows) {
    // 오래된 프로젝트부터 첫 번째 상자에 놓는다.
    const list = rows.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, slots.length);
    slots.forEach((slot, i) => {
      slot.project = list[i] || null;
      slot.hit.visible = Boolean(slot.project);
      if (slot.project) slot.pop = 1;
    });
    setLabels();
  }
  function renderCard() {
    if (!selected?.project) return closeCard();
    const list = filled(), { project } = selected;

    q('[data-prev]').hidden = q('[data-next]').hidden = list.length < 2;
    q('[data-avatar]').textContent = (ownerName || '?').trim().charAt(0) || '?';
    q('[data-owner]').textContent = ownerName || '수강생';
    q('[data-title]').textContent = project.title;
    q('[data-host]').textContent = hostOf(project.url);
    q('[data-browser-host]').textContent = hostOf(project.url);
    q('[data-description]').textContent = project.description || '등록된 설명이 없어요.';
    q('[data-instructions]').textContent = project.instructions || '등록된 사용법이 없어요.';
    const image = q('[data-image]');
    const shot = q('.room-shot');
    delete image.dataset.landscape;
    delete shot.dataset.portrait;
    shot.style.removeProperty('--image-ratio');
    function fitImage() {
      if (!image.naturalWidth || !image.naturalHeight) return;
      image.dataset.landscape = String(image.naturalWidth > image.naturalHeight);
      shot.dataset.portrait = String(image.naturalHeight > image.naturalWidth);
      shot.style.setProperty('--image-ratio', `${image.naturalWidth} / ${image.naturalHeight}`);
    }
    image.onload = fitImage;
    image.hidden = !project.image_url;
    image.alt = `${project.title} 대표 이미지`;
    image.onerror = () => { image.hidden = true; delete shot.dataset.portrait; q('[data-no-image]').hidden = false; };
    if (project.image_url) image.src = project.image_url;
    else image.removeAttribute('src');
    if (project.image_url && image.complete) fitImage();
    q('[data-no-image]').hidden = Boolean(project.image_url);
    q('[data-open]').href = normalizeLink(project.url) || '#';
    q('[data-edit]').hidden = !isMine;
    q('[data-remove]').hidden = !isMine;
    q('[data-remove]').textContent = removing ? '정말 비울까요? 한 번 더 누르면 지워져요' : '이 상자 비우기';
    q('[data-card-error]').textContent = '';
    clearTimeout(closeCardTimer);
    card.classList.remove('is-closing');
    card.inert = false;
    card.hidden = false;
    setLabels();
  }
  function openCard(slot) {
    selected = slot;
    removing = false;
    renderCard();
    feedback.open(slot.project.id);
  }
  function closeCard() {
    feedback.close();
    selected = null;
    removing = false;
    clearTimeout(closeCardTimer);
    if (!card.hidden) {
      card.classList.add('is-closing');
      card.inert = true;
      closeCardTimer = setTimeout(() => {
        card.hidden = true;
        card.classList.remove('is-closing');
      }, reduceMotion.matches ? 0 : 480);
    }
    setLabels();
  }
  function stepCard(delta) {
    const list = filled();
    if (list.length < 2 || !selected) return;
    openCard(list[(list.indexOf(selected) + delta + list.length) % list.length]);
  }
  function openForm(slot) {
    if (saving || !isMine) return;
    formSlot = slot;
    form.reset();
    clearPreview();
    const project = slot.project;
    form.querySelector('h2').textContent = project ? '프로젝트 수정하기' : '이 상자에 프로젝트 넣기';
    submitBtn.textContent = project ? '수정 저장' : '넣기';
    imageInput.required = !project;
    form.querySelector('.room-preview-frame > span').textContent = project ? '새 이미지를 선택하면 교체돼요' : '대표 이미지를 선택해 주세요';
    if (project) {
      form.elements.title.value = project.title;
      linkInput.value = project.url;
      form.elements.description.value = project.description || '';
      form.elements.instructions.value = project.instructions || '';
      if (project.image_url) { preview.src = project.image_url; preview.hidden = false; }
    }
    formError.textContent = '';
    submitBtn.disabled = saving;
    formVeil.hidden = false;
    linkInput.focus();
  }
  function closeForm() {
    if (saving && active) return;
    clearPreview();
    formVeil.hidden = true;
    formSlot = null;
  }
  const failText = error => {
    const text = error?.message || '';
    if (/[가-힣]/.test(text)) return text;
    if (/failed to fetch|network/i.test(text)) return '연결을 확인하고 다시 시도해 주세요.';
    return '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  };
  async function load(token, projectId = null) {
    try {
      const rows = await backend.getProjects(home);
      if (token === loadToken) {
        applyProjects(rows);
        const target = projectId && slots.find(slot => slot.project?.id === projectId);
        if (target) openCard(target);
      }
    } catch (e) {
      // 로그인 전이거나 비공개 이글루면 빈 상자만 보인다.
      if (token === loadToken) applyProjects([]);
      console.warn('프로젝트를 불러오지 못했어요:', e.message);
    }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (saving || !active || !isMine || !formSlot) return;
    const link = normalizeLink(linkInput.value);
    if (!link) {
      formError.textContent = '올바른 링크를 넣어 주세요. 예: https://example.com';
      linkInput.focus();
      return;
    }
    const title = form.elements.title.value.trim();
    const description = form.elements.description.value.trim();
    const instructions = form.elements.instructions.value.trim();
    const file = imageInput.files[0];
    if (!title || !description || !instructions || (!file && !formSlot.project)) {
      formError.textContent = '이름, 설명, 사용법과 대표 이미지를 모두 입력해 주세요.';
      return;
    }
    const token = loadToken, slot = formSlot, targetHome = home;
    saving = true;
    submitBtn.disabled = true;
    formError.textContent = '';
    try {
      const image = file ? await prepareImage(file) : null;
      if (token !== loadToken) return;
      const editing = slot.project;
      const values = { title, description, instructions, url: link, image };
      const previousThemeUnlock = editing ? null : await cardThemes.unlockState();
      if (token !== loadToken) return;
      const project = editing ? await backend.updateProject(editing.id, values) : await backend.addProject(targetHome, values);
      if (token !== loadToken) return;
      const list = filled().map(s => s.project);
      applyProjects(editing ? list.map(item => item.id === project.id ? project : item) : [...list, project]);
      if (!editing) cardThemes.projectPosted(previousThemeUnlock);
      if (!editing) exteriorLight.refresh();
      saving = false;
      closeForm();
      const placed = slots.find(s => s.project?.id === project.id) || slot;
      if (editing) openCard(placed);
      else closeCard();
    } catch (error) {
      if (token === loadToken) formError.textContent = failText(error);
    } finally {
      saving = false;
      submitBtn.disabled = false;
    }
  });
  formVeil.querySelector('[data-cancel]').onclick = closeForm;
  formVeil.addEventListener('pointerdown', e => { if (e.target === formVeil) closeForm(); });
  q('[data-close]').onclick = closeCard;
  q('[data-prev]').onclick = () => stepCard(-1);
  q('[data-next]').onclick = () => stepCard(1);
  q('[data-edit]').onclick = () => { if (isMine && selected?.project) openForm(selected); };
  q('[data-remove]').onclick = async () => {
    if (!removing) {
      removing = true;
      renderCard();
      return;
    }
    const slot = selected, token = loadToken, button = q('[data-remove]');
    button.disabled = true;
    try {
      await backend.deleteProject(slot.project.id);
      if (token !== loadToken) return;
      const rest = filled().filter(s => s !== slot).map(s => s.project);
      closeCard();
      applyProjects(rest);
    } catch (error) {
      removing = false;
      q('[data-card-error]').textContent = failText(error);
    } finally {
      button.disabled = false;
    }
  };

  const onKey = e => {
    if (!active || e.key !== 'Escape') return;
    if (!formVeil.hidden) closeForm();
    else if (!card.hidden) closeCard();
  };
  addEventListener('keydown', onKey);
  addEventListener('keydown', e => {
    if (!active || typing() || !formVeil.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) return;
    e.preventDefault(); keys.add(e.code);paintControlKeys();
  });
  addEventListener('keyup', e => { keys.delete(e.code);paintControlKeys(); });
  const clearInput = () => { keys.clear();paintControlKeys();controlMouse.forEach(key => key.classList.remove('is-held'));pointers.clear(); pinch = 0; dragged = false; };
  addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
  document.addEventListener('focusin', () => { if (typing()) { keys.clear();paintControlKeys(); } });
  canvas.addEventListener('contextmenu', e => { if (active) e.preventDefault(); });

  canvas.addEventListener('pointerdown', e => {
    if (!active || (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2)) return;
    if (e.button === 2) e.preventDefault();
    controlMouse.forEach(key => key.classList.toggle('is-held', Number(key.dataset.mouse) === e.button));
    pointers.set(e.pointerId, { button: e.button, touch: e.pointerType !== 'mouse', x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    if (pointers.size === 1) dragged = false;
    pinch = 0;
  });
  addEventListener('pointermove', e => {
    if (!active) return;
    const held = pointers.get(e.pointerId);
    if (!held) {
      if (e.pointerType === 'mouse' && e.target === canvas && !pointers.size) {
        hovered = pick(e.clientX, e.clientY);
        canvas.style.cursor = clickable(hovered) ? 'pointer' : 'grab';
      }
      return;
    }
    const dx = e.clientX - held.x, dy = e.clientY - held.y;
    held.x = e.clientX;
    held.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) { forward.set(0, 0, -1).applyQuaternion(camera.quaternion); moveCamera(forward.x * (distance - pinch) * 0.015, 0, forward.z * (distance - pinch) * 0.015); }
      pinch = distance;
      dragged = true;
      clampView();
      return;
    }
    if (!dragged && Math.hypot(e.clientX - held.startX, e.clientY - held.startY) < 6) return;
    dragged = true;
    if (!held.touch && held.button !== 2) return;
    canvas.style.cursor = 'grabbing';
    view.targetYaw -= dx * 0.0052;
    view.targetPitch -= dy * 0.0032;
    clampView();
  });
  const endPointer = e => {
    if (!pointers.has(e.pointerId)) return;
    const held = pointers.get(e.pointerId);
    controlMouse.forEach(key => key.classList.remove('is-held'));
    pointers.delete(e.pointerId);
    pinch = 0;
    if (!active || pointers.size) return;
    canvas.style.cursor = 'grab';
    if (dragged || e.type !== 'pointerup' || (!held.touch && held.button !== 0)) return;
    const slot = pick(e.clientX, e.clientY);
    if (!clickable(slot)) return;
    if (slot.project) openCard(slot);
    else openForm(slot);
  };
  addEventListener('pointerup', endPointer);
  addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', e => {
    if (!active) return;
    e.preventDefault();
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const step = THREE.MathUtils.clamp(-e.deltaY * 0.004, -0.6, 0.6);
    moveCamera(forward.x * step, 0, forward.z * step);
  }, { passive: false });

  return {
    scene, camera,
    setAspect(aspect) {
      camera.aspect = aspect;
      // 세로로 긴 화면에서도 상자가 모두 보이도록 화각을 넓힌다.
      camera.fov = aspect < 1.1 ? 68 : 50;
      camera.updateProjectionMatrix();
    },
    enter({ home: nextHome, isMine: mine, isPublic = false, ownerName: name, projectId = null }) {
      active = true;
      home = nextHome;
      isMine = Boolean(mine);
      privacy.enter(nextHome, isMine, isPublic);
      cardThemes.enter(nextHome, isMine);
      exteriorLight.enter(isMine);
      ownerName = name || '';
      closeForm();
      closeCard();
      clearInput();
      lastTime = null;
      resetView();
      placeCamera();
      labels.hidden = false;
      controls.hidden = false;
      applyProjects([]);
      canvas.style.cursor = 'grab';
      load(++loadToken, projectId);
    },
    leave() {
      privacy.leave();
      cardThemes.leave();
      exteriorLight.leave();
      active = false;
      loadToken++;
      clearInput();
      closeForm();
      closeCard();
      labels.hidden = true;
      controls.hidden = true;
      canvas.style.cursor = '';
    },
    update(t) {
      const dt = lastTime === null ? 0 : Math.min(t - lastTime, 0.1);
      lastTime = t;
      const k = 1 - Math.exp(-dt * 9);
      view.yaw += (view.targetYaw - view.yaw) * k;
      view.pitch += (view.targetPitch - view.pitch) * k;
      if (active && !typing() && formVeil.hidden) {
        forward.set(-Math.sin(view.yaw), 0, -Math.cos(view.yaw));
        right.set(Math.cos(view.yaw), 0, -Math.sin(view.yaw));
        movement.set(0, 0, 0);
        movement.addScaledVector(forward, Number(keys.has('KeyW')) - Number(keys.has('KeyS')));
        movement.addScaledVector(right, Number(keys.has('KeyD')) - Number(keys.has('KeyA')));
        movement.y = Number(keys.has('KeyQ')) - Number(keys.has('KeyE'));
        if (movement.lengthSq()) {
          movement.normalize().multiplyScalar(dt * 3.2);
          movement.x *= 2.5;
          movement.z *= 2.5;
          moveCamera(movement.x, movement.y, movement.z);
        }
      }
      placeCamera();
      const still = reduceMotion.matches;
      treasureLight.intensity=0;
      for (const slot of slots) {
        // 눌러 볼 수 있는 상자와 선택된 상자에만 은은한 빛이 돈다.
        const want = selected === slot ? 0.32 : hovered === slot && clickable(slot) ? 0.2 : 0;
        slot.glow += (want - slot.glow) * (1 - Math.exp(-dt * 10));
        slot.bodyMaterial.emissiveIntensity = slot.glow;
        const targetWrap = slot.project && selected !== slot ? 1 : 0;
        const step = dt / 0.85;
        slot.wrap = still ? targetWrap : THREE.MathUtils.clamp(slot.wrap + Math.sign(targetWrap-slot.wrap)*Math.min(step,Math.abs(targetWrap-slot.wrap)),0,1);
        const lidProgress = THREE.MathUtils.smoothstep(slot.wrap,0,0.65);
        const ribbonProgress = THREE.MathUtils.smoothstep(slot.wrap,0.5,1);
        const treasureStrength=slot.project?THREE.MathUtils.smoothstep(1-lidProgress,0.12,0.85):0;
        slot.treasure.visible=treasureStrength>0.001;
        const shimmer=still?1:0.94+Math.sin(t*3.3)*0.04+Math.sin(t*7.1)*0.02;
        slot.treasureFillMaterial.uniforms.strength.value=treasureStrength;
        slot.treasureFillMaterial.uniforms.time.value=still?0:t;
        slot.glowMaterial.opacity=treasureStrength*0.95*shimmer;
        slot.poolMaterial.opacity=treasureStrength*0.48;
        slot.beamMaterial.uniforms.strength.value=treasureStrength*shimmer;
        slot.sparkleMaterial.uniforms.strength.value=treasureStrength;
        slot.sparkleMaterial.uniforms.time.value=still?0:t;
        if(treasureStrength>0.001) {
          slot.root.localToWorld(treasureLight.position.set(0,slot.box.h+0.3,0));
          treasureLight.intensity=6*treasureStrength*shimmer;
        }
        slot.lid.rotation.x = -1.42 * (1-lidProgress);
        slot.lidRibbon.visible = slot.bodyRibbon.visible = ribbonProgress > 0.001;
        slot.lidRibbon.scale.setScalar(Math.max(0.001,ribbonProgress));
        slot.bodyRibbon.scale.set(1,Math.max(0.001,ribbonProgress),1);
        slot.pop = Math.max(0,slot.pop-dt/0.6);
        const bounce = still ? 0 : Math.sin((1-slot.pop)*Math.PI*2)*slot.pop*0.035;
        slot.root.scale.set(1-bounce*0.5,1+bounce,1-bounce*0.5);
        slot.label.style.display = '';
        screen.copy(slot.anchor);
        screen.y += slot.project ? 0.25 : 0.14;
        screen.project(camera);
        if (screen.z >= 1) {
          slot.label.style.display = 'none';
          continue;
        }
        slot.label.style.left = (screen.x * 0.5 + 0.5) * innerWidth + 'px';
        slot.label.style.top = (-screen.y * 0.5 + 0.5) * innerHeight + 'px';
      }
      if (!still) dust.rotation.y = t * 0.012;
    }
  };
}
