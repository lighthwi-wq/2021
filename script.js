'use strict';

const STORAGE_KEY = 'oneteam_db_mz_v1';
const MBTI_TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];
const MBTI_LABELS = { INTJ:'갓벽주의 전략가', INTP:'방구석 아인슈타인', ENTJ:'도파민 폭주 기관차', ENTP:'팩폭 장인', INFJ:'겉바속촉 예언자', INFP:'망상 풀가동 요정', ENFJ:'인간 리트리버', ENFP:'인싸 중의 인싸', ISTJ:'엑셀 인간화', ISFJ:'프로수발러', ESTJ:'효율 집착 광공', ESFJ:'핵인싸 총무', ISTP:'효율 낭만파', ISFP:'누워있는 예술가', ESTP:'브레이크 고장', ESFP:'인간 ホットシックス' };
const AVATAR_PALETTE = ['#FF3300','#4A154B','#00C853','#FF007F','#7000FF','#FF9100','#00B0FF','#1A1A1A'];

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const uid = (prefix='id') => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
const hash = s => { let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return Math.abs(h); };
const pickColor = seed => AVATAR_PALETTE[hash(String(seed))%AVATAR_PALETTE.length];
const initial = name => (name||'?').trim().charAt(0);
const clamp = (n,min,max) => Math.max(min, Math.min(max, n));

const DEFAULT_STATE = { settings: { theme: 'dark' }, profile: null, customMembers: [], teams: [] };
const deepClone = obj => JSON.parse(JSON.stringify(obj));

const Store = {
  state: deepClone(DEFAULT_STATE),
  load(){ try { const raw = localStorage.getItem(STORAGE_KEY); if(raw) this.state = { ...deepClone(DEFAULT_STATE), ...JSON.parse(raw) }; } catch(e){} },
  save(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch(e){} },
  pool(){ return [...(this.state.customMembers || [])]; },
  member(id){ if(this.state.profile && this.state.profile.id === id) return this.state.profile; return this.pool().find(m => m && m.id === id); },
  team(id){ return (this.state.teams || []).find(t => t.id === id); },
};

const Haptic = { 
  light(){ this._do(10); }, 
  success(){ this._do([10,30,50]); }, 
  heavy(){ this._do(40); },
  _do(p){ try{ navigator.vibrate && navigator.vibrate(p); } catch(_){} } 
};

const Toast = {
  show(msg, icon='✨', dur=2500){
    const el = document.createElement('div'); el.className = `toast`; 
    el.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;
    $('#toastArea').appendChild(el); Haptic.light();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, dur);
  }
};

const Sheet = {
  open(title, bodyHTML, opts={}){ 
    $('#sheetHead').innerHTML = esc(title); 
    $('#sheetBody').innerHTML = bodyHTML; 
    $('#sheet').classList.add('open'); $('#scrim').classList.add('open'); 
    Haptic.light();
    if(opts.mount) opts.mount(); 
  },
  close(){ $('#sheet').classList.remove('open'); $('#scrim').classList.remove('open'); }
};

/* ===================================================================
   MZ VIBE AI ENGINE
   =================================================================== */
const AIEngine = {
  evaluateInteraction(m1, m2) {
    if(!m1 || !m2) return 0;
    let score = 0;
    if (m1[1] !== m2[1]) score += 15; 
    if (m1[3] !== m2[3]) score += 10;
    if (m1 === m2) score -= 10;
    return score;
  },
  
  analyze(memberIds) {
    const members = memberIds.map(id => Store.member(id)).filter(Boolean);
    if(!members.length) return { scores:{leadership:0, execution:0, creativity:0, analysis:0, empathy:0}, overall:0, insights:[] };

    let s = { leadership:0, execution:0, creativity:0, analysis:0, empathy:0 };
    let roles = { planner: 0, executor: 0, mediator: 0, analyst: 0 };
    
    members.forEach(m => {
      if(m.mbti){
        if(m.mbti[0]==='E') s.leadership+=15; else s.analysis+=5;
        if(m.mbti[1]==='S') { s.execution+=20; roles.executor++; } else { s.creativity+=20; roles.planner++; }
        if(m.mbti[2]==='T') { s.analysis+=20; roles.analyst++; } else { s.empathy+=20; roles.mediator++; }
        if(m.mbti[3]==='J') { s.execution+=10; s.leadership+=5; } else { s.creativity+=5; }
      }
    });

    let synergyBonus = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) { synergyBonus += this.evaluateInteraction(members[i].mbti, members[j].mbti); }
    }
    
    const maxPer = Math.max(members.length * 30, 100);
    Object.keys(s).forEach(k => s[k] = clamp(Math.round(((s[k] + (synergyBonus/(members.length||1)))) / maxPer * 100), 20, 100));
    
    const overall = Math.round((s.leadership + s.execution + s.creativity + s.analysis + s.empathy) / 5);
    const insights = [];
    
    if(roles.planner > 0 && roles.executor === 0) insights.push({ i:'🚨', t:'몽상가들의 파티 (실행력 떡락 주의)', d:'아이디어는 넷플릭스급인데, 막상 코딩할 사람이 없습니다. J나 S 성향의 멱살잡이 1명이 시급합니다.', type:'warn' });
    else if(roles.planner > 0 && roles.executor > 0) insights.push({ i:'🚀', t:'티키타카 오지는 릴레이', d:'N의 미친 발상을 S가 묵묵히 현실로 깎아내는 갓벽한 업무 파이프라인입니다.', type:'ai' });
    
    if(roles.analyst > (members.length/2)) insights.push({ i:'🧊', t:'T발 C야? 얼음송곳 팀', d:'효율과 논리가 지배하는 차가운 공간. 목표 달성은 빠르겠지만, 멘탈 나가는 팀원이 생길 수 있으니 칭찬을 의식적으로 해주세요.', type:'warn' });
    if(roles.mediator > (members.length/2)) insights.push({ i:'💖', t:'F들의 힐링 캠프', d:'서로 상처받을까봐 피드백을 못할 수도 있습니다. 일할 땐 조금 더 매운맛이 필요합니다.', type:'warn' });
    
    if(synergyBonus > 20) insights.push({ i:'🔥', t:'우주 최강 도파민 파티', d:'성향이 서로의 단점을 미친듯이 보완해줍니다. 케미스트리 폭발, 팀워크 1티어 조합입니다.', type:'ai' });
    else if(insights.length === 0) insights.push({ i:'⚖️', t:'육각형 안정형 팟', d:'모난 곳 없이 밸런스가 좋습니다. 무난하게 프로젝트를 폭파시킬 수 있는 든든한 조합.', type:'ai' });

    let title = "평범한 스쿼드";
    if(overall > 85) title = "S급 전설의 레전드 스쿼드 👑";
    else if(overall > 70) title = "포텐 터지는 시너지 스쿼드 ⚡";

    return { scores:s, overall, insights, count:members.length, title };
  },

  recommend(selectedIds, pool) {
    if(selectedIds.length === 0 || pool.length === 0) return [];
    const current = this.analyze(selectedIds);
    let best = null, maxGain = 0;
    
    pool.filter(p => !selectedIds.includes(p.id)).forEach(c => {
      const sim = this.analyze([...selectedIds, c.id]);
      const gain = sim.overall - current.overall;
      if (gain > maxGain) { maxGain = gain; best = c.id; }
    });
    return best ? [best] : [];
  }
};

/* --- CHART RENDERER --- */
function renderRadarChart(data){
  const size = 260, cx = size/2, cy = size/2, r = 90;
  const angleAt = i => -Math.PI/2 + (i * 2*Math.PI/5);
  const pt = (i, val) => [cx + r*(val/100)*Math.cos(angleAt(i)), cy + r*(val/100)*Math.sin(angleAt(i))];
  const rings = [0.25, 0.5, 0.75, 1].map(k => `<polygon class="grid" points="${[0,1,2,3,4].map(i => `${cx + r*k*Math.cos(angleAt(i))},${cy + r*k*Math.sin(angleAt(i))}`).join(' ')}"/>`).join('');
  const axes = [0,1,2,3,4].map(i => `<line class="axis" x1="${cx}" y1="${cy}" x2="${pt(i,100)[0]}" y2="${pt(i,100)[1]}"/>`).join('');
  const dataPts = data.map((d,i) => pt(i, d.value).join(',')).join(' ');
  const points = data.map((d,i) => `<circle class="point" cx="${pt(i, d.value)[0]}" cy="${pt(i, d.value)[1]}" r="5"/>`).join('');
  const labels = data.map((d,i) => {
    const [x,y] = [cx + (r+28)*Math.cos(angleAt(i)), cy + (r+28)*Math.sin(angleAt(i))];
    const anchor = Math.abs(x-cx)<10 ? 'middle' : x>cx ? 'start' : 'end';
    return `<text class="label" x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle">${d.label}</text>`;
  }).join('');
  return `<div class="radar-wrap"><div class="radar"><svg viewBox="0 0 ${size} ${size}">${rings}${axes}<polygon class="area" points="${dataPts}"/>${points}${labels}</svg></div></div>`;
}

/* ===================================================================
   ROUTING & VIEWS
   =================================================================== */
const Router = {
  current: null,
  go(name, params={}){
    this.current = { name, params };
    $('#stage').innerHTML = `<div class="screen fade-in">${Views[name](params)}</div>`;
    if(Views[name].mount) Views[name].mount(params);
    const showTabs = ['home','teams','settings'].includes(name);
    $('#tabBar').classList.toggle('hidden', !showTabs);
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  }
};

const avatarHTML = m => `<div class="avatar avatar-md" style="background:${pickColor(m.id)}">${esc(initial(m.name))}</div>`;
const Views = {};

/* --- GODO SPLASH --- */
Views.splash = () => `
  <div class="screen" id="splash">
    <div id="splash-emblem">
      <div class="emblem-arc"></div>
      <div class="emblem-arc"></div>
      <div class="emblem-arc"></div>
      <div id="emblem-core"></div>
    </div>
    <div id="splash-text">
      <div class="splash-title">One Team.</div>
      <div class="splash-subtitle typing-effect">AI 팀원 매시업.</div>
    </div>
  </div>
`;

Views.splash.mount = () => {
  const splash = $('#splash');
  const title = $('.splash-title', splash);
  const subtitle = $('.splash-subtitle', splash);

  Haptic.heavy(); // 임팩트 있는 스플래시 시작

  // 1. 엠블렘 애니메이션은 CSS로 자동 시작

  // 2. 타이포그래피 애니메이션 시퀀스 제어
  // 메인 타이틀 등장 (2초 후)
  setTimeout(() => { title.style.animationPlayState = 'running'; }, 2000);
  
  // 서브 타이틀 등장 (2.5초 후)
  setTimeout(() => { subtitle.style.animationPlayState = 'running'; }, 2500);

  // 3. 메인 화면으로 전환
  // 모든 애니메이션이 끝난 후 (dur-slow +dur_extra)
  setTimeout(() => {
    splash.classList.add('out'); // 페이드아웃 시작
    // 페이드아웃 애니메이션 완료 후 라우팅
    setTimeout(() => { Router.go('home'); }, 480); // dur-slow와 동일하게 설정
  }, 4500); // 전체 스플래시 유지 시간
};

/* --- HOME --- */
Views.home = () => {
  const p = Store.state.profile;
  let details = '';
  if (p) {
    const extra = [p.gender, p.bloodType, p.family, p.hobbies ? `🎨 ${p.hobbies}` : ''].filter(Boolean).join(' · ');
    details = `
      <div style="font-size:15px;color:var(--muted);margin-top:4px;font-weight:700;">${esc(p.mbti)} · ${MBTI_LABELS[p.mbti]}</div>
      ${extra ? `<div style="font-size:13px;color:var(--muted-2);margin-top:4px;font-weight:500;">${esc(extra)}</div>` : ''}
    `;
  }
  const hero = p ? `<div class="card mb-24" style="background:var(--card-2); color:var(--ink); border:1px solid var(--line); padding:32px 24px;"><div style="display:flex;align-items:center;gap:20px;">${avatarHTML(p)}<div style="flex:1"><div style="font-size:24px;font-weight:900;">${esc(p.name)}님</div>${details}</div></div></div>` : '';
  return `
    <div class="app-header"><div class="left"><span class="h-title">홈</span></div></div>
    <div class="scroll" style="padding:16px 22px;">
      ${hero}
      <div class="section-h"><span class="h3">액션 스튜디오</span></div>
      <div class="stack mb-24">
        <button class="btn btn-primary" onclick="Router.go('teamBuilder')" style="height:72px; font-size:18px; justify-content:flex-start; padding:0 24px; box-shadow:var(--shadow-sm);">
          <span style="font-size:24px; margin-right:12px;">✨</span> AI 팀 매시업 만들기
        </button>
        <button class="btn btn-secondary" onclick="Router.go('analyze')" style="height:60px; justify-content:flex-start; padding:0 24px; font-size:16px;">
          <span style="font-size:20px; margin-right:12px;">👤</span> 내 프로필 업데이트
        </button>
      </div>
      
      <div class="section-h">
        <span class="h3">최근 스쿼드</span>
        <button class="link" onclick="Router.go('teams')">전체보기 <svg viewBox="0 0 24 24" width="16"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
      <div class="stack">
        ${Store.state.teams.slice(0,2).map(t => `<button class="team-card" data-team="${t.id}"><div class="team-card-name"><span>${esc(t.name)}</span><span style="color:var(--accent); font-weight:900;">${AIEngine.analyze(t.memberIds).overall}점</span></div><div class="team-card-meta">${t.memberIds.length}명의 능력자들</div><div class="team-avatars">${t.memberIds.slice(0,5).map(id => avatarHTML(Store.member(id))).join('')}</div></button>`).join('') || '<div style="text-align:center;padding:40px;color:var(--muted); font-weight:700; background:var(--card); border-radius:24px; border:1px dashed var(--line-2);">아직 스쿼드가 없어요!</div>'}
      </div>
    </div>
  `;
};
Views.home.mount = () => { $$('[data-team]').forEach(b => b.addEventListener('click', () => { Haptic.light(); Router.go('teamDetail', {id: b.dataset.team}); })); };

/* --- TEAMS & DETAIL --- */
Views.teams = () => `
  <div class="app-header"><div class="left"><span class="h-title">내 스쿼드</span></div></div>
  <div class="scroll" style="padding:16px 22px;">
    <div class="stack" id="teamListContainer"></div>
  </div>
`;
Views.teams.mount = () => {
  const container = $('#teamListContainer');
  if(!Store.state.teams.length){ container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--muted);font-weight:700;">조합된 팀이 없습니다.<br><br><button class="btn btn-primary" onclick="Router.go(\'teamBuilder\')">첫 스쿼드 만들기</button></div>'; return; }
  container.innerHTML = Store.state.teams.map(t => {
    const a = AIEngine.analyze(t.memberIds);
    return `<button class="team-card" data-team="${t.id}"><div class="team-card-name"><span>${esc(t.name)}</span><span style="color:var(--accent); font-weight:900;">${a.overall}점</span></div><div class="team-card-meta">${a.title}</div><div class="team-avatars">${t.memberIds.slice(0,5).map(id => avatarHTML(Store.member(id))).join('')}</div></button>`;
  }).join('');
  $$('[data-team]').forEach(b => b.addEventListener('click', () => Router.go('teamDetail', {id: b.dataset.team})));
};

Views.teamDetail = ({id}) => {
  const team = Store.team(id);
  if(!team) return ``;
  
  setTimeout(() => {
    if($('#insightContent')) {
      $('#insightContent').innerHTML = renderInsights(team);
      Haptic.success();
    }
  }, 1200);

  return `
    <div class="app-header">
      <div class="left">
        <button class="h-back" onclick="Router.go('teams')"><svg viewBox="0 0 24 24" width="24"><path d="M15 19l-7-7 7-7"/></svg></button>
      </div>
      <div class="right">
        <button class="h-action" id="btnMore"><svg viewBox="0 0 24 24" width="24"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg></button>
      </div>
    </div>
    <div class="scroll no-tab" style="padding:0 22px;">
      <h2 style="font-size:28px; font-weight:900; margin-bottom:24px; letter-spacing:-0.04em;">${esc(team.name)}</h2>
      
      <div id="insightContent" style="min-height:400px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <div style="font-size:40px; animation: pulseGlow 1s infinite alternate;">✨</div>
        <div class="typing-effect" style="margin-top:16px; font-weight:800; font-size:16px; color:var(--accent);">AI가 케미스트리를 분석 중입니다...</div>
      </div>
    </div>
    
    <div style="position:fixed; bottom:0; left:0; right:0; padding:16px 22px calc(16px + var(--safe-bottom)); background:linear-gradient(transparent, var(--paper) 40%); pointer-events:none;">
      <button class="btn btn-ai btn-block" onclick="Toast.show('이미지가 갤러리에 저장되었습니다! 📸')" style="pointer-events:auto; box-shadow:0 12px 30px rgba(255,51,0,0.3);">
        <svg viewBox="0 0 24 24" width="20"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        결과 자랑하기 (스토리 공유)
      </button>
    </div>
  `;
};

function renderInsights(team) {
  const analysis = AIEngine.analyze(team.memberIds);
  const radarData = [ { label:'리더십', value:analysis.scores.leadership }, { label:'실행력', value:analysis.scores.execution }, { label:'창의력', value:analysis.scores.creativity }, { label:'분석력', value:analysis.scores.analysis }, { label:'공감력', value:analysis.scores.empathy } ];
  
  return `
    <div class="holo-card w-100">
      <div style="font-size:16px; font-weight:800; color:var(--muted);">AI 종합 시너지 스코어</div>
      <div style="font-size:64px; font-weight:900; letter-spacing:-0.05em; margin:8px 0; text-shadow:0 4px 20px rgba(0,0,0,0.5);">${analysis.overall}</div>
      <div style="font-size:18px; font-weight:800; color:var(--accent-3);">${analysis.title}</div>
      ${renderRadarChart(radarData)}
    </div>
    
    <div style="width:100%; margin-top:32px; padding-bottom:100px;">
      <div class="section-h"><span class="h3">🔥 AI 팩폭 리포트</span></div>
      <div class="insight-list">
        ${analysis.insights.map(r => `
          <div class="insight-item ${r.type==='ai'?'ai-focus':''}">
            <div class="insight-icon">${r.i}</div>
            <div class="insight-text"><div class="insight-title">${r.t}</div><div class="insight-desc">${r.d}</div></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

Views.teamDetail.mount = ({id}) => {
  $('#btnMore').addEventListener('click', () => {
    Sheet.open('스쿼드 관리', `
      <div class="stack">
        <button class="btn btn-secondary btn-block" onclick="Toast.show('이름 변경은 준비중입니다 🛠️'); Sheet.close();">이름 변경</button>
        <button class="btn btn-block" style="background:#FF17441f; color:var(--bad);" id="btnDelTeam">스쿼드 해체 (삭제)</button>
      </div>
    `, { mount: () => {
      $('#btnDelTeam').onclick = () => {
        Store.state.teams = Store.state.teams.filter(t => t.id !== id); Store.save();
        Sheet.close(); Haptic.heavy(); Toast.show('스쿼드가 해체되었습니다.', '💥'); Router.go('teams');
      };
    }});
  });
};

/* --- TEAM BUILDER --- */
const BuilderState = { selected: new Set(), recommended: new Set() };
Views.teamBuilder = () => {
  BuilderState.selected = new Set(Store.state.profile ? [Store.state.profile.id] : []);
  BuilderState.recommended = new Set();
  return `
    <div class="app-header">
      <div class="left"><button class="h-back" onclick="Router.go('home')"><svg viewBox="0 0 24 24" width="24"><path d="M15 19l-7-7 7-7"/></svg></button><span class="h-title">멤버 픽업</span></div>
      <div class="right">
        <button class="h-action" id="btnAiRecommend" style="color:var(--accent); margin-right:8px; background:rgba(255,51,0,0.1); border:1px solid rgba(255,51,0,0.2);">
          <svg viewBox="0 0 24 24" width="20"><path d="M12 2l2.4 7.6 7.6 2.4-7.6 2.4L12 22l-2.4-7.6-7.6-2.4 7.6-2.4L12 2z"/></svg>
        </button>
        <button class="h-action" id="cmAddContact">
          <svg viewBox="0 0 24 24" width="20"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></svg>
        </button>
      </div>
    </div>
    <div class="scroll" id="builderList" style="padding:16px 16px 120px;"></div>
    <div class="builder-bar show" id="builderBar">
      <div style="font-size:18px;font-weight:900;" id="builderCount">0명 선택</div>
      <button class="btn btn-primary" id="builderSave" style="border-radius:99px; box-shadow:var(--shadow-sm);">매시업 믹스 🚀</button>
    </div>
  `;
};
Views.teamBuilder.mount = () => {
  const render = () => {
    const pool = [Store.state.profile, ...(Store.state.customMembers||[])].filter(Boolean);
    if (pool.length === 0) { $('#builderList').innerHTML = `<div style="padding:60px 20px;text-align:center;color:var(--muted); font-weight:700;">풀에 멤버가 없어요.<br>우측 상단 + 버튼으로 팀원을 추가해보세요!</div>`; } 
    else {
      $('#builderList').innerHTML = pool.map(m => {
        const sel = BuilderState.selected.has(m.id), aiRec = BuilderState.recommended.has(m.id);
        const extra = [m.gender, m.bloodType, m.hobbies].filter(Boolean).join(' · ');
        const metaText = extra ? `${esc(m.mbti)} (${extra})` : `${esc(m.mbti)} · ${MBTI_LABELS[m.mbti]}`;
        return `<button class="team-card builder-row ${sel?'selected':''} ${aiRec?'ai-recommended':''}" data-pick="${m.id}" style="margin-bottom:12px; padding:16px;">${avatarHTML(m)}<div class="builder-body"><div class="builder-name">${esc(m.name)}</div><div class="builder-meta">${metaText}</div></div><div class="check-ring"><svg viewBox="0 0 24 24" width="16"><path d="M5 12l4 4L19 7"/></svg></div></button>`;
      }).join('');
    }
    $$('[data-pick]').forEach(b => b.addEventListener('click', () => { Haptic.light(); const id = b.dataset.pick; BuilderState.selected.has(id) ? BuilderState.selected.delete(id) : BuilderState.selected.add(id); render(); }));
    $('#builderCount').textContent = `${BuilderState.selected.size}명 선택`;
  };
  render();

  $('#btnAiRecommend').addEventListener('click', () => {
    Haptic.success();
    const currentSelected = Array.from(BuilderState.selected);
    const pool = [Store.state.profile, ...(Store.state.customMembers||[])].filter(Boolean);
    const recommendedIds = AIEngine.recommend(currentSelected, pool);
    
    if(recommendedIds.length > 0) {
      recommendedIds.forEach(id => { BuilderState.selected.add(id); BuilderState.recommended.add(id); });
      Toast.show('AI가 최적의 조합을 찾았습니다!', '🤖');
    } else {
      Toast.show('더 이상 추천할 꿀조합이 없어요.', '🤔');
    }
    render();
  });

  $('#builderSave').addEventListener('click', () => {
    if(BuilderState.selected.size < 2) return Toast.show('스쿼드는 최소 2명이어야 해요!', '🚨');
    const newTeamId = uid('t');
    Store.state.teams.push({ id: newTeamId, name: `도파민 스쿼드 #${Math.floor(Math.random()*999)}`, memberIds: Array.from(BuilderState.selected), createdAt: Date.now() });
    Store.save(); Haptic.success(); Router.go('teamDetail', {id: newTeamId});
  });

  $('#cmAddContact').addEventListener('click', () => {
    Sheet.open('새 멤버 영입', `
      <div class="stack" style="padding-top:8px; max-height: 65vh; overflow-y: auto;">
        <div class="field"><input class="input" id="cmName" placeholder="이름 (닉네임) 입력" style="font-size:20px; height:64px; text-align:center;"/></div>
        
        <div class="field mt-8"><label class="field-label">성별</label>
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px;">
            ${['남성','여성','선택안함'].map(g => `<button type="button" class="mbti-chip" data-cmgender="${g}">${g}</button>`).join('')}
          </div>
        </div>

        <div class="field mt-8"><label class="field-label">혈액형</label>
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px;">
            ${['A형','B형','O형','AB형'].map(b => `<button type="button" class="mbti-chip" data-cmblood="${b}">${b}</button>`).join('')}
          </div>
        </div>

        <div class="field mt-8"><label class="field-label">MBTI</label>
          <div class="mbti-grid" id="cmMbti">${MBTI_TYPES.map(t => `<button type="button" class="mbti-chip" data-m="${t}">${t}</button>`).join('')}</div>
        </div>

        <div class="field mt-8"><label class="field-label">가족 관계</label><input class="input" id="cmFamily" placeholder="예: 미혼, 형제 2명"/></div>
        
        <div class="field mt-8"><label class="field-label">취미 / 관심사</label><input class="input" id="cmHobbies" placeholder="예: 스케이트보드, 게임"/></div>

        <button class="btn btn-primary btn-block mt-16" id="cmSave" style="height:60px; margin-bottom:16px;">영입 완료</button>
      </div>`, {
      mount: () => {
        let selectedMbti = '';
        let selectedGender = '';
        let selectedBlood = '';
        $$('[data-m]').forEach(b => b.addEventListener('click', () => { Haptic.light(); selectedMbti = b.dataset.m; $$('[data-m]').forEach(x => x.classList.toggle('selected', x===b)); }));
        $$('[data-cmgender]').forEach(b => b.addEventListener('click', () => { Haptic.light(); selectedGender = b.dataset.cmgender; $$('[data-cmgender]').forEach(x => x.classList.toggle('selected', x===b)); }));
        $$('[data-cmblood]').forEach(b => b.addEventListener('click', () => { Haptic.light(); selectedBlood = b.dataset.cmblood; $$('[data-cmblood]').forEach(x => x.classList.toggle('selected', x===b)); }));
        
        $('#cmSave').addEventListener('click', () => {
          const name = $('#cmName').value.trim();
          const family = $('#cmFamily').value.trim();
          const hobbies = $('#cmHobbies').value.trim();
          if(!name || !selectedMbti) return Toast.show('이름과 MBTI는 필수입력이에요!', '🥺');
          const newId = uid('cm');
          Store.state.customMembers.push({ 
            id: newId, 
            name, 
            mbti: selectedMbti,
            gender: selectedGender,
            bloodType: selectedBlood,
            family,
            hobbies
          });
          Store.save(); Sheet.close(); Toast.show('영입 완료!', '🎉'); BuilderState.selected.add(newId); render();
        });
      }
    });
  });
};

/* --- WIZARD (ONBOARDING) --- */
const WizState = { data: {} };
Views.analyze = () => {
  WizState.data = Store.state.profile || { name:'', mbti:'', gender:'', bloodType:'', family:'', hobbies:'' };
  const isFirstTime = !Store.state.profile;
  const backBtnHtml = isFirstTime ? '' : `<button class="h-back" onclick="Router.go('home')" style="background:var(--line-2); color:var(--ink); border:1px solid var(--line); box-shadow:none;"><svg viewBox="0 0 24 24" width="24"><path d="M15 19l-7-7 7-7"/></svg></button>`;
  
  return `
    <div style="display:flex; flex-direction:column; height:100%; width:100%;">
      <div style="background:var(--card-2); padding:calc(16px + var(--safe-top)) 24px 40px; border-bottom-left-radius:32px; border-bottom-right-radius:32px; position:relative; overflow:hidden; flex-shrink:0; box-shadow:var(--shadow-sm); border-bottom:1px solid var(--line);">
        <div style="position:absolute; inset:0; background:var(--ai-grad); opacity:0.15; filter:blur(40px);"></div>
        
        <div style="position:relative; z-index:2; display:flex; align-items:center; height:40px; margin-bottom:24px; margin-left:-8px;">
           ${backBtnHtml}
        </div>
        
        <div style="position:relative; z-index:2;">
          <h2 class="wiz-q" style="color:var(--ink);">당신의 <span style="background:var(--ai-grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">업무 DNA</span>를<br/>알려주세요.</h2>
          <p style="color:var(--muted); font-size:15px; font-weight:600; margin-top:12px;">AI가 가장 완벽한 시너지의 스쿼드를 짜드릴게요.</p>
        </div>
      </div>

      <div class="scroll no-tab" style="padding:32px 24px 140px; flex:1; background:transparent;">
        <div class="stack">
          <div class="field"><label class="field-label">호칭</label><input class="input" id="wizName" value="${esc(WizState.data.name)}" placeholder="이름 또는 닉네임"/></div>
          
          <div class="field mt-16"><label class="field-label">성별</label>
            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px;">
              ${['남성','여성','선택안함'].map(g => `<button type="button" class="mbti-chip ${WizState.data.gender===g?'selected':''}" data-wgender="${g}">${g}</button>`).join('')}
            </div>
          </div>

          <div class="field mt-16"><label class="field-label">혈액형</label>
            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px;">
              ${['A형','B형','O형','AB형'].map(b => `<button type="button" class="mbti-chip ${WizState.data.bloodType===b?'selected':''}" data-wblood="${b}">${b}</button>`).join('')}
            </div>
          </div>

          <div class="field mt-16"><label class="field-label">MBTI</label>
            <div class="mbti-grid">${MBTI_TYPES.map(t => `<button type="button" class="mbti-chip ${WizState.data.mbti===t?'selected':''}" data-wmbti="${t}">${t}</button>`).join('')}</div>
          </div>
          
          <div class="field mt-16"><label class="field-label">가족 관계</label><input class="input" id="wizFamily" value="${esc(WizState.data.family)}" placeholder="예: 기혼, 자녀 1명"/></div>
          
          <div class="field mt-16"><label class="field-label">취미 / 관심사</label><input class="input" id="wizHobbies" value="${esc(WizState.data.hobbies)}" placeholder="예: 풋살, 탁구, AI 음악 제작"/></div>
        </div>
      </div>
      
      <div class="wiz-actions" style="background:linear-gradient(transparent, var(--paper) 30%); z-index:30;">
        <button class="btn btn-ai btn-block" id="wizSave" style="height:64px; border-radius:24px; font-size:18px; box-shadow:0 12px 24px rgba(255,51,0,0.3);">${isFirstTime ? '시작하기 🚀' : '업데이트 완료'}</button>
      </div>
    </div>
  `;
};
Views.analyze.mount = () => {
  $$('[data-wmbti]').forEach(b => b.addEventListener('click', () => { Haptic.light(); WizState.data.mbti = b.dataset.wmbti; $$('[data-wmbti]').forEach(x => x.classList.toggle('selected', x===b)); }));
  $$('[data-wgender]').forEach(b => b.addEventListener('click', () => { Haptic.light(); WizState.data.gender = b.dataset.wgender; $$('[data-wgender]').forEach(x => x.classList.toggle('selected', x===b)); }));
  $$('[data-wblood]').forEach(b => b.addEventListener('click', () => { Haptic.light(); WizState.data.bloodType = b.dataset.wblood; $$('[data-wblood]').forEach(x => x.classList.toggle('selected', x===b)); }));
  
  $('#wizSave').addEventListener('click', () => {
    const name = $('#wizName').value.trim();
    const family = $('#wizFamily').value.trim();
    const hobbies = $('#wizHobbies').value.trim();
    if(!name || !WizState.data.mbti) return Toast.show('이름과 MBTI는 필수입력이에요!', '🚨');
    Store.state.profile = { 
      id: 'p_me', 
      name, 
      mbti: WizState.data.mbti,
      gender: WizState.data.gender || '',
      bloodType: WizState.data.bloodType || '',
      family,
      hobbies
    };
    Store.save(); Haptic.success(); Router.go('home');
  });
};

/* --- SETTINGS --- */
Views.settings = () => `
  <div class="app-header"><div class="left"><span class="h-title">화학실</span></div></div>
  <div class="scroll" style="padding:16px 22px;">
    <div class="card" style="padding:16px; display:flex; flex-direction:column; gap:8px;">
      <div style="font-size:14px;font-weight:800;color:var(--muted);margin-bottom:8px;">UI 테마 모드 (기본 다크로 맵핑됨)</div>
      <div style="display:flex;gap:8px; background:var(--card-2); padding:6px; border-radius:18px;">
        ${['light','dark','system'].map(t => `<button class="theme-opt ${Store.state.settings.theme===t?'active':''}" data-theme="${t}" style="flex:1; padding:12px; border-radius:14px; font-weight:800; font-size:14px; transition:all .2s; background:${Store.state.settings.theme===t?'var(--card)':'transparent'}; color:${Store.state.settings.theme===t?'var(--ink)':'var(--muted)'};">${t==='light'?'☀️ 라이트':t==='dark'?'🌙 다크':'⚙️ 시스템'}</button>`).join('')}
      </div>
    </div>
    
    <div class="mt-16">
      <button class="btn btn-block" id="btnReset" style="background:rgba(255,69,58,0.1); color:var(--bad); height:60px;">데이터 전체 초기화 💣</button>
    </div>
  </div>
`;
Views.settings.mount = () => {
  $$('[data-theme]').forEach(b => b.addEventListener('click', () => { 
    Haptic.light(); Store.state.settings.theme = b.dataset.theme; Store.save(); applyTheme(); 
    $$('[data-theme]').forEach(x => { x.style.background='transparent'; x.style.color='var(--muted)'; });
    b.style.background='var(--card)'; b.style.color='var(--ink)';
  }));
  $('#btnReset').addEventListener('click', () => { 
    Sheet.open('정말 초기화할까요?', '<div class="stack"><p style="color:var(--muted); font-size:15px; font-weight:600; text-align:center;">저장된 프로필과 팀 데이터가 모두 날아갑니다.</p><button class="btn btn-block" style="background:var(--bad); color:#fff; height:60px;" id="btnConfirmReset">네, 폭파시킬게요 💣</button></div>', {
      mount: () => { $('#btnConfirmReset').onclick = () => { Store.state = deepClone(DEFAULT_STATE); Store.save(); applyTheme(); Sheet.close(); Router.go('splash'); }; }
    });
  });
};

function applyTheme() {
  let t = Store.state.settings.theme || 'dark'; if(t === 'system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
}
function boot(){
  Store.load(); applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if(Store.state.settings.theme === 'system') applyTheme(); });
  $('#scrim').addEventListener('click', () => { if($('#sheet').classList.contains('open')) Sheet.close(); });
  Router.go('splash');
}
document.addEventListener('DOMContentLoaded', boot);