// server.mjs — 여러 채널 중 "지금 라이브 중인" 방송만 모아 보여주는 대시보드 웹앱
// 실행: node server.mjs   →   http://localhost:4000
import http from "node:http";
import { getChannelInfo } from "./youtube-info.mjs";

const PORT = process.env.PORT || 4000;

// 병렬 조회 (동시 실행 수 제한)
async function pool(items, size, fn) {
  const ret = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return ret;
}

const PAGE = /* html */ `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>유튜브 라이브 보드</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=JetBrains+Mono:wght@500;700&family=Noto+Sans+KR:wght@400;500;700;900&display=swap">
<style>
  :root{
    color-scheme: dark;
    --bg:#0e0b0c; --panel:#161213; --tile:#1e1819; --line:#2c2324;
    --ink:#f4ecec; --muted:#a8999a; --faint:#7c6f70;
    --live:#ff2b32; --live-2:#ff5a60; --glow:rgba(255,43,50,.4);
    --amber:#f5a623; --offline:#6b6264;
    --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
    --disp:"Archivo",system-ui,sans-serif;
    --kr:"Noto Sans KR",system-ui,sans-serif;
  }
  *{box-sizing:border-box}
  body{margin:0; background:radial-gradient(1200px 600px at 80% -10%, rgba(255,43,50,.10), transparent 60%),var(--bg);
       color:var(--ink); font-family:var(--kr); -webkit-font-smoothing:antialiased; line-height:1.5}
  .stage{max-width:1120px; margin:0 auto; padding:26px 18px 48px}
  a{color:inherit}

  .brand{display:flex; align-items:center; gap:10px; font-family:var(--disp); font-weight:900; letter-spacing:.02em;
         font-size:15px; text-transform:uppercase; color:var(--muted); margin-bottom:16px}
  .brand .r{width:11px; height:11px; border-radius:50%; background:var(--live); box-shadow:0 0 12px var(--glow); animation:pulse 1.6s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(255,43,50,.5)}70%{box-shadow:0 0 0 8px rgba(255,43,50,0)}100%{box-shadow:0 0 0 0 rgba(255,43,50,0)}}

  /* controls */
  .controls{background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:14px 16px; margin-bottom:16px}
  .ctop{display:flex; align-items:center; gap:12px; flex-wrap:wrap}
  .ctop label{font-family:var(--mono); font-size:12px; color:var(--muted); cursor:pointer; display:inline-flex; align-items:center; gap:7px}
  .btn{border:0; border-radius:11px; padding:11px 20px; font-family:var(--kr); font-weight:700; font-size:14px; cursor:pointer; white-space:nowrap}
  .btn.go{color:#fff; background:linear-gradient(180deg,var(--live),#d81c23); box-shadow:0 8px 20px var(--glow)}
  .btn.go:disabled{opacity:.55; cursor:default; box-shadow:none}
  .btn.edit{color:var(--ink); background:transparent; box-shadow:inset 0 0 0 1px var(--line)}
  .ctop .spacer{margin-left:auto}
  details{margin-top:12px}
  details summary{font-family:var(--mono); font-size:12px; color:var(--muted); cursor:pointer}
  textarea{width:100%; margin-top:10px; min-height:120px; resize:vertical; padding:12px 14px; border-radius:10px;
           border:1px solid var(--line); background:#141011; color:var(--ink); font-family:var(--mono); font-size:13px; line-height:1.7}
  textarea:focus{outline:none; border-color:var(--live)}
  .hint{font-family:var(--mono); font-size:11px; color:var(--faint); margin-top:8px}

  /* summary strip */
  .summary{font-family:var(--mono); font-size:12px; color:var(--faint); display:flex; flex-wrap:wrap; gap:8px 16px;
           align-items:center; border:1px solid var(--line); border-radius:10px; padding:10px 14px; margin-bottom:16px; background:rgba(255,255,255,.015)}
  .summary .on{color:var(--live-2); font-weight:700} .summary b{color:var(--muted); font-weight:500}
  .sep{color:#3a2f30}
  .msg{font-family:var(--mono); font-size:13px; padding:14px 16px; border-radius:12px; display:none; margin-bottom:16px}
  .msg.err{display:block; color:#ffb0b3; background:rgba(255,43,50,.08); border:1px solid rgba(255,43,50,.3)}
  .msg.load{display:flex; align-items:center; gap:10px; color:var(--muted); background:var(--panel); border:1px solid var(--line)}
  .spin{width:15px; height:15px; border:2px solid var(--line); border-top-color:var(--live); border-radius:50%; animation:spin .7s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}

  /* grid */
  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px}
  .card{background:var(--panel); border:1px solid var(--line); border-radius:16px; overflow:hidden;
        display:flex; flex-direction:column; transition:transform .1s ease, border-color .1s ease; text-decoration:none}
  .card:hover{transform:translateY(-2px)}
  .card.live{border-color:rgba(255,43,50,.35)}
  .card.live:hover{border-color:var(--live)}
  .thumb{position:relative; aspect-ratio:16/9; background:#000}
  .thumb img{width:100%; height:100%; object-fit:cover; display:block}
  .thumb::after{content:""; position:absolute; inset:0; box-shadow:inset 0 -50px 40px -30px rgba(0,0,0,.8)}
  .rec{position:absolute; top:10px; left:10px; display:inline-flex; align-items:center; gap:6px; font-family:var(--disp);
       font-weight:800; font-size:11px; letter-spacing:.1em; color:#fff; background:rgba(216,28,35,.92); padding:5px 9px; border-radius:7px}
  .rec .d{width:7px; height:7px; border-radius:50%; background:#fff; animation:pulse 1.6s infinite}
  .vb{position:absolute; bottom:8px; left:10px; font-family:var(--mono); font-weight:700; font-size:13px; color:#fff;
      background:rgba(0,0,0,.6); padding:3px 9px; border-radius:7px; font-variant-numeric:tabular-nums}
  .body{padding:13px 15px; display:flex; gap:11px; align-items:center}
  .ava{width:40px; height:40px; border-radius:11px; object-fit:cover; border:1px solid var(--line); background:#000; flex-shrink:0}
  .info{min-width:0; flex:1}
  .nm{font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .hd{font-family:var(--mono); font-size:11px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .status{margin-left:auto; flex-shrink:0; font-family:var(--disp); font-weight:800; font-size:10px; letter-spacing:.08em;
          text-transform:uppercase; padding:5px 9px; border-radius:999px}
  .status.live{color:#fff; background:linear-gradient(180deg,var(--live),#d81c23)}
  .status.up{color:#1a1206; background:var(--amber)}
  .status.off{color:var(--muted); background:var(--tile); box-shadow:inset 0 0 0 1px var(--line)}
  .status.err{color:#ffb0b3; background:rgba(255,43,50,.1)}
  .vtitle{padding:0 15px 14px; font-size:12.5px; color:var(--muted); line-height:1.5;
          display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden}
  .offrow{padding:0 15px 14px; font-family:var(--mono); font-size:11.5px; color:var(--faint)}
  .card.off{opacity:.82} .card.err{opacity:.7}

  footer{margin-top:24px; font-family:var(--mono); font-size:11.5px; color:var(--faint); display:flex; flex-wrap:wrap; gap:6px 14px}
  @media (prefers-reduced-motion:reduce){ *{animation:none!important; transition:none!important} }
</style>
</head>
<body>
<div class="stage">
  <div class="brand"><span class="r"></span>유튜브 라이브 보드</div>

  <div class="controls">
    <div class="ctop">
      <button class="btn go" id="go">가져오기 / 새로고침</button>
      <label><input type="checkbox" id="onlyLive"> 라이브만 보기</label>
      <button class="btn edit spacer" id="editBtn">채널 목록 편집</button>
    </div>
    <details id="editor">
      <summary>채널 목록 (한 줄에 하나씩 · 주소 또는 @핸들)</summary>
      <textarea id="list" spellcheck="false"></textarea>
      <div class="hint">저장은 이 브라우저에 자동 보관됩니다 · 최대 40개 · <button class="btn edit" style="padding:5px 10px;font-size:12px" id="save">목록 저장 &amp; 새로고침</button></div>
    </details>
  </div>

  <div id="summary" class="summary" style="display:none"></div>
  <div id="msg" class="msg"></div>
  <div id="grid" class="grid"></div>

  <footer>
    <span>YOUTUBE LIVE MONITOR</span><span class="sep">│</span>
    <span>여러 채널 중 지금 라이브 중인 방송만 모아 표시 · 등록한 채널 범위 내</span>
  </footer>
</div>

<script>
const DEFAULTS = ["@maebulshow","@ytnnews24","@sbsnews8","@MBCNEWS11","@newskbs","@tvchosunnews","@KTV"];
const KEY="yt-live-channels";
const $=id=>document.getElementById(id);
const go=$("go"), grid=$("grid"), msg=$("msg"), summary=$("summary"),
      listEl=$("list"), onlyLive=$("onlyLive"), editor=$("editor");

let channels = load();
listEl.value = channels.join("\\n");

function load(){ try{ const s=JSON.parse(localStorage.getItem(KEY)); if(Array.isArray(s)&&s.length) return s; }catch{} return DEFAULTS.slice(); }
function persist(arr){ try{ localStorage.setItem(KEY, JSON.stringify(arr)); }catch{} }
function parseList(t){ return t.split(/[\\n,]/).map(s=>s.trim()).filter(Boolean).slice(0,40); }

$("editBtn").onclick=()=>{ editor.open=!editor.open; };
$("save").onclick=(e)=>{ e.preventDefault(); channels=parseList(listEl.value); persist(channels); listEl.value=channels.join("\\n"); editor.open=false; fetchAll(); };
go.onclick=fetchAll;
onlyLive.onchange=()=>render(LAST);

let LAST=[];
async function fetchAll(){
  if(!channels.length){ msg.className="msg err"; msg.textContent="채널 목록이 비어 있습니다. '채널 목록 편집'에서 추가하세요."; return; }
  grid.innerHTML=""; summary.style.display="none";
  msg.className="msg load"; msg.innerHTML='<span class="spin"></span> '+channels.length+'개 채널의 라이브 상태를 확인하는 중…';
  go.disabled=true;
  try{
    const r=await fetch("/api/live-list?urls="+encodeURIComponent(channels.join("\\n")));
    const data=await r.json();
    if(!r.ok) throw new Error(data.error||"조회 실패");
    msg.className="msg"; msg.style.display="none";
    LAST=data.results; renderSummary(data);
    render(data.results);
  }catch(ex){ msg.className="msg err"; msg.textContent="❌ "+ex.message; }
  finally{ go.disabled=false; }
}

const esc=s=>{const d=document.createElement("div");d.textContent=s==null?"":s;return d.innerHTML;};
const int=n=>{const x=Number(String(n||"").replace(/[^\\d]/g,""));return isFinite(x)&&x?x.toLocaleString("ko-KR"):null;};
const kst=iso=>{try{return new Date(iso).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",dateStyle:"short",timeStyle:"short"});}catch{return iso;}};
function rank(x){ if(!x.ok) return 4; if(x.live?.isLive) return 0; if(x.live?.state==="upcoming") return 1; return 2; }
function viewers(x){ return Number(String(x.live?.concurrentViewers||"").replace(/[^\\d]/g,""))||0; }

function renderSummary(data){
  const total=data.results.length;
  const liveN=data.results.filter(x=>x.ok&&x.live?.isLive).length;
  const errN=data.results.filter(x=>!x.ok).length;
  summary.style.display="flex";
  summary.innerHTML='<span class="on">● '+liveN+'개 라이브</span><span class="sep">│</span>'
    +'<span><b>채널</b> '+total+'개</span>'+(errN?'<span class="sep">│</span><span><b>조회 실패</b> '+errN+'개</span>':'')
    +'<span class="sep">│</span><span><b>조회</b> '+esc(kst(data.fetchedAt))+'</span>';
}

function render(results){
  const list=results.slice().sort((a,b)=> rank(a)-rank(b) || viewers(b)-viewers(a) || (a.channel?.title||"").localeCompare(b.channel?.title||""));
  const show = onlyLive.checked ? list.filter(x=>x.ok&&x.live?.isLive) : list;
  if(!show.length){ grid.innerHTML='<div class="offrow" style="padding:20px">표시할 채널이 없습니다.</div>'; return; }
  grid.innerHTML = show.map(card).join("");
}

function card(x){
  if(!x.ok){
    return '<div class="card err"><div class="body"><div class="info"><div class="nm">'+esc(x.input)+'</div>'
      +'<div class="hd">조회 실패</div></div><span class="status err">Error</span></div>'
      +'<div class="offrow">'+esc((x.error||"").slice(0,50))+'</div></div>';
  }
  const c=x.channel, l=x.live;
  const detail="/channel?url="+encodeURIComponent(c.handle||c.channelId||x.input);
  const ava='<img class="ava" src="'+esc(c.avatar||"")+'" alt="" onerror="this.style.visibility=\\'hidden\\'">';
  const head='<div class="body">'+ava+'<div class="info"><div class="nm">'+esc(c.title||x.input)+'</div>'
    +'<div class="hd">'+esc(c.handle||"")+' · 구독 '+esc((c.subscribers||"").replace(/^구독자\\s*/,"")||"-")+'</div></div>';

  if(l.isLive){
    const vb=int(l.concurrentViewers);
    return '<a class="card live" href="'+detail+'">'
      +'<div class="thumb">'+(l.thumbnail?'<img src="'+esc(l.thumbnail)+'" alt="" onerror="this.parentNode.style.background=\\'#1a1416\\'">':"")
      +'<span class="rec"><span class="d"></span>REC</span>'+(vb?'<span class="vb">👁 '+vb+'</span>':"")+'</div>'
      +head+'<span class="status live">Live</span></div>'
      +'<div class="vtitle">'+esc(l.title||"")+'</div></a>';
  }
  if(l.state==="upcoming"){
    return '<a class="card" href="'+detail+'">'
      +head+'<span class="status up">예정</span></div>'
      +'<div class="offrow">시작 예정 · '+esc(l.scheduledStart?kst(l.scheduledStart):"미정")+'</div></a>';
  }
  return '<a class="card off" href="'+detail+'">'
    +head+'<span class="status off">Offline</span></div>'
    +'<div class="offrow">방송 '+esc((c.videoCount||"").replace(/^동영상\\s*/,"")||"-")+' · 오프라인</div></a>';
}

fetchAll(); // 열자마자 조회
</script>
</body>
</html>`;

// ── 채널 상세 페이지 (카드 클릭 시 이동) ──
const DETAIL_PAGE = /* html */ `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>채널 상세 · 온에어 보드</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=JetBrains+Mono:wght@500;700&family=Noto+Sans+KR:wght@400;500;700;900&display=swap">
<style>
  :root{
    color-scheme: dark;
    --bg:#0e0b0c; --panel:#161213; --tile:#1e1819; --line:#2c2324;
    --ink:#f4ecec; --muted:#a8999a; --faint:#7c6f70;
    --live:#ff2b32; --live-2:#ff5a60; --glow:rgba(255,43,50,.45);
    --amber:#f5a623; --offline:#6b6264;
    --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
    --disp:"Archivo",system-ui,sans-serif;
    --kr:"Noto Sans KR",system-ui,sans-serif;
  }
  *{box-sizing:border-box}
  body{margin:0; background:radial-gradient(1200px 600px at 78% -10%, rgba(255,43,50,.10), transparent 60%),var(--bg);
       color:var(--ink); font-family:var(--kr); -webkit-font-smoothing:antialiased; line-height:1.5}
  .stage{max-width:980px; margin:0 auto; padding:22px 18px 48px}
  a{color:inherit}

  .navbar{display:flex; align-items:center; gap:12px; margin-bottom:18px}
  .back{display:inline-flex; align-items:center; gap:7px; font-family:var(--mono); font-size:13px; color:var(--muted);
        text-decoration:none; border:1px solid var(--line); border-radius:10px; padding:9px 14px; background:var(--panel)}
  .back:hover{color:var(--ink); border-color:var(--live)}
  .refresh{margin-left:auto; border:0; border-radius:10px; padding:9px 16px; font-family:var(--kr); font-weight:700;
           font-size:13px; color:#fff; cursor:pointer; background:linear-gradient(180deg,var(--live),#d81c23); box-shadow:0 6px 18px var(--glow)}
  .refresh:disabled{opacity:.55; cursor:default; box-shadow:none}

  .msg{font-family:var(--mono); font-size:13px; padding:14px 16px; border-radius:12px; display:none}
  .msg.err{display:block; color:#ffb0b3; background:rgba(255,43,50,.08); border:1px solid rgba(255,43,50,.3)}
  .msg.load{display:flex; align-items:center; gap:10px; color:var(--muted); background:var(--panel); border:1px solid var(--line)}
  .spin{width:15px; height:15px; border:2px solid var(--line); border-top-color:var(--live); border-radius:50%; animation:spin .7s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  #board{display:none}

  .signal{font-family:var(--mono); font-size:11.5px; letter-spacing:.03em; color:var(--faint); display:flex; flex-wrap:wrap;
          gap:8px 16px; align-items:center; border:1px solid var(--line); border-radius:10px; padding:9px 14px; background:rgba(255,255,255,.015)}
  .signal b{color:var(--muted); font-weight:500} .signal .on{color:var(--live-2)} .signal .offc{color:var(--offline)}
  .sep{color:#3a2f30}

  .topbar{display:flex; align-items:center; gap:16px; margin:22px 2px 20px}
  .ava{width:64px; height:64px; border-radius:16px; object-fit:cover; border:1px solid var(--line); box-shadow:0 6px 20px rgba(0,0,0,.4); background:#000}
  .who{min-width:0; flex:1}
  .who h1{margin:0; font-weight:900; font-size:clamp(20px,3.4vw,28px); letter-spacing:-.01em; text-wrap:balance}
  .who .handle{font-family:var(--mono); color:var(--muted); font-size:13px; margin-top:3px}
  .pill{margin-left:auto; flex-shrink:0; display:inline-flex; align-items:center; gap:8px; font-family:var(--disp);
        font-weight:800; letter-spacing:.08em; font-size:13px; text-transform:uppercase; padding:9px 14px; border-radius:999px}
  .pill.live{color:#fff; background:linear-gradient(180deg,var(--live),#d81c23); box-shadow:0 0 0 1px rgba(255,90,96,.5),0 8px 24px var(--glow)}
  .pill.up{color:#1a1206; background:linear-gradient(180deg,var(--amber),#d98e12)}
  .pill.off{color:var(--muted); background:var(--tile); box-shadow:inset 0 0 0 1px var(--line)}
  .dot{width:9px; height:9px; border-radius:50%; background:#fff}
  .pill.live .dot{animation:pulse 1.6s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.55)}70%{box-shadow:0 0 0 7px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}

  .onair{display:grid; grid-template-columns:1.15fr 1fr; gap:0; background:var(--panel); border:1px solid var(--line); border-radius:18px; overflow:hidden}
  .onair.solo{grid-template-columns:1fr}
  .screen{position:relative; aspect-ratio:16/9; background:#000}
  .screen img{width:100%; height:100%; object-fit:cover; display:block}
  .screen::after{content:""; position:absolute; inset:0; box-shadow:inset 0 0 0 1px rgba(255,43,50,.25),inset 0 -60px 60px -30px rgba(0,0,0,.7)}
  .rec{position:absolute; top:12px; left:12px; display:inline-flex; align-items:center; gap:7px; font-family:var(--disp);
       font-weight:800; font-size:12px; letter-spacing:.1em; color:#fff; background:rgba(216,28,35,.92); padding:6px 11px; border-radius:8px}
  .rec .dot{width:8px; height:8px; animation:pulse 1.6s infinite}
  .stamp{position:absolute; bottom:10px; right:12px; font-family:var(--mono); font-size:11px; color:#e8dede; background:rgba(0,0,0,.55); padding:3px 8px; border-radius:6px}
  .readout{padding:22px; display:flex; flex-direction:column; min-width:0}
  .eyebrow{font-family:var(--disp); text-transform:uppercase; letter-spacing:.14em; font-size:11px; font-weight:800; display:flex; align-items:center; gap:8px}
  .eyebrow.live{color:var(--live-2)} .eyebrow.up{color:var(--amber)} .eyebrow.off{color:var(--offline)}
  .eyebrow::after{content:""; flex:1; height:1px; background:linear-gradient(90deg,var(--line),transparent)}
  .vtitle{font-weight:700; font-size:16px; line-height:1.45; margin:12px 0 0; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden}
  .offmsg{margin-top:12px; color:var(--muted); font-size:14px; line-height:1.6}
  .viewers{margin-top:auto; padding-top:18px}
  .viewers .num{font-family:var(--mono); font-weight:700; font-size:clamp(30px,5vw,40px); letter-spacing:-.01em; font-variant-numeric:tabular-nums; line-height:1}
  .viewers .lbl{color:var(--muted); font-size:12.5px; margin-top:5px}
  .viewers .lbl b{color:var(--live-2); font-weight:700}
  .cta{display:flex; gap:10px; margin-top:18px; flex-wrap:wrap}
  .btn{font-family:var(--kr); font-weight:700; font-size:14px; text-decoration:none; border-radius:11px; padding:11px 16px; display:inline-flex; align-items:center; gap:8px; transition:transform .08s ease}
  .btn:active{transform:translateY(1px)}
  .btn.primary{background:linear-gradient(180deg,var(--live),#d81c23); color:#fff; box-shadow:0 8px 22px var(--glow)}
  .btn.ghost{background:transparent; color:var(--ink); box-shadow:inset 0 0 0 1px var(--line)}

  .stats{display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:14px}
  .tile{background:var(--tile); border:1px solid var(--line); border-radius:14px; padding:16px 16px 14px}
  .tile .k{font-size:12px; color:var(--muted); letter-spacing:.02em}
  .tile .v{font-family:var(--mono); font-weight:700; font-size:clamp(20px,3vw,27px); margin-top:8px; font-variant-numeric:tabular-nums; letter-spacing:-.01em}
  .tile.hot{border-color:rgba(255,43,50,.4)} .tile.hot .v{color:var(--live-2)}
  .tile.dim .v{color:var(--faint)}
  .tile .u{font-size:12px; color:var(--faint); margin-top:3px}

  .meta{display:grid; grid-template-columns:1fr 1.35fr; gap:12px; margin-top:12px}
  .card{background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px 18px}
  .card h2{margin:0 0 12px; font-family:var(--disp); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:800; color:var(--faint)}
  .kv{display:flex; flex-direction:column; gap:11px}
  .kv .row{display:flex; justify-content:space-between; gap:12px; align-items:baseline; border-bottom:1px dashed var(--line); padding-bottom:10px}
  .kv .row:last-child{border-bottom:0; padding-bottom:0}
  .kv .rk{color:var(--muted); font-size:13px; flex-shrink:0}
  .kv .rv{font-family:var(--mono); font-size:12.5px; text-align:right; word-break:break-all}
  .chips{display:flex; flex-wrap:wrap; gap:7px}
  .chip{font-size:12px; color:var(--muted); background:var(--tile); border:1px solid var(--line); padding:5px 10px; border-radius:999px}
  .desc{font-size:13px; color:#cabfbf; white-space:pre-wrap; line-height:1.65; max-height:150px; overflow:auto; margin-top:12px; padding-right:6px}
  .desc::-webkit-scrollbar{width:8px} .desc::-webkit-scrollbar-thumb{background:#2c2324; border-radius:8px}
  footer{margin-top:22px; display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center; font-family:var(--mono); font-size:11.5px; color:var(--faint)}

  @media (max-width:720px){ .onair{grid-template-columns:1fr} .stats{grid-template-columns:repeat(2,1fr)} .meta{grid-template-columns:1fr} }
  @media (prefers-reduced-motion:reduce){ *{animation:none!important; transition:none!important} }
</style>
</head>
<body>
<div class="stage">
  <div class="navbar">
    <a class="back" href="/">← 라이브 보드</a>
    <button class="refresh" id="refresh">새로고침</button>
  </div>
  <div id="msg" class="msg"></div>
  <div id="board"></div>
</div>

<script>
const params=new URLSearchParams(location.search);
const target=params.get("url")||"";
const msg=document.getElementById("msg"), board=document.getElementById("board"), refresh=document.getElementById("refresh");
refresh.onclick=load;

const esc=s=>{const d=document.createElement("div");d.textContent=s==null?"":s;return d.innerHTML;};
const int=n=>{const x=Number(String(n||"").replace(/[^\\d]/g,""));return isFinite(x)&&x?x.toLocaleString("ko-KR"):null;};
const kst=iso=>{if(!iso)return null;try{return new Date(iso).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",dateStyle:"medium",timeStyle:"short"});}catch{return iso;}};
const kstTime=iso=>{if(!iso)return"";try{return new Date(iso).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit"});}catch{return"";}};
function elapsed(f,t){if(!f)return null;const a=new Date(f),z=t?new Date(t):new Date();let m=Math.floor((z-a)/60000);if(m<0||!isFinite(m))return null;const h=Math.floor(m/60);m%=60;return(h?h+"시간 ":"")+m+"분";}
const strip=(s,re)=>(s||"").replace(re,"").trim()||"-";

async function load(){
  if(!target){ msg.className="msg err"; msg.textContent="채널이 지정되지 않았습니다."; return; }
  board.style.display="none";
  msg.className="msg load"; msg.innerHTML='<span class="spin"></span> 채널 정보를 가져오는 중…';
  refresh.disabled=true;
  try{
    const r=await fetch("/api/channel?url="+encodeURIComponent(target));
    const data=await r.json();
    if(!r.ok) throw new Error(data.error||"조회 실패");
    msg.className="msg"; msg.style.display="none";
    render(data);
  }catch(ex){ msg.className="msg err"; msg.textContent="❌ "+ex.message; }
  finally{ refresh.disabled=false; }
}

function render({channel:c, live:l, fetchedAt}){
  document.title = (c.title||"채널")+" · 온에어 보드";
  const state=l.isLive?"live":(l.state==="upcoming"?"up":"off");
  const pill = state==="live" ? '<span class="pill live"><span class="dot"></span>On Air</span>'
             : state==="up"  ? '<span class="pill up"><span class="dot"></span>Upcoming</span>'
             : '<span class="pill off"><span class="dot" style="background:var(--offline)"></span>Offline</span>';
  const sigState = state==="live"?'<span class="on">● SIGNAL LIVE</span>'
                 : state==="up"?'<span style="color:var(--amber)">● SIGNAL STANDBY</span>'
                 : '<span class="offc">● SIGNAL OFFLINE</span>';

  let onair;
  if(state==="live"){
    const vc=int(l.concurrentViewers), el=elapsed(l.startedAt,fetchedAt);
    onair='<section class="onair">'
      +(l.thumbnail?'<div class="screen"><img src="'+esc(l.thumbnail)+'" alt="방송 썸네일" onerror="this.parentNode.style.display=\\'none\\'">'
        +'<span class="rec"><span class="dot"></span>REC</span>'+(l.startedAt?'<span class="stamp">LIVE · '+kstTime(l.startedAt)+' KST 시작</span>':"")+'</div>':"")
      +'<div class="readout"><div class="eyebrow live">실시간 방송 중</div>'
      +'<p class="vtitle">'+esc(l.title)+'</p>'
      +'<div class="viewers"><div class="num">'+(vc||"—")+'</div>'
      +'<div class="lbl"><b>동시 시청자</b>'+(el?' · 약 '+el+'째 방송 중':"")+'</div></div>'
      +'<div class="cta"><a class="btn primary" href="'+esc(l.watchUrl)+'" target="_blank" rel="noopener">▶ 방송 보러가기</a>'
      +'<a class="btn ghost" href="'+esc(c.channelUrl||("https://www.youtube.com/"+c.handle))+'" target="_blank" rel="noopener">유튜브 채널 열기</a></div></div></section>';
  } else {
    const eb=state==="up"?'<div class="eyebrow up">방송 예정</div>':'<div class="eyebrow off">현재 방송 없음</div>';
    const body=state==="up"
      ? '<p class="vtitle">'+esc(l.title)+'</p><div class="offmsg">시작 예정 · '+(kst(l.scheduledStart)||"미정")+'</div>'
      : '<div class="offmsg">지금은 실시간 방송 중이 아닙니다. 최근 영상은 채널에서 확인하세요.</div>';
    const cta='<div class="cta">'+(state==="up"&&l.watchUrl?'<a class="btn primary" href="'+esc(l.watchUrl)+'" target="_blank" rel="noopener">예약 페이지</a>':"")
      +'<a class="btn ghost" href="'+esc(c.channelUrl||("https://www.youtube.com/"+c.handle))+'" target="_blank" rel="noopener">유튜브 채널 열기</a></div>';
    onair='<section class="onair solo"><div class="readout" style="min-height:150px">'+eb+body+'<div style="margin-top:auto">'+cta+'</div></div></section>';
  }

  const subs=strip(c.subscribers,/^구독자\\s*/), vids=strip(c.videoCount,/^동영상\\s*/);
  const stats='<section class="stats">'
    +'<div class="tile"><div class="k">구독자</div><div class="v">'+esc(subs)+'</div><div class="u">subscribers</div></div>'
    +'<div class="tile"><div class="k">동영상</div><div class="v">'+esc(vids)+'</div><div class="u">videos</div></div>'
    +(state==="live"
      ? '<div class="tile hot"><div class="k">동시 시청자</div><div class="v">'+(int(l.concurrentViewers)||"—")+'</div><div class="u">watching now</div></div>'
        +'<div class="tile"><div class="k">현재 방송 총 조회</div><div class="v">'+(int(l.totalViews)||"—")+'</div><div class="u">views</div></div>'
      : '<div class="tile dim"><div class="k">동시 시청자</div><div class="v">—</div><div class="u">offline</div></div>'
        +'<div class="tile dim"><div class="k">방송 상태</div><div class="v" style="font-size:18px">'+(state==="up"?"예정":"오프라인")+'</div><div class="u">status</div></div>')
    +'</section>';

  const kws=(c.keywords||"").split(";").map(s=>s.trim()).filter(Boolean).slice(0,12);
  const chips=kws.length?'<h2 style="margin-top:18px">Keywords</h2><div class="chips">'+kws.map(k=>'<span class="chip">'+esc(k)+'</span>').join("")+'</div>':"";
  const meta='<section class="meta"><div class="card"><h2>Channel</h2><div class="kv">'
    +'<div class="row"><span class="rk">채널 ID</span><span class="rv">'+esc(c.channelId||"-")+'</span></div>'
    +'<div class="row"><span class="rk">핸들</span><span class="rv">'+esc(c.handle||"-")+'</span></div>'
    +(state==="live"&&l.startedAt?'<div class="row"><span class="rk">방송 시작</span><span class="rv">'+kst(l.startedAt)+'</span></div>':"")
    +'<div class="row"><span class="rk">안전 등급</span><span class="rv">'+(c.isFamilySafe?"FamilySafe":"-")+'</span></div>'
    +'</div>'+chips+'</div>'
    +'<div class="card"><h2>About</h2><div class="desc">'+esc(c.description||"설명 없음")+'</div></div></section>';

  const signal='<div class="signal">'+sigState+'<span class="sep">│</span>'
    +'<span><b>SRC</b> '+esc((c.handle||c.resolvedUrl||"").replace(/^https?:\\/\\/(www\\.)?/,""))+'</span><span class="sep">│</span>'
    +'<span><b>CH</b> '+esc(c.channelId||"-")+'</span><span class="sep">│</span>'
    +'<span><b>조회</b> '+esc(kst(fetchedAt))+'</span></div>';
  const header='<div class="topbar">'
    +'<img class="ava" src="'+esc(c.avatar||"")+'" alt="프로필" onerror="this.style.visibility=\\'hidden\\'">'
    +'<div class="who"><h1>'+esc(c.title||"(제목 없음)")+'</h1><div class="handle">'+esc(c.handle||"")+'</div></div>'+pill+'</div>';

  board.innerHTML=signal+header+onair+stats+meta
    +'<footer><span>YOUTUBE CHANNEL MONITOR</span><span class="sep">│</span><span>조회 시각 '+esc(kst(fetchedAt))+'</span></footer>';
  board.style.display="block";
}

load();
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const json = (obj, code = 200) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
  };

  // 여러 채널의 라이브 상태를 한 번에
  if (url.pathname === "/api/live-list") {
    const raw = url.searchParams.get("urls") || "";
    const list = raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).slice(0, 40);
    if (!list.length) return json({ error: "urls 파라미터가 필요합니다." }, 400);
    try {
      const results = await pool(list, 6, async (u) => {
        try {
          const d = await getChannelInfo(u);
          return { input: u, ok: true, channel: d.channel, live: d.live };
        } catch (e) {
          return { input: u, ok: false, error: e.message };
        }
      });
      return json({ results, fetchedAt: new Date().toISOString() });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // 단일 채널 상세 (기존 API 유지)
  if (url.pathname === "/api/channel") {
    const input = url.searchParams.get("url");
    try {
      if (!input) throw new Error("url 파라미터가 필요합니다.");
      return json(await getChannelInfo(input));
    } catch (e) {
      return json({ error: e.message }, 400);
    }
  }

  // 채널 상세 페이지
  if (url.pathname === "/channel") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(DETAIL_PAGE);
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(PAGE);
});

server.listen(PORT, () => {
  console.log(`✅ 유튜브 라이브 보드 실행: http://localhost:${PORT}`);
});
