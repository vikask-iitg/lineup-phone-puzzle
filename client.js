const app = document.querySelector('#app');
const PUBLIC_GAME_ORIGIN = 'https://lineup-phone-puzzle.vercel.app';
if (location.hostname.endsWith('.vercel.app') && location.origin !== PUBLIC_GAME_ORIGIN) {
  location.replace(`${PUBLIC_GAME_ORIGIN}${location.pathname}${location.search}${location.hash}`);
}
const palette = ['#ff5d73','#39d5c5','#ffc857','#8c7bff','#55a7ff','#ff914d','#d66bdb','#a3d977'];
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
let socket, roomState, sessionId, myId, clockOffset = 0, reconnectCode = '', soloTiles = [], pointer = null, incompleteCount = 0;
try { sessionId = localStorage.getItem('mosaic-session'); } catch {}
if (!sessionId) { sessionId = crypto.randomUUID?.() || Math.random().toString(36).slice(2); try { localStorage.setItem('mosaic-session', sessionId); } catch {} }

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(text) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = text; document.body.append(el); setTimeout(() => el.remove(), 2800); }
function logo() { return `<div class="topbar"><span class="brand">◉ &nbsp; LINES IN SYNC</span><span>CO-OP / NO LOSERS</span></div>`; }
function landing() {
  app.innerHTML = `<div class="shell">${logo()}<section class="hero"><div><div class="eyebrow">One row. One team.</div><h1>Lines<br>in sync.</h1><p>Put your phones side by side. Match the lines at the edges. Swipe across together to solve.</p><div class="actions"><button class="btn primary" id="create">Create room</button><button class="btn" id="join">Join room</button><button class="btn" id="practice">Practice solo</button></div></div><div class="art" aria-label="Three phones joining into one line"><div class="phone"><i></i></div><div class="phone"><i></i></div><div class="phone"><i></i></div></div></section><div class="hint">A little teamwork goes a long way.</div></div>`;
  document.querySelector('#create').onclick = () => connect({ type: 'create', sessionId, name: askName() });
  document.querySelector('#join').onclick = joinForm;
  document.querySelector('#practice').onclick = practice;
}
function askName() { try { return localStorage.getItem('mosaic-name') || ''; } catch { return ''; } }
function connect(payload) {
  if (['localhost', '127.0.0.1'].includes(location.hostname) && ['create', 'join'].includes(payload.type)) {
    const roomPath = payload.type === 'join' ? `/${encodeURIComponent(payload.code)}` : '/?createRoom=1';
    location.replace(`${PUBLIC_GAME_ORIGIN}${roomPath}`);
    return;
  }
  if (socket) socket.close();
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${scheme}//${location.host}`); let samples = [], sent = 0;
  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'ping', clientTime: Date.now() }));
    sent = 1;
    const sync = setInterval(() => { if (socket.readyState !== 1 || sent >= 5) { clearInterval(sync); return; } socket.send(JSON.stringify({ type:'ping', clientTime:Date.now() })); sent++; }, 150);
    if (payload.type === 'create') socket.send(JSON.stringify(payload));
    else if (payload.type === 'join') socket.send(JSON.stringify(payload));
  };
  socket.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.type === 'pong') { const after = Date.now(), rtt = after - m.clientTime; samples.push({ rtt, offset: m.serverTime - (m.clientTime + rtt / 2) }); if (samples.length >= 5) { samples.sort((a,b)=>a.rtt-b.rtt); clockOffset = samples[Math.floor(samples.length/2)].offset; } }
    if (m.type === 'joined') { myId = m.sessionId; reconnectCode = m.code; try { localStorage.setItem('mosaic-name', payload.name || ''); } catch {} }
    if (m.type === 'state') { roomState = m.state; renderRoom(); }
    if (m.type === 'error') toast(m.message);
    if (m.type === 'notice') toast(m.message);
    if (m.type === 'elsewhere') { toast('Opened elsewhere'); roomState = null; }
  };
  socket.onclose = () => { if (roomState?.phase === 'play' && reconnectCode) setTimeout(() => connect({type:'join', code:reconnectCode, sessionId, name:askName()}), 1200); };
}
function joinForm(code = '') {
  app.innerHTML = `<div class="shell">${logo()}<section class="panel"><div class="eyebrow">Join your friends</div><h2>Enter the room code</h2><p>Ask the host for the four letters on their screen.</p><input class="field code" id="code" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="ABCD" value="${esc(code)}"><input class="field" id="name" maxlength="16" placeholder="Your name (optional)" value="${esc(askName())}"><div class="actions"><button class="btn primary" id="go">Join room</button><button class="btn" id="back">Back</button></div></section></div>`;
  document.querySelector('#go').onclick = () => { const code = document.querySelector('#code').value.toUpperCase().replace(/[^A-Z]/g,''); const name = document.querySelector('#name').value.trim(); if (code.length !== 4) return toast('Enter all 4 letters.'); connect({type:'join',code,sessionId,name}); };
  document.querySelector('#back').onclick = landing;
  document.querySelector('#code').oninput = e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g,'');
}
function svgTile(tile, height = 500) {
  const left = tile.left || [], right = tile.right || [], count = Math.max(left.length, right.length);
  if (!count) return '<svg viewBox="0 0 300 500" aria-hidden="true"></svg>';
  let lines = '';
  for (let i = 0; i < count; i++) {
    const l = left[i] || right[i], r = right[i] || left[i];
    const y1 = (l.y / 100) * 500, y2 = (r.y / 100) * 500;
    const cx1 = 90, cx2 = 210;
    const dash = (l.pattern === 'dash' || r.pattern === 'dash') ? ' stroke-dasharray="18 12"' : (l.pattern === 'dot' || r.pattern === 'dot') ? ' stroke-dasharray="3 12"' : '';
    lines += `<path d="M 0 ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, 300 ${y2}" fill="none" stroke="${l.color}" stroke-width="15" stroke-linecap="round"${dash}/>`;
  }
  return `<svg viewBox="0 0 300 500" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`;
}
function renderRoom() {
  if (!roomState) return;
  const s = roomState;
  document.body.classList.toggle('playing', ['play','get-ready'].includes(s.phase));
  if (['lobby',''].includes(s.phase)) return renderLobby(s);
  if (s.phase === 'get-ready') return renderReady(s);
  if (s.phase === 'play') return renderPlay(s);
  if (s.phase === 'level-complete') return renderResult(s, 'Solved!', `Team score: ${s.score}`, true);
  if (s.phase === 'time-up') return renderTimeout(s);
  if (s.phase === 'final') return renderResult(s, 'Team mosaic!', `${s.level - (s.result === 'time-up' ? 1 : 0)} levels cleared · ${s.score} points`, false);
}
function renderLobby(s) {
  const host = s.hostId === myId;
  const qrMarkup = document.querySelector('#qr-view')?.outerHTML || '';
  const qrLabel = qrMarkup ? 'Refresh QR' : 'Show QR';
  app.innerHTML = `<div class="shell">${logo()}<div class="lobby"><section class="card"><div class="eyebrow">Your room</div><div class="room-code">${esc(s.code)}</div><div class="actions"><button class="btn" id="copy">Copy invite link</button><button class="btn" id="qr">${qrLabel}</button></div><p class="hint">Share this code. Friends can join from any phone or laptop.</p>${qrMarkup}</section><section class="card"><div class="eyebrow">Players · ${s.players.length}/8</div><div>${s.players.map(p=>`<div class="player"><span class="dot" style="background:${p.color}"></span><strong>${esc(p.name)}</strong>${p.id===s.hostId?'<small>HOST</small>':''}<small>${p.connected?'●':'○'}</small></div>`).join('')}</div><p class="instruction">Put your phones side by side.<br>Match the lines. Swipe together.</p>${host?`<button class="btn primary" id="start" ${s.players.length<2?'disabled':''}>Start game &nbsp; →</button>`:'<p class="hint">Waiting for host…</p>'}</section></div></div>`;
  document.querySelector('#copy').onclick = async () => { const url = new URL(`/${encodeURIComponent(s.code)}`, PUBLIC_GAME_ORIGIN).href; try { await navigator.clipboard.writeText(url); toast('Invite link copied!'); } catch { toast(url); } };
  document.querySelector('#qr').onclick = () => {
    const inviteUrl = new URL(`/${encodeURIComponent(s.code)}`, PUBLIC_GAME_ORIGIN).href;
    const qrCode = qrcode(0, 'M');
    qrCode.addData(inviteUrl, 'Byte');
    qrCode.make();
    let view = document.querySelector('#qr-view');
    if (!view) {
      view = document.createElement('div');
      view.id = 'qr-view';
      view.className = 'qr-view';
      document.querySelector('.lobby .card').append(view);
    }
    view.innerHTML = `<p class="hint">Scan to open this room:</p><a class="qr-link" href="${esc(inviteUrl)}">${esc(inviteUrl)}</a><div class="qr-image" role="img" aria-label="QR code for room ${esc(s.code)}">${qrCode.createSvgTag({ cellSize: 5, margin: 4, scalable: true })}</div>`;
    document.querySelector('#qr').textContent = 'Refresh QR';
  };
  document.querySelector('#start')?.addEventListener('click',()=>send({type:'start'}));
}
function renderReady(s) {
  app.innerHTML = `<div class="stage"><div class="stagehead"><span>LEVEL ${s.level}</span><span>GET READY</span></div><div class="center"><div class="eyebrow">Find your place</div><h1>Put all ${s.players.length} phones<br>in a row, screens up.</h1><div class="diagram">${s.players.map(()=>'<div class="mini"></div>').join('')}</div><h1 id="countdown">3</h1></div></div>`;
  const counter = document.querySelector('#countdown'); const tick=()=>{ const n=Math.max(1,Math.ceil((s.startsAt-Date.now()-clockOffset)/1000)); if(counter)counter.textContent=n; }; tick(); setInterval(tick,250);
}
function renderPlay(s) {
  const tile = s.tiles.find(t=>t.playerId===myId);
  if (!tile) { app.innerHTML=`<div class="stage"><div class="center"><h2>Next level starts soon — you'll be in it.</h2></div></div>`; return; }
  const totalSeconds = [60, 50, 45, 45, 40][s.level - 1] || 40;
  const remain = Math.max(0, (s.endsAt - (Date.now()+clockOffset))/1000); const width = Math.max(0,remain/totalSeconds*100);
  const hint = tile.start ? 'Swipe from here →' : tile.end ? '← Finish here' : 'Continue the swipe →';
  app.innerHTML = `<div class="stage"><div class="stagehead"><span>LEVEL ${s.level} · ${esc(tile.start?'START':tile.end?'FINISH':'TILE')}</span><span id="time">${Math.ceil(remain)}s</span></div><div class="timer"><i style="width:${width}%"></i></div><div class="tile" id="tile">${svgTile(tile)}<svg class="swipe-overlay" viewBox="0 0 300 500" preserveAspectRatio="none" aria-hidden="true"><path id="swipe-trail" d=""/></svg><div class="edgebadge">${tile.start?'● START':tile.end?'⚑ FINISH':'MATCH BOTH EDGES'}</div><div class="tilehint">${hint}</div>${s.level===4?'<button class="rotate" id="rotate" aria-label="Rotate tile">↻</button>':''}</div><div class="stagefoot">Swipe from the left edge to the right edge.<br><span class="hint">Keep all phones in the row.</span></div></div>`;
  const el=document.querySelector('#tile'), trail=document.querySelector('#swipe-trail'); let start, points=[];
  const timeEl=document.querySelector('#time'), timerFill=document.querySelector('.timer > i');
  const timerInterval=setInterval(()=>{if(!timeEl.isConnected||roomState?.phase!=='play'){clearInterval(timerInterval);return;}const seconds=Math.max(0,(s.endsAt-(Date.now()+clockOffset))/1000);timeEl.textContent=`${Math.ceil(seconds)}s`;timerFill.style.width=`${Math.max(0,seconds/totalSeconds*100)}%`;},100);
  const draw=e=>{const r=el.getBoundingClientRect(), point={x:Math.max(0,Math.min(300,(e.clientX-r.left)/r.width*300)),y:Math.max(0,Math.min(500,(e.clientY-r.top)/r.height*500))};if(!points.length||Math.hypot(point.x-points.at(-1).x,point.y-points.at(-1).y)>2)points.push(point);trail.setAttribute('d',points.map((p,i)=>`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '));};
  const begin=e=>{if(e.target.closest('#rotate'))return;e.preventDefault();const r=el.getBoundingClientRect();start={x:e.clientX,y:e.clientY,t:Date.now()+clockOffset,left:e.clientX-r.left,pointerId:e.pointerId};points=[];draw(e);el.setPointerCapture(e.pointerId);};
  const move=e=>{if(start?.pointerId===e.pointerId){e.preventDefault();draw(e);}};
  const end=e=>{if(!start||start.pointerId!==e.pointerId)return;e.preventDefault();draw(e);const dx=e.clientX-start.x,dy=Math.abs(e.clientY-start.y),r=el.getBoundingClientRect();const valid=dx>0&&dx>=dy*2&&(tile.start||start.left<=40)&&(tile.end||r.right-e.clientX<=40);if(valid)send({type:'segment',startTime:start.t,endTime:Date.now()+clockOffset});start=null;setTimeout(()=>{if(!start)trail.setAttribute('d','');},450);};
  el.addEventListener('pointerdown',begin);el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',()=>{start=null;trail.setAttribute('d','');});
  document.querySelector('#rotate')?.addEventListener('click',()=>{el.style.transform=el.style.transform?'':'rotate(180deg)';});
}
function renderResult(s,title,sub,advance) {
  app.innerHTML=`<div class="stage"><div class="center"><div class="eyebrow">${advance?'LEVEL COMPLETE':'GAME OVER'}</div><h1 class="result">${title}</h1><p>${sub}</p><div class="diagram">${s.players.map((_,i)=>`<div class="mini ${advance?'active':''}" style="animation-delay:${i*.18}s"></div>`).join('')}</div>${advance?'<div class="hint">Next level in a moment…</div>':s.hostId===myId?'<div class="actions" style="justify-content:center"><button class="btn primary" id="again">Play again</button><button class="btn" id="lobby">Back to lobby</button></div>':''}</div></div>`;
  document.querySelector('#again')?.addEventListener('click',()=>send({type:'retry'}));
  document.querySelector('#lobby')?.addEventListener('click',()=>{if(socket)socket.close();roomState=null;landing();});
}
function renderTimeout(s) {
  app.innerHTML=`<div class="stage"><div class="center"><div class="eyebrow">LEVEL ${s.level}</div><h1>Out of time!</h1><p>Here's the line-up that would have solved it.</p><div class="diagram">${s.tiles.slice().sort((a,b)=>a.slot-b.slot).map(t=>`<div class="mini ${t.playerId===myId?'active':''}"></div>`).join('')}</div><p>Team score: ${s.score}</p>${s.hostId===myId?'<div class="actions" style="justify-content:center"><button class="btn primary" id="retry">Retry level</button><button class="btn" id="end">End game</button></div>':'<p class="hint">Waiting for host…</p>'}</div></div>`;
  document.querySelector('#retry')?.addEventListener('click',()=>send({type:'retry'}));document.querySelector('#end')?.addEventListener('click',()=>send({type:'end'}));
}
function send(data) { if(socket?.readyState===1)socket.send(JSON.stringify(data)); }
function pattern(i,n=3){return Array.from({length:n},(_,j)=>({color:palette[j],y:25+((i*19+j*31+7)%51),pattern:['solid','dash','dot'][(i+j)%3]}));}
function makeSolo(n=4){const boundaries=Array.from({length:n-1},(_,i)=>pattern(i)); const tiles=Array.from({length:n},(_,slot)=>({slot,left:slot?boundaries[slot-1]:[],right:slot<n-1?boundaries[slot]:[]})); const order=tiles.map((_,i)=>i).sort(()=>Math.random()-.5); return order.map((slot,id)=>({id,slot,left:tiles[slot].left,right:tiles[slot].right}));}
function practice(){soloTiles=makeSolo();renderPractice();}
function renderPractice(){
  app.innerHTML=`<div class="shell">${logo()}<section class="panel" style="max-width:900px"><div class="eyebrow">Practice solo</div><h2>Make the line</h2><p>Drag each tile into the right order. Follow the start dot from left to right.</p><div class="solo-board" id="board">${soloTiles.map((t,i)=>`<div class="solo-tile" draggable="true" data-i="${i}">${svgTile(t)}<span class="edgebadge">${t.slot===0?'●':t.slot===soloTiles.length-1?'⚑':'↔'}</span></div>`).join('')}</div><p class="hint">The shuffled row is different each time.</p><div class="actions"><button class="btn primary" id="shuffle">Shuffle again</button><button class="btn" id="home">Home</button></div></section></div>`;
  let from;document.querySelectorAll('.solo-tile').forEach(el=>{el.ondragstart=()=>from=Number(el.dataset.i);el.ondragover=e=>e.preventDefault();el.ondrop=e=>{e.preventDefault();const to=Number(el.dataset.i);[soloTiles[from],soloTiles[to]]=[soloTiles[to],soloTiles[from]];if(soloTiles.every((t,i)=>t.slot===i)){renderPractice();document.querySelector('.panel').insertAdjacentHTML('afterbegin','<div class="success">Solved together (with yourself)!</div>');}else renderPractice();};el.onclick=()=>{if(from==null){from=Number(el.dataset.i);el.classList.add('selected');}else{const to=Number(el.dataset.i);[soloTiles[from],soloTiles[to]]=[soloTiles[to],soloTiles[from]];from=null;renderPractice();}};});
  document.querySelector('#shuffle').onclick=practice;document.querySelector('#home').onclick=landing;
}

const directCode=location.pathname.slice(1).toUpperCase();
if (new URLSearchParams(location.search).has('createRoom')) {
  history.replaceState(null, '', '/');
  connect({type:'create',sessionId,name:askName()});
} else if (/^[A-Z]{4}$/.test(directCode)) connect({type:'join',code:directCode,sessionId,name:askName()}); else landing();
