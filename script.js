'use strict';

const STORAGE_KEY = 'oneteam_db_mz_v1';
const MBTI_TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];
const MBTI_LABELS = { INTJ:'갓벽주의 전략가', INTP:'방구석 아인슈타인', ENTJ:'도파민 폭주 기관차', ENTP:'팩폭 장인', INFJ:'겉바속촉 예언자', INFP:'망상 풀가동 요정', ENFJ:'인간 리트리버', ENFP:'인싸 중의 인싸', ISTJ:'엑셀 인간화', ISFJ:'프로수발러', ESTJ:'효율 집착 광공', ESFJ:'핵인싸 총무', ISTP:'효율 낭만파', ISFP:'누워있는 예술가', ESTP:'브레이크 고장', ESFP:'인간 핫식스' };
const AVATAR_PALETTE = ['#FF3300','#4A154B','#00C853','#FF007F','#7000FF','#FF9100','#00B0FF','#1A1A1A'];

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const uid = (prefix='id') => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
const hash = s => { let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return Math.abs(h); };
const pickColor = seed => AVATAR_PALETTE[hash(String(seed))%AVATAR_PALETTE.length];
const initial = name => (name||'?').trim().charAt(0);
const clamp = (n,min,max) => Math.max(min, Math.min(max, n));

const DEFAULT_STATE = { settings: { theme: 'dark' }, profile: null, customMembers: [], teams: [], penalty: false };
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

function bindSheetSwipeDown() {
  const sheet = $('#sheet'); if (!sheet) return;
  let start = null, dy = 0;
  const handle = sheet.querySelector('.sheet-handle');
  const onDown = (e) => {
    if (e.target !== handle && !e.target.closest('.sheet-handle')) return;
    start = e.clientY; dy = 0;
    sheet.style.transition = 'none';
  };
  const onMove = (e) => {
    if (start === null) return;
    dy = Math.max(0, e.clientY - start);
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const onUp = () => {
    if (start === null) return;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 80) Sheet.close();
    start = null; dy = 0;
  };
  sheet.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

/* ===================================================================
   MZ VIBE AI ENGINE
   =================================================================== */
const AIEngine = {
  /* ---------- 두 멤버 간 페어 시너지 ---------- */
  evaluateInteraction(m1, m2) {
    if (!m1 || !m2) return 0;
    let score = 0;
    // MBTI 4축 다양성 (S/N 가장 중요, J/P 두번째, T/F 세번째, E/I 보너스)
    if (m1[1] !== m2[1]) score += 15;
    if (m1[3] !== m2[3]) score += 10;
    if (m1[2] !== m2[2]) score += 8;
    if (m1[0] !== m2[0]) score += 5;
    // 완전 동일 MBTI 패널티
    if (m1 === m2) score -= 8;
    return score;
  },

  /* ---------- 종합 분석 (MBTI + 혈액형 + 성별 + 가족 + 취미 모두 반영) ---------- */
  analyze(memberIds) {
    const empty = { scores: { leadership: 0, execution: 0, creativity: 0, analysis: 0, empathy: 0 }, overall: 0, insights: [], count: 0, title: '비어있는 스쿼드' };
    const members = memberIds.map(id => Store.member(id)).filter(Boolean);
    if (!members.length) return empty;

    // === 1. MBTI 기반 5각 능력치 (각 멤버 평균) ===
    let raw = { leadership: 0, execution: 0, creativity: 0, analysis: 0, empathy: 0 };
    let roles = { planner: 0, executor: 0, mediator: 0, analyst: 0, leader: 0 };

    members.forEach(m => {
      const mb = (m.mbti || 'XXXX').toUpperCase();
      if (mb[0] === 'E') { raw.leadership += 25; raw.empathy += 8; roles.leader++; }
      else if (mb[0] === 'I') { raw.analysis += 15; raw.creativity += 10; }

      if (mb[1] === 'S') { raw.execution += 30; raw.analysis += 8; roles.executor++; }
      else if (mb[1] === 'N') { raw.creativity += 30; raw.empathy += 5; roles.planner++; }

      if (mb[2] === 'T') { raw.analysis += 25; raw.leadership += 7; roles.analyst++; }
      else if (mb[2] === 'F') { raw.empathy += 30; raw.creativity += 5; roles.mediator++; }

      if (mb[3] === 'J') { raw.execution += 18; raw.leadership += 10; }
      else if (mb[3] === 'P') { raw.creativity += 20; raw.empathy += 5; }
    });
    Object.keys(raw).forEach(k => raw[k] = raw[k] / members.length);

    // === 2. 보너스 (다양성/시너지) ===
    let bonus = 0;
    const tags = new Set();

    if (members.length >= 2) {
      // MBTI 4축 다양성
      const axisDiverse = [0, 1, 2, 3].map(i =>
        new Set(members.map(m => (m.mbti || '')[i]).filter(Boolean)).size >= 2 ? 1 : 0
      );
      const mbtiDiv = axisDiverse.reduce((a, b) => a + b, 0);
      bonus += mbtiDiv * 5;
      if (mbtiDiv >= 3) tags.add('mbti_diverse');
      if (mbtiDiv <= 1) tags.add('mbti_similar');

      // 페어 시너지 평균
      let pairSum = 0, pairs = 0;
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          pairSum += this.evaluateInteraction(members[i].mbti, members[j].mbti);
          pairs++;
        }
      }
      const avgPair = pairs ? pairSum / pairs : 0;
      bonus += avgPair * 0.6;
      if (avgPair >= 25) tags.add('synergy_high');
      if (avgPair < 5) tags.add('synergy_low');

      // 혈액형 다양성
      const bloods = members.map(m => m.bloodType).filter(Boolean);
      if (bloods.length >= 2) {
        const uniq = new Set(bloods).size;
        bonus += Math.min(uniq - 1, 3) * 4;
        if (uniq === Math.min(members.length, 4) && members.length >= 3) tags.add('blood_all_diverse');
        if (uniq === 1 && bloods.length === members.length) tags.add('blood_same');
      }

      // 성별 밸런스
      const genders = members.map(m => m.gender).filter(g => g && g !== '선택안함');
      if (genders.length >= 2) {
        const uniq = new Set(genders).size;
        if (uniq >= 2) { bonus += 8; tags.add('gender_mix'); }
      }

      // 가족관계 다양성
      const fams = members.map(m => m.family).filter(Boolean);
      if (fams.length >= 2) {
        const uniq = new Set(fams.map(f => f.trim().toLowerCase())).size;
        if (uniq >= 2) { bonus += 5; tags.add('family_diverse'); }
      }

      // 취미 다양성
      const hobs = members.map(m => m.hobbies).filter(Boolean);
      if (hobs.length >= 2) {
        const uniq = new Set(hobs.map(h => h.trim().toLowerCase())).size;
        if (uniq >= Math.max(2, members.length - 1)) { bonus += 4; tags.add('hobby_diverse'); }
      }

      // 4역할 풀패키지
      const filled = (roles.planner > 0 ? 1 : 0) + (roles.executor > 0 ? 1 : 0)
                   + (roles.analyst > 0 ? 1 : 0) + (roles.mediator > 0 ? 1 : 0);
      bonus += filled * 3;
      if (filled === 4) { bonus += 10; tags.add('dream_team'); }
      if (roles.leader > 0) bonus += 3;
      if (roles.planner > 0 && roles.executor === 0) tags.add('all_planner');
      if (roles.analyst > members.length / 2) tags.add('too_T');
      if (roles.mediator > members.length / 2) tags.add('too_F');
    } else {
      tags.add('solo');
    }

    // 팀 사이즈
    const n = members.length;
    bonus += n === 1 ? -8 : n === 2 ? 4 : n <= 5 ? 7 : n <= 7 ? 3 : -5;

    // === 3. 최종 점수 ===
    const scores = {};
    Object.keys(raw).forEach(k => {
      scores[k] = clamp(Math.round(raw[k] + Math.max(0, bonus) * 0.25), 15, 99);
    });
    const dimAvg = (scores.leadership + scores.execution + scores.creativity + scores.analysis + scores.empathy) / 5;
    const overall = clamp(Math.round(dimAvg * 0.5 + bonus * 0.4 + 18), 10, 99);

    // === 4. 인사이트 ===
    const insights = [];
    if (tags.has('all_planner'))   insights.push({ i: '🚨', t: '몽상가들의 파티 (실행력 떡락 주의)', d: '아이디어는 넷플릭스급인데, 막상 코딩할 사람이 없습니다. J나 S 성향의 멱살잡이 1명이 시급합니다.', type: 'warn' });
    else if (roles.planner > 0 && roles.executor > 0) insights.push({ i: '🚀', t: '티키타카 오지는 릴레이', d: 'N의 미친 발상을 S가 묵묵히 현실로 깎아내는 갓벽한 업무 파이프라인입니다.', type: 'ai' });
    if (tags.has('too_T'))         insights.push({ i: '🧊', t: 'T발 C야? 얼음송곳 팀', d: '효율과 논리가 지배하는 차가운 공간. 목표 달성은 빠르겠지만, 멘탈 나가는 팀원이 생길 수 있으니 칭찬을 의식적으로 해주세요.', type: 'warn' });
    if (tags.has('too_F'))         insights.push({ i: '💖', t: 'F들의 힐링 캠프', d: '서로 상처받을까봐 피드백을 못할 수도 있습니다. 일할 땐 조금 더 매운맛이 필요합니다.', type: 'warn' });
    if (tags.has('synergy_high'))  insights.push({ i: '🔥', t: '우주 최강 도파민 파티', d: '성향이 서로의 단점을 미친듯이 보완해줍니다. 케미스트리 폭발, 팀워크 1티어 조합입니다.', type: 'ai' });
    if (tags.has('dream_team'))    insights.push({ i: '👑', t: '4역할 풀패키지 드림팀', d: '기획(N)·실행(S)·분석(T)·공감(F) 모든 영역에 사람이 있는 완전체. 회사가 좋아할 그림.', type: 'ai' });
    if (tags.has('gender_mix'))    insights.push({ i: '🌗', t: '성비 골든밸런스', d: '다양한 관점이 회의실을 더 다채롭게. 결과물의 포용성이 +20%.', type: 'ai' });
    if (tags.has('blood_all_diverse')) insights.push({ i: '🩸', t: '혈액형 풀세트 콜렉터', d: 'A·B·O·AB가 다 모이면 한국식 편견을 한 번에 시험할 수 있어요. 보너스 케미.', type: 'ai' });
    if (tags.has('blood_same'))    insights.push({ i: '🩸', t: '단일 혈액형 군단', d: '같은 혈액형끼리 모인 단단한 결속. 단, 새로운 자극은 좀 부족할 수 있어요.', type: 'warn' });
    if (tags.has('family_diverse')) insights.push({ i: '🏡', t: '인생경험 다양도 만렙', d: '다양한 가족 배경이 의사결정의 시야를 넓혀줍니다.', type: 'ai' });
    if (tags.has('hobby_diverse')) insights.push({ i: '🎨', t: '덕질 풀스펙트럼', d: '서로 다른 관심사가 회식 메뉴 고르는 재미를 +10%.', type: 'ai' });
    if (tags.has('mbti_similar'))  insights.push({ i: '🪞', t: '끼리끼리 거울방', d: '생각이 너무 비슷합니다. 가끔은 다른 결의 의견이 그리울 수도.', type: 'warn' });
    if (tags.has('solo'))          insights.push({ i: '🧍', t: '솔로 모드', d: '혼자선 종합 시너지 계산이 어려워요. 동료 1명 이상 추가해 보세요.', type: 'warn' });
    if (insights.length === 0)     insights.push({ i: '⚖️', t: '육각형 안정형 팟', d: '모난 곳 없이 밸런스가 좋습니다. 무난하게 프로젝트를 폭파시킬 수 있는 든든한 조합.', type: 'ai' });

    // === 5. 타이틀 ===
    let title;
    if (overall >= 90) title = 'S급 전설의 레전드 스쿼드 👑';
    else if (overall >= 80) title = '갓벽 시너지 A급 스쿼드 ⚡';
    else if (overall >= 70) title = '포텐 터지는 스쿼드 🚀';
    else if (overall >= 60) title = '균형 잡힌 안정형 스쿼드 ✨';
    else if (overall >= 50) title = '쓸만한 도파민 스쿼드 🎯';
    else if (overall >= 40) title = '아쉬운 케미 스쿼드 🤔';
    else title = '병맛 형벌 스쿼드 ⚠️';

    return { scores, overall, insights, count: members.length, title };
  },

  /* ---------- AI 추천: 현재 셀렉션을 가장 많이 끌어올리는 멤버 1명 ---------- */
  recommend(selectedIds, pool) {
    if (!pool.length) return [];
    const base = selectedIds.length ? this.analyze(selectedIds) : { overall: 0 };
    let best = null, maxGain = -Infinity;
    pool.filter(p => !selectedIds.includes(p.id)).forEach(c => {
      const sim = this.analyze([...selectedIds, c.id]);
      const gain = sim.overall - base.overall;
      if (gain > maxGain) { maxGain = gain; best = c.id; }
    });
    return (best && maxGain > 0) ? [best] : [];
  }
};

/* ===================================================================
   ARCADE SOUND ENGINE — 마림바/우드 또각또각 + 조약돌 톤
   - 사인 기본파 + 옥타브 배음 + 짧은 밴드패스 노이즈 트랜지언트
   - 펜타토닉 멜로디로 항상 듣기 좋은 화성
   =================================================================== */
const SFX = {
  _ctx: null,
  _master: null,
  _reverb: null,
  _muted: false,
  ctx() {
    if (!this._ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this._ctx = new AC();
        this._master = this._ctx.createGain();
        this._master.gain.value = 0.55;
        const comp = this._ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4;
        comp.attack.value = 0.003; comp.release.value = 0.12;
        this._master.connect(comp); comp.connect(this._ctx.destination);
        this._reverb = this._buildReverb();
        if (this._reverb) {
          const wet = this._ctx.createGain(); wet.gain.value = 0.18;
          this._reverb.connect(wet); wet.connect(this._master);
        }
      } catch (e) { return null; }
    }
    if (this._ctx.state === 'suspended') { try { this._ctx.resume(); } catch (_) {} }
    return this._ctx;
  },
  _buildReverb() {
    try {
      const ctx = this._ctx;
      const conv = ctx.createConvolver();
      const sr = ctx.sampleRate, len = sr * 0.6;
      const ir = ctx.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
      }
      conv.buffer = ir; return conv;
    } catch (_) { return null; }
  },
  setMuted(m) { this._muted = !!m; if (this._master) this._master.gain.value = m ? 0 : 0.55; },

  /* ---------- 마림바/우드블록 톤: 사인 기본 + 옥타브 배음 + 짧은 BP 노이즈 클릭 ---------- */
  _wood({ freq = 700, dur = 0.18, vol = 0.28, harmonic = true, click = true, send = 0.25 }) {
    if (this._muted) return;
    const ctx = this.ctx(); if (!ctx) return;
    const t = ctx.currentTime;
    const bus = ctx.createGain(); bus.gain.value = 1;
    bus.connect(this._master);
    if (this._reverb && send > 0) {
      const sendGain = ctx.createGain(); sendGain.gain.value = send;
      bus.connect(sendGain); sendGain.connect(this._reverb);
    }

    const fund = ctx.createOscillator();
    fund.type = 'sine';
    fund.frequency.setValueAtTime(freq, t);
    const fg = ctx.createGain();
    fg.gain.setValueAtTime(0.0001, t);
    fg.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    fg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    fund.connect(fg); fg.connect(bus);
    fund.start(t); fund.stop(t + dur + 0.03);

    if (harmonic) {
      const h = ctx.createOscillator();
      h.type = 'sine';
      h.frequency.setValueAtTime(freq * 2, t);
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.0001, t);
      hg.gain.exponentialRampToValueAtTime(vol * 0.32, t + 0.003);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.55);
      h.connect(hg); hg.connect(bus);
      h.start(t); h.stop(t + dur + 0.03);

      const h3 = ctx.createOscillator();
      h3.type = 'sine';
      h3.frequency.setValueAtTime(freq * 3, t);
      const h3g = ctx.createGain();
      h3g.gain.setValueAtTime(0.0001, t);
      h3g.gain.exponentialRampToValueAtTime(vol * 0.14, t + 0.002);
      h3g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.35);
      h3.connect(h3g); h3g.connect(bus);
      h3.start(t); h3.stop(t + dur + 0.03);
    }

    if (click) {
      const cl = 0.012;
      const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * cl), ctx.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const ns = ctx.createBufferSource(); ns.buffer = nb;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = Math.min(6500, freq * 2.2); bp.Q.value = 4.5;
      const ng = ctx.createGain(); ng.gain.value = vol * 0.55;
      ns.connect(bp); bp.connect(ng); ng.connect(bus);
      ns.start(t);
    }
  },

  /* ---------- 조약돌: 둥글둥글한 사인파, 살짝 떨어지는 피치 ---------- */
  _pebble({ freq = 900, dur = 0.10, vol = 0.22 }) {
    if (this._muted) return;
    const ctx = this.ctx(); if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.35, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this._master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  _melody(notes, step = 60, vol = 0.28, opts = {}) {
    notes.forEach((freq, i) => {
      setTimeout(() => this._wood({ freq, dur: opts.dur || 0.22, vol, harmonic: true, send: opts.send ?? 0.3 }), i * step);
    });
  },

  // 펜타토닉 음역 (C 메이저: C D E G A) — 항상 화성적으로 듣기 좋음
  _PENT: [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51],

  // === 게임 액션 사운드 ===
  move()     { this._wood({ freq: 659.25, dur: 0.07, vol: 0.18, harmonic: false, send: 0.15 }); },
  rotate()   { this._wood({ freq: 987.77, dur: 0.10, vol: 0.22, harmonic: true,  send: 0.25 }); },
  softDrop() { this._wood({ freq: 523.25, dur: 0.05, vol: 0.16, harmonic: false, click: false, send: 0.1 }); },
  hardDrop() {
    this._wood({ freq: 392, dur: 0.18, vol: 0.30, harmonic: true, send: 0.4 });
    this._pebble({ freq: 196, dur: 0.22, vol: 0.18 });
  },
  lock()     { this._wood({ freq: 440, dur: 0.12, vol: 0.26, harmonic: true, send: 0.3 }); },

  lineClear(n) {
    const p = this._PENT;
    const seq = n === 1 ? [p[0], p[2], p[4]]
              : n === 2 ? [p[0], p[2], p[4], p[5]]
              : n === 3 ? [p[0], p[2], p[4], p[5], p[6]]
              :           [p[0], p[2], p[4], p[5], p[6], p[7]];
    this._melody(seq, 55, 0.3, { dur: 0.28, send: 0.45 });
  },
  levelUp()  { this._melody([523.25, 659.25, 783.99, 1046.5], 70, 0.3, { dur: 0.22, send: 0.4 }); },
  gameOver() { this._melody([523.25, 466.16, 392, 311.13, 261.63], 130, 0.28, { dur: 0.32, send: 0.5 }); },
  win()      { this._melody([523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98], 80, 0.32, { dur: 0.28, send: 0.55 }); },

  tap()      { this._wood({ freq: 1318.51, dur: 0.05, vol: 0.14, harmonic: false, send: 0.1 }); },
};

function playPebble() { SFX.lock(); }

/* ===================================================================
   ROUTING & VIEWS
   =================================================================== */
const Router = {
  current: null,
  history: [],
  go(name, params={}, opts={}){
    if (this.current && !opts.replace) this.history.push(this.current);
    this.current = { name, params };
    $('#stage').innerHTML = `<div class="screen fade-in">${Views[name](params)}</div>`;
    if(Views[name].mount) Views[name].mount(params);
    const showTabs = ['home','teams','settings'].includes(name);
    $('#tabBar').classList.toggle('hidden', !showTabs);
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  },
  back(fallback='home'){
    const prev = this.history.pop();
    if (prev) { this.current = null; this.go(prev.name, prev.params, { replace: true }); }
    else this.go(fallback);
  }
};

const avatarHTML = m => `<div class="avatar avatar-md" style="background:${pickColor(m.id)}">${esc(initial(m.name))}</div>`;
const Views = {};

/* --- HIGH-END MINIMAL SPLASH --- */
Views.splash = () => `
  <div class="screen" id="splash">
    <div class="splash-wrapper">
      <div id="splash-emblem">
        <div class="emblem-ring"></div>
        <div id="emblem-blocks" aria-hidden="true">
          <div class="t-piece t-giyeok">
            <span class="t-block" style="grid-area:1/1"></span>
            <span class="t-block" style="grid-area:1/2"></span>
            <span class="t-block" style="grid-area:1/3"></span>
            <span class="t-block" style="grid-area:2/3"></span>
          </div>
          <div class="t-piece t-nieun">
            <span class="t-block" style="grid-area:2/1"></span>
            <span class="t-block" style="grid-area:3/1"></span>
            <span class="t-block" style="grid-area:3/2"></span>
            <span class="t-block" style="grid-area:3/3"></span>
          </div>
          <div class="lock-flash" aria-hidden="true"></div>
        </div>
      </div>
      <div id="splash-text">
        <div class="splash-copy">너랑 나랑 맞을까?</div>
        <div class="splash-title">One Team</div>
      </div>
    </div>
  </div>
`;

Views.splash.mount = () => {
  const splash = $('#splash');
  let done = false;
  const go = () => {
    if (done) return; done = true;
    splash.classList.add('out');
    Router.history = [];
    setTimeout(() => {
      Store.state.profile && Store.state.profile.name ? Router.go('home') : Router.go('analyze');
    }, 600);
  };
  setTimeout(() => { Haptic.light(); }, 200);
  splash.addEventListener('pointerdown', () => { SFX.tap(); go(); }, { once: true });
  setTimeout(go, 2600);
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
    <div class="app-header"><div class="left"><span class="h-title">어서와 처음이지~?</span></div></div>
    <div class="scroll">
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
Views.home.mount = () => { $$('[data-team]').forEach(b => b.addEventListener('click', () => { Haptic.light(); SFX.tap(); Router.go('teamDetail', { id: b.dataset.team }); })); };

/* ===================================================================
   TETRIS PENALTY ARCADE
   - 진짜 모바일 아케이드 게임 (사운드/햅틱/스코어/넥스트/홀드/고스트/레벨업)
   =================================================================== */
const TETRIS_GOAL_LINES = 3;

Views.tetris = () => `
  <div class="screen" id="tetris-screen">
    <div class="tetris-topbar">
      <button class="h-back" id="tBack" aria-label="나가기">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 19l-7-7 7-7"/></svg>
      </button>
      <div class="tetris-title">PENALTY ARCADE</div>
      <button class="tetris-pause" id="tPause" aria-label="일시정지">
        <svg viewBox="0 0 24 24" width="22" height="22"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
      </button>
    </div>

    <div class="tetris-mission">
      <span class="pulse-dot"></span>
      <span>매시업 50점 미만! <b>${TETRIS_GOAL_LINES}줄</b>을 부숴야 형벌 종료. 진행 <b id="tMissionLines">0</b>/${TETRIS_GOAL_LINES}</span>
    </div>

    <div class="tetris-stage">
      <div class="tetris-side">
        <div class="tet-stat">
          <div class="lbl">Score</div>
          <div class="val" id="tScore">0</div>
        </div>
        <div class="tet-stat">
          <div class="lbl">Level</div>
          <div class="val" id="tLevel">1</div>
        </div>
        <div class="tet-hold">
          <div class="lbl">Hold</div>
          <canvas id="tHoldCvs" width="60" height="60"></canvas>
        </div>
      </div>

      <div class="tetris-board-wrap">
        <div class="tetris-board" id="tBoardWrap">
          <canvas id="tCanvas" width="200" height="400"></canvas>
        </div>
      </div>

      <div class="tetris-side">
        <div class="tet-stat">
          <div class="lbl">Lines</div>
          <div class="val" id="tLines">0</div>
        </div>
        <div class="tet-next">
          <div class="lbl">Next</div>
          <canvas id="tNextCvs" width="60" height="60"></canvas>
        </div>
        <button class="tet-btn accent" id="tHold" style="height:auto;padding:10px 0;flex-direction:column;font-size:11px;letter-spacing:.1em;">
          <svg viewBox="0 0 24 24" width="20"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v6h-6"/></svg>
          HOLD
        </button>
      </div>
    </div>

    <div class="tetris-controls">
      <button class="tet-btn" id="tLeft" aria-label="왼쪽">
        <svg viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7"/></svg>
      </button>
      <button class="tet-btn accent" id="tRotate" aria-label="회전">
        <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v6h-6"/></svg>
      </button>
      <button class="tet-btn" id="tRight" aria-label="오른쪽">
        <svg viewBox="0 0 24 24"><path d="M9 19l7-7-7-7"/></svg>
      </button>
      <button class="tet-btn" id="tSoft" aria-label="아래">
        <svg viewBox="0 0 24 24"><path d="M19 12l-7 7-7-7"/></svg>
        <span class="sub">SOFT</span>
      </button>
      <button class="tet-btn primary wide" id="tDrop" aria-label="강하">
        <svg viewBox="0 0 24 24"><path d="M12 2v16"/><path d="M5 11l7 7 7-7"/></svg>
        <span class="sub" style="position:static;margin-left:8px;opacity:.85;">HARD DROP</span>
      </button>
    </div>

    <div class="tetris-overlay" id="tOverlay">
      <div class="tetris-overlay-card">
        <h3 id="tOverlayTitle">일시정지</h3>
        <p id="tOverlayMsg">잠깐 숨 고르기. 준비되면 재개하세요.</p>
        <div class="stack">
          <button class="btn btn-ai btn-block" id="tResume">계속하기</button>
          <button class="btn btn-secondary btn-block" id="tRestart">다시 시작</button>
          <button class="btn btn-block" id="tQuit" style="background:rgba(255,69,58,0.12);color:var(--bad);">탈출 포기 (홈으로)</button>
        </div>
      </div>
    </div>
  </div>
`;

Views.tetris.mount = () => {
  /* ---------- canvas setup with DPR scaling ---------- */
  const boardWrap = document.getElementById('tBoardWrap');
  const cvs = document.getElementById('tCanvas');
  const ctx = cvs.getContext('2d');
  const nextCvs = document.getElementById('tNextCvs');
  const nextCtx = nextCvs.getContext('2d');
  const holdCvs = document.getElementById('tHoldCvs');
  const holdCtx = holdCvs.getContext('2d');

  const COLS = 10, ROWS = 20;
  let SQ = 20;

  const resizeCanvas = () => {
    const stageEl = cvs.closest('.tetris-stage');
    const wrapEl = cvs.closest('.tetris-board-wrap');
    if (!stageEl || !wrapEl) return;
    const maxH = wrapEl.clientHeight - 16;
    const maxW = wrapEl.clientWidth - 16;
    const sqByH = Math.floor(maxH / ROWS);
    const sqByW = Math.floor(maxW / COLS);
    SQ = Math.max(14, Math.min(28, Math.min(sqByH, sqByW)));
    const w = COLS * SQ, h = ROWS * SQ;
    const dpr = window.devicePixelRatio || 1;
    cvs.style.width = w + 'px'; cvs.style.height = h + 'px';
    cvs.width = w * dpr; cvs.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    [nextCvs, holdCvs].forEach((c, i) => {
      const cctx = i === 0 ? nextCtx : holdCtx;
      const cs = parseFloat(getComputedStyle(c).width) || 60;
      c.width = cs * dpr; c.height = cs * dpr;
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    draw();
  };

  /* ---------- pieces (SRS-style) ---------- */
  const PIECES = {
    I: { color: '#00E0FF', shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
    O: { color: '#FFD600', shape: [[1,1],[1,1]] },
    T: { color: '#B266FF', shape: [[0,1,0],[1,1,1],[0,0,0]] },
    S: { color: '#32D74B', shape: [[0,1,1],[1,1,0],[0,0,0]] },
    Z: { color: '#FF453A', shape: [[1,1,0],[0,1,1],[0,0,0]] },
    J: { color: '#0A84FF', shape: [[1,0,0],[1,1,1],[0,0,0]] },
    L: { color: '#FF9F0A', shape: [[0,0,1],[1,1,1],[0,0,0]] },
  };
  const KEYS = Object.keys(PIECES);

  /* ---------- state ---------- */
  let board, current, next, holdPiece, hasHeld, bag, lines, score, level, missionLines, dropMs, lastDrop, raf, gameOver, paused;

  const initState = () => {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    bag = [];
    current = nextPiece();
    next = nextPiece();
    holdPiece = null; hasHeld = false;
    lines = 0; score = 0; level = 1; missionLines = 0;
    dropMs = 800; lastDrop = performance.now();
    gameOver = false; paused = false;
    updateHUD();
  };

  function refillBag() {
    const arr = KEYS.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    bag = arr;
  }
  function nextPiece() {
    if (!bag.length) refillBag();
    const k = bag.pop();
    const def = PIECES[k];
    const shape = def.shape.map(r => r.slice());
    return { key: k, color: def.color, shape, x: Math.floor((COLS - shape[0].length) / 2), y: -getTopOffset(shape) };
  }
  function getTopOffset(shape) {
    for (let r = 0; r < shape.length; r++) if (shape[r].some(v => v)) return r;
    return 0;
  }

  /* ---------- collision & rotation ---------- */
  function collide(x, y, shape, b = board) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nx = x + c, ny = y + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny < 0) continue;
        if (b[ny][nx]) return true;
      }
    }
    return false;
  }
  function rotateShape(shape) {
    const n = shape.length, m = shape[0].length;
    const out = Array.from({ length: m }, () => Array(n).fill(0));
    for (let r = 0; r < n; r++) for (let c = 0; c < m; c++) out[c][n - 1 - r] = shape[r][c];
    return out;
  }
  function tryRotate() {
    if (current.key === 'O') return false;
    const rotated = rotateShape(current.shape);
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (!collide(current.x + k, current.y, rotated)) {
        current.shape = rotated; current.x += k;
        return true;
      }
    }
    return false;
  }

  /* ---------- ghost ---------- */
  function ghostY() {
    let y = current.y;
    while (!collide(current.x, y + 1, current.shape)) y++;
    return y;
  }

  /* ---------- merge & line clear ---------- */
  function lockPiece() {
    let topRow = current.y;
    for (let r = 0; r < current.shape.length; r++) {
      for (let c = 0; c < current.shape[r].length; c++) {
        if (current.shape[r][c]) {
          const y = current.y + r, x = current.x + c;
          if (y < 0) { triggerGameOver(); return; }
          board[y][x] = current.color;
          if (y < topRow) topRow = y;
        }
      }
    }
    SFX.lock();
    Haptic.light();

    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(v => v)) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(0));
        cleared++; r++;
      }
    }
    if (cleared > 0) {
      const pts = [0, 100, 300, 500, 800][cleared] * level;
      score += pts;
      lines += cleared;
      missionLines += cleared;
      const prevLevel = level;
      level = 1 + Math.floor(lines / 5);
      dropMs = Math.max(120, 800 - (level - 1) * 70);
      SFX.lineClear(cleared);
      Haptic.heavy();
      flashBoard();
      floatScore(`+${pts}${cleared === 4 ? ' TETRIS!' : ''}`);
      if (level > prevLevel) { SFX.levelUp(); flashStat('tLevel'); Toast.show(`레벨 ${level} 돌입! 속도 업`, '⚡', 1400); }
      flashStat('tScore'); flashStat('tLines');
      updateHUD();
      if (missionLines >= TETRIS_GOAL_LINES) { triggerWin(); return; }
    } else {
      updateHUD();
    }

    current = next;
    next = nextPiece();
    hasHeld = false;
    if (collide(current.x, current.y, current.shape)) triggerGameOver();
  }

  function flashBoard() {
    boardWrap.classList.remove('flash'); void boardWrap.offsetWidth; boardWrap.classList.add('flash');
    boardWrap.classList.remove('shake'); void boardWrap.offsetWidth; boardWrap.classList.add('shake');
  }
  function flashStat(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
  function floatScore(text) {
    const wrap = document.querySelector('.tetris-board-wrap'); if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'tet-floating-score'; el.textContent = text;
    el.style.left = '50%'; el.style.top = '40%';
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  /* ---------- movement ---------- */
  function move(dx) {
    if (paused || gameOver) return;
    if (!collide(current.x + dx, current.y, current.shape)) {
      current.x += dx;
      SFX.move(); Haptic.light(); draw();
    }
  }
  function rotate() {
    if (paused || gameOver) return;
    if (tryRotate()) { SFX.rotate(); Haptic.light(); draw(); }
  }
  function softDrop() {
    if (paused || gameOver) return;
    if (!collide(current.x, current.y + 1, current.shape)) {
      current.y++; score += 1; SFX.softDrop(); updateHUD(); draw();
    } else {
      lockPiece(); draw();
    }
    lastDrop = performance.now();
  }
  function hardDrop() {
    if (paused || gameOver) return;
    let d = 0;
    while (!collide(current.x, current.y + 1, current.shape)) { current.y++; d++; }
    score += d * 2;
    SFX.hardDrop(); Haptic.heavy();
    lockPiece(); draw(); updateHUD();
    lastDrop = performance.now();
  }
  function doHold() {
    if (paused || gameOver || hasHeld) return;
    SFX.rotate(); Haptic.light();
    const cur = { key: current.key, color: current.color, shape: PIECES[current.key].shape.map(r => r.slice()) };
    if (holdPiece) {
      const swap = holdPiece;
      holdPiece = cur;
      current = { ...swap, x: Math.floor((COLS - swap.shape[0].length) / 2), y: -getTopOffset(swap.shape) };
    } else {
      holdPiece = cur;
      current = next;
      next = nextPiece();
    }
    hasHeld = true;
    draw();
  }

  /* ---------- drawing ---------- */
  function drawBlock(cctx, x, y, size, color) {
    const r = Math.max(2, Math.floor(size * 0.18));
    cctx.fillStyle = color;
    roundRect(cctx, x + 1, y + 1, size - 2, size - 2, r);
    cctx.fill();
    const grad = cctx.createLinearGradient(x, y, x, y + size);
    grad.addColorStop(0, 'rgba(255,255,255,0.45)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.35)');
    cctx.fillStyle = grad;
    roundRect(cctx, x + 1, y + 1, size - 2, size - 2, r);
    cctx.fill();
    cctx.strokeStyle = 'rgba(255,255,255,0.25)';
    cctx.lineWidth = 1.5;
    roundRect(cctx, x + 2, y + 2, size - 4, size - 4, Math.max(1, r - 2));
    cctx.stroke();
  }
  function drawGhost(cctx, x, y, size) {
    cctx.save();
    cctx.fillStyle = 'rgba(255,255,255,0.08)';
    cctx.strokeStyle = 'rgba(255,255,255,0.35)';
    cctx.lineWidth = 1.5;
    cctx.setLineDash([3, 3]);
    const r = Math.max(2, Math.floor(size * 0.18));
    roundRect(cctx, x + 2, y + 2, size - 4, size - 4, r);
    cctx.fill(); cctx.stroke();
    cctx.restore();
  }
  function roundRect(cctx, x, y, w, h, r) {
    cctx.beginPath();
    cctx.moveTo(x + r, y);
    cctx.arcTo(x + w, y, x + w, y + h, r);
    cctx.arcTo(x + w, y + h, x, y + h, r);
    cctx.arcTo(x, y + h, x, y, r);
    cctx.arcTo(x, y, x + w, y, r);
    cctx.closePath();
  }

  function draw() {
    const w = COLS * SQ, h = ROWS * SQ;
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) { ctx.beginPath(); ctx.moveTo(i * SQ, 0); ctx.lineTo(i * SQ, h); ctx.stroke(); }
    for (let i = 1; i < ROWS; i++) { ctx.beginPath(); ctx.moveTo(0, i * SQ); ctx.lineTo(w, i * SQ); ctx.stroke(); }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (board[r][c]) drawBlock(ctx, c * SQ, r * SQ, SQ, board[r][c]);
    }
    if (current && !gameOver) {
      const gy = ghostY();
      for (let r = 0; r < current.shape.length; r++) {
        for (let c = 0; c < current.shape[r].length; c++) {
          if (current.shape[r][c] && gy + r >= 0) {
            drawGhost(ctx, (current.x + c) * SQ, (gy + r) * SQ, SQ);
          }
        }
      }
      for (let r = 0; r < current.shape.length; r++) {
        for (let c = 0; c < current.shape[r].length; c++) {
          if (current.shape[r][c] && current.y + r >= 0) {
            drawBlock(ctx, (current.x + c) * SQ, (current.y + r) * SQ, SQ, current.color);
          }
        }
      }
    }
    drawMini(nextCtx, next);
    drawMini(holdCtx, holdPiece);
  }
  function drawMini(c, piece) {
    const size = parseFloat(c.canvas.style.width) || 60;
    c.clearRect(0, 0, size, size);
    if (!piece) return;
    const cells = [];
    let minR = piece.shape.length, maxR = 0, minC = piece.shape[0].length, maxC = 0;
    for (let r = 0; r < piece.shape.length; r++) for (let cc = 0; cc < piece.shape[r].length; cc++) {
      if (piece.shape[r][cc]) {
        cells.push([r, cc]);
        if (r < minR) minR = r; if (r > maxR) maxR = r;
        if (cc < minC) minC = cc; if (cc > maxC) maxC = cc;
      }
    }
    const w = maxC - minC + 1, h = maxR - minR + 1;
    const sq = Math.floor(Math.min((size - 8) / Math.max(w, h), 14));
    const offX = (size - w * sq) / 2, offY = (size - h * sq) / 2;
    cells.forEach(([r, cc]) => drawBlock(c, offX + (cc - minC) * sq, offY + (r - minR) * sq, sq, piece.color));
  }

  /* ---------- HUD ---------- */
  function updateHUD() {
    document.getElementById('tScore').textContent = score;
    document.getElementById('tLevel').textContent = level;
    document.getElementById('tLines').textContent = lines;
    const ml = document.getElementById('tMissionLines'); if (ml) ml.textContent = Math.min(missionLines, TETRIS_GOAL_LINES);
  }

  /* ---------- loop ---------- */
  function loop(now) {
    if (!paused && !gameOver) {
      if (now - lastDrop >= dropMs) {
        if (!collide(current.x, current.y + 1, current.shape)) { current.y++; }
        else { lockPiece(); }
        lastDrop = now;
        draw();
      }
    }
    raf = requestAnimationFrame(loop);
  }

  /* ---------- end states ---------- */
  function triggerWin() {
    gameOver = true; cancelAnimationFrame(raf);
    Store.state.penalty = false; Store.save();
    SFX.win(); Haptic.success();
    showOverlay('🎉 형벌 종료!', `${TETRIS_GOAL_LINES}줄 클리어 성공! 매시업을 다시 시도할 수 있어요.`, [
      { label: '홈으로 돌아가기', cls: 'btn-ai', onClick: () => Router.go('home') },
      { label: '한판 더', cls: 'btn-secondary', onClick: () => restart() },
    ]);
  }
  function triggerGameOver() {
    gameOver = true; cancelAnimationFrame(raf);
    SFX.gameOver(); Haptic.heavy();
    showOverlay('💀 GAME OVER', `점수: ${score}점 · 라인: ${lines}줄\n블록이 천장에 닿았어요. 다시 도전!`, [
      { label: '다시 시작', cls: 'btn-ai', onClick: () => restart() },
      { label: '탈출 포기', cls: '', extra: 'background:rgba(255,69,58,0.12);color:var(--bad);', onClick: () => Router.go('home') },
    ]);
  }
  function restart() {
    initState(); hideOverlay(); resizeCanvas();
    cancelAnimationFrame(raf); lastDrop = performance.now(); raf = requestAnimationFrame(loop);
  }

  /* ---------- overlay ---------- */
  const overlay = document.getElementById('tOverlay');
  function showOverlay(title, msg, actions) {
    const card = overlay.querySelector('.tetris-overlay-card');
    card.innerHTML = `
      <h3>${esc(title)}</h3>
      <p style="white-space:pre-line">${esc(msg)}</p>
      <div class="stack"></div>
    `;
    const stack = card.querySelector('.stack');
    actions.forEach(a => {
      const b = document.createElement('button');
      b.className = `btn btn-block ${a.cls || ''}`;
      if (a.extra) b.setAttribute('style', a.extra);
      b.textContent = a.label;
      b.addEventListener('click', () => { Haptic.light(); a.onClick(); });
      stack.appendChild(b);
    });
    overlay.classList.add('show');
  }
  function hideOverlay() { overlay.classList.remove('show'); }

  /* ---------- pause ---------- */
  function togglePause() {
    if (gameOver) return;
    paused = !paused;
    if (paused) {
      SFX.tap();
      showOverlay('일시정지', '잠깐 숨 고르기. 준비되면 재개하세요.', [
        { label: '계속하기', cls: 'btn-ai', onClick: () => { paused = false; hideOverlay(); lastDrop = performance.now(); } },
        { label: '다시 시작', cls: 'btn-secondary', onClick: () => restart() },
        { label: '탈출 포기 (홈으로)', cls: '', extra: 'background:rgba(255,69,58,0.12);color:var(--bad);', onClick: () => Router.go('home') },
      ]);
    } else { hideOverlay(); lastDrop = performance.now(); }
  }

  /* ---------- input bindings ---------- */
  const bind = (id, fn, opts = {}) => {
    const el = document.getElementById(id); if (!el) return;
    const trigger = (e) => { e.preventDefault(); el.classList.add('pressed'); SFX.ctx(); fn(); };
    const release = () => el.classList.remove('pressed');
    el.addEventListener('pointerdown', trigger);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);

    if (opts.repeat) {
      let holdT = null, repT = null;
      el.addEventListener('pointerdown', () => {
        clearTimeout(holdT); clearInterval(repT);
        holdT = setTimeout(() => { repT = setInterval(fn, opts.repeat); }, 220);
      });
      const stop = () => { clearTimeout(holdT); clearInterval(repT); };
      el.addEventListener('pointerup', stop);
      el.addEventListener('pointercancel', stop);
      el.addEventListener('pointerleave', stop);
    }
  };
  bind('tLeft', () => move(-1), { repeat: 80 });
  bind('tRight', () => move(1), { repeat: 80 });
  bind('tSoft', () => softDrop(), { repeat: 50 });
  bind('tRotate', rotate);
  bind('tDrop', hardDrop);
  bind('tHold', doHold);
  bind('tPause', togglePause);

  document.getElementById('tBack').addEventListener('click', () => {
    paused = true;
    showOverlay('정말 나갈까요?', '진행 상황은 저장되지 않아요.', [
      { label: '계속 도전', cls: 'btn-ai', onClick: () => { paused = false; hideOverlay(); lastDrop = performance.now(); } },
      { label: '홈으로 (탈출 포기)', cls: '', extra: 'background:rgba(255,69,58,0.12);color:var(--bad);', onClick: () => Router.go('home') },
    ]);
  });

  /* ---------- touch swipe on board ---------- */
  let touchStart = null, lastSwipe = 0;
  cvs.addEventListener('pointerdown', (e) => { touchStart = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  cvs.addEventListener('pointermove', (e) => {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
    if (Math.abs(dx) > SQ && Date.now() - lastSwipe > 80) {
      move(dx > 0 ? 1 : -1);
      touchStart = { x: e.clientX, y: e.clientY, t: Date.now() };
      lastSwipe = Date.now();
    } else if (dy > SQ * 1.2 && Date.now() - lastSwipe > 60) {
      softDrop();
      touchStart = { x: e.clientX, y: e.clientY, t: Date.now() };
      lastSwipe = Date.now();
    }
  });
  cvs.addEventListener('pointerup', (e) => {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y, dt = Date.now() - touchStart.t;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && dt < 200) rotate();
    else if (dy > SQ * 4 && dt < 300) hardDrop();
    touchStart = null;
  });

  /* ---------- keyboard (optional desktop test) ---------- */
  const keyHandler = (e) => {
    if (e.key === 'ArrowLeft') move(-1);
    else if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowDown') softDrop();
    else if (e.key === 'ArrowUp' || e.key === 'x' || e.key === 'X') rotate();
    else if (e.key === ' ') { e.preventDefault(); hardDrop(); }
    else if (e.key === 'c' || e.key === 'C' || e.key === 'Shift') doHold();
    else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
  };
  window.addEventListener('keydown', keyHandler);

  const ro = new ResizeObserver(resizeCanvas);
  ro.observe(boardWrap);

  /* cleanup on route change */
  const origGo = Router.go;
  Router.go = function (name, params, opts) {
    if (Router.current && Router.current.name === 'tetris' && name !== 'tetris') {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', keyHandler);
      try { ro.disconnect(); } catch (_) {}
      Router.go = origGo;
    }
    return origGo.call(this, name, params, opts);
  };

  /* ---------- go! ---------- */
  initState();
  resizeCanvas();
  SFX.ctx();
  raf = requestAnimationFrame(loop);
};

/* --- TEAMS & DETAIL --- */
Views.teams = () => `
  <div class="app-header"><div class="left"><span class="h-title">내 스쿼드</span></div></div>
  <div class="scroll">
    <div class="stack" id="teamListContainer"></div>
  </div>
`;
Views.teams.mount = () => {
  const container = $('#teamListContainer');
  if (!Store.state.teams.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:48px 20px 24px;color:var(--muted);font-weight:700;">
        <div style="font-size:48px;margin-bottom:12px;">🧩</div>
        <div style="font-size:16px;color:var(--ink);margin-bottom:6px;">아직 만든 스쿼드가 없어요</div>
        <div style="font-size:13px;color:var(--muted);">AI가 도와줄게요. 첫 스쿼드를 만들어볼까요?</div>
      </div>
      <button class="btn btn-ai btn-block" onclick="Router.go('teamBuilder')" style="height:64px; font-size:17px; border-radius:20px; box-shadow:0 12px 24px rgba(255,51,0,0.3);">
        ✨ 첫 스쿼드 만들기
      </button>`;
    return;
  }
  container.innerHTML = Store.state.teams.map(t => {
    const a = AIEngine.analyze(t.memberIds);
    return `<button class="team-card" data-team="${t.id}"><div class="team-card-name"><span>${esc(t.name)}</span><span style="color:var(--accent); font-weight:900;">${a.overall}점</span></div><div class="team-card-meta">${a.title}</div><div class="team-avatars">${t.memberIds.slice(0,5).map(id => avatarHTML(Store.member(id))).join('')}</div></button>`;
  }).join('');
  $$('[data-team]').forEach(b => b.addEventListener('click', () => { Haptic.light(); SFX.tap(); Router.go('teamDetail', { id: b.dataset.team }); }));
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
    <div class="scroll no-tab" style="padding-bottom:120px;">
      <h2 style="font-size:28px; font-weight:900; margin-bottom:24px; letter-spacing:-0.04em;">${esc(team.name)}</h2>
      
      <div id="insightContent" style="min-height:400px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <div style="font-size:40px; animation: pulseGlow 1s infinite alternate;">✨</div>
        <div class="typing-effect" style="margin-top:16px; font-weight:800; font-size:16px; color:var(--accent);">AI가 케미스트리를 분석 중입니다...</div>
      </div>
    </div>
    
    <div style="position:absolute; bottom:0; left:0; right:0; padding:16px 22px calc(16px + var(--safe-bottom)); background:linear-gradient(transparent, var(--paper) 40%); pointer-events:none;">
      <button class="btn btn-ai btn-block" id="btnShare" style="pointer-events:auto; box-shadow:0 12px 30px rgba(255,51,0,0.3);">
        <svg viewBox="0 0 24 24" width="20"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        결과 자랑하기 (스토리 공유)
      </button>
    </div>
  `;
};

function renderRadarChart(data) {
  const size = 240, cx = size / 2, cy = size / 2, r = 90;
  const n = data.length;
  const angle = (i) => (Math.PI * 2 * i / n) - Math.PI / 2;
  const pt = (i, mag) => [cx + Math.cos(angle(i)) * r * mag, cy + Math.sin(angle(i)) * r * mag];

  const rings = [0.25, 0.5, 0.75, 1].map(m => {
    const pts = Array.from({ length: n }, (_, i) => pt(i, m).join(',')).join(' ');
    return `<polygon class="grid" points="${pts}"/>`;
  }).join('');
  const axes = Array.from({ length: n }, (_, i) => {
    const [x, y] = pt(i, 1);
    return `<line class="axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;
  }).join('');
  const areaPts = data.map((d, i) => pt(i, clamp(d.value, 0, 100) / 100).join(',')).join(' ');
  const points = data.map((d, i) => {
    const [x, y] = pt(i, clamp(d.value, 0, 100) / 100);
    return `<circle class="point" cx="${x}" cy="${y}" r="4"/>`;
  }).join('');
  const labels = data.map((d, i) => {
    const [x, y] = pt(i, 1.22);
    return `<text class="label" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${esc(d.label)}</text>`;
  }).join('');

  return `
    <div class="radar-wrap"><div class="radar">
      <svg viewBox="0 0 ${size} ${size}">
        ${rings}
        ${axes}
        <polygon class="area" points="${areaPts}"/>
        ${points}
        ${labels}
      </svg>
    </div></div>
  `;
}

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
  const team = Store.team(id);
  const share = $('#btnShare');
  if (share && team) {
    share.addEventListener('click', async () => {
      Haptic.success(); SFX.tap();
      const a = AIEngine.analyze(team.memberIds);
      const text = `[One Team] ${team.name}\n시너지 ${a.overall}점 — ${a.title}\n${a.insights.map(x => `• ${x.t}`).join('\n')}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: 'One Team — 우리 스쿼드', text });
          Toast.show('공유했어요!', '📤');
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
          Toast.show('결과를 클립보드에 복사했어요!', '📋');
        } else {
          Toast.show('이미지가 갤러리에 저장되었습니다!', '📸');
        }
      } catch (e) { /* user cancelled */ }
    });
  }

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
    <div class="scroll" id="builderList" style="padding:16px 16px calc(140px + var(--kb-inset));"></div>
    <div class="builder-bar show" id="builderBar">
      <div style="font-size:18px;font-weight:900;" id="builderCount">0명 선택</div>
      <button class="btn btn-ai" id="builderSave" style="height:60px; padding:0 22px; border-radius:99px; font-size:16px; box-shadow:0 10px 24px rgba(255,51,0,0.35);">매시업 믹스 🚀</button>
    </div>
  `;
};
Views.teamBuilder.mount = () => {
  if (Store.state.penalty) {
    Toast.show('형벌을 마치지 않았습니다! 테트리스장으로 강제 연행됩니다.', '🚨', 3000);
    return Router.go('tetris');
  }

  const render = () => {
    const pool = [Store.state.profile, ...(Store.state.customMembers || [])].filter(Boolean);
    const addCta = `
      <button class="btn btn-ai btn-block" id="builderAddCta" style="height:64px; font-size:17px; border-radius:20px; box-shadow:0 12px 24px rgba(255,51,0,0.3); margin-top:8px;">
        <svg viewBox="0 0 24 24" width="20"><path d="M19 8v6M16 11h6"/><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        새 팀원 영입하기
      </button>`;

    if (pool.length === 0) {
      $('#builderList').innerHTML = `
        <div style="padding:48px 20px 24px;text-align:center;color:var(--muted); font-weight:700;">
          <div style="font-size:40px; margin-bottom:8px;">🫥</div>
          <div style="font-size:16px; color:var(--ink); margin-bottom:6px;">풀에 멤버가 없어요</div>
          <div style="font-size:13px; color:var(--muted); margin-bottom:24px;">아래 버튼으로 팀원을 영입해보세요</div>
        </div>
        ${addCta}`;
    } else {
      const list = pool.map(m => {
        const sel = BuilderState.selected.has(m.id), aiRec = BuilderState.recommended.has(m.id);
        const extra = [m.gender, m.bloodType, m.hobbies].filter(Boolean).join(' · ');
        const metaText = extra ? `${esc(m.mbti)} (${extra})` : `${esc(m.mbti)} · ${MBTI_LABELS[m.mbti] || ''}`;
        return `<button class="team-card builder-row ${sel ? 'selected' : ''} ${aiRec ? 'ai-recommended' : ''}" data-pick="${m.id}" style="margin-bottom:12px; padding:16px;">${avatarHTML(m)}<div class="builder-body"><div class="builder-name">${esc(m.name)}</div><div class="builder-meta">${metaText}</div></div><div class="check-ring"><svg viewBox="0 0 24 24" width="16"><path d="M5 12l4 4L19 7"/></svg></div></button>`;
      }).join('');
      $('#builderList').innerHTML = list + addCta;
    }
    $$('[data-pick]').forEach(b => b.addEventListener('click', () => {
      Haptic.light(); SFX.tap();
      const id = b.dataset.pick;
      BuilderState.selected.has(id) ? BuilderState.selected.delete(id) : BuilderState.selected.add(id);
      render();
    }));
    const addBtn = $('#builderAddCta');
    if (addBtn) addBtn.addEventListener('click', () => { Haptic.light(); SFX.tap(); $('#cmAddContact').click(); });
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

  // 패널티 테트리스 연동 로직
  $('#builderSave').addEventListener('click', () => {
    if(BuilderState.selected.size < 2) return Toast.show('스쿼드는 최소 2명이어야 해요!', '🚨');
    
    const currentSelected = Array.from(BuilderState.selected);
    const analysis = AIEngine.analyze(currentSelected);

    // 스쿼드 점수 50점 미만 시 형벌장 이동
    if (analysis.overall < 50) {
      Store.state.penalty = true;
      Store.save();
      Haptic.heavy();
      Toast.show('조합 점수 50점 미만! 형벌의 방으로 이동합니다.', '⚡', 3500);
      return Router.go('tetris');
    }

    const newTeamId = uid('t');
    Store.state.teams.push({ id: newTeamId, name: `도파민 스쿼드 #${Math.floor(Math.random()*999)}`, memberIds: currentSelected, createdAt: Date.now() });
    Store.save(); Haptic.success(); Router.go('teamDetail', {id: newTeamId});
  });

  $('#cmAddContact').addEventListener('click', () => {
    Sheet.open('새 멤버 영입', `
      <div class="stack" style="padding-top:8px;">
        <div class="field"><input class="input" id="cmName" placeholder="이름 (닉네임) 입력" style="font-size:20px; height:64px; text-align:center;" autocomplete="off" autocapitalize="off" autocorrect="off"/></div>
        
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

        <div class="field mt-8"><label class="field-label">가족 관계</label><input class="input" id="cmFamily" placeholder="예: 미혼, 형제 2명" autocomplete="off"/></div>

        <div class="field mt-8"><label class="field-label">취미 / 관심사</label><input class="input" id="cmHobbies" placeholder="예: 스케이트보드, 게임" autocomplete="off"/></div>

        <button class="btn btn-ai btn-block mt-16" id="cmSave" style="height:64px; font-size:18px; border-radius:20px; box-shadow:0 12px 24px rgba(255,51,0,0.3); margin-bottom:16px;">
          <svg viewBox="0 0 24 24" width="20"><path d="M5 12l4 4L19 7"/></svg>
          영입 완료
        </button>
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
        
        <div style="position:relative; z-index:2; display:flex; align-items:center; height:44px; margin-bottom:20px; margin-left:-8px;">
           ${backBtnHtml}
        </div>
        
        <div style="position:relative; z-index:2;">
          <h2 class="wiz-q" style="color:var(--ink);">당신의 <span style="background:var(--ai-grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">업무 DNA</span>를<br/>알려주세요.</h2>
          <p style="color:var(--muted); font-size:15px; font-weight:600; margin-top:12px;">AI가 가장 완벽한 시너지의 스쿼드를 짜드릴게요.</p>
        </div>
      </div>

      <div class="scroll no-tab" style="padding:32px 24px calc(140px + var(--kb-inset)); flex:1; background:transparent;">
        <div class="stack">
          <div class="field"><label class="field-label">호칭</label><input class="input" id="wizName" value="${esc(WizState.data.name)}" placeholder="이름 또는 닉네임" autocomplete="nickname" enterkeyhint="next"/></div>
          
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
          
          <div class="field mt-16"><label class="field-label">가족 관계</label><input class="input" id="wizFamily" value="${esc(WizState.data.family)}" placeholder="예: 기혼, 자녀 1명" autocomplete="off" enterkeyhint="next"/></div>

          <div class="field mt-16"><label class="field-label">취미 / 관심사</label><input class="input" id="wizHobbies" value="${esc(WizState.data.hobbies)}" placeholder="예: 풋살, 탁구, AI 음악 제작" autocomplete="off" enterkeyhint="done"/></div>
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
  <div class="scroll">
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
function bindTabBar() {
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const name = tab.dataset.tab;
      if (!name || !Views[name]) return;
      Haptic.light();
      SFX.tap();
      if (Router.current && Router.current.name === name) return;
      if (name === 'teamBuilder') Router.history = [];
      Router.go(name);
    });
  });
}

function preventDoubleTapZoom() {
  let last = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - last < 350) e.preventDefault();
    last = now;
  }, { passive: false });
}

/* ===================================================================
   키보드 / 포커스 매니지먼트
   - 모바일 가상 키보드 높이를 --kb-inset 변수로 노출
   - input/textarea 포커스 시 시야 가운데로 부드럽게 스크롤
   - body.kb-open 토글로 하단 고정 바를 키보드 위로 띄움
   =================================================================== */
function bindKeyboardAwareInputs() {
  const vv = window.visualViewport;
  let kbOpen = false;
  const update = () => {
    if (!vv) return;
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb-inset', `${inset}px`);
    const open = inset > 60;
    if (open !== kbOpen) {
      kbOpen = open;
      document.body.classList.toggle('kb-open', open);
    }
  };
  if (vv) {
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
  }

  const isInput = (el) => el && el.matches && el.matches('input:not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]');

  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!isInput(el)) return;
    document.body.classList.add('input-focused');
    // 키보드가 열릴 시간을 주고, 가운데 정렬로 스크롤
    const reveal = () => {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_) {
        try { el.scrollIntoView(false); } catch (__) {}
      }
    };
    setTimeout(reveal, 280);
    setTimeout(reveal, 520);
  });

  document.addEventListener('focusout', (e) => {
    if (!isInput(e.target)) return;
    setTimeout(() => {
      if (!document.activeElement || !isInput(document.activeElement)) {
        document.body.classList.remove('input-focused');
      }
    }, 100);
  });

  // 텍스트 인풋: Enter 키로 다음 입력 또는 포커스 해제
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const el = e.target;
    if (!isInput(el) || el.tagName === 'TEXTAREA') return;
    e.preventDefault();
    const form = el.closest('form, .sheet-body, .scroll') || document;
    const fields = Array.from(form.querySelectorAll('input:not([type=button]):not([type=submit]), textarea'));
    const idx = fields.indexOf(el);
    if (idx >= 0 && idx + 1 < fields.length) fields[idx + 1].focus();
    else el.blur();
  });
}

function boot(){
  Store.load(); applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if(Store.state.settings.theme === 'system') applyTheme(); });
  $('#scrim').addEventListener('click', () => { if($('#sheet').classList.contains('open')) Sheet.close(); });
  bindTabBar();
  bindSheetSwipeDown();
  preventDoubleTapZoom();
  bindKeyboardAwareInputs();
  const wakeAudio = () => { SFX.ctx(); document.removeEventListener('pointerdown', wakeAudio); document.removeEventListener('touchstart', wakeAudio); };
  document.addEventListener('pointerdown', wakeAudio, { once: true });
  document.addEventListener('touchstart', wakeAudio, { once: true });
  Router.go('splash');
}
document.addEventListener('DOMContentLoaded', boot);