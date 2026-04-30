    const AUTH_SESSION_KEY = 'metlife_auth';
    const PING_TOKEN_KEY = 'ping_fed_token';
    const ASSET_CANDIDATE_KEY = 'semantic_asset_candidates_v1';
    const GOV_QUEUE_KEY = 'gov_admin_queue_v1';
    const NOTIFICATION_KEY = 'metlife_notifications_v1';

    let queryPatternCounter = {};
    let assetCandidates = [];
    let approvedAssets = [];
    let govAdminQueue = [];
    let assetViewMode = 'candidates';
    let notifications = [];
    let notificationFilter = 'all';
    let govQueueFilter = 'all';

    const DEMO_CREDENTIALS = {
      'admin': 'metlife2026!',
      '1': '1'
    };

    function submitLogin(ev) {
      ev.preventDefault();
      const uid = document.getElementById('loginUserId').value.trim();
      const pw = document.getElementById('loginPassword').value;
      const errEl = document.getElementById('loginError');
      if (!uid || !pw) {
        errEl.textContent = '아이디와 비밀번호를 모두 입력해주세요.';
        return;
      }
      if (DEMO_CREDENTIALS[uid] !== pw) {
        errEl.textContent = '아이디 또는 비밀번호가 올바르지 않습니다. (데모: admin / metlife2026!)';
        return;
      }
      errEl.textContent = '';
      sessionStorage.setItem(AUTH_SESSION_KEY, '1');
      sessionStorage.setItem('metlife_login_user', uid);
      sessionStorage.setItem(PING_TOKEN_KEY, `ping-fed-${Date.now().toString(36)}`);
      enterAppShell();
    }

    function logout() {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      sessionStorage.removeItem(PING_TOKEN_KEY);
      sessionStorage.removeItem('metlife_login_user');
      window.location.reload();
    }

    function enterAppShell() {
      document.getElementById('loginScreen')?.classList.add('hidden');
      document.getElementById('appRoot')?.classList.remove('app-hidden');
      const authBadge = document.getElementById('authBadge');
      if (authBadge) authBadge.style.display = 'inline-flex';
      loadSemanticAssetCandidates();
      loadGovAdminQueue();
      loadNotifications();
      startMaskingExpiryWatcher();
      currentView = '';
      switchView('home');
    }

    function isLoggedIn() {
      return sessionStorage.getItem(AUTH_SESSION_KEY) === '1';
    }

    function loadNotifications() {
      try {
        const raw = localStorage.getItem(NOTIFICATION_KEY);
        notifications = raw ? JSON.parse(raw) : [];
      } catch {
        notifications = [];
      }
      if (!notifications.length) {
        notifications = [
          { id: `N-${Date.now()-3}`, type: 'warning', title: '결재 대기', msg: '원본 조회 권한 신청 2건이 승인 대기 중입니다.', read: false, ts: new Date().toISOString() },
          { id: `N-${Date.now()-2}`, type: 'danger', title: '파이프라인 실패', msg: '레거시 보험금 IF · bronze 적재 오류 (담당: 데이터수집셀)', read: false, ts: new Date().toISOString() },
          { id: `N-${Date.now()-1}`, type: 'info', title: '리포트 발행', msg: '월간 FinOps 요약이 생성되었습니다.', read: false, ts: new Date().toISOString() }
        ];
      }
      persistNotifications();
      updateNotificationDot();
    }

    function persistNotifications() {
      localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(notifications.slice(0, 60)));
    }

    function addSystemNotification(type, title, msg) {
      notifications.unshift({ id: `N-${Date.now()}-${Math.floor(Math.random()*1000)}`, type, title, msg, read: false, ts: new Date().toISOString() });
      persistNotifications();
      updateNotificationDot();
      if (document.getElementById('notificationModal')?.classList.contains('show')) {
        renderNotificationPanel();
      }
    }

    function notificationDomain(n) {
      if (/권한|마스킹|거버넌스|승인|반려/.test(`${n.title} ${n.msg}`)) return 'governance';
      if (/비용|예산|finops/i.test(`${n.title} ${n.msg}`)) return 'finops';
      if (/품질|dq|정합성|신선도/i.test(`${n.title} ${n.msg}`)) return 'quality';
      return 'all';
    }

    function setNotificationFilter(mode) {
      notificationFilter = mode || 'all';
      renderNotificationPanel();
    }

    function updateNotificationDot() {
      const hasUnread = notifications.some((n) => !n.read);
      const dot = document.querySelector('.icon-btn .dot');
      if (dot) dot.style.display = hasUnread ? 'block' : 'none';
      const sub = document.getElementById('notificationSub');
      if (sub) sub.textContent = `읽지 않은 알림 ${notifications.filter((n) => !n.read).length}건`;
    }

    function renderNotificationPanel() {
      const host = document.getElementById('notificationList');
      if (!host) return;
      const filtered = notificationFilter === 'all'
        ? notifications
        : notifications.filter((n) => notificationDomain(n) === notificationFilter);
      if (!filtered.length) {
        host.innerHTML = '<div class="notif-empty">표시할 알림이 없습니다.</div>';
        updateNotificationDot();
        return;
      }
      const toneClass = (type) => type === 'danger'
        ? 'tone-danger'
        : type === 'warning'
          ? 'tone-warning'
          : 'tone-info';
      const dayKey = (ts) => new Date(ts).toDateString();
      const now = new Date();
      const y = new Date(now); y.setDate(now.getDate() - 1);
      const labelOf = (ts) => {
        const k = dayKey(ts);
        if (k === dayKey(now)) return '오늘';
        if (k === dayKey(y)) return '어제';
        return '이전';
      };
      const grouped = { '오늘': [], '어제': [], '이전': [] };
      filtered.forEach((n) => grouped[labelOf(n.ts)].push(n));
      host.innerHTML = ['오늘','어제','이전'].map((g) => {
        if (!grouped[g].length) return '';
        return `
          <div class="notif-group-title">${g}</div>
          ${grouped[g].map((n) => `
            <div class="notif-item ${toneClass(n.type)} ${n.read ? '' : 'unread'}">
              <div class="notif-title">${n.title}</div>
              <div class="notif-msg">${n.msg}</div>
              <div class="notif-meta">
                <small>${new Date(n.ts).toLocaleString('ko-KR')}</small>
                ${n.read ? '<small class="notif-state-read">읽음</small>' : `<button type="button" class="btn btn-ghost btn-sm" data-action="notification-read-one" data-notification-id="${n.id}">읽음 처리</button>`}
              </div>
            </div>
          `).join('')}
        `;
      }).join('');
      updateNotificationDot();
    }

    function markNotificationRead(id) {
      const n = notifications.find((x) => x.id === id);
      if (!n) return;
      n.read = true;
      persistNotifications();
      renderNotificationPanel();
    }

    function markAllNotificationsRead() {
      notifications.forEach((n) => { n.read = true; });
      persistNotifications();
      renderNotificationPanel();
    }

    function submitPermissionRequest() {
      const reason = document.getElementById('permReason')?.value.trim() || '';
      if (reason.length < 8) {
        toast('입력 필요', '조회 사유를 8자 이상 입력해 주세요.');
        return;
      }
      const sel = document.getElementById('permDatasetSelect');
      const label = sel ? sel.options[sel.selectedIndex].text : '미지정 데이터셋';
      const reqId = `REQ-${new Date().getFullYear().toString().slice(-2)}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
      const squad = /claim|청구/i.test(label) ? 'Claim Analytics Squad' : /customer|고객/i.test(label) ? 'Customer Insight Squad' : 'Data Governance Squad';
      govAdminQueue.unshift({
        id: reqId,
        requester: '오석휘 수석',
        dataset: label,
        squad,
        reason,
        risk: /customer|claim|dim_customer|pii/i.test(label) ? 'HIGH' : 'MEDIUM',
        status: 'PENDING',
        requestedAt: new Date().toISOString(),
        slaDueAt: new Date(Date.now() + 3600_000 * 4).toISOString(),
        slaAlerted: false,
        unmaskUntil: ''
      });
      persistGovAdminQueue();
      closePermModal();
      const host = document.getElementById('approvalState');
      if (!host) return;
      host.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; padding: 40px;"><span class="loading-pill">결재 요청 전송 중…</span></div>';
      setTimeout(() => {
        host.innerHTML = mockResponse('/mock/permission');
        toast('결재 접수 완료', label ? `${label} 에 대한 요청이 접수되었습니다.` : '요청이 접수되었습니다.');
        addSystemNotification('warning', '권한 신청 접수', `${reqId} · ${label} 접근 권한 신청이 접수되었습니다.`);
        advanceApprovalSimulation();
        const prEl = document.getElementById('permReason');
        if (prEl) prEl.value = '';
        renderGovAdminQueue();
      }, 650);
    }

    function mockResponse(path) {
      if (path === '/mock/permission') {
        return `
          <div style="display: flex; align-items: center; gap: 12px; padding: 14px;
                      background: linear-gradient(135deg, var(--mint-50), var(--sky-100));
                      border-radius: 12px; margin-bottom: 18px;
                      border: 1px solid var(--mint-300);">
            <div style="width: 40px; height: 40px; border-radius: 10px;
                        background: linear-gradient(135deg, var(--mint-500), var(--mint-700));
                        display: grid; place-items: center; color: white;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div style="flex: 1;">
              <div style="font-weight: 700; color: var(--ink-800); font-size: 13px;">결재 요청이 접수되었습니다</div>
              <div style="font-size: 12px; color: var(--ink-600); margin-top: 2px;">
                티켓 번호 <strong>REQ-26-04891</strong> · 평균 처리 4시간 내외
              </div>
            </div>
          </div>

          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-500); margin-bottom: 10px;">
            결재 진행 단계
          </div>
          <ul class="timeline" id="liveTimeline">
            <li class="done">
              <span class="timeline-marker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>
              <div class="timeline-content">
                <div class="timeline-title">신청서 제출 완료</div>
                <div class="timeline-time">방금 전 · 오석휘 수석</div>
              </div>
            </li>
            <li class="active" id="step-2">
              <span class="timeline-marker">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
              </span>
              <div class="timeline-content">
                <div class="timeline-title">1차 결재 검토 중 (정광용 팀장)</div>
                <div class="timeline-time">진행 중…</div>
              </div>
            </li>
            <li class="pending" id="step-3">
              <span class="timeline-marker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/></svg></span>
              <div class="timeline-content">
                <div class="timeline-title">2차 데이터거버넌스 검토</div>
                <div class="timeline-time">대기 중</div>
              </div>
            </li>
            <li class="pending" id="step-4">
              <span class="timeline-marker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="20 6 9 17 4 12"/></svg></span>
              <div class="timeline-content">
                <div class="timeline-title">권한 발급 (7일 한시)</div>
                <div class="timeline-time">대기 중</div>
              </div>
            </li>
          </ul>
        `;
      }
      return '';
    }

    function advanceApprovalSimulation() {
      setTimeout(() => {
        const s2 = document.getElementById('step-2');
        if (!s2) return;
        s2.classList.remove('active'); s2.classList.add('done');
        s2.querySelector('.timeline-marker').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
        s2.querySelector('.timeline-title').textContent = '1차 결재 승인 (정광용 팀장)';
        s2.querySelector('.timeline-time').textContent = '방금 전 · 코멘트: "목적 적합 확인"';
        const s3 = document.getElementById('step-3');
        s3.classList.remove('pending'); s3.classList.add('active');
        s3.querySelector('.timeline-marker').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>';
        s3.querySelector('.timeline-title').textContent = '2차 데이터거버넌스 검토 중';
        s3.querySelector('.timeline-time').textContent = '진행 중…';
        toast('1차 결재 승인', '정광용 팀장이 결재를 승인했습니다.');
      }, 1800);

      setTimeout(() => {
        const s3 = document.getElementById('step-3'); if (!s3) return;
        s3.classList.remove('active'); s3.classList.add('done');
        s3.querySelector('.timeline-marker').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
        s3.querySelector('.timeline-title').textContent = '2차 거버넌스 승인';
        s3.querySelector('.timeline-time').textContent = '방금 전 · 위원회 만장일치';
        const s4 = document.getElementById('step-4');
        s4.classList.remove('pending'); s4.classList.add('done');
        s4.querySelector('.timeline-title').textContent = '권한 발급 완료 (7일 한시)';
        s4.querySelector('.timeline-time').textContent = '~ 2026-05-07 23:59 까지';
        toast('권한 발급 완료', '7일간 원본 조회 권한이 부여되었습니다.', 'success');
      }, 3600);
    }

    function loadSemanticAssetCandidates() {
      try {
        const raw = localStorage.getItem(ASSET_CANDIDATE_KEY);
        const parsed = raw ? JSON.parse(raw) : { candidates: [], catalog: [] };
        if (Array.isArray(parsed)) {
          assetCandidates = parsed;
          approvedAssets = [];
        } else {
          assetCandidates = parsed.candidates || [];
          approvedAssets = parsed.catalog || [];
        }
      } catch {
        assetCandidates = [];
        approvedAssets = [];
      }
    }

    function persistSemanticAssetCandidates() {
      localStorage.setItem(ASSET_CANDIDATE_KEY, JSON.stringify({
        candidates: assetCandidates,
        catalog: approvedAssets
      }));
    }

    function fingerprintSQL(sql) {
      return sql
        .replace(/--.*$/gm, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/'[^']*'/g, '?')
        .replace(/\b\d+(\.\d+)?\b/g, '?')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }

    function registerQueryAssetCandidate(sql, resultRows) {
      const fp = fingerprintSQL(sql);
      if (!fp) return;
      const risk = /\bCUST_NM\b|ADDRESS|PHONE|CONTACT|CLAIM|DIM_CUSTOMER|FACT_CLAIM/i.test(fp) ? 'HIGH' : /\bCUSTOMER_ID\b/i.test(fp) ? 'MEDIUM' : 'LOW';
      queryPatternCounter[fp] = (queryPatternCounter[fp] || 0) + 1;
      const uses = queryPatternCounter[fp];
      if (uses < 3) return;
      const exists = assetCandidates.find((x) => x.fp === fp);
      const nowIso = new Date().toISOString();
      if (exists) {
        exists.uses = uses;
        exists.lastSeenAt = nowIso;
        exists.risk = risk;
      } else {
        assetCandidates.unshift({
          fp,
          title: `자산 후보 · ${new Date().toLocaleDateString('ko-KR')}`,
          uses,
          rows: resultRows,
          risk,
          status: 'CANDIDATE',
          owner: 'Data Steward 대기',
          createdAt: nowIso,
          lastSeenAt: nowIso
        });
      }
      assetCandidates = assetCandidates.slice(0, 12);
      persistSemanticAssetCandidates();
      renderAssetCandidates();
    }

    function renderAssetCandidates() {
      const host = document.getElementById('assetCandidateList');
      const catalogHost = document.getElementById('assetCatalogList');
      const label = document.getElementById('assetViewLabel');
      const filterHost = document.getElementById('assetCatalogFilters');
      const searchEl = document.getElementById('assetCatalogSearch');
      const riskEl = document.getElementById('assetCatalogRisk');
      if (!host || !catalogHost || !label || !filterHost || !searchEl || !riskEl) return;
      pulseUiState(assetViewMode === 'catalog' ? catalogHost : host, 'asset-list-refresh', 360);
      host.style.display = assetViewMode === 'candidates' ? 'grid' : 'none';
      catalogHost.style.display = assetViewMode === 'catalog' ? 'grid' : 'none';
      filterHost.style.display = assetViewMode === 'catalog' ? 'grid' : 'none';
      label.textContent = assetViewMode === 'catalog' ? '운영 카탈로그' : '후보 목록';

      if (!assetCandidates.length) {
        host.innerHTML = '<div class="asset-empty">아직 자동 등록된 자산 후보가 없습니다. 동일 패턴 쿼리를 3회 이상 실행하면 후보로 등록됩니다.</div>';
      } else {
        host.innerHTML = assetCandidates.map((c, idx) => `
          <div class="asset-item-card">
            <div class="asset-item-head">
              <strong class="asset-item-title">${c.title}</strong>
              <span class="badge badge-mint">반복 ${c.uses}회</span>
            </div>
            <div class="asset-item-meta">최근 결과 ${c.rows.toLocaleString()}건 · 상태 ${c.status}</div>
            <div class="asset-item-fp">${escapeHtmlCell(c.fp)}</div>
            <div class="asset-item-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-action="asset-reject-candidate" data-asset-idx="${idx}">보류</button>
              <button type="button" class="btn btn-primary btn-sm" data-action="asset-approve-candidate" data-asset-idx="${idx}">카탈로그 등록</button>
            </div>
          </div>
        `).join('');
      }

      if (!approvedAssets.length) {
        catalogHost.innerHTML = '<div class="asset-empty">등록된 데이터 자산이 없습니다. 후보에서 "카탈로그 등록"을 선택하세요.</div>';
      } else {
        const sq = searchEl.value.trim().toUpperCase();
        const rq = riskEl.value;
        const filteredCatalog = approvedAssets.filter((a) => {
          const matchText = !sq || `${a.title} ${a.fp}`.toUpperCase().includes(sq);
          const matchRisk = !rq || (a.risk || 'LOW') === rq;
          return matchText && matchRisk;
        });
        if (!filteredCatalog.length) {
          catalogHost.innerHTML = '<div class="asset-empty">검색 조건에 맞는 자산이 없습니다.</div>';
          return;
        }
        catalogHost.innerHTML = filteredCatalog.map((a) => {
          const assetIndex = approvedAssets.findIndex((x) => x.fp === a.fp);
          const selectId = `assetRollback-${assetIndex < 0 ? 0 : assetIndex}`;
          const previewId = `assetRollbackPreview-${assetIndex < 0 ? 0 : assetIndex}`;
          const rollbackOptions = Array.isArray(a.versionHistory)
            ? a.versionHistory
              .filter((h) => h.version !== (a.version || 'v1'))
              .map((h) => `<option value="${h.version}">${h.version} · ${new Date(h.at).toLocaleDateString('ko-KR')}</option>`)
              .join('')
            : '';
          const defaultTarget = Array.isArray(a.versionHistory)
            ? (a.versionHistory.find((h) => h.version !== (a.version || 'v1'))?.version || '')
            : '';
          return `
            <div class="asset-item-card">
              <div class="asset-item-head">
                <strong class="asset-item-title">${a.title}</strong>
                <span class="badge badge-success">CERTIFIED ${a.version || 'v1'}</span>
              </div>
              <div class="asset-item-meta">오너 ${a.owner} · 등록 ${new Date(a.registeredAt).toLocaleDateString('ko-KR')} · 리스크 ${(a.risk || 'LOW')}</div>
              <div class="asset-item-comment">승인 코멘트: ${escapeHtmlCell(a.stewardComment || '코멘트 없음')}</div>
              <div class="asset-item-history">버전 이력: ${(Array.isArray(a.versionHistory) && a.versionHistory.length ? a.versionHistory.slice(0,3).map((h) => `${h.version}(${new Date(h.at).toLocaleDateString('ko-KR')})`).join(' · ') : (a.version || 'v1'))}</div>
              <div class="asset-item-fp">${escapeHtmlCell(a.fp)}</div>
              <div id="${previewId}" class="asset-rollback-preview">
                ${getRollbackPreviewHtml(a, defaultTarget)}
              </div>
              <div class="asset-item-actions asset-item-actions-row">
                <select id="${selectId}" class="form-select asset-rollback-select" data-action="asset-preview-rollback" data-asset-fp="${a.fp}" data-select-id="${selectId}" data-preview-id="${previewId}">
                  ${rollbackOptions || '<option value="">복원 버전 없음</option>'}
                </select>
                <button type="button" class="btn btn-ghost btn-sm" data-action="asset-rollback-version" data-asset-fp="${a.fp}" data-select-id="${selectId}">선택 버전 복원</button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    function setAssetViewMode(mode) {
      assetViewMode = mode === 'catalog' ? 'catalog' : 'candidates';
      renderAssetCandidates();
    }

    function approveAssetCandidate(idx) {
      const c = assetCandidates[idx];
      if (!c) return;
      const comment = window.prompt('스튜어드 승인 코멘트를 입력하세요', '표준 KPI 정의와 일치하여 인증 자산으로 승격') || '코멘트 없음';
      const now = new Date().toISOString();
      const existing = approvedAssets.find((x) => x.fp === c.fp);
      if (existing) {
        const curVer = parseInt(String(existing.version || 'v1').replace(/[^\d]/g, ''), 10) || 1;
        existing.version = `v${curVer + 1}`;
        existing.registeredAt = now;
        existing.stewardComment = comment;
        existing.owner = 'Data Steward';
        if (!Array.isArray(existing.versionHistory)) existing.versionHistory = [];
        existing.versionHistory.unshift({ version: existing.version, comment, at: now });
      } else {
        approvedAssets.unshift({
          ...c,
          owner: 'Data Steward',
          registeredAt: now,
          stewardComment: comment,
          version: 'v1',
          versionHistory: [{ version: 'v1', comment, at: now }]
        });
      }
      assetCandidates.splice(idx, 1);
      persistSemanticAssetCandidates();
      setAssetViewMode('catalog');
      addSystemNotification('info', '데이터 자산 등록', `${c.title} 이(가) CERTIFIED 카탈로그로 승격되었습니다.`);
      toast('자산 등록', '데이터 자산 카탈로그에 CERTIFIED 상태로 등록했습니다.', 'success');
    }

    function rejectAssetCandidate(idx) {
      const c = assetCandidates[idx];
      if (!c) return;
      c.status = 'ON_HOLD';
      persistSemanticAssetCandidates();
      renderAssetCandidates();
      toast('후보 보류', '해당 자산 후보를 보류 상태로 변경했습니다.');
    }

    function flushAssetCandidates() {
      assetCandidates = [];
      queryPatternCounter = {};
      approvedAssets = [];
      persistSemanticAssetCandidates();
      renderAssetCandidates();
      toast('자산 후보 초기화', '시멘틱 레이어 자동 후보 목록을 비웠습니다.');
    }

    function rollbackAssetVersion(fp, selectId) {
      const asset = approvedAssets.find((a) => a.fp === fp);
      if (!asset || !Array.isArray(asset.versionHistory) || asset.versionHistory.length < 2) {
        toast('롤백 불가', '복원 가능한 이전 버전 이력이 없습니다.');
        return;
      }
      const targetVersion = document.getElementById(selectId)?.value;
      if (!targetVersion) {
        toast('롤백 불가', '복원할 버전을 먼저 선택해 주세요.');
        return;
      }
      const previous = asset.versionHistory.find((h) => h.version === targetVersion);
      if (!previous) {
        toast('롤백 불가', '선택한 버전을 찾을 수 없습니다.');
        return;
      }
      const current = {
        version: asset.version || 'v1',
        comment: asset.stewardComment || '코멘트 없음',
        at: new Date().toISOString()
      };
      asset.versionHistory.unshift(current);
      asset.version = previous.version;
      asset.stewardComment = `${previous.comment || '코멘트 없음'} (rollback)`;
      asset.registeredAt = new Date().toISOString();
      persistSemanticAssetCandidates();
      renderAssetCandidates();
      addSystemNotification('info', '카탈로그 롤백', `${asset.title} 자산을 ${asset.version}로 복원했습니다.`);
      toast('버전 복원', `${asset.title} 자산을 이전 버전으로 되돌렸습니다.`, 'success');
    }

    function getRollbackPreviewHtml(asset, targetVersion) {
      if (!asset || !targetVersion || !Array.isArray(asset.versionHistory)) {
        return '복원 대상을 선택하면 변경 요약이 표시됩니다.';
      }
      const target = asset.versionHistory.find((h) => h.version === targetVersion);
      if (!target) return '선택한 버전 정보를 찾을 수 없습니다.';
      const currentVersion = asset.version || 'v1';
      const currentComment = escapeHtmlCell(asset.stewardComment || '코멘트 없음');
      const targetComment = escapeHtmlCell(target.comment || '코멘트 없음');
      return `
        <strong style="color:var(--ink-700);">복원 미리보기</strong><br/>
        버전: <span style="color:var(--danger);">${currentVersion}</span> → <span style="color:var(--success);">${target.version}</span><br/>
        등록일: <span style="color:var(--danger);">${new Date(asset.registeredAt).toLocaleDateString('ko-KR')}</span> → <span style="color:var(--success);">${new Date(target.at).toLocaleDateString('ko-KR')}</span><br/>
        코멘트: <span style="color:var(--danger);">${currentComment}</span> → <span style="color:var(--success);">${targetComment}</span>
      `;
    }

    function previewRollbackDiff(fp, selectId, previewId) {
      const asset = approvedAssets.find((a) => a.fp === fp);
      const targetVersion = document.getElementById(selectId)?.value || '';
      const previewHost = document.getElementById(previewId);
      if (!previewHost) return;
      previewHost.innerHTML = getRollbackPreviewHtml(asset, targetVersion);
    }

    function loadGovAdminQueue() {
      try {
        const raw = localStorage.getItem(GOV_QUEUE_KEY);
        govAdminQueue = raw ? JSON.parse(raw) : [];
      } catch {
        govAdminQueue = [];
      }
      if (!govAdminQueue.length) {
        govAdminQueue = [
          {
            id: 'REQ-26-48102',
            requester: '상품기획팀 김OO',
            dataset: 'dm_customer.dim_customer',
            squad: 'Customer Insight Squad',
            reason: '캠페인 성과 분석',
            risk: 'HIGH',
            status: 'PENDING',
            requestedAt: new Date(Date.now() - 3600_000 * 7).toISOString(),
            slaDueAt: new Date(Date.now() - 3600_000 * 3).toISOString(),
            unmaskUntil: ''
          },
          {
            id: 'REQ-26-48011',
            requester: '청구분석팀 박OO',
            dataset: 'dm_claim.fact_claim_event',
            squad: 'Claim Analytics Squad',
            reason: '청구 패턴 이상탐지 검증',
            risk: 'MEDIUM',
            status: 'APPROVED',
            requestedAt: new Date(Date.now() - 3600_000 * 24).toISOString(),
            slaDueAt: new Date(Date.now() - 3600_000 * 20).toISOString(),
            unmaskUntil: new Date(Date.now() + 3600_000 * 24 * 5).toISOString().slice(0,16)
          }
        ];
      }
      govAdminQueue = govAdminQueue.map((r) => ({
        squad: 'Data Governance Squad',
        slaDueAt: new Date(Date.now() + 3600_000 * 4).toISOString(),
        slaAlerted: false,
        ...r
      }));
    }

    function persistGovAdminQueue() {
      localStorage.setItem(GOV_QUEUE_KEY, JSON.stringify(govAdminQueue));
    }

    function setGovQueueFilter(mode) {
      govQueueFilter = mode || 'all';
      renderGovAdminQueue();
    }

    function formatSla(r) {
      const due = new Date(r.slaDueAt).getTime();
      if (!Number.isNaN(due)) {
        const diff = due - Date.now();
        if (r.status === 'PENDING' && diff < 0) return { text: `위반 ${Math.floor(Math.abs(diff) / 60000)}분`, breached: true };
        if (r.status === 'PENDING') return { text: `남음 ${Math.floor(diff / 60000)}분`, breached: false };
      }
      return { text: r.status === 'PENDING' ? 'SLA 계산중' : '처리완료', breached: false };
    }

    function renderGovAdminQueue() {
      const tbody = document.getElementById('govAdminQueue');
      if (!tbody) return;
      const filtered = govQueueFilter === 'all'
        ? govAdminQueue
        : govQueueFilter === 'pending'
          ? govAdminQueue.filter((r) => r.status === 'PENDING')
          : govQueueFilter === 'approved'
            ? govAdminQueue.filter((r) => r.status === 'APPROVED')
            : govAdminQueue.filter((r) => r.status === 'PENDING' && new Date(r.slaDueAt).getTime() < Date.now());
      tbody.innerHTML = filtered.map((r) => {
        const badge = r.status === 'APPROVED'
          ? '<span class="badge badge-success">승인</span>'
          : r.status === 'EXPIRED'
            ? '<span class="badge badge-neutral">만료</span>'
          : r.status === 'REJECTED'
            ? '<span class="badge badge-danger">반려</span>'
            : '<span class="badge badge-warning">대기</span>';
        const riskBadge = r.risk === 'HIGH' ? 'badge-danger' : 'badge-warning';
        const disabled = r.status !== 'PENDING' ? 'disabled' : '';
        const remain = formatRemainingTime(r.unmaskUntil, r.status);
        const sla = formatSla(r);
        return `
          <tr style="${sla.breached ? 'background: #f2f8e8;' : ''}; cursor:pointer;" data-action="gov-open-detail" data-gov-id="${r.id}">
            <td style="font-family:monospace;">${r.id}</td>
            <td>${r.requester}</td>
            <td>${r.dataset}</td>
            <td>${r.squad || 'Data Governance Squad'}</td>
            <td><span class="badge ${riskBadge}">${r.risk}</span></td>
            <td><span style="font-size:12px; font-weight:600; color:${sla.breached ? 'var(--ink-700)' : 'var(--ink-600)'};">${sla.text}</span></td>
            <td>
              <div style="display:flex; flex-direction:column; gap:4px;">
              <input type="datetime-local" id="mask-${r.id}" value="${r.unmaskUntil || ''}" ${disabled}
                style="padding:6px 8px; border:1px solid var(--ink-200); border-radius:8px; font-size:12px;" />
              <small style="color:var(--ink-500);">${remain}</small>
              </div>
            </td>
            <td style="display:flex; gap:6px; align-items:center;">
              ${badge}
              <button type="button" class="btn btn-ghost btn-sm" ${disabled} data-action="gov-approve" data-gov-id="${r.id}">승인</button>
              <button type="button" class="btn btn-ghost btn-sm" ${disabled} data-action="gov-reject" data-gov-id="${r.id}">반려</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function viewGovRequestDetail(id) {
      const req = govAdminQueue.find((x) => x.id === id);
      if (!req) return;
      const body = document.getElementById('govDetailBody');
      if (!body) return;
      const policy = req.risk === 'HIGH'
        ? 'PII-HIGH 정책 대상 · 목적적합성/최소권한 검토 필수'
        : '일반 민감정보 정책 대상 · 표준 승인 절차 적용';
      body.innerHTML = `
        <div style="display:grid; grid-template-columns: 120px 1fr; gap:8px; font-size:13px; color:var(--ink-700);">
          <strong>요청ID</strong><span style="font-family:monospace;">${req.id}</span>
          <strong>신청자</strong><span>${req.requester}</span>
          <strong>대상</strong><span>${req.dataset}</span>
          <strong>담당 Squad</strong><span>${req.squad || 'Data Governance Squad'}</span>
          <strong>리스크</strong><span>${req.risk}</span>
          <strong>상태</strong><span>${req.status}</span>
          <strong>SLA</strong><span>${formatSla(req).text}</span>
          <strong>정책근거</strong><span>${policy}</span>
          <strong>요청사유</strong><span>${escapeHtmlCell(req.reason || '사유 없음')}</span>
        </div>
        <div style="margin-top:12px; padding:10px 12px; border-radius:10px; background:var(--ink-50); border:1px solid var(--ink-100);">
          <div style="font-size:12px; font-weight:700; color:var(--ink-600); margin-bottom:6px;">감사 로그</div>
          <div style="font-size:12px; color:var(--ink-500); line-height:1.6;">
            - ${new Date(req.requestedAt).toLocaleString('ko-KR')} 요청 생성<br/>
            - ${req.status === 'APPROVED' ? '승인 처리 및 마스킹 해제 기간 설정' : req.status === 'REJECTED' ? '반려 처리 완료' : '결재 대기 중'}
          </div>
        </div>
        <div style="margin-top:10px; padding:10px 12px; border-radius:10px; background:white; border:1px solid var(--ink-100);">
          <div style="font-size:12px; font-weight:700; color:var(--ink-600); margin-bottom:6px;">처리 전/후 변경 요약</div>
          ${getGovDetailDiffHtml(req)}
        </div>
      `;
      document.getElementById('govDetailModal')?.classList.add('show');
    }

    function getGovDetailDiffHtml(req) {
      const beforeStatus = 'PENDING';
      const beforeMasking = '미설정';
      const beforeSla = formatSla({ ...req, status: 'PENDING' }).text;
      const afterStatus = req.status;
      const afterMasking = req.unmaskUntil
        ? new Date(req.unmaskUntil).toLocaleString('ko-KR')
        : (req.status === 'REJECTED' ? '반려로 미적용' : req.status === 'EXPIRED' ? '만료로 재적용' : '미설정');
      const afterSla = formatSla(req).text;
      return `
        <div style="font-size:12px; color:var(--ink-600); line-height:1.7;">
          상태: <span style="color:var(--danger);">${beforeStatus}</span> → <span style="color:var(--success);">${afterStatus}</span><br/>
          마스킹: <span style="color:var(--danger);">${beforeMasking}</span> → <span style="color:var(--success);">${afterMasking}</span><br/>
          SLA: <span style="color:var(--danger);">${beforeSla}</span> → <span style="color:var(--success);">${afterSla}</span>
        </div>
      `;
    }

    function closeGovDetailModal() {
      document.getElementById('govDetailModal')?.classList.remove('show');
    }

    function exportPermissionAuditCsv() {
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = ['request_id,requester,dataset,squad,risk,status,requested_at,sla_due_at,unmask_until,reason'];
      govAdminQueue.forEach((r) => {
        lines.push([
          r.id,
          r.requester,
          r.dataset,
          r.squad || 'Data Governance Squad',
          r.risk,
          r.status,
          r.requestedAt,
          r.slaDueAt,
          r.unmaskUntil || '',
          r.reason || ''
        ].map(esc).join(','));
      });
      const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `permission-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      addSystemNotification('info', '권한 감사 산출물', '권한 결재 감사 CSV가 생성되었습니다.');
      toast('내보내기 완료', '권한 감사 CSV를 저장했습니다.', 'success');
    }

    function exportPermissionApprovalReport() {
      const now = new Date();
      const approved = govAdminQueue.filter((r) => r.status === 'APPROVED').length;
      const pending = govAdminQueue.filter((r) => r.status === 'PENDING').length;
      const rejected = govAdminQueue.filter((r) => r.status === 'REJECTED').length;
      const expired = govAdminQueue.filter((r) => r.status === 'EXPIRED').length;
      const body = [
        'MetLife Data Platform - Permission Approval Report',
        `Generated At: ${now.toLocaleString('ko-KR')}`,
        '',
        '[Summary]',
        `Total Requests: ${govAdminQueue.length}`,
        `Approved: ${approved}`,
        `Pending: ${pending}`,
        `Rejected: ${rejected}`,
        `Expired: ${expired}`,
        '',
        '[Detailed Records]',
        ...govAdminQueue.map((r) =>
          `- ${r.id} | ${r.status} | ${r.requester} | ${r.dataset} | ${r.risk} | ${r.unmaskUntil || 'N/A'} | ${r.reason || '사유없음'}`
        )
      ].join('\n');
      const blob = new Blob([body], { type: 'text/plain;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `permission-approval-report-${now.toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      addSystemNotification('info', '결재 보고서 산출물', '권한 결재 보고서(TXT)가 생성되었습니다.');
      toast('보고서 생성', '승인결재서 형식 텍스트 보고서를 저장했습니다.', 'success');
    }

    function printPermissionApprovalPdfLayout() {
      const now = new Date();
      const approved = govAdminQueue.filter((r) => r.status === 'APPROVED').length;
      const pending = govAdminQueue.filter((r) => r.status === 'PENDING').length;
      const rejected = govAdminQueue.filter((r) => r.status === 'REJECTED').length;
      const expired = govAdminQueue.filter((r) => r.status === 'EXPIRED').length;
      const rows = govAdminQueue.map((r) => `
        <tr>
          <td>${r.id}</td>
          <td>${r.requester}</td>
          <td>${r.dataset}</td>
          <td>${r.risk}</td>
          <td>${r.status}</td>
          <td>${r.unmaskUntil || '-'}</td>
        </tr>
      `).join('');
      const html = `
<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>권한 승인 결재서</title>
<style>
body{font-family:Arial,'Malgun Gothic',sans-serif;padding:24px;color:#222}
h1{font-size:20px;margin:0 0 8px}
.doc-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px}
.doc-brand{display:flex;align-items:center;gap:10px}
.doc-logo{width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,#0090DA,#005A9C);color:#fff;font-weight:700;display:grid;place-items:center}
.doc-brand-meta{font-size:11px;color:#4a5568;line-height:1.4}
.doc-meta-box{border:1px solid #d9d9d9;border-radius:6px;padding:8px 10px;font-size:11px;min-width:230px;background:#fafbfd}
h1{font-size:20px;margin:0 0 8px} .meta{font-size:12px;color:#555;margin-bottom:16px}
.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px}
.box{border:1px solid #d9d9d9;border-radius:6px;padding:8px;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #d9d9d9;padding:6px 8px;text-align:left}
th{background:#f5f7f9}
.sign-wrap{margin-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.sign-box{border:1px solid #d9d9d9;border-radius:6px;padding:12px;min-height:90px}
.sign-title{font-size:12px;color:#444;margin-bottom:8px}
.sign-line{margin-top:24px;border-top:1px solid #999;padding-top:6px;font-size:11px;color:#666}
@media print{@page{size:A4 portrait;margin:12mm} body{padding:0}}
</style></head><body>
<div class="doc-header">
  <div class="doc-brand">
    <div class="doc-logo">M</div>
    <div>
      <div style="font-size:16px;font-weight:700;line-height:1.1;">MetLife Korea</div>
      <div class="doc-brand-meta">Data Platform Governance Office</div>
    </div>
  </div>
  <div class="doc-meta-box">
    <div><strong>문서번호:</strong> AAAA84-2604-4018</div>
    <div><strong>버전:</strong> 1.0</div>
    <div><strong>작성부서:</strong> 구매서비스팀</div>
    <div><strong>보안등급:</strong> Internal Use Only</div>
    <div><strong>출력시각:</strong> ${now.toLocaleString('ko-KR')}</div>
  </div>
</div>
<h1>권한 승인 결재서 (Audit Submission)</h1>
<div class="meta">Generated at: ${now.toLocaleString('ko-KR')}</div>
<div class="summary">
  <div class="box">총 요청: <strong>${govAdminQueue.length}</strong></div>
  <div class="box">승인: <strong>${approved}</strong></div>
  <div class="box">대기: <strong>${pending}</strong></div>
  <div class="box">반려: <strong>${rejected}</strong></div>
  <div class="box">만료: <strong>${expired}</strong></div>
</div>
<table><thead><tr><th>요청ID</th><th>요청자</th><th>대상 데이터셋</th><th>Risk</th><th>상태</th><th>만료시각</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sign-wrap">
  <div class="sign-box"><div class="sign-title">작성자 (담당자)</div><div class="sign-line">성명/서명:</div><div class="sign-line">결재일:</div></div>
  <div class="sign-box"><div class="sign-title">검토자 (Data Governance)</div><div class="sign-line">성명/서명:</div><div class="sign-line">결재일:</div></div>
  <div class="sign-box"><div class="sign-title">승인자 (관리자/책임자)</div><div class="sign-line">성명/서명:</div><div class="sign-line">결재일:</div></div>
</div>
</body></html>`;
      const win = window.open('', '_blank', 'width=1100,height=860');
      if (!win) {
        toast('출력 실패', '팝업이 차단되어 결재서 인쇄창을 열 수 없습니다.');
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 300);
      addSystemNotification('info', '결재서 인쇄 레이아웃', '권한 승인 결재서 인쇄창을 생성했습니다.');
      toast('인쇄 준비', '브라우저 인쇄에서 PDF로 저장하세요.', 'success');
    }

    function formatRemainingTime(unmaskUntil, status) {
      if (status === 'EXPIRED') return 'SLA 만료 · 마스킹 재적용';
      if (!unmaskUntil) return '해제기간 미설정';
      const end = new Date(unmaskUntil).getTime();
      if (Number.isNaN(end)) return '시간 형식 오류';
      const diff = end - Date.now();
      if (diff <= 0) return '만료 임박/만료';
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      return `남은시간 ${d}일 ${h}시간 ${m}분`;
    }

    function approveGovRequest(id) {
      const row = govAdminQueue.find((x) => x.id === id);
      if (!row || row.status !== 'PENDING') return;
      const dt = document.getElementById(`mask-${id}`)?.value || '';
      if (!dt) {
        toast('입력 필요', '마스킹 해제 종료시각을 설정해 주세요.');
        return;
      }
      row.unmaskUntil = dt;
      row.status = 'APPROVED';
      persistGovAdminQueue();
      renderGovAdminQueue();
      addSystemNotification('info', '권한 승인', `${id} 승인 완료 · 동적 마스킹 해제 만료 ${dt.replace('T', ' ')}`);
      toast('승인 완료', `${id} 승인 · 동적 마스킹 해제 만료 ${dt.replace('T', ' ')}`, 'success');
    }

    function rejectGovRequest(id) {
      const row = govAdminQueue.find((x) => x.id === id);
      if (!row || row.status !== 'PENDING') return;
      row.status = 'REJECTED';
      persistGovAdminQueue();
      renderGovAdminQueue();
      addSystemNotification('warning', '권한 반려', `${id} 요청이 반려되었습니다.`);
      toast('반려 처리', `${id} 요청을 반려했습니다.`);
    }

    function startMaskingExpiryWatcher() {
      if (window._maskExpiryTimer) clearInterval(window._maskExpiryTimer);
      window._maskExpiryTimer = setInterval(() => {
        const now = Date.now();
        let changed = false;
        govAdminQueue.forEach((r) => {
          if (r.status === 'PENDING' && r.slaDueAt && !r.slaAlerted) {
            const due = new Date(r.slaDueAt).getTime();
            if (!Number.isNaN(due) && due <= now) {
              r.slaAlerted = true;
              changed = true;
              addSystemNotification('warning', 'SLA 위반', `${r.id} 승인 SLA를 초과했습니다. 담당 Squad(${r.squad}) 확인 필요`);
            }
          }
          if (r.status === 'APPROVED' && r.unmaskUntil) {
            const until = new Date(r.unmaskUntil).getTime();
            if (!Number.isNaN(until) && until <= now) {
              r.status = 'EXPIRED';
              changed = true;
              addSystemNotification('warning', '마스킹 자동 복구', `${r.id} 만료로 동적 마스킹이 자동 재적용되었습니다.`);
              toast('마스킹 자동 복구', `${r.id} 만료로 동적 마스킹이 자동 재적용되었습니다.`);
            }
          }
        });
        if (changed) {
          persistGovAdminQueue();
        }
        if (currentView === 'permission') renderGovAdminQueue();
      }, 10000);
    }

    function generateSQLFromNLQ() {
      const nlq = (document.getElementById('nlqInput')?.value || '').trim();
      const ta = document.getElementById('sqlEditor');
      const hint = document.getElementById('nlqPolicyHint');
      if (!ta) return;
      if (!nlq) {
        toast('입력 필요', '자연어 질문을 입력해 주세요.');
        return;
      }
      const lower = nlq.toLowerCase();
      const isClaim = /청구|손해율|claim/.test(lower);
      const isPersist = /13회차|유지율|persist/.test(lower);
      const isChannel = /채널|설계사|tm|digital/.test(lower);
      const wantsCustomerPII = /고객명|연락처|주소|전화|주민|개인/.test(lower);
      const topMatch = lower.match(/상위\s*(\d{1,3})/);
      const topN = topMatch ? Math.min(200, Math.max(1, parseInt(topMatch[1], 10))) : 100;
      const dtFilter = /최근\s*3개월|3개월|최근/.test(lower) ? "contract_dt >= '2026-02-01'\n       AND " : '';
      let risk = wantsCustomerPII ? 'HIGH' : 'LOW';

      let generated = `SELECT customer_id,\n       policy_no,\n       SUM(premium) AS total_premium,\n       COUNT(*) AS contract_cnt\nFROM   dm_policy.fact_contract\nWHERE  ${dtFilter}status = 'ACTIVE'\nGROUP  BY customer_id, policy_no\nORDER  BY total_premium DESC\nLIMIT  ${topN};`;

      if (isClaim) {
        generated = `SELECT customer_id,\n       COUNT(*) AS claim_cnt,\n       SUM(claim_amt) AS total_claim_amt\nFROM   dm_claim.fact_claim_event\nGROUP  BY customer_id\nORDER  BY total_claim_amt DESC\nLIMIT  ${topN};`;
        risk = 'MEDIUM';
      } else if (isPersist) {
        generated = `SELECT product_nm,\n       COUNT(*) AS active_contracts,\n       AVG(premium) AS avg_premium\nFROM   dm_policy.fact_contract\nWHERE  status = 'ACTIVE'\nGROUP  BY product_nm\nORDER  BY active_contracts DESC\nLIMIT  ${topN};`;
      } else if (isChannel) {
        generated = `SELECT product_nm,\n       COUNT(*) AS contract_cnt,\n       SUM(premium) AS total_premium\nFROM   dm_policy.fact_contract\nWHERE  status = 'ACTIVE'\nGROUP  BY product_nm\nORDER  BY contract_cnt DESC\nLIMIT  ${topN};`;
      }

      ta.value = generated;
      highlightSQL();
      if (hint) {
        hint.textContent = risk === 'HIGH'
          ? '정책 경고: 민감정보 가능성 HIGH · 승인 워크플로우 필수'
          : risk === 'MEDIUM'
            ? '정책 유의: 민감 도메인 데이터(청구) · 감사 로그 추적 대상'
            : '정책 검사: 위험도 LOW · 실행 가능';
        hint.style.color = risk === 'HIGH' ? 'var(--danger)' : risk === 'MEDIUM' ? 'var(--warning)' : 'var(--success)';
      }
      toast('SQL 생성 완료', '자연어 입력을 바탕으로 실행 가능한 SQL 초안을 생성했습니다.', 'success');
    }

    function clearNlqPrompt() {
      const el = document.getElementById('nlqInput');
      if (el) el.value = '';
      const hint = document.getElementById('nlqPolicyHint');
      if (hint) {
        hint.textContent = '정책 검사 대기 중';
        hint.style.color = 'var(--ink-500)';
      }
    }

    /* ================================================
       View routing (SPA)
       ================================================ */
    const VIEW_TITLES = {
      home:       'Overview',
      ingestion:  'Ingestion · CDC',
      query:      '쿼리 에디터',
      permission: '권한 · Unity Catalog',
      lineage:    '데이터 자산 · 계보',
      quality:    '품질 · 거버넌스',
      finops:     'FinOps · 비용',
      bi:         'BI · PowerBI 전환'
    };
    let currentView = 'home';
    let metaSearchFilter = 'all';
    let copyProtectionEnabled = false;
    let mfaVerified = false;
    let currentUserRole = 'admin';
    let evidenceFilter = 'all';
    let evidenceDateFilter = 'all';
    let evidenceQuery = '';
    let evidenceGroupMode = false;
    let evidenceReviewFilter = 'all';
    let evidenceSparkMeta = [];
    const EVIDENCE_KEY = 'rfp_evidence_log_v1';
    let evidenceLogs = [];
    let requirementFilter = 'all';
    let requirementFilterByView = {};
    let requirementQueryByView = {};
    let requirementEditMode = false;
    const REQUIREMENT_STATE_KEY = 'rfp_requirement_state_v1';
    const REQUIREMENT_UI_KEY = 'rfp_requirement_ui_v1';

    const REQUIREMENT_MATRIX = {
      home: [
        { id: 'SFR-001', title: 'CDC/MQ 업그레이드 및 고도화', status: 'completed' },
        { id: 'SFR-002', title: '대규모 파이프라인 구축', status: 'completed' },
        { id: 'SFR-003', title: '운영 고도화(1) DR/비용자동화', status: 'completed' },
        { id: 'SFR-004', title: '운영 고도화(2) 품질/거버넌스', status: 'completed' },
        { id: 'SFR-005', title: '운영 고도화(3) 통합모니터링', status: 'completed' },
        { id: 'SFR-006', title: '포털 내 SQL/GUI 조회 환경', status: 'completed' },
        { id: 'SFR-007', title: '데이터 자산화/시멘틱', status: 'completed' },
        { id: 'SFR-008', title: '권한/보안 통합관리', status: 'completed' },
        { id: 'SFR-009', title: '인프라 요건 개발/운영 구축', status: 'in_progress' },
        { id: 'SFR-010', title: '거버넌스 기반 통합 결재', status: 'completed' },
        { id: 'SFR-011', title: 'BI AS-IS/TO-BE 분석', status: 'completed' },
        { id: 'SFR-012', title: 'SQL 분석 기반 최적화', status: 'completed' },
        { id: 'SFR-013', title: 'TDM 고도화', status: 'in_progress' },
        { id: 'SFR-014', title: '사용자 변화관리', status: 'in_progress' },
        { id: 'SFR-015', title: '초기 이관 네트워크 방안', status: 'not_implemented' },
        { id: 'SVR-001', title: '보안관리/취약점 진단 기준', status: 'not_implemented' },
        { id: 'SVR-002', title: '보안성 심의', status: 'not_implemented' },
        { id: 'SVR-003', title: '시큐어코딩 점검', status: 'in_progress' },
        { id: 'SVR-004', title: '모의해킹 진단', status: 'not_implemented' },
        { id: 'SVR-005', title: '인프라 취약점 진단', status: 'not_implemented' },
        { id: 'SVR-006', title: '보안 추가 요구사항', status: 'in_progress' },
        { id: 'SVR-007', title: '캡처/복사 차단', status: 'in_progress' },
        { id: 'SVR-008', title: 'MFA 인증 플로우', status: 'in_progress' },
        { id: 'SVR-009', title: '데이터 암호화(AES-256+)', status: 'in_progress' },
        { id: 'SVR-010', title: '개인정보 마스킹', status: 'in_progress' }
      ],
      ingestion: [
        { id: 'SFR-001', title: '노후 CDC/MQ 전환', status: 'completed' },
        { id: 'SFR-002', title: '3,000 파이프라인 수집체계', status: 'completed' },
        { id: 'SFR-003', title: 'Terraform 기반 DR/운영자동화', status: 'completed' },
        { id: 'SFR-004', title: '품질/Retention/DevOps 표준', status: 'in_progress' },
        { id: 'SFR-005', title: '통합 모니터링/알림', status: 'completed' },
        { id: 'SFR-009', title: '인프라 요건 개발/운영 구축', status: 'in_progress' },
        { id: 'SFR-015', title: '초기 이관 네트워크 구성', status: 'not_implemented' },
        { id: 'TTR-001', title: '장애복구 테스트 범위', status: 'in_progress' },
        { id: 'SVR-001', title: '취약점 진단 기준 준수', status: 'not_implemented' },
        { id: 'SVR-005', title: '클라우드/인프라 취약점 진단', status: 'not_implemented' }
      ],
      query: [
        { id: 'SFR-006', title: '고성능 웹 SQL 에디터', status: 'completed' },
        { id: 'SFR-007', title: '자산화 및 시멘틱 레이어', status: 'completed' },
        { id: 'SFR-012', title: 'SQL 패턴 자산화', status: 'completed' },
        { id: 'SFR-010', title: '원천조회 승인체계 연동', status: 'in_progress' },
        { id: 'SVR-003', title: '시큐어코딩 점검', status: 'in_progress' },
        { id: 'SVR-007', title: '화면/복사 제어 정책', status: 'in_progress' },
        { id: 'SVR-009', title: '암호화 기준 반영', status: 'in_progress' },
        { id: 'SVR-010', title: '개인정보 마스킹 정책', status: 'in_progress' },
        { id: 'TTR-001', title: '쿼리 성능/동시접속 테스트', status: 'in_progress' }
      ],
      permission: [
        { id: 'SFR-008', title: '권한/마스킹 통합 관리', status: 'completed' },
        { id: 'SFR-010', title: '승인 워크플로우/감사로그', status: 'completed' },
        { id: 'SVR-007', title: '캡처/복사 차단 시뮬레이션', status: 'in_progress' },
        { id: 'SVR-008', title: 'MFA 플로우 UI', status: 'in_progress' },
        { id: 'SVR-009', title: '민감정보 암호화 정책', status: 'in_progress' },
        { id: 'SVR-010', title: '표시제한(마스킹) 적용', status: 'in_progress' },
        { id: 'IFR-005', title: 'SSO/권한상태별 메뉴제어', status: 'completed' },
        { id: 'IFR-007', title: 'Ping SSO/AD 연계', status: 'in_progress' }
      ],
      lineage: [
        { id: 'SFR-007', title: '용어사전/계보/카탈로그', status: 'completed' },
        { id: 'SFR-010', title: 'Lineage 자동 추적 시각화', status: 'completed' },
        { id: 'SFR-012', title: '쿼리 패턴 자산화 연계', status: 'completed' },
        { id: 'SFR-014', title: '사용자 가이드/내재화', status: 'in_progress' },
        { id: 'IFR-007', title: 'SSO/인사정보 연계 고려', status: 'in_progress' },
        { id: 'PMR-006', title: '교육/기술이전 연계', status: 'in_progress' }
      ],
      quality: [
        { id: 'SFR-004', title: '품질/거버넌스 고도화', status: 'completed' },
        { id: 'SFR-010', title: '기초 품질 점검 체계', status: 'completed' },
        { id: 'SVR-001', title: '취약점 관리 연계', status: 'not_implemented' },
        { id: 'SVR-003', title: '시큐어코딩 품질 연계', status: 'in_progress' },
        { id: 'SVR-006', title: '보안 추가요건 반영', status: 'in_progress' },
        { id: 'PMR-004', title: '품질보증/리스크 관리', status: 'in_progress' }
      ],
      finops: [
        { id: 'SFR-005', title: 'FinOps 비용 추적', status: 'completed' },
        { id: 'IFR-005', title: '운영 통계/처리이력', status: 'in_progress' },
        { id: 'SFR-003', title: '자동 중지/Backfill 정책', status: 'completed' },
        { id: 'SFR-009', title: '임계치 알림 연계', status: 'in_progress' },
        { id: 'PMR-004', title: '품질/위험 관리 연동', status: 'not_implemented' },
        { id: 'PMR-002', title: '일정/리스크 관리 추적', status: 'in_progress' }
      ],
      bi: [
        { id: 'SFR-011', title: 'BI AS-IS/TO-BE 분석', status: 'completed' },
        { id: 'SFR-013', title: 'TDM 고도화 연계', status: 'in_progress' },
        { id: 'SFR-014', title: '사용자 변화관리/교육', status: 'in_progress' },
        { id: 'PMR-006', title: '교육/기술이전', status: 'in_progress' },
        { id: 'PFR-003', title: '안정화/인수인계 지원', status: 'in_progress' },
        { id: 'PFR-004', title: '글로벌 아키텍처 승인', status: 'not_implemented' }
      ]
    };
    const DEFAULT_REQUIREMENT_MATRIX = JSON.parse(JSON.stringify(REQUIREMENT_MATRIX));

    function requirementStatusBadge(status) {
      if (status === 'completed') return '<span class="badge badge-success">완료</span>';
      if (status === 'in_progress') return '<span class="badge badge-warning">진행</span>';
      return '<span class="badge badge-neutral">미구현</span>';
    }

    function persistRequirementState() {
      try {
        localStorage.setItem(REQUIREMENT_STATE_KEY, JSON.stringify(REQUIREMENT_MATRIX));
      } catch {
        // ignore storage failure
      }
    }

    function loadRequirementState() {
      try {
        const raw = localStorage.getItem(REQUIREMENT_STATE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        Object.keys(REQUIREMENT_MATRIX).forEach((view) => {
          const current = REQUIREMENT_MATRIX[view];
          const saved = Array.isArray(parsed?.[view]) ? parsed[view] : [];
          current.forEach((row) => {
            const match = saved.find((s) => s.id === row.id);
            if (match && ['completed', 'in_progress', 'not_implemented'].includes(match.status)) {
              row.status = match.status;
            }
          });
        });
      } catch {
        // ignore parse failure
      }
    }

    function persistRequirementUiState() {
      try {
        localStorage.setItem(REQUIREMENT_UI_KEY, JSON.stringify({
          filterByView: requirementFilterByView,
          queryByView: requirementQueryByView,
          editMode: requirementEditMode
        }));
      } catch {
        // ignore storage failure
      }
    }

    function exportRequirementStateJson() {
      const payload = {
        exportedAt: new Date().toISOString(),
        requirementState: REQUIREMENT_MATRIX,
        uiState: {
          filterByView: requirementFilterByView,
          queryByView: requirementQueryByView,
          editMode: requirementEditMode
        }
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `metlife-rfp-checklist-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast('내보내기 완료', '요건 체크리스트 상태를 JSON 파일로 저장했습니다.', 'success');
    }

    function resetRequirementStateToDefault() {
      const ok = window.confirm('요건 체크 상태/필터/검색/편집모드를 기본값으로 초기화할까요?');
      if (!ok) return;
      Object.keys(REQUIREMENT_MATRIX).forEach((view) => {
        const current = REQUIREMENT_MATRIX[view];
        const defaults = DEFAULT_REQUIREMENT_MATRIX[view] || [];
        current.forEach((row) => {
          const base = defaults.find((d) => d.id === row.id);
          if (base) row.status = base.status;
        });
      });
      requirementFilter = 'all';
      requirementFilterByView = {};
      requirementQueryByView = {};
      requirementEditMode = false;
      try {
        localStorage.removeItem(REQUIREMENT_STATE_KEY);
        localStorage.removeItem(REQUIREMENT_UI_KEY);
      } catch {
        // ignore storage failure
      }
      renderRequirementChecklist(currentView);
      toast('초기화 완료', '요건 체크리스트를 기본값으로 복원했습니다.', 'success');
    }

    function importRequirementStateJson(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || '{}'));
          const importedState = parsed.requirementState || {};
          Object.keys(REQUIREMENT_MATRIX).forEach((view) => {
            const current = REQUIREMENT_MATRIX[view];
            const incoming = Array.isArray(importedState[view]) ? importedState[view] : [];
            current.forEach((row) => {
              const found = incoming.find((x) => x.id === row.id);
              if (found && ['completed', 'in_progress', 'not_implemented'].includes(found.status)) {
                row.status = found.status;
              }
            });
          });
          const ui = parsed.uiState || {};
          requirementFilterByView = ui.filterByView && typeof ui.filterByView === 'object' ? ui.filterByView : requirementFilterByView;
          requirementQueryByView = ui.queryByView && typeof ui.queryByView === 'object' ? ui.queryByView : requirementQueryByView;
          requirementEditMode = typeof ui.editMode === 'boolean' ? ui.editMode : requirementEditMode;
          persistRequirementState();
          persistRequirementUiState();
          renderRequirementChecklist(currentView);
          toast('가져오기 완료', '요건 체크리스트 상태를 JSON에서 복원했습니다.', 'success');
        } catch (err) {
          toast('가져오기 실패', `유효한 JSON 파일이 아닙니다. (${err.message || 'parse error'})`);
        }
      };
      reader.readAsText(file, 'utf-8');
    }

    function loadRequirementUiState() {
      try {
        const raw = localStorage.getItem(REQUIREMENT_UI_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        requirementFilterByView = parsed?.filterByView && typeof parsed.filterByView === 'object' ? parsed.filterByView : {};
        requirementQueryByView = parsed?.queryByView && typeof parsed.queryByView === 'object' ? parsed.queryByView : {};
        requirementEditMode = Boolean(parsed?.editMode);
      } catch {
        // ignore parse failure
      }
    }

    function getCurrentRequirementFilter(view) {
      return requirementFilterByView[view] || 'all';
    }

    function getCurrentRequirementQuery(view) {
      return requirementQueryByView[view] || '';
    }

    function renderRequirementChecklist(view) {
      const host = document.getElementById('reqChecklistHost');
      if (!host) return;
      requirementFilter = getCurrentRequirementFilter(view);
      const q = getCurrentRequirementQuery(view).trim().toUpperCase();
      const rows = (REQUIREMENT_MATRIX[view] || []).filter((r) => {
        const passFilter = requirementFilter === 'all' ? true : r.status === requirementFilter;
        const passQuery = !q || r.id.toUpperCase().includes(q) || r.title.toUpperCase().includes(q);
        return passFilter && passQuery;
      });
      if (!rows.length) {
        host.innerHTML = '<div class="form-help">선택한 필터 조건에 맞는 항목이 없습니다.</div>';
        return;
      }
      host.innerHTML = rows.map((r) => `
        <div class="req-row">
          <div class="req-id">${r.id}</div>
          <div class="req-title">${r.title}</div>
          <div class="req-state">
            ${requirementEditMode
              ? `<button type="button" class="btn btn-ghost btn-sm req-state-btn" data-action="cycle-req-status" data-req-id="${r.id}">${r.status === 'completed' ? '완료' : r.status === 'in_progress' ? '진행' : '미구현'}</button>`
              : requirementStatusBadge(r.status)}
          </div>
        </div>
      `).join('');
      document.querySelectorAll('[data-action="req-filter"]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.filter === requirementFilter);
      });
      const input = document.getElementById('reqSearchInput');
      if (input && input.value !== getCurrentRequirementQuery(view)) input.value = getCurrentRequirementQuery(view);
      const editBtn = document.querySelector('[data-action="toggle-req-edit-mode"]');
      if (editBtn) {
        editBtn.classList.toggle('active', requirementEditMode);
        editBtn.textContent = requirementEditMode ? '편집모드 ON' : '편집모드 OFF';
      }
    }

    function injectStandardPanels(view) {
      const main = document.getElementById('mainView');
      if (!main) return;
      if (!main.querySelector('#reqChecklistCard')) {
        const card = document.createElement('section');
        card.className = 'card';
        card.id = 'reqChecklistCard';
        card.style.marginTop = '16px';
        card.innerHTML = `
          <div class="card-head">
            <div>
              <h3 class="card-title">요건 충족 체크</h3>
              <div class="card-sub">완료 / 진행 / 미구현 표준 관리</div>
            </div>
            <div class="req-filter-group">
              <input id="reqSearchInput" class="form-input req-search-input" placeholder="요건번호/제목 검색 (예: SFR-010)" data-action="req-search" />
              <button type="button" class="btn btn-ghost btn-sm" data-action="req-filter" data-filter="all">전체</button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="req-filter" data-filter="completed">완료</button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="req-filter" data-filter="in_progress">진행</button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="req-filter" data-filter="not_implemented">미구현</button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-req-edit-mode">편집모드 OFF</button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="export-req-state">내보내기</button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="import-req-state">가져오기</button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="reset-req-state">초기화</button>
              <input id="reqStateFileInput" type="file" accept=".json,application/json" style="display:none;" />
            </div>
          </div>
          <div class="card-body" id="reqChecklistHost"></div>
        `;
        main.appendChild(card);
      }
      renderRequirementChecklist(view);

      if (view === 'permission' && !main.querySelector('#securityControlCard')) {
        const sec = document.createElement('section');
        sec.className = 'card';
        sec.id = 'securityControlCard';
        sec.style.marginTop = '16px';
        sec.innerHTML = `
          <div class="card-head"><h3 class="card-title">보안 정책 시뮬레이션</h3><div class="card-sub">SVR-007 / SVR-008</div></div>
          <div class="card-body">
            <div class="page-actions" style="margin-bottom:12px;">
              <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-copy-policy">캡처/복사 차단 토글</button>
              <button type="button" class="btn btn-primary btn-sm" data-action="start-mfa-flow">MFA 인증 시작</button>
            </div>
            <div id="securityPolicyState" class="form-help">복사 차단 비활성 · MFA 미인증</div>
            <div class="protected-zone" id="protectedZone" style="margin-top:10px;">
              고객명: 김*이터 / 연락처: 010-****-1234 / 계좌: 123-****-**** (테스트 데이터)
            </div>
            <div id="mfaPanel" style="display:none; margin-top:12px; border:1px solid var(--ink-200); border-radius:10px; padding:12px;">
              <div style="font-size:12px; color:var(--ink-600); margin-bottom:6px;">2차 인증 코드 입력 (데모 코드: 260430)</div>
              <div style="display:flex; gap:8px;">
                <input id="mfaCodeInput" class="form-input" type="text" maxlength="6" placeholder="6자리 코드" />
                <button type="button" class="btn btn-primary btn-sm" data-action="verify-mfa-code">검증</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="reset-mfa-flow">취소</button>
              </div>
            </div>
          </div>
        `;
        main.appendChild(sec);
      }
      if (view === 'home' && !main.querySelector('#rfpTrackerCard')) {
        const tr = document.createElement('section');
        tr.className = 'card';
        tr.id = 'rfpTrackerCard';
        tr.style.marginTop = '16px';
        tr.innerHTML = `
          <div class="card-head">
            <h3 class="card-title">RFP 요구사항 트래커 (38건)</h3>
            <div class="card-sub">SFR-15 · IFR-7 · TTR-1 · SVR-10 · PFR-4 · PMR-6 · COR-2</div>
          </div>
          <div class="card-body">
            <div class="sfr-tracker-grid" id="rfpTrackerGrid"></div>
          </div>
        `;
        main.appendChild(tr);
        try { renderRfpTrackerGrid(); } catch(_) {}
      }
      if (view === 'home' && !main.querySelector('#rfpControlCenterCard')) {
        const ops = document.createElement('section');
        ops.className = 'card';
        ops.id = 'rfpControlCenterCard';
        ops.style.marginTop = '16px';
        ops.innerHTML = `
          <div class="card-head"><h3 class="card-title">RFP 통합 실행 센터</h3><div class="card-sub">보안/테스트/운영/PM 요구사항 실행 시뮬레이션</div></div>
          <div class="card-body">
            <div class="page-actions" style="margin-bottom:12px; flex-wrap:wrap;">
              <button class="btn btn-ghost btn-sm" data-action="run-secure-coding">SVR-003 시큐어코딩 점검</button>
              <button class="btn btn-ghost btn-sm" data-action="run-pentest">SVR-004 모의해킹 진단</button>
              <button class="btn btn-ghost btn-sm" data-action="run-infra-vuln">SVR-005 인프라 취약점 진단</button>
              <button class="btn btn-ghost btn-sm" data-action="run-dr-test">TTR-001 DR 복구 테스트</button>
              <button class="btn btn-ghost btn-sm" data-action="run-lifecycle-job">SFR-004 Retention 작업</button>
              <button class="btn btn-ghost btn-sm" data-action="simulate-sso-fallback">IFR-007 SSO 장애대응</button>
              <button class="btn btn-ghost btn-sm" data-action="export-audit-log">SFR-010 Audit Export</button>
              <button class="btn btn-ghost btn-sm" data-action="toggle-role">권한 전환 (관리자/사용자)</button>
            </div>
            <div id="rfpOpsState" class="form-help">실행 대기 중</div>
          </div>
        `;
        main.appendChild(ops);
      }
      if (view === 'home' && !main.querySelector('#rfpEvidenceCard')) {
        const ev = document.createElement('section');
        ev.className = 'card';
        ev.id = 'rfpEvidenceCard';
        ev.style.marginTop = '16px';
        ev.innerHTML = `
          <div class="card-head">
            <div><h3 class="card-title">RFP 증적 탭</h3><div class="card-sub">보고서/결과서/산출물 실행 로그</div></div>
            <div class="req-filter-group">
              <button class="btn btn-ghost btn-sm" data-action="evidence-filter" data-filter="all">전체</button>
              <button class="btn btn-ghost btn-sm" data-action="evidence-filter" data-filter="보안">보안</button>
              <button class="btn btn-ghost btn-sm" data-action="evidence-filter" data-filter="테스트">테스트</button>
              <button class="btn btn-ghost btn-sm" data-action="evidence-filter" data-filter="운영">운영</button>
              <button class="btn btn-ghost btn-sm" data-action="evidence-filter" data-filter="PM">PM</button>
              <button class="btn btn-ghost btn-sm" data-action="evidence-date-filter" data-filter="all">전체기간</button>
              <button class="btn btn-ghost btn-sm" data-action="evidence-date-filter" data-filter="today">오늘</button>
              <button class="btn btn-ghost btn-sm" data-action="evidence-date-filter" data-filter="7d">7일</button>
              <button class="btn btn-ghost btn-sm" data-action="evidence-date-filter" data-filter="30d">30일</button>
              <button class="btn btn-ghost btn-sm" data-action="evidence-review-filter" data-filter="all">전체검토</button>
              <button class="btn btn-ghost btn-sm" data-action="evidence-review-filter" data-filter="reviewed">검토완료만</button>
              <button class="btn btn-ghost btn-sm" data-action="evidence-review-filter" data-filter="pending">검토대기만</button>
              <button class="btn btn-ghost btn-sm" data-action="evidence-toggle-group">그룹보기 OFF</button>
              <input class="form-input req-search-input" placeholder="증적 검색 (요건번호/제목)" data-action="evidence-search" />
              <button class="btn btn-ghost btn-sm" data-action="evidence-export">CSV 내보내기</button>
            </div>
          </div>
          <div class="card-body evidence-kpi-bar" id="evidenceKpiBar">
            <div class="evidence-kpi-item"><span>전체 증적</span><strong id="evidenceTotalCount">0</strong></div>
            <div class="evidence-kpi-item"><span>검토완료</span><strong id="evidenceReviewedCount">0</strong></div>
            <div class="evidence-kpi-item"><span>검토대기</span><strong id="evidencePendingCount">0</strong></div>
            <div class="evidence-kpi-item"><span>완료율</span><strong id="evidenceReviewedPct">0%</strong></div>
            <div class="evidence-kpi-item evidence-kpi-wide"><span>최근 7일 추세</span><strong id="evidenceTrendText">-</strong></div>
            <div class="evidence-kpi-item evidence-kpi-wide">
              <span>최근 7일 완료율 스파크라인</span>
              <svg id="evidenceSparkline" viewBox="0 0 240 48" preserveAspectRatio="none" aria-label="최근 7일 완료율 추이"></svg>
              <div id="evidenceSparkTooltip" class="evidence-spark-tooltip" style="display:none;">-</div>
            </div>
          </div>
          <div class="card-body" id="rfpEvidenceRows"></div>
        `;
        main.appendChild(ev);
      }
      applyRequirementAdminVisibility();
      syncSecurityPolicyState();
      renderEvidencePanel();
    }

    /* RFP requirement tracker grid (38 items) — SFR/IFR/TTR/SVR/PFR/PMR/COR */
    const RFP_TRACKER = [
      // SFR (15)
      { id: 'SFR-001', kind: 'sfr', title: 'CDC/MQ 시스템 업그레이드 · IIDR→CDC 전환', pct: 62, status: 'progress', view: 'ingestion' },
      { id: 'SFR-002', kind: 'sfr', title: '데이터 Ingestion · 3,000 파이프라인 자동화', pct: 71, status: 'progress', view: 'ingestion' },
      { id: 'SFR-003', kind: 'sfr', title: '운영 고도화 (1) · Terraform IaC + DR + 7AM-8PM 스케줄', pct: 80, status: 'progress', view: 'finops' },
      { id: 'SFR-004', kind: 'sfr', title: '운영 고도화 (2) · Unity Catalog + MERGE/Time Travel', pct: 75, status: 'progress', view: 'quality' },
      { id: 'SFR-005', kind: 'sfr', title: '운영 고도화 (3) · FinOps + DQ 모니터링', pct: 68, status: 'progress', view: 'finops' },
      { id: 'SFR-006', kind: 'sfr', title: '데이터 포털 탐색/조회 · 웹 SQL + GUI 빌더', pct: 92, status: 'done', view: 'query' },
      { id: 'SFR-007', kind: 'sfr', title: '데이터 자산화 · LLM 시멘틱 + Vector Search', pct: 54, status: 'progress', view: 'lineage' },
      { id: 'SFR-008', kind: 'sfr', title: '권한 · 보안 통합 관리 · RBAC + 동적 마스킹', pct: 88, status: 'done', view: 'permission' },
      { id: 'SFR-009', kind: 'sfr', title: '인프라 요건 개발/운영 · IaC + 자원 시각화', pct: 70, status: 'progress', view: null },
      { id: 'SFR-010', kind: 'sfr', title: '거버넌스 통합 결재 · Owner + Lifecycle + 계보', pct: 78, status: 'progress', view: 'permission' },
      { id: 'SFR-011', kind: 'sfr', title: 'BI/Mart AS-IS 분석 · QlikSense → PowerBI', pct: 38, status: 'risk', view: 'bi' },
      { id: 'SFR-012', kind: 'sfr', title: '사용자 SQL 분석 기반 DW/마트 자산화', pct: 46, status: 'progress', view: 'bi' },
      { id: 'SFR-013', kind: 'sfr', title: 'TDM 솔루션 업그레이드', pct: 22, status: 'risk', view: null },
      { id: 'SFR-014', kind: 'sfr', title: '사용자 변화 관리 · 매뉴얼 + BI 교육', pct: 30, status: 'progress', view: null },
      { id: 'SFR-015', kind: 'sfr', title: '대용량 초기이관 · IPSEC VPN 1:1 연동', pct: 55, status: 'progress', view: null },
      // IFR (7)
      { id: 'IFR-001', kind: 'ifr', title: '인프라 일반 · 1년 Warranty + 무상 유지보수', pct: 84, status: 'done', view: null },
      { id: 'IFR-002', kind: 'ifr', title: '시스템 구성 · Azure + AKS', pct: 78, status: 'progress', view: null },
      { id: 'IFR-003', kind: 'ifr', title: 'DBMS/Web/WAS · Apache + SpringBoot', pct: 82, status: 'progress', view: null },
      { id: 'IFR-004', kind: 'ifr', title: '인프라 기타 · 가용성/성능 검증', pct: 65, status: 'progress', view: null },
      { id: 'IFR-005', kind: 'ifr', title: '솔루션 운영 기능 · Ping SSO + AD', pct: 91, status: 'done', view: null },
      { id: 'IFR-006', kind: 'ifr', title: '시스템 운영관리 · PoleStar/Jennifer/MaxGauge', pct: 73, status: 'progress', view: null },
      { id: 'IFR-007', kind: 'ifr', title: 'SSO + 인사정보 연동 · 장애 fallback', pct: 88, status: 'done', view: null },
      // TTR (1)
      { id: 'TTR-001', kind: 'ttr', title: '테스트 유형/범위 · Unit/Integration/Performance/DR', pct: 58, status: 'progress', view: 'ingestion' },
      // SVR (10)
      { id: 'SVR-001', kind: 'svr', title: '보안 관리 · 취약점 진단 기준 (KISA 인증사)', pct: 70, status: 'progress', view: null },
      { id: 'SVR-002', kind: 'svr', title: '보안성 심의(검토) · 금융보안원 가이드', pct: 64, status: 'progress', view: null },
      { id: 'SVR-003', kind: 'svr', title: '시큐어 코딩 · Veracode Greenlight', pct: 82, status: 'done', view: null },
      { id: 'SVR-004', kind: 'svr', title: '모의 해킹 진단 (테스트 단계)', pct: 40, status: 'progress', view: null },
      { id: 'SVR-005', kind: 'svr', title: '인프라/클라우드 취약점 · Qualys/Prisma', pct: 55, status: 'progress', view: null },
      { id: 'SVR-006', kind: 'svr', title: '보안 추가 요구사항', pct: 60, status: 'progress', view: null },
      { id: 'SVR-007', kind: 'svr', title: '화면 캡쳐/Copy/Paste 차단', pct: 95, status: 'done', view: 'permission' },
      { id: 'SVR-008', kind: 'svr', title: 'Multi Factor Authentication', pct: 88, status: 'done', view: 'permission' },
      { id: 'SVR-009', kind: 'svr', title: '데이터 암호화 (AES-256+)', pct: 92, status: 'done', view: null },
      { id: 'SVR-010', kind: 'svr', title: '개인정보 마스킹 적용', pct: 90, status: 'done', view: 'permission' },
      // PFR (4)
      { id: 'PFR-001', kind: 'pfr', title: '주요 투입인력 자격 · PM/DA/CA/DE/MLE/BI', pct: 68, status: 'progress', view: null },
      { id: 'PFR-002', kind: 'pfr', title: '프로젝트 수행 계획 · 착수/중간/완료 보고', pct: 75, status: 'progress', view: null },
      { id: 'PFR-003', kind: 'pfr', title: '안정화 운영 · Hyper-care + 인수인계', pct: 22, status: 'progress', view: null },
      { id: 'PFR-004', kind: 'pfr', title: '글로벌 ARB 승인 · OSS Governance', pct: 35, status: 'progress', view: null },
      // PMR (6)
      { id: 'PMR-001', kind: 'pmr', title: 'MPPM 기반 산출물 관리', pct: 70, status: 'progress', view: null },
      { id: 'PMR-002', kind: 'pmr', title: '일정 관리 · WBS + 정기보고', pct: 78, status: 'progress', view: null },
      { id: 'PMR-003', kind: 'pmr', title: '투입인력 관리 · 핵심인력 교체 불가', pct: 82, status: 'done', view: null },
      { id: 'PMR-004', kind: 'pmr', title: '품질 보증 · QA + Agile PI/Sprint', pct: 65, status: 'progress', view: null },
      { id: 'PMR-005', kind: 'pmr', title: '보안관리 · 비밀유지서약서', pct: 88, status: 'done', view: null },
      { id: 'PMR-006', kind: 'pmr', title: '교육 · 기술이전 (인수인계)', pct: 18, status: 'progress', view: null },
      // COR (2)
      { id: 'COR-001', kind: 'cor', title: '제약사항 일반 · 손해배상 책임', pct: 100, status: 'done', view: null },
      { id: 'COR-002', kind: 'cor', title: '산출물 소유권 · 회사 귀속', pct: 100, status: 'done', view: null },
    ];

    function renderRfpTrackerGrid() {
      const host = document.getElementById('rfpTrackerGrid');
      if (!host) return;
      const total = RFP_TRACKER.length;
      const avg = Math.round(RFP_TRACKER.reduce((a,b) => a + b.pct, 0) / total);
      const done = RFP_TRACKER.filter(r => r.status === 'done').length;
      const risk = RFP_TRACKER.filter(r => r.status === 'risk').length;
      host.innerHTML = `
        <div class="sfr-card status-done" style="background:linear-gradient(135deg, var(--mint-50), white);">
          <div class="sfr-card-head"><span class="sfr-id">SUMMARY</span><span class="sfr-kind-badge kind-sfr">전체</span></div>
          <div class="sfr-card-title">전체 평균 진척도 ${avg}% · ${done}건 완료 · ${risk}건 리스크</div>
          <div class="sfr-progress-bar"><div style="width:${avg}%"></div></div>
          <div class="sfr-card-foot"><span>총 38건 요구사항</span><span>${avg}%</span></div>
        </div>
        ${RFP_TRACKER.map(r => `
          <div class="sfr-card ${r.status === 'done' ? 'status-done' : (r.status === 'risk' ? 'status-risk' : '')}"
               ${r.view ? `data-action="jump-view" data-view="${r.view}"` : ''}>
            <div class="sfr-card-head">
              <span class="sfr-id">${r.id}</span>
              <span class="sfr-kind-badge kind-${r.kind}">${r.kind.toUpperCase()}</span>
            </div>
            <div class="sfr-card-title">${r.title}</div>
            <div class="sfr-progress-bar"><div style="width:${r.pct}%"></div></div>
            <div class="sfr-card-foot">
              <span>${r.status === 'done' ? '✓ 완료' : (r.status === 'risk' ? '⚠ 리스크' : '진행중')}</span>
              <span>${r.pct}%</span>
            </div>
          </div>
        `).join('')}
      `;
    }

    function applyRequirementAdminVisibility() {
      const canEdit = currentUserRole === 'admin';
      document.querySelectorAll(
        '[data-action="toggle-req-edit-mode"],[data-action="export-req-state"],[data-action="import-req-state"],[data-action="reset-req-state"]'
      ).forEach((el) => {
        el.style.display = canEdit ? '' : 'none';
      });
    }

    function markRequirementStatus(ids, status) {
      Object.values(REQUIREMENT_MATRIX).forEach((rows) => {
        rows.forEach((r) => {
          if (ids.includes(r.id)) r.status = status;
        });
      });
      persistRequirementState();
      renderRequirementChecklist(currentView);
    }

    function setOpsState(msg) {
      const el = document.getElementById('rfpOpsState');
      if (el) el.textContent = msg;
    }

    function loadEvidenceLogs() {
      try {
        const raw = localStorage.getItem(EVIDENCE_KEY);
        evidenceLogs = raw ? JSON.parse(raw) : [];
      } catch {
        evidenceLogs = [];
      }
    }

    function persistEvidenceLogs() {
      try {
        localStorage.setItem(EVIDENCE_KEY, JSON.stringify(evidenceLogs.slice(0, 300)));
      } catch {
        // ignore storage failure
      }
    }

    function addEvidence(category, title, detail, requirementIds = []) {
      evidenceLogs.unshift({
        id: `EV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ts: new Date().toISOString(),
        category,
        title,
        detail,
        requirementIds,
        reviewed: false,
        reviewedAt: '',
        reviewedBy: '',
        reviewComment: ''
      });
      persistEvidenceLogs();
      renderEvidencePanel();
    }

    function renderEvidencePanel() {
      const host = document.getElementById('rfpEvidenceRows');
      if (!host) return;
      const total = evidenceLogs.length;
      const reviewed = evidenceLogs.filter((e) => e.reviewed).length;
      const pending = Math.max(0, total - reviewed);
      const pct = total ? Math.round((reviewed / total) * 100) : 0;
      const now = Date.now();
      const dayMs = 86400000;
      const recentSet = evidenceLogs.filter((e) => now - new Date(e.ts).getTime() <= dayMs * 7);
      const prevSet = evidenceLogs.filter((e) => {
        const age = now - new Date(e.ts).getTime();
        return age > dayMs * 7 && age <= dayMs * 14;
      });
      const recentPct = recentSet.length ? Math.round((recentSet.filter((e) => e.reviewed).length / recentSet.length) * 100) : 0;
      const prevPct = prevSet.length ? Math.round((prevSet.filter((e) => e.reviewed).length / prevSet.length) * 100) : 0;
      const trendDelta = recentPct - prevPct;
      const volumeDelta = recentSet.length - prevSet.length;
      const trendText = `${trendDelta >= 0 ? '▲' : '▼'} 완료율 ${Math.abs(trendDelta)}%p · 증적 ${volumeDelta >= 0 ? '+' : ''}${volumeDelta}건`;
      const totalEl = document.getElementById('evidenceTotalCount');
      const reviewedEl = document.getElementById('evidenceReviewedCount');
      const pendingEl = document.getElementById('evidencePendingCount');
      const pctEl = document.getElementById('evidenceReviewedPct');
      const trendEl = document.getElementById('evidenceTrendText');
      if (totalEl) totalEl.textContent = String(total);
      if (reviewedEl) reviewedEl.textContent = String(reviewed);
      if (pendingEl) pendingEl.textContent = String(pending);
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (trendEl) {
        trendEl.textContent = trendText;
        trendEl.style.color = trendDelta >= 0 ? 'var(--success)' : 'var(--danger)';
      }
      const spark = document.getElementById('evidenceSparkline');
      if (spark) {
        const dayBuckets = Array.from({ length: 7 }, (_, i) => {
          const start = now - dayMs * (6 - i + 1);
          const end = now - dayMs * (6 - i);
          const rows = evidenceLogs.filter((e) => {
            const ts = new Date(e.ts).getTime();
            return ts >= start && ts < end;
          });
          const pctVal = rows.length ? Math.round((rows.filter((e) => e.reviewed).length / rows.length) * 100) : 0;
          return { pctVal, start, end };
        });
        const max = Math.max(100, ...dayBuckets.map((d) => d.pctVal));
        evidenceSparkMeta = dayBuckets.map((d, i) => {
          const x = (i / 6) * 240;
          const y = 48 - (d.pctVal / max) * 44 - 2;
          return {
            x,
            y: Math.max(2, Math.min(46, y)),
            pct: d.pctVal,
            label: new Date(d.end).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
          };
        });
        const points = evidenceSparkMeta.map((p) => `${p.x},${p.y}`).join(' ');
        const circles = evidenceSparkMeta.map((p, idx) =>
          `<circle class="spark-point" cx="${p.x}" cy="${p.y}" r="3.2" data-action="spark-hover" data-idx="${idx}"></circle>`
        ).join('');
        const last = evidenceSparkMeta[evidenceSparkMeta.length - 1]?.pct || 0;
        spark.innerHTML = `
          <polyline points="${points}" fill="none" stroke="var(--ml-blue)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></polyline>
          ${circles}
          <line x1="0" y1="46" x2="240" y2="46" stroke="var(--ink-200)" stroke-width="1"></line>
          <text x="238" y="12" text-anchor="end" fill="var(--ink-500)" font-size="9">${last}%</text>
        `;
      }
      const rows = evidenceLogs.filter((e) => {
        const passCategory = evidenceFilter === 'all' ? true : e.category === evidenceFilter;
        const age = now - new Date(e.ts).getTime();
        const passDate = evidenceDateFilter === 'all'
          ? true
          : evidenceDateFilter === 'today'
            ? age <= 86400000
            : evidenceDateFilter === '7d'
              ? age <= 86400000 * 7
              : age <= 86400000 * 30;
        const q = evidenceQuery.trim().toUpperCase();
        const target = `${e.title} ${(e.requirementIds || []).join(' ')} ${e.detail}`.toUpperCase();
        const passQuery = !q || target.includes(q);
        const passReview = evidenceReviewFilter === 'all'
          ? true
          : evidenceReviewFilter === 'reviewed'
            ? e.reviewed
            : !e.reviewed;
        return passCategory && passDate && passQuery && passReview;
      });
      if (!rows.length) {
        host.innerHTML = '<div class="form-help">저장된 증적이 없습니다.</div>';
      } else if (evidenceGroupMode) {
        const groups = {};
        rows.forEach((e) => {
          const keys = e.requirementIds && e.requirementIds.length ? e.requirementIds : ['UNMAPPED'];
          keys.forEach((k) => {
            if (!groups[k]) groups[k] = [];
            groups[k].push(e);
          });
        });
        const keys = Object.keys(groups).sort();
        host.innerHTML = keys.map((k, idx) => `
          <details class="evidence-group" ${idx === 0 ? 'open' : ''}>
            <summary>${escapeHtmlCell(k)} <span class="badge badge-neutral">${groups[k].length}건</span></summary>
            <div style="margin-top:8px;">
              ${groups[k].map((e) => `
                <div class="evidence-row">
                  <div class="evidence-head"><strong>${escapeHtmlCell(e.title)}</strong><span class="badge ${e.reviewed ? 'badge-success' : 'badge-warning'}">${e.reviewed ? '검토완료' : '검토대기'}</span></div>
                  <div class="evidence-meta">${new Date(e.ts).toLocaleString('ko-KR')} · ${escapeHtmlCell(e.category)}</div>
                  <div class="evidence-detail">${escapeHtmlCell(e.detail)}</div>
                  <div style="margin-top:8px; display:flex; justify-content:flex-end; gap:6px;">
                    <button type="button" class="btn btn-ghost btn-sm" data-action="evidence-open-detail" data-evidence-id="${e.id}">상세 보기</button>
                    <button type="button" class="btn btn-ghost btn-sm" data-action="evidence-review-toggle" data-evidence-id="${e.id}">${e.reviewed ? '검토해제' : '검토완료'}</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </details>
        `).join('');
      } else {
        host.innerHTML = rows.map((e) => `
          <div class="evidence-row">
            <div class="evidence-head"><strong>${escapeHtmlCell(e.title)}</strong><span class="badge badge-info">${escapeHtmlCell(e.category)}</span></div>
            <div class="evidence-meta">${new Date(e.ts).toLocaleString('ko-KR')} · ${escapeHtmlCell((e.requirementIds || []).join(', ') || '-')}</div>
            <div class="evidence-detail">${escapeHtmlCell(e.detail)}</div>
            <div style="margin-top:8px; display:flex; justify-content:flex-end; gap:6px;">
              <button type="button" class="btn btn-ghost btn-sm" data-action="evidence-open-detail" data-evidence-id="${e.id}">상세 보기</button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="evidence-review-toggle" data-evidence-id="${e.id}">${e.reviewed ? '검토해제' : '검토완료'}</button>
            </div>
          </div>
        `).join('');
      }
      document.querySelectorAll('[data-action="evidence-filter"]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.filter === evidenceFilter);
      });
      document.querySelectorAll('[data-action="evidence-date-filter"]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.filter === evidenceDateFilter);
      });
      document.querySelectorAll('[data-action="evidence-review-filter"]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.filter === evidenceReviewFilter);
      });
      const groupBtn = document.querySelector('[data-action="evidence-toggle-group"]');
      if (groupBtn) {
        groupBtn.classList.toggle('active', evidenceGroupMode);
        groupBtn.textContent = evidenceGroupMode ? '그룹보기 ON' : '그룹보기 OFF';
      }
    }

    function openEvidenceDetail(id) {
      const ev = evidenceLogs.find((x) => x.id === id);
      if (!ev) return;
      const sub = document.getElementById('evidenceDetailSub');
      const body = document.getElementById('evidenceDetailBody');
      if (sub) sub.textContent = `${new Date(ev.ts).toLocaleString('ko-KR')} · ${ev.category}`;
      if (body) {
        body.innerHTML = `
          <div style="display:grid; grid-template-columns:120px 1fr; gap:8px; font-size:13px;">
            <strong>제목</strong><span>${escapeHtmlCell(ev.title)}</span>
            <strong>요건번호</strong><span>${escapeHtmlCell((ev.requirementIds || []).join(', ') || '-')}</span>
            <strong>상세</strong><span>${escapeHtmlCell(ev.detail)}</span>
            <strong>검토상태</strong><span>${ev.reviewed ? `완료 (${escapeHtmlCell(ev.reviewedBy || 'reviewer')}, ${new Date(ev.reviewedAt).toLocaleString('ko-KR')})` : '검토대기'}</span>
            <strong>검토코멘트</strong><span>${escapeHtmlCell(ev.reviewComment || '-')}</span>
            <strong>증적 ID</strong><span style="font-family:monospace;">${escapeHtmlCell(ev.id)}</span>
          </div>
        `;
      }
      document.getElementById('evidenceDetailModal')?.classList.add('show');
    }

    function closeEvidenceDetailModal() {
      document.getElementById('evidenceDetailModal')?.classList.remove('show');
    }

    function exportEvidenceCsv() {
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = ['timestamp,category,title,requirements,detail,reviewed,reviewed_by,reviewed_at,review_comment'];
      evidenceLogs.forEach((e) => {
        lines.push([
          e.ts,
          e.category,
          e.title,
          (e.requirementIds || []).join('|'),
          e.detail,
          e.reviewed ? 'Y' : 'N',
          e.reviewedBy || '',
          e.reviewedAt || '',
          e.reviewComment || ''
        ].map(esc).join(','));
      });
      const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `metlife-rfp-evidence-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast('증적 내보내기', 'RFP 증적 로그를 CSV로 저장했습니다.', 'success');
    }

    function syncSecurityPolicyState() {
      const el = document.getElementById('securityPolicyState');
      if (!el) return;
      const c = copyProtectionEnabled ? '복사 차단 활성' : '복사 차단 비활성';
      const m = mfaVerified ? 'MFA 인증 완료' : 'MFA 미인증';
      el.textContent = `${c} · ${m}`;
    }

    function getViewTemplateHtml(view) {
      if (view === 'home') {
        return `
          <section class="view">
            <div class="page-head">
              <div class="page-title-wrap">
                <div class="page-eyebrow">rfp aligned</div>
                <h1 class="page-title">MetLife Data Platform Modernization</h1>
                <p class="page-desc">SFR/IFR/SVR/TTR 요구사항을 메뉴별 기능으로 구현한 통합 포털입니다.</p>
              </div>
            </div>
            <div class="kpi-grid">
              <div class="kpi"><div class="kpi-label">Ingestion 파이프라인</div><div class="kpi-value">3,000</div></div>
              <div class="kpi"><div class="kpi-label">CDC / Batch</div><div class="kpi-value">1,500 / 1,500</div></div>
              <div class="kpi"><div class="kpi-label">보안 통제 항목</div><div class="kpi-value">10</div></div>
              <div class="kpi"><div class="kpi-label">BI 리포트</div><div class="kpi-value">400</div></div>
            </div>
            <div class="pillars">
              <article class="pillar" data-action="jump-view" data-view="ingestion"><div class="pillar-title">Ingestion · 운영 고도화</div><div class="pillar-meta">SFR-001~005 · CDC/MQ/DR/모니터링</div></article>
              <article class="pillar" data-action="jump-view" data-view="query"><div class="pillar-title">데이터 탐색 · 조회</div><div class="pillar-meta">SFR-006 · SQL/GUI 조회 및 실행</div></article>
              <article class="pillar" data-action="jump-view" data-view="permission"><div class="pillar-title">권한 · 보안 · 결재</div><div class="pillar-meta">SFR-008/010 · 마스킹/승인/Audit</div></article>
              <article class="pillar" data-action="jump-view" data-view="bi"><div class="pillar-title">BI/TDM/변화관리</div><div class="pillar-meta">SFR-011~014 · 전환/교육/정착</div></article>
            </div>
          </section>`;
      }
      if (view === 'ingestion') {
        return `
          <section class="view">
            <div class="page-head">
              <div class="page-title-wrap">
                <div class="page-eyebrow">SFR-001 · 002 · 005 · TTR-001</div>
                <h1 class="page-title">Ingestion · CDC</h1>
                <p class="page-desc">IBM IIDR 11.5 / MQ 9.3 → CDC 모듈 전환 · 3,000 파이프라인 모니터링 · 큐 재분류 · 정합성 검증</p>
              </div>
              <div class="page-actions">
                <button class="btn btn-secondary btn-sm" data-action="run-cdc-recon">정합성 검증 실행</button>
                <button class="btn btn-primary btn-sm" data-action="open-pipeline-create">파이프라인 생성</button>
              </div>
            </div>

            <div class="kpi-grid">
              <div class="kpi"><div class="kpi-label">총 파이프라인</div><div class="kpi-value" id="pipelineCount">3,124</div><div class="kpi-delta">/ 3,000 목표</div></div>
              <div class="kpi"><div class="kpi-label">CDC : Batch</div><div class="kpi-value">1,512 : 1,612</div><div class="kpi-delta">실시간 49%</div></div>
              <div class="kpi"><div class="kpi-label">평균 TPS</div><div class="kpi-value">1,840</div><div class="kpi-delta up">+8.2% MoM</div></div>
              <div class="kpi"><div class="kpi-label">P95 지연</div><div class="kpi-value">428ms</div><div class="kpi-delta">SLA 500ms</div></div>
            </div>

            <!-- Queue mapping board (SFR-001-4: 큐 재분류) -->
            <div class="queue-mapping-board">
              <div class="queue-card q-high">
                <div class="queue-card-head">
                  <span class="queue-card-title">상 (High)</span>
                  <span class="queue-card-meta"><strong>418</strong>개 · CDC 우선</span>
                </div>
                <div class="queue-card-body">
                  <div class="queue-table-row"><span class="table-name">SRC_CONTRACT_HDR</span><span class="table-tag cdc">CDC</span></div>
                  <div class="queue-table-row"><span class="table-name">SRC_CLAIM_PAYMENT</span><span class="table-tag cdc">CDC</span></div>
                  <div class="queue-table-row"><span class="table-name">SRC_CUSTOMER_BASE</span><span class="table-tag cdc">CDC</span></div>
                  <div class="queue-table-row"><span class="table-name">SRC_POLICY_STATUS</span><span class="table-tag cdc">CDC</span></div>
                  <div class="queue-table-row"><span class="table-name">SRC_PREMIUM_TRX</span><span class="table-tag cdc">CDC</span></div>
                </div>
              </div>
              <div class="queue-card q-medium">
                <div class="queue-card-head">
                  <span class="queue-card-title">중 (Medium)</span>
                  <span class="queue-card-meta"><strong>894</strong>개 · 혼합</span>
                </div>
                <div class="queue-card-body">
                  <div class="queue-table-row"><span class="table-name">SRC_AGENT_PERF</span><span class="table-tag batch">BATCH</span></div>
                  <div class="queue-table-row"><span class="table-name">SRC_PRODUCT_PRICE</span><span class="table-tag cdc">CDC</span></div>
                  <div class="queue-table-row"><span class="table-name">SRC_CHANNEL_STAT</span><span class="table-tag batch">BATCH</span></div>
                  <div class="queue-table-row"><span class="table-name">SRC_CAMPAIGN_RES</span><span class="table-tag batch">BATCH</span></div>
                  <div class="queue-table-row"><span class="table-name">SRC_LOSS_RATIO</span><span class="table-tag batch">BATCH</span></div>
                </div>
              </div>
              <div class="queue-card q-low">
                <div class="queue-card-head">
                  <span class="queue-card-title">하 (Low)</span>
                  <span class="queue-card-meta"><strong>1,812</strong>개 · 배치</span>
                </div>
                <div class="queue-card-body">
                  <div class="queue-table-row"><span class="table-name">SRC_LEGACY_LOG</span><span class="table-tag batch">BATCH</span></div>
                  <div class="queue-table-row"><span class="table-name">SRC_AUDIT_HIST</span><span class="table-tag batch">BATCH</span></div>
                  <div class="queue-table-row"><span class="table-name">SRC_REF_CODE</span><span class="table-tag batch">BATCH</span></div>
                  <div class="queue-table-row"><span class="table-name">SRC_DEPRECATED</span><span class="table-tag batch">BATCH</span></div>
                  <div class="queue-table-row"><span class="table-name">SRC_ARCHIVE</span><span class="table-tag batch">BATCH</span></div>
                </div>
              </div>
            </div>

            <div class="dash-grid">
              <div class="card"><div class="card-head"><h3 class="card-title">실시간 TPS 추이</h3><div class="card-sub">ADF + Databricks 통합 로그</div></div><div class="card-body chart-wrap"><canvas id="tpsChart"></canvas></div></div>
              <div class="card"><div class="card-head"><h3 class="card-title">상태 분포</h3></div><div class="card-body chart-wrap"><canvas id="statusChart"></canvas></div></div>
            </div>

            <!-- CDC 정합성 검증 (SFR-002-5: 소스-타겟 건수 검증) -->
            <div class="card" style="margin-top:14px;">
              <div class="card-head">
                <h3 class="card-title">소스-타겟 정합성 검증 · SRC_CONTRACT_HDR</h3>
                <div class="card-sub">SFR-002-5 · 자동화 정합성 체크 (마지막 실행: 12분 전)</div>
              </div>
              <div class="card-body">
                <div class="cdc-recon-card">
                  <div class="cdc-recon-tile match">
                    <div class="cdc-recon-tile-label">Source 건수</div>
                    <div class="cdc-recon-tile-value">12,481,920</div>
                    <div class="cdc-recon-tile-sub">DB2 · IRS</div>
                  </div>
                  <div class="cdc-recon-tile match">
                    <div class="cdc-recon-tile-label">Target 건수</div>
                    <div class="cdc-recon-tile-value">12,481,896</div>
                    <div class="cdc-recon-tile-sub">Databricks · Bronze</div>
                  </div>
                  <div class="cdc-recon-tile diff">
                    <div class="cdc-recon-tile-label">차이</div>
                    <div class="cdc-recon-tile-value">−24</div>
                    <div class="cdc-recon-tile-sub">Delta 동기화 대기</div>
                  </div>
                  <div class="cdc-recon-tile delete">
                    <div class="cdc-recon-tile-label">Delete log</div>
                    <div class="cdc-recon-tile-value">142</div>
                    <div class="cdc-recon-tile-sub">별도 관리 (SFR-001-6)</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="card" style="margin-top:14px;"><div class="card-head"><h3 class="card-title">파이프라인 목록</h3></div><div class="pipeline-list" id="pipelineList"></div></div>
            <div class="card" style="margin-top:14px;"><div class="card-head"><h3 class="card-title">부하 히트맵</h3><div class="card-sub">시간대별 24h × 7d</div></div><div class="card-body"><div id="heatmap" class="heatmap-grid"></div></div></div>

            <div class="card" style="margin-top:14px;">
              <div class="card-head"><h3 class="card-title">RFP 요구사항 검증 상태</h3></div>
              <div class="card-body">
                <div class="q-issue"><div class="q-issue-table">SFR-001-1</div><div class="q-issue-rule">IBM IIDR 11.5 / MQ → CDC 전환</div><div class="q-issue-impact">진행중</div><div><span class="badge badge-warning">62%</span></div></div>
                <div class="q-issue"><div class="q-issue-table">SFR-001-4</div><div class="q-issue-rule">큐 재분류 (상/중/하 그룹화)</div><div class="q-issue-impact">완료</div><div><span class="badge badge-success">OK</span></div></div>
                <div class="q-issue"><div class="q-issue-table">SFR-001-6</div><div class="q-issue-rule">Delete log 별도 관리</div><div class="q-issue-impact">구현</div><div><span class="badge badge-success">OK</span></div></div>
                <div class="q-issue"><div class="q-issue-table">SFR-002-4</div><div class="q-issue-rule">Checkpoint 재시작/재처리</div><div class="q-issue-impact">구현</div><div><span class="badge badge-success">OK</span></div></div>
                <div class="q-issue"><div class="q-issue-table">SFR-002-5</div><div class="q-issue-rule">소스-타겟 정합성 자동 검증</div><div class="q-issue-impact">구현</div><div><span class="badge badge-success">OK</span></div></div>
                <div class="q-issue"><div class="q-issue-table">SFR-005-3</div><div class="q-issue-rule">TPS · 지연 · 성공률 시각화</div><div class="q-issue-impact">구현</div><div><span class="badge badge-success">OK</span></div></div>
                <div class="q-issue"><div class="q-issue-table">TTR-001</div><div class="q-issue-rule">DR 복구 시나리오 테스트</div><div class="q-issue-impact">진행중</div><div><span class="badge badge-warning">RUN</span></div></div>
              </div>
            </div>
          </section>`;
      }
      if (view === 'query') {
        const hour = new Date().getHours();
        const clusterRunning = (hour >= 7 && hour < 20);
        const clusterDot = clusterRunning ? 'active' : 'cold';
        const clusterText = clusterRunning ? 'RUNNING (Photon)' : 'SUSPENDED · 캐시조회';
        const clusterHint = clusterRunning ? '실시간 처리 가능' : `재기동까지 ${20 - hour < 0 ? 24 + (20 - hour) : 20 - hour}h`;
        return `
          <section class="view">
            <div class="page-head">
              <div class="page-title-wrap">
                <div class="page-eyebrow">SFR-006 · 007 · 012</div>
                <h1 class="page-title">쿼리 에디터</h1>
                <p class="page-desc">웹 SQL · GUI 빌더 · NLQ → SQL · 자산화 · Unity Catalog 연동 · 실행이력 분석</p>
              </div>
              <div class="page-actions">
                <button class="btn btn-ghost btn-sm" data-action="switch-query-mode" data-mode="sql">SQL 모드</button>
                <button class="btn btn-ghost btn-sm" data-action="switch-query-mode" data-mode="visual">Visual 모드</button>
              </div>
            </div>

            <div class="query-statusbar">
              <div>
                <span class="query-stat-label">Workspace</span>
                <span class="query-stat-value"><span class="query-stat-dot active"></span>metlife-prod</span>
              </div>
              <div>
                <span class="query-stat-label">SQL Warehouse</span>
                <span class="query-stat-value" id="qsbCluster"><span class="query-stat-dot ${clusterDot}"></span>${clusterText}</span>
              </div>
              <div>
                <span class="query-stat-label">Catalog</span>
                <span class="query-stat-value">unity_catalog · prod</span>
              </div>
              <div>
                <span class="query-stat-label">PII 마스킹</span>
                <span class="query-stat-value"><span class="query-stat-dot warn"></span>활성</span>
              </div>
              <div>
                <span class="query-stat-label">결과 캐시</span>
                <span class="query-stat-value" id="qsbCache"><span class="query-stat-dot active"></span>${clusterRunning ? '24h TTL' : '읽기전용 · ' + clusterHint}</span>
              </div>
            </div>

            <div class="card" style="margin-bottom:14px;">
              <div class="card-body" style="display:grid; grid-template-columns:1fr auto auto; gap:8px; align-items:center;">
                <input id="nlqInput" class="form-input" placeholder="자연어 질의 예) 최근 3개월 ACTIVE 계약 상위 50명 프리미엄 합계" />
                <button type="button" class="btn btn-secondary btn-sm" data-action="generate-sql-nlq">NLQ → SQL</button>
                <button type="button" class="btn btn-ghost btn-sm" data-action="clear-nlq">초기화</button>
                <div id="nlqPolicyHint" class="form-help" style="grid-column:1 / -1;">정책 검사 대기 중 · Vector Search 후보 LLM 연동 예정 (SFR-007)</div>
              </div>
            </div>

            <div class="query-pane-v2">

              <!-- LEFT: Schema panel v2 -->
              <aside class="schema-panel-v2">
                <div class="schema-tabs">
                  <button class="schema-tab active" data-action="schema-tab" data-tab="catalog">카탈로그</button>
                  <button class="schema-tab" data-action="schema-tab" data-tab="recent">최근 사용</button>
                </div>
                <div class="schema-search"><input type="text" placeholder="테이블/컬럼 검색" data-action="filter-schema" id="schemaSearchInput"/></div>
                <div class="schema-tree-v2" id="schemaTree"></div>
                <div class="saved-queries">
                  <div class="saved-queries-head">
                    <span>저장된 쿼리</span>
                    <button type="button" data-action="save-current-query">+ 저장</button>
                  </div>
                  <div id="savedQueriesList"></div>
                </div>
              </aside>

              <!-- CENTER: Editor + Builder + Results -->
              <section class="editor-area mode-sql" id="editorArea" style="position: relative;">
                <div class="sql-editor">
                  <div class="sql-toolbar">
                    <span class="filename">query.sql</span><span class="spacer"></span>
                    <button type="button" data-action="format-sql">Format</button>
                    <button type="button" data-action="explain-sql">Explain</button>
                    <button type="button" data-action="save-query-draft">Draft 저장</button>
                    <button type="button" data-action="export-query-csv">CSV</button>
                    <button type="button" data-action="export-query-xlsx">Excel용</button>
                    <button type="button" class="run-btn" data-action="run-query">Run ▶</button>
                  </div>
                  <pre class="sql-gutter" id="sqlGutter">1</pre>
                  <pre class="sql-hl" id="sqlHl"></pre>
                  <textarea id="sqlEditor" class="sql-textarea" spellcheck="false" wrap="off">SELECT customer_id, policy_no, contract_dt, premium FROM dm_policy.fact_contract WHERE status = 'ACTIVE' LIMIT 50;</textarea>
                </div>

                <!-- Autocomplete dropdown -->
                <div class="sql-autocomplete" id="sqlAutocomplete"></div>

                <div class="builder-bar" id="builderBar">
                  <div class="builder-clause" data-clause="SELECT"><span class="builder-clause-label">SELECT</span><span class="chip">customer_id <button type="button" data-action="builder-remove-chip">×</button></span><span class="chip">policy_no <button type="button" data-action="builder-remove-chip">×</button></span></div>
                  <div class="builder-clause" data-clause="FROM"><span class="builder-clause-label">FROM</span><span class="chip">dm_policy.fact_contract <button type="button" data-action="builder-remove-chip">×</button></span></div>
                  <div class="builder-clause" data-clause="WHERE"><span class="builder-clause-label">WHERE</span><span class="chip">status = 'ACTIVE' <button type="button" data-action="builder-remove-chip">×</button></span></div>
                </div>

                <div class="results-pane">
                  <div class="results-head">
                    <span class="results-stat" id="qStatus">● 대기</span>
                    <span class="results-stat">Time <strong id="qTime">-</strong></span>
                    <span class="results-stat">Scan <strong id="qScan">-</strong></span>
                    <span class="results-stat">Rows <strong id="qRows">0</strong></span>
                  </div>

                  <!-- Result tabs -->
                  <div class="results-tabs">
                    <button class="result-tab active" data-action="result-tab" data-tab="table">테이블 <span class="badge-count" id="resultTabBadgeRows">0</span></button>
                    <button class="result-tab" data-action="result-tab" data-tab="chart">차트</button>
                    <button class="result-tab" data-action="result-tab" data-tab="summary">요약 통계</button>
                  </div>

                  <!-- Table section -->
                  <div class="results-section active" id="resultSection-table">
                    <div class="results-head" style="border-top:1px solid var(--ink-100);">
                      <input id="resultFilterInput" class="form-input" placeholder="결과 필터 (예: =ACTIVE, >1000)" style="max-width:220px;" />
                      <span class="results-stat">Top N</span>
                      <input id="resultSampleNInput" class="form-input" type="number" min="0" step="10" value="0" style="width:80px;" />
                      <span class="results-stat">Page</span>
                      <select id="resultPageSizeSelect" class="form-select" style="width:80px;">
                        <option value="20">20</option><option value="50">50</option><option value="100">100</option>
                      </select>
                      <span class="spacer"></span>
                      <button type="button" class="btn btn-ghost btn-sm" data-action="result-prev-page">◀</button>
                      <span class="results-stat"><strong id="resultPageInfo">1 / 1</strong></span>
                      <button type="button" class="btn btn-ghost btn-sm" data-action="result-next-page">▶</button>
                    </div>
                    <div class="results-grid" id="resultsGrid"></div>
                  </div>

                  <!-- Chart section -->
                  <div class="results-section" id="resultSection-chart">
                    <div class="results-chart-wrap">
                      <div class="results-chart-controls">
                        <label>Type</label>
                        <select id="resultChartType" class="form-select">
                          <option value="bar">Bar</option>
                          <option value="line">Line</option>
                          <option value="doughnut">Doughnut</option>
                          <option value="horizontalBar">Horizontal Bar</option>
                        </select>
                        <label>X</label>
                        <select id="resultChartX" class="form-select"></select>
                        <label>Y</label>
                        <select id="resultChartY" class="form-select"></select>
                        <button class="btn btn-secondary btn-sm" data-action="render-result-chart">차트 그리기</button>
                      </div>
                      <div class="chart-wrap" style="height: 280px;"><canvas id="resultChartCanvas"></canvas></div>
                    </div>
                  </div>

                  <!-- Summary stats section -->
                  <div class="results-section" id="resultSection-summary">
                    <div class="results-summary-grid" id="resultsSummaryGrid"></div>
                  </div>
                </div>
              </section>

              <!-- RIGHT: Context panel -->
              <aside class="qctx-panel">
                <div class="qctx-tabs">
                  <button class="qctx-tab active" data-action="qctx-tab" data-tab="overview">개요</button>
                  <button class="qctx-tab" data-action="qctx-tab" data-tab="plan">실행계획</button>
                  <button class="qctx-tab" data-action="qctx-tab" data-tab="policy">정책</button>
                </div>
                <div class="qctx-body" id="qctxBody"></div>
              </aside>

            </div>

            <div class="card" style="margin-top:14px;">
              <div class="card-head"><h3 class="card-title">최근 실행 이력</h3><div class="page-actions"><button class="btn btn-ghost btn-sm" data-action="clear-query-history">이력 비우기</button></div></div>
              <div class="card-body" id="queryHistoryList"></div>
            </div>

            <div class="card asset-card-wrap" style="margin-top:14px;">
              <div class="card-head">
                <h3 class="card-title"><span id="assetViewLabel">자산화 후보</span></h3>
                <div class="asset-view-switch">
                  <button class="btn btn-ghost btn-sm" data-action="asset-mode-candidate">후보</button>
                  <button class="btn btn-ghost btn-sm" data-action="asset-mode-catalog">카탈로그</button>
                </div>
              </div>
              <div class="card-body">
                <div id="assetCatalogFilters" class="asset-catalog-filters" style="display:none;">
                  <input id="assetCatalogSearch" class="form-input" placeholder="카탈로그 검색"/>
                  <select id="assetCatalogRisk" class="form-select">
                    <option value="">전체</option><option value="HIGH">HIGH</option><option value="MEDIUM">MEDIUM</option><option value="LOW">LOW</option>
                  </select>
                </div>
                <div id="assetCandidateList" class="asset-list-grid"></div>
                <div id="assetCatalogList" class="asset-list-grid"></div>
              </div>
            </div>
          </section>`;
      }
      if (view === 'permission') {
        return `
          <section class="view">
            <div class="page-head">
              <div class="page-title-wrap">
                <div class="page-eyebrow">SFR-008 · 010 · SVR-010</div>
                <h1 class="page-title">권한 · Unity Catalog</h1>
                <p class="page-desc">테이블/행/열 RBAC · 동적 마스킹 · 결재 워크플로우 · 감사 로그 · Privacy by Design</p>
              </div>
              <div class="page-actions">
                <button type="button" class="btn btn-primary btn-sm" data-action="open-perm-modal">권한 신청</button>
                <button type="button" class="btn btn-ghost btn-sm" data-action="export-permission-audit-csv">감사 CSV</button>
                <button type="button" class="btn btn-ghost btn-sm" data-action="export-permission-report">결재서 TXT</button>
                <button type="button" class="btn btn-ghost btn-sm" data-action="print-permission-report">결재서 PDF</button>
              </div>
            </div>

            <div class="card"><div class="card-body" id="approvalState">권한 승인 워크플로우 상태</div></div>

            <!-- RBAC 매트릭스 (SFR-008-1) -->
            <div class="card" style="margin-top:14px;">
              <div class="card-head">
                <h3 class="card-title">테이블 × 역할 RBAC 매트릭스</h3>
                <div class="card-sub">SFR-008-1 · Unity Catalog 행/열 단위 권한 · 동적 마스킹</div>
              </div>
              <div class="card-body" style="padding:0;">
                <div class="rbac-matrix-wrap">
                  <table class="rbac-matrix">
                    <thead>
                      <tr>
                        <th>테이블 / 컬럼</th>
                        <th>CDO</th>
                        <th>분석가</th>
                        <th>현업</th>
                        <th>외부 감사</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>dim_customer.cust_nm</td>
                        <td><span class="rbac-cell full">FULL</span></td>
                        <td><span class="rbac-cell mask">MASK</span></td>
                        <td><span class="rbac-cell mask">MASK</span></td>
                        <td><span class="rbac-cell deny">DENY</span></td>
                      </tr>
                      <tr>
                        <td>dim_customer.phone</td>
                        <td><span class="rbac-cell full">FULL</span></td>
                        <td><span class="rbac-cell mask">MASK</span></td>
                        <td><span class="rbac-cell deny">DENY</span></td>
                        <td><span class="rbac-cell deny">DENY</span></td>
                      </tr>
                      <tr>
                        <td>dim_customer.address</td>
                        <td><span class="rbac-cell full">FULL</span></td>
                        <td><span class="rbac-cell mask">MASK</span></td>
                        <td><span class="rbac-cell deny">DENY</span></td>
                        <td><span class="rbac-cell deny">DENY</span></td>
                      </tr>
                      <tr>
                        <td>fact_contract.policy_no</td>
                        <td><span class="rbac-cell full">FULL</span></td>
                        <td><span class="rbac-cell full">FULL</span></td>
                        <td><span class="rbac-cell full">FULL</span></td>
                        <td><span class="rbac-cell mask">MASK</span></td>
                      </tr>
                      <tr>
                        <td>fact_contract.premium</td>
                        <td><span class="rbac-cell full">FULL</span></td>
                        <td><span class="rbac-cell full">FULL</span></td>
                        <td><span class="rbac-cell mask">MASK</span></td>
                        <td><span class="rbac-cell mask">MASK</span></td>
                      </tr>
                      <tr>
                        <td>fact_claim_event.claim_amt</td>
                        <td><span class="rbac-cell full">FULL</span></td>
                        <td><span class="rbac-cell full">FULL</span></td>
                        <td><span class="rbac-cell mask">MASK</span></td>
                        <td><span class="rbac-cell deny">DENY</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div class="card" style="margin-top:14px;">
              <div class="card-head"><h3 class="card-title">결재 큐 (위험등급별)</h3><div class="card-sub">SFR-010-2 · 직무/직급별 승인 + High-value Data 사전 검토</div></div>
              <div class="card-body" style="padding:0;">
                <table class="data-table">
                  <thead><tr><th>ID</th><th>요청자</th><th>대상</th><th>Squad</th><th>Risk</th><th>SLA</th><th>만료</th><th>상태</th></tr></thead>
                  <tbody id="govAdminQueue"></tbody>
                </table>
              </div>
            </div>
          </section>`;
      }
      if (view === 'lineage') {
        return `
          <section class="view">
            <div class="page-head"><div class="page-title-wrap"><h1 class="page-title">데이터 자산 · 계보</h1><p class="page-desc">수집-표준화-권한-감사-배포의 통합 워크플로우</p></div></div>
            <div class="lineage-grid">
              <div class="lineage-canvas">
                <div class="lineage-canvas-head">
                  <div class="lineage-canvas-title">Workflow Fabric</div>
                  <div class="lineage-canvas-badges">
                    <span class="lineage-canvas-badge ok">Policy Guard ON</span>
                    <span class="lineage-canvas-badge">Latency 42ms</span>
                  </div>
                </div>
                <svg id="lineageSvg" viewBox="0 0 800 420">
                  <defs>
                    <linearGradient id="wfA" x1="0" x2="1"><stop offset="0%" stop-color="#F8FBFF"/><stop offset="100%" stop-color="#E7F1FA"/></linearGradient>
                    <linearGradient id="wfB" x1="0" x2="1"><stop offset="0%" stop-color="#F8FAFC"/><stop offset="100%" stop-color="#EAF0F7"/></linearGradient>
                    <linearGradient id="wfC" x1="0" x2="1"><stop offset="0%" stop-color="#F6FBF8"/><stop offset="100%" stop-color="#EAF6EE"/></linearGradient>
                  </defs>
                  <path class="ln-edge flow-a" d="M200 110 C 250 80, 300 80, 350 110" stroke-width="2" fill="none"/>
                  <path class="ln-edge flow-b" d="M450 110 C 500 80, 550 80, 600 110" stroke-width="2" fill="none"/>
                  <path class="ln-edge flow-c" d="M200 230 C 250 260, 300 260, 350 230" stroke-width="2" fill="none"/>
                  <path class="ln-edge flow-d" d="M450 230 C 500 260, 550 260, 600 230" stroke-width="2" fill="none"/>

                  <g class="ln-node" data-node="ingest">
                    <rect x="90" y="80" width="130" height="58" rx="14" fill="url(#wfA)"></rect>
                    <text class="ln-node-label ln-node-dark" x="112" y="108">Ingest</text><text class="ln-node-sub ln-node-dark" x="112" y="123">CDC / Batch</text>
                    <rect class="ln-node-badge-bg" x="182" y="86" width="30" height="14" rx="7"></rect><text class="ln-node-badge" x="189" y="96">LIVE</text>
                  </g>
                  <g class="ln-node" data-node="standardize">
                    <rect x="340" y="80" width="130" height="58" rx="14" fill="url(#wfB)"></rect>
                    <text class="ln-node-label ln-node-dark" x="362" y="108">Standardize</text><text class="ln-node-sub ln-node-dark" x="362" y="123">Silver DQ</text>
                    <rect class="ln-node-badge-bg warn" x="432" y="86" width="30" height="14" rx="7"></rect><text class="ln-node-badge" x="439" y="96">DQ</text>
                  </g>
                  <g class="ln-node" data-node="publish">
                    <rect x="590" y="80" width="130" height="58" rx="14" fill="url(#wfC)"></rect>
                    <text class="ln-node-label ln-node-dark" x="612" y="108">Publish</text><text class="ln-node-sub ln-node-dark" x="612" y="123">Gold / BI</text>
                    <rect class="ln-node-badge-bg" x="682" y="86" width="30" height="14" rx="7"></rect><text class="ln-node-badge" x="689" y="96">OK</text>
                  </g>
                  <g class="ln-node" data-node="masking"><rect x="90" y="200" width="130" height="58" rx="14" fill="#F6F8FA"></rect><text class="ln-node-label ln-node-dark" x="112" y="228">Masking</text><text class="ln-node-sub ln-node-dark" x="112" y="243">SVR-010</text></g>
                  <g class="ln-node" data-node="approval"><rect x="340" y="200" width="130" height="58" rx="14" fill="#F2F5F8"></rect><text class="ln-node-label ln-node-dark" x="362" y="228">Approval</text><text class="ln-node-sub ln-node-dark" x="362" y="243">SFR-010</text></g>
                  <g class="ln-node" data-node="audit"><rect x="590" y="200" width="130" height="58" rx="14" fill="#EFF3F7"></rect><text class="ln-node-label ln-node-dark" x="612" y="228">Audit</text><text class="ln-node-sub ln-node-dark" x="612" y="243">Logs / Export</text></g>
                </svg>
                <div class="lineage-flow-strip">
                  <div class="flow-step"><strong>01</strong><span>자산 접수</span></div>
                  <div class="flow-step"><strong>02</strong><span>영향 분석</span></div>
                  <div class="flow-step"><strong>03</strong><span>정책 검증</span></div>
                  <div class="flow-step"><strong>04</strong><span>승인/배포</span></div>
                  <div class="flow-step"><strong>05</strong><span>사후 모니터링</span></div>
                </div>
              </div>
              <aside class="glossary-panel">
                <div class="glossary-search"><input type="text" placeholder="용어 검색" data-action="filter-glossary"/></div>
                <div class="workflow-detail-panel">
                  <div class="workflow-detail-head">
                    <div class="workflow-detail-title">워크플로우 상세</div>
                    <div class="workflow-detail-meta">SLA 기준 · 24h</div>
                  </div>
                  <div id="lineageWorkflowDetail" class="workflow-detail-body">노드를 클릭하면 입력/출력/정책/담당조직을 보여줍니다.</div>
                </div>
                <div class="lineage-gov-cockpit">
                  <div class="lineage-gov-head">
                    <div class="lineage-gov-title">Governance Control Tower</div>
                    <div class="lineage-gov-badge">정책 준수율 98.6%</div>
                  </div>
                  <div class="lineage-gov-kpis">
                    <div class="gov-kpi">
                      <div class="gov-kpi-label">미승인 변경</div>
                      <div class="gov-kpi-value">2</div>
                    </div>
                    <div class="gov-kpi">
                      <div class="gov-kpi-label">SLA 초과</div>
                      <div class="gov-kpi-value risk">1</div>
                    </div>
                    <div class="gov-kpi">
                      <div class="gov-kpi-label">감사 증적 누락</div>
                      <div class="gov-kpi-value">0</div>
                    </div>
                  </div>
                  <div class="lineage-gov-matrix">
                    <div class="gov-matrix-row head"><span>Control Gate</span><span>Owner</span><span>Status</span></div>
                    <div class="gov-matrix-row"><span>Schema Drift 승인</span><span>Data Owner</span><span class="ok">PASS</span></div>
                    <div class="gov-matrix-row"><span>PII Masking 검증</span><span>Security Owner</span><span class="warn">REVIEW</span></div>
                    <div class="gov-matrix-row"><span>증적 패키지 생성</span><span>Internal Audit</span><span class="ok">PASS</span></div>
                  </div>
                </div>
                <div class="lineage-raci-board">
                  <div class="lineage-raci-title">결재 책임흐름 (RACI Swimlane)</div>
                  <div class="lineage-raci-head">
                    <span>Role</span><span>접수</span><span>영향분석</span><span>정책검증</span><span>승인/배포</span><span>사후감사</span>
                  </div>
                  <div class="lineage-raci-row">
                    <span class="raci-role">요청자 (Requester)</span>
                    <span class="raci-chip r">R</span><span class="raci-chip c">C</span><span class="raci-chip i">I</span><span class="raci-chip i">I</span><span class="raci-chip i">I</span>
                  </div>
                  <div class="lineage-raci-row">
                    <span class="raci-role">데이터오너 (Data Owner)</span>
                    <span class="raci-chip a">A</span><span class="raci-chip r">R</span><span class="raci-chip a">A</span><span class="raci-chip a">A</span><span class="raci-chip c">C</span>
                  </div>
                  <div class="lineage-raci-row">
                    <span class="raci-role">보안오너 (Security Owner)</span>
                    <span class="raci-chip c">C</span><span class="raci-chip c">C</span><span class="raci-chip a">A</span><span class="raci-chip a">A</span><span class="raci-chip c">C</span>
                  </div>
                  <div class="lineage-raci-row">
                    <span class="raci-role">내부감사 (Internal Audit)</span>
                    <span class="raci-chip i">I</span><span class="raci-chip i">I</span><span class="raci-chip c">C</span><span class="raci-chip c">C</span><span class="raci-chip a">A</span>
                  </div>
                  <div class="lineage-raci-foot">A: Accountable · R: Responsible · C: Consulted · I: Informed</div>
                </div>
                <div class="lineage-ops-board">
                  <div class="lineage-ops-title">운영 워크플로우 보드</div>
                  <div class="lineage-ops-row" data-flow-stage="0">
                    <span class="ops-state intake">접수</span>
                    <span class="ops-item">암복호화 정책 변경 요청 · 2건</span>
                    <span class="ops-sla-badge">+0h</span>
                  </div>
                  <div class="lineage-ops-row" data-flow-stage="1">
                    <span class="ops-state analysis">영향분석</span>
                    <span class="ops-item"><code>dm_customer.dim_customer</code> 하위 14개 뷰 영향</span>
                    <span class="ops-sla-badge warn">+18h</span>
                  </div>
                  <div class="lineage-ops-row" data-flow-stage="2">
                    <span class="ops-state approval">승인</span>
                    <span class="ops-item">데이터오너/보안오너 2단계 승인 대기</span>
                    <span class="ops-sla-badge danger">+31h</span>
                  </div>
                </div>
                <div class="lineage-flow-control">
                  <div class="lineage-flow-progress-meta">
                    <span id="lineageFlowStageText">진행 단계 · 접수</span>
                    <span id="lineageFlowPct">20%</span>
                  </div>
                  <div class="lineage-flow-progress"><div id="lineageFlowBar"></div></div>
                  <div class="lineage-flow-status">
                    <span class="lineage-status-chip" id="lineageAutoStatus">AUTO · OFF</span>
                    <span class="lineage-status-chip danger" id="lineageRiskStatus">SLA 리스크 · 감시중</span>
                  </div>
                  <div class="lineage-flow-btns">
                    <button type="button" class="btn btn-secondary btn-sm" id="lineageFlowResetBtn">초기화</button>
                    <button type="button" class="btn btn-secondary btn-sm" id="lineageFlowAutoBtn">자동 진행</button>
                    <button type="button" class="btn btn-primary btn-sm" id="lineageFlowNextBtn">다음 단계</button>
                  </div>
                </div>
                <div class="lineage-timeline" id="lineageTimeline"></div>
                <div class="lineage-decision-log">
                  <div class="lineage-decision-title">최근 거버넌스 의사결정</div>
                  <div class="lineage-decision-item"><span>10:21</span><p>민감등급 상향(고객연락처) · 마스킹 정책 강제 적용</p></div>
                  <div class="lineage-decision-item"><span>10:42</span><p>승인 반려 사유코드 G-204 등록 · 영향분석 재실행</p></div>
                  <div class="lineage-decision-item"><span>11:03</span><p>감사 증적 패키지 v1.2 생성 완료</p></div>
                </div>
                <div class="glossary-list" id="glossaryList"></div>
              </aside>
            </div>
          </section>`;
      }
      if (view === 'quality') {
        return `
          <section class="view">
            <div class="page-head">
              <div class="page-title-wrap">
                <div class="page-eyebrow">SFR-004 · 005</div>
                <h1 class="page-title">품질 · 거버넌스</h1>
                <p class="page-desc">Unity Catalog 프로파일링 · Delta MERGE/Time Travel · VACUUM 승인 워크플로우 · 품질 이상징후 모니터링</p>
              </div>
              <div class="page-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-action="open-quality-rules">품질 규칙</button>
                <button type="button" class="btn btn-primary btn-sm" data-action="run-lifecycle-job">Lifecycle 실행</button>
              </div>
            </div>

            <div class="quality-grid">
              <div class="q-metric"><div class="q-metric-name">완전성</div><div class="q-metric-score">99.2<small>%</small></div><div class="q-metric-bar"><div style="width:99.2%"></div></div></div>
              <div class="q-metric"><div class="q-metric-name">유일성</div><div class="q-metric-score">98.4<small>%</small></div><div class="q-metric-bar"><div style="width:98.4%"></div></div></div>
              <div class="q-metric"><div class="q-metric-name">정확성</div><div class="q-metric-score">97.8<small>%</small></div><div class="q-metric-bar"><div style="width:97.8%"></div></div></div>
              <div class="q-metric warn"><div class="q-metric-name">신선도</div><div class="q-metric-score">93.1<small>%</small></div><div class="q-metric-bar"><div style="width:93.1%"></div></div></div>
            </div>

            <!-- 데이터 생애주기 (SFR-004-2: VACUUM/DELETE + 승인 워크플로우) -->
            <div class="card" style="margin-top:14px;">
              <div class="card-head">
                <h3 class="card-title">데이터 생애주기 관리 (Bronze → Silver → Gold → Archive)</h3>
                <div class="card-sub">SFR-004-2 · 보존정책에 따른 자동 VACUUM/DELETE + 운영자 승인</div>
              </div>
              <div class="card-body" style="padding:0;">
                <div class="lifecycle-row head">
                  <div>현재 단계</div>
                  <div>테이블</div>
                  <div>행 수</div>
                  <div>VACUUM 예정</div>
                  <div>승인 상태</div>
                </div>
                <div class="lifecycle-row">
                  <div><span class="lifecycle-stage bronze">BRONZE</span></div>
                  <div style="font-family:'JetBrains Mono',monospace; font-size:11.5px;">raw.src_contract_hdr</div>
                  <div>12.4M</div>
                  <div>2026-05-15 02:00</div>
                  <div><span class="badge badge-success">자동 승인</span></div>
                </div>
                <div class="lifecycle-row">
                  <div><span class="lifecycle-stage silver">SILVER</span></div>
                  <div style="font-family:'JetBrains Mono',monospace; font-size:11.5px;">std.fact_contract</div>
                  <div>12.4M</div>
                  <div>2026-06-01 02:00</div>
                  <div><span class="badge badge-warning">대기 (정광용)</span></div>
                </div>
                <div class="lifecycle-row">
                  <div><span class="lifecycle-stage gold">GOLD</span></div>
                  <div style="font-family:'JetBrains Mono',monospace; font-size:11.5px;">dm_policy.fact_contract</div>
                  <div>12.4M</div>
                  <div>—</div>
                  <div><span class="badge badge-success">활성 운영</span></div>
                </div>
                <div class="lifecycle-row">
                  <div><span class="lifecycle-stage archive">ARCHIVE</span></div>
                  <div style="font-family:'JetBrains Mono',monospace; font-size:11.5px;">arc.legacy_contract_2023</div>
                  <div>8.2M</div>
                  <div>2026-12-31 02:00</div>
                  <div><span class="badge badge-warning">대기 (CDO)</span></div>
                </div>
              </div>
            </div>

            <!-- Time Travel 복구 지점 (SFR-004-1-2) -->
            <div class="card" style="margin-top:14px;">
              <div class="card-head">
                <h3 class="card-title">Delta Time Travel · 복구 지점</h3>
                <div class="card-sub">SFR-004-1-2 · 장애 발생 시 특정 시점 즉시 복구</div>
              </div>
              <div class="card-body">
                <div class="q-issue"><div class="q-issue-table">v#1284</div><div class="q-issue-rule">2026-04-30 09:21 · MERGE 1,284 rows</div><div class="q-issue-impact">최신</div><div><span class="badge badge-success">활성</span></div></div>
                <div class="q-issue"><div class="q-issue-table">v#1283</div><div class="q-issue-rule">2026-04-30 09:00 · 일일 ETL</div><div class="q-issue-impact">21분 전</div><div><button class="btn btn-ghost btn-sm">복구</button></div></div>
                <div class="q-issue"><div class="q-issue-table">v#1280</div><div class="q-issue-rule">2026-04-30 02:00 · VACUUM</div><div class="q-issue-impact">7시간 전</div><div><button class="btn btn-ghost btn-sm">복구</button></div></div>
                <div class="q-issue"><div class="q-issue-table">v#1271</div><div class="q-issue-rule">2026-04-29 14:30 · 스키마 변경</div><div class="q-issue-impact">19시간 전</div><div><button class="btn btn-ghost btn-sm">복구</button></div></div>
              </div>
            </div>

            <!-- DQ 이슈 (SFR-005-6) -->
            <div class="card" style="margin-top:14px;">
              <div class="card-head"><h3 class="card-title">DQ 이상징후 (실시간)</h3><div class="card-sub">SFR-005-6 · 완전성 · 유일성 · 정확성 측정</div></div>
              <div class="card-body">
                <div class="q-issue"><div class="q-issue-table">dm_customer.dim_customer</div><div class="q-issue-rule">cust_nm null 비율 임계치 초과</div><div class="q-issue-impact">1.2%</div><div><button class="btn btn-ghost btn-sm" data-action="dq-investigate" data-asset="dm_customer.dim_customer">조사</button></div></div>
                <div class="q-issue"><div class="q-issue-table">dm_policy.fact_contract</div><div class="q-issue-rule">policy_no 중복 발견</div><div class="q-issue-impact">3건</div><div><button class="btn btn-ghost btn-sm">조치</button></div></div>
                <div class="q-issue"><div class="q-issue-table">dm_claim.fact_claim_event</div><div class="q-issue-rule">claim_amt 음수값 감지</div><div class="q-issue-impact">7건</div><div><button class="btn btn-ghost btn-sm">검토</button></div></div>
              </div>
            </div>
          </section>`;
      }
      if (view === 'finops') {
        return `
          <section class="view">
            <div class="page-head">
              <div class="page-title-wrap">
                <div class="page-eyebrow">SFR-003 · 005</div>
                <h1 class="page-title">FinOps · 비용</h1>
                <p class="page-desc">업무 경계별 비용 추적 · 7AM 기동 / 8PM 중단 자동스케줄 · Backfill 큐 · 예산 거버넌스</p>
              </div>
              <div class="page-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-action="open-budget-modal">예산 설정</button>
                <button type="button" class="btn btn-primary btn-sm" data-action="run-lifecycle-job">FinOps 실행</button>
              </div>
            </div>

            <div class="kpi-grid">
              <div class="kpi"><div class="kpi-label">월 누적 비용</div><div class="kpi-value">₩172M</div><div class="kpi-delta">예산 ₩250M</div></div>
              <div class="kpi"><div class="kpi-label">예산 사용률</div><div class="kpi-value" id="finopsBudgetPct">68.8</div><div class="kpi-delta up">+4.2%p</div></div>
              <div class="kpi"><div class="kpi-label">월 절감액</div><div class="kpi-value">₩48M</div><div class="kpi-delta">스케줄 자동화</div></div>
              <div class="kpi"><div class="kpi-label">Backfill 대기</div><div class="kpi-value">14</div><div class="kpi-delta">큐 처리 중</div></div>
            </div>

            <!-- 7AM-8PM 스케줄 (SFR-003-2-1) -->
            <div class="card" style="margin-top:14px;">
              <div class="card-head">
                <h3 class="card-title">자동 기동/중단 스케줄</h3>
                <div class="card-sub">SFR-003-2-1 · 7시 기동 · 20시 중단 · 야간 비용 절감</div>
              </div>
              <div class="card-body">
                <div class="schedule-bar">
                  <div class="schedule-active" style="left:29.17%; width:54.17%;">RUNNING (7:00 ~ 20:00) · Photon 활성</div>
                </div>
                <div class="schedule-hours">
                  <span>0</span><span>3</span><span>6</span><span>9</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span>
                </div>
                <div style="font-size:12px; color:var(--ink-500); line-height:1.6; margin-top:8px;">
                  • 활성 시간대 (13시간) · 사용량 ₩4.8M / 일 평균<br>
                  • 비활성 시간대 (11시간) · ₩0 / 일 (서버리스 SQL 캐시 조회만 가능 · SFR-003-2-4)<br>
                  • 자원 중지 기간 미반영 데이터는 다음 기동 시 자동 Backfill (SFR-003-2-3)
                </div>
              </div>
            </div>

            <div class="finops-grid" style="margin-top:14px;">
              <div class="card">
                <div class="card-head"><h3 class="card-title">일별 비용 추이</h3></div>
                <div class="card-body chart-wrap"><canvas id="finopsChart"></canvas></div>
              </div>
              <div class="card">
                <div class="card-head">
                  <h3 class="card-title">업무 도메인별 비용</h3>
                  <div class="card-sub">SFR-005-1 · ML 개발 / ML 추론 / 데이터 수집 분리</div>
                </div>
                <div class="card-body">
                  <div class="cost-bar-row"><div class="cost-bar-label">데이터 수집</div><div class="cost-bar-track"><div class="cost-bar-fill" style="width:72%; background:#0090DA;"></div></div><div class="cost-bar-amt">₩72M</div></div>
                  <div class="cost-bar-row"><div class="cost-bar-label">ML 개발</div><div class="cost-bar-track"><div class="cost-bar-fill" style="width:34%; background:#7CC8F0;"></div></div><div class="cost-bar-amt">₩34M</div></div>
                  <div class="cost-bar-row"><div class="cost-bar-label">ML 추론</div><div class="cost-bar-track"><div class="cost-bar-fill" style="width:15%; background:#A4D65E;"></div></div><div class="cost-bar-amt">₩15M</div></div>
                  <div class="cost-bar-row"><div class="cost-bar-label">BI · PowerBI</div><div class="cost-bar-track"><div class="cost-bar-fill" style="width:33%; background:#005A9C;"></div></div><div class="cost-bar-amt">₩33M</div></div>
                  <div class="cost-bar-row"><div class="cost-bar-label">거버넌스</div><div class="cost-bar-track"><div class="cost-bar-fill" style="width:18%; background:#7FCEB7;"></div></div><div class="cost-bar-amt">₩18M</div></div>
                </div>
              </div>
            </div>

            <!-- Backfill 큐 (SFR-003-2-3) -->
            <div class="card" style="margin-top:14px;">
              <div class="card-head"><h3 class="card-title">Backfill 큐</h3><div class="card-sub">SFR-003-2-3 · 자원 중지 시간 미반영 데이터 재처리</div></div>
              <div class="card-body" style="padding:0;">
                <div class="backfill-row" style="background:var(--ink-50); font-size:10px; font-weight:700; color:var(--ink-500); text-transform:uppercase; letter-spacing:0.05em; border-top:none;">
                  <div>대상 테이블</div>
                  <div>대기 시간</div>
                  <div>예상 처리</div>
                  <div>상태</div>
                </div>
                <div class="backfill-row">
                  <div class="table-name">raw.src_contract_hdr</div>
                  <div>11h 04m</div>
                  <div>~14m</div>
                  <div><span class="badge badge-success">예약</span></div>
                </div>
                <div class="backfill-row">
                  <div class="table-name">raw.src_claim_payment</div>
                  <div>11h 04m</div>
                  <div>~22m</div>
                  <div><span class="badge badge-success">예약</span></div>
                </div>
                <div class="backfill-row">
                  <div class="table-name">raw.src_customer_base</div>
                  <div>10h 47m</div>
                  <div>~8m</div>
                  <div><span class="badge badge-warning">실행중</span></div>
                </div>
                <div class="backfill-row">
                  <div class="table-name">raw.src_premium_trx</div>
                  <div>10h 12m</div>
                  <div>~18m</div>
                  <div><span class="badge badge-success">완료</span></div>
                </div>
              </div>
            </div>
          </section>`;
      }
      if (view === 'bi') {
        return `
          <section class="view">
            <div class="page-head">
              <div class="page-title-wrap">
                <div class="page-eyebrow">SFR-011 · 012</div>
                <h1 class="page-title">BI · PowerBI 전환</h1>
                <p class="page-desc">QlikSense → PowerBI 전환 · 400 리포트 활용도 분석 · 사용자 SQL 패턴 자산화</p>
              </div>
              <div class="page-actions">
                <button class="btn btn-ghost btn-sm" data-action="sort-bi-active">활성순</button>
                <button class="btn btn-ghost btn-sm" data-action="sort-bi-idle">미사용순</button>
              </div>
            </div>

            <div class="bi-summary">
              <div class="bi-card"><div class="bi-card-title">전체 리포트</div><div class="bi-card-num">400</div></div>
              <div class="bi-card"><div class="bi-card-title">활성 리포트</div><div class="bi-card-num">102</div></div>
              <div class="bi-card"><div class="bi-card-title">통폐합 후보</div><div class="bi-card-num">298</div></div>
              <div class="bi-card"><div class="bi-card-title">전환 완료</div><div class="bi-card-num">38</div></div>
            </div>

            <!-- Top SQL 패턴 분석 (SFR-011-3, SFR-012) -->
            <div class="card" style="margin-top:14px;">
              <div class="card-head">
                <h3 class="card-title">Top SQL 패턴 (Ad-hoc 쿼리 분석)</h3>
                <div class="card-sub">SFR-011-3 · SFR-012 · 자주 사용되는 패턴 → DW/마트 자산화 후보</div>
              </div>
              <div class="card-body" style="padding:0;">
                <div class="sql-pattern-row" style="background:var(--ink-50); font-size:10px; font-weight:700; color:var(--ink-500); text-transform:uppercase; letter-spacing:0.05em;">
                  <div>#</div>
                  <div>SQL 패턴</div>
                  <div>실행 빈도</div>
                  <div>월 호출</div>
                  <div>자산화</div>
                </div>
                <div class="sql-pattern-row">
                  <div class="sql-pattern-rank">01</div>
                  <div class="sql-pattern-text">SELECT customer_id, SUM(premium) FROM fact_contract WHERE status = 'ACTIVE' GROUP BY customer_id</div>
                  <div class="sql-pattern-bar"><div style="width:92%"></div></div>
                  <div>2,841</div>
                  <div><span class="badge badge-success">완료</span></div>
                </div>
                <div class="sql-pattern-row">
                  <div class="sql-pattern-rank">02</div>
                  <div class="sql-pattern-text">SELECT product_cd, COUNT(*) FROM fact_contract WHERE contract_dt &gt;= ... GROUP BY product_cd</div>
                  <div class="sql-pattern-bar"><div style="width:78%"></div></div>
                  <div>1,924</div>
                  <div><span class="badge badge-success">완료</span></div>
                </div>
                <div class="sql-pattern-row">
                  <div class="sql-pattern-rank">03</div>
                  <div class="sql-pattern-text">SELECT channel_cd, AVG(premium) FROM fact_contract JOIN dim_channel ... GROUP BY channel_cd</div>
                  <div class="sql-pattern-bar"><div style="width:64%"></div></div>
                  <div>1,508</div>
                  <div><span class="badge badge-warning">진행중</span></div>
                </div>
                <div class="sql-pattern-row">
                  <div class="sql-pattern-rank">04</div>
                  <div class="sql-pattern-text">SELECT MONTH(claim_dt), SUM(claim_amt) FROM fact_claim_event GROUP BY MONTH(claim_dt)</div>
                  <div class="sql-pattern-bar"><div style="width:51%"></div></div>
                  <div>1,242</div>
                  <div><span class="badge badge-warning">진행중</span></div>
                </div>
                <div class="sql-pattern-row">
                  <div class="sql-pattern-rank">05</div>
                  <div class="sql-pattern-text">SELECT diagnosis_cd, COUNT(*) FROM fact_claim_event JOIN dim_diagnosis ...</div>
                  <div class="sql-pattern-bar"><div style="width:42%"></div></div>
                  <div>987</div>
                  <div><span class="badge">대기</span></div>
                </div>
                <div class="sql-pattern-row">
                  <div class="sql-pattern-rank">06</div>
                  <div class="sql-pattern-text">SELECT * FROM dim_customer WHERE tier_cd IN (...) AND birth_dt BETWEEN ...</div>
                  <div class="sql-pattern-bar"><div style="width:34%"></div></div>
                  <div>812</div>
                  <div><span class="badge">대기</span></div>
                </div>
              </div>
            </div>

            <!-- 라이선스 추천 (SFR-011-5) -->
            <div class="card" style="margin-top:14px;">
              <div class="card-head">
                <h3 class="card-title">IaaS VM 라이선스 추천</h3>
                <div class="card-sub">SFR-011-5 · Satellite · iGriffin · DPM 검토</div>
              </div>
              <div class="license-rec-grid">
                <div class="license-rec-card">
                  <div class="license-rec-name">Satellite (PowerBI Gateway)</div>
                  <div class="license-rec-desc">IaaS PowerBI 데이터 게이트웨이 · 온프렘 → Azure 연결</div>
                  <div class="license-rec-vm"><span>VM 단위</span><span>4 vCPU × 4대</span></div>
                </div>
                <div class="license-rec-card">
                  <div class="license-rec-name">Secuve iGriffin IM</div>
                  <div class="license-rec-desc">Linux 서버 계정관리 · IFR-006 표준</div>
                  <div class="license-rec-vm"><span>VM 단위</span><span>전체 Linux 호스트</span></div>
                </div>
                <div class="license-rec-card">
                  <div class="license-rec-name">DPM (Data Privacy Mgr)</div>
                  <div class="license-rec-desc">개인정보 처리현황 모니터링 · TScan 연동</div>
                  <div class="license-rec-vm"><span>VM 단위</span><span>2 vCPU × 2대</span></div>
                </div>
              </div>
            </div>

            <div class="card" style="margin-top:14px;">
              <div class="card-head"><h3 class="card-title">리포트 활용도 (Top 활성 / 통폐합 대상)</h3></div>
              <div class="card-body" id="biReportRows">
                <div class="bi-list-row" data-monthly="124"><div>●</div><div><div>보험영업 KPI</div></div><div>124</div><div>사용중</div><div>전환완료</div></div>
                <div class="bi-list-row" data-monthly="98"><div>●</div><div><div>월별 손해율 추이</div></div><div>98</div><div>사용중</div><div>전환완료</div></div>
                <div class="bi-list-row" data-monthly="68"><div>●</div><div><div>청구 손해율 분석</div></div><div>68</div><div>사용중</div><div>전환중</div></div>
                <div class="bi-list-row" data-monthly="42"><div>●</div><div><div>채널별 신계약</div></div><div>42</div><div>사용중</div><div>전환중</div></div>
                <div class="bi-list-row" data-monthly="12"><div>●</div><div><div>레거시 보고서 A</div></div><div>12</div><div>낮음</div><div>대상</div></div>
                <div class="bi-list-row" data-monthly="4"><div>●</div><div><div>레거시 보고서 B</div></div><div>4</div><div>낮음</div><div>대상</div></div>
                <div class="bi-list-row" data-monthly="0"><div>●</div><div><div>미사용 보고서 C</div></div><div>0</div><div>없음</div><div>폐기</div></div>
              </div>
            </div>
          </section>`;
      }
      return `<section class="view"><div class="card"><div class="card-body">지원되지 않는 화면입니다.</div></div></section>`;
    }

    const VIEW_UX_META = {
      home:       { stage: 'Overview 운영', cue: '주요 지표를 빠르게 확인하고 리스크를 선별하세요.', target: '.pillar-grid' },
      ingestion:  { stage: '수집 파이프라인', cue: '장애/지연/정합성 흐름을 우선 점검하세요.', target: '.pipeline-list' },
      query:      { stage: '탐색/분석', cue: 'NLQ 생성 → SQL 검증 → 결과 차트화 순서로 진행하세요.', target: '.query-v2' },
      permission: { stage: '권한/결재', cue: '결재 큐 SLA와 마스킹 만료 시간을 동시에 점검하세요.', target: '#govAdminQueue' },
      lineage:    { stage: '자산/계보', cue: '노드별 정책과 RACI 책임흐름을 함께 검토하세요.', target: '.lineage-grid' },
      quality:    { stage: '품질/거버넌스', cue: '신선도 경고 자산부터 우선 조치하세요.', target: '.quality-grid' },
      finops:     { stage: '비용 최적화', cue: '예산 사용률과 Backfill 대기큐를 같이 확인하세요.', target: '.finops-grid, .card' },
      bi:         { stage: 'BI 전환', cue: '활성도 높은 리포트부터 우선 전환하세요.', target: '.bi-list-row, .card' }
    };

    function renderViewUxBooster(view) {
      const m = VIEW_UX_META[view] || { stage: '워크스페이스', cue: '핵심 작업을 빠르게 수행하세요.', target: '.card' };
      return `
        <section class="ux-booster" id="uxBoosterBar">
          <div class="ux-booster-main">
            <div class="ux-booster-stage">${m.stage}</div>
            <div class="ux-booster-cue">${m.cue}</div>
          </div>
          <div class="ux-booster-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-action="ux-focus-search">검색 포커스</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="ux-jump-section" data-target="${m.target}">핵심 섹션 이동</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="ux-refresh-view">새로고침</button>
          </div>
        </section>
      `;
    }

    function refreshCurrentView() {
      if (!currentView) return;
      const v = currentView;
      currentView = '';
      switchView(v);
    }

    function switchView(view) {
      if (!isLoggedIn()) return;
      if (view === currentView) return;
      currentView = view;
      document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.view === view);
      });
      document.getElementById('crumbCurrent').textContent = VIEW_TITLES[view] || view;
      const tpl = document.getElementById(`tpl-${view}`);
      const main = document.getElementById('mainView');
      main.innerHTML = '';
      if (tpl) {
        main.appendChild(tpl.content.cloneNode(true));
      } else {
        main.innerHTML = getViewTemplateHtml(view);
      }
      const viewRoot = main.querySelector('.view');
      if (viewRoot && !viewRoot.querySelector('.page-breadcrumb')) {
        viewRoot.insertAdjacentHTML('afterbegin', `
          <div class="page-breadcrumb" aria-label="페이지 경로">
            <span>플랫폼</span>
            <span class="sep">/</span>
            <span>Workspace</span>
            <span class="sep">/</span>
            <strong>${VIEW_TITLES[view] || view}</strong>
          </div>
        `);
      }
      if (viewRoot && !viewRoot.querySelector('#uxBoosterBar')) {
        viewRoot.insertAdjacentHTML('afterbegin', renderViewUxBooster(view));
      }

      // initialise per-view
      if (view === 'home')       initHome();
      if (view === 'ingestion')  initIngestion();
      if (view === 'query')      initQuery();
      if (view === 'permission') initPermission();
      if (view === 'lineage')    initLineage();
      if (view === 'quality')    initQuality();
      if (view === 'finops')     initFinops();
      if (view === 'bi')         initBI();
      injectStandardPanels(view);
    }

    const SEARCH_INDEX = [
      { type: '테이블', title: 'fact_contract', desc: 'dm_policy · 계약 팩트', view: 'query' },
      { type: '테이블', title: 'dim_customer', desc: 'dm_customer · 고객 차원', view: 'query' },
      { type: '파이프라인', title: '계약 원장 CDC', desc: 'Oracle → Bronze · 모니터링', view: 'ingestion' },
      { type: '용어 사전', title: 'APE', desc: '월납환산보험료 · 매핑 확인', view: 'lineage' },
      { type: '보안·권한', title: 'Unity Catalog', desc: '결재 · PII 마스킹', view: 'permission' },
      { type: '품질', title: 'DQ 대시보드', desc: '완전성 · 유일성 지표', view: 'quality' },
      { type: '비용', title: 'FinOps', desc: '일별 비용 · 예산', view: 'finops' },
      { type: 'BI', title: 'PowerBI 전환', desc: '활용도 · 통폐합', view: 'bi' },
    ];

    function searchTypeKey(type) {
      const t = String(type || '').toLowerCase();
      if (t.includes('테이블')) return 'table';
      if (t.includes('파이프라인')) return 'pipeline';
      if (t.includes('용어')) return 'glossary';
      if (t.includes('보안') || t.includes('권한')) return 'security';
      return 'all';
    }

    function closeSearchSuggest() {
      const box = document.getElementById('searchSuggest');
      const chips = document.getElementById('metaSearchChips');
      if (box) {
        box.classList.remove('show');
        box.innerHTML = '';
      }
      chips?.classList.remove('show');
    }

    function renderSearchSuggest(raw) {
      const box = document.getElementById('searchSuggest');
      const input = document.getElementById('globalSearchInput');
      if (!box || !input) return;
      const q = String(raw !== undefined ? raw : input.value).toLowerCase().trim();
      const hits = SEARCH_INDEX.map((x, i) => ({ x, i })).filter(({ x }) => {
        const passType = metaSearchFilter === 'all' || searchTypeKey(x.type) === metaSearchFilter;
        const passQuery = !q ||
          x.title.toLowerCase().includes(q) ||
          x.desc.toLowerCase().includes(q) ||
          x.type.toLowerCase().includes(q);
        return passType && passQuery;
      }).slice(0, 8);
      if (!hits.length) {
        box.classList.remove('show');
        box.innerHTML = '';
        return;
      }
      box.innerHTML = hits.map(({ x, i }) =>
        `<button type="button" class="search-suggest-item" role="option" data-action="run-search-action" data-search-idx="${i}">
          <strong>${x.title}</strong><small>${x.type} · ${x.desc}</small>
        </button>`
      ).join('');
      box.classList.add('show');
      document.getElementById('metaSearchChips')?.classList.add('show');
    }

    function setMetaSearchFilter(filter) {
      metaSearchFilter = ['all', 'table', 'pipeline', 'glossary', 'security'].includes(filter) ? filter : 'all';
      document.querySelectorAll('.meta-chip').forEach((el) => {
        el.classList.toggle('active', el.dataset.filter === metaSearchFilter);
      });
      renderSearchSuggest();
    }

    function runSearchAction(idx) {
      const item = SEARCH_INDEX[idx];
      if (!item) return;
      closeSearchSuggest();
      switchView(item.view);
      toast('검색 이동', `${item.title} 관련 화면으로 전환했습니다.`);
    }

    function globalSearchSuggest(ev) {
      renderSearchSuggest(ev.target.value);
    }

    function globalSearchKey(ev) {
      if (ev.key === 'Escape') closeSearchSuggest();
    }

    function initSidebarToggle() {
      const app = document.querySelector('.app');
      const btn = document.getElementById('sidebarToggle');
      if (!btn || !app) return;
      btn.addEventListener('click', () => {
        app.classList.toggle('sidebar-collapsed');
        btn.setAttribute('aria-expanded', String(!app.classList.contains('sidebar-collapsed')));
      });
    }

    function bindStaticUiEvents() {
      document.querySelectorAll('.nav-item[data-view]').forEach((el) => {
        el.addEventListener('click', () => switchView(el.dataset.view));
      });
      const loginForm = document.getElementById('loginForm');
      loginForm?.addEventListener('submit', submitLogin);
      const searchInput = document.getElementById('globalSearchInput');
      searchInput?.addEventListener('keydown', globalSearchKey);
      searchInput?.addEventListener('input', globalSearchSuggest);
    }

    function bindDelegatedActions() {
      document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        if (action === 'logout') logout();
        if (action === 'open-help-modal') openHelpModal();
        if (action === 'meta-search-filter') setMetaSearchFilter(target.dataset.filter || 'all');
        if (action === 'run-search-action') runSearchAction(parseInt(target.dataset.searchIdx || '-1', 10));
        if (action === 'ux-focus-search') {
          const inp = document.getElementById('globalSearchInput');
          inp?.focus();
          inp?.select();
        }
        if (action === 'ux-jump-section') {
          const selector = target.dataset.target || '.card';
          const el = document.querySelector(selector);
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (action === 'ux-refresh-view') refreshCurrentView();
        if (action === 'close-help-modal') closeHelpModal();
        if (action === 'open-notification-panel') openNotificationPanel();
        if (action === 'close-notification-modal') closeNotificationModal();
        if (action === 'notification-filter') setNotificationFilter(target.dataset.filter || 'all');
        if (action === 'notifications-read-all') markAllNotificationsRead();
        if (action === 'notification-read-one') markNotificationRead(target.dataset.notificationId);
        if (action === 'open-perm-modal') openPermModal();
        if (action === 'export-permission-audit-csv') exportPermissionAuditCsv();
        if (action === 'export-permission-report') exportPermissionApprovalReport();
        if (action === 'print-permission-report') printPermissionApprovalPdfLayout();
        if (action === 'close-perm-modal') closePermModal();
        if (action === 'submit-permission-request') submitPermissionRequest();
        if (action === 'close-gov-detail-modal') closeGovDetailModal();
        if (action === 'open-budget-modal') openBudgetSettingsModal();
        if (action === 'close-budget-modal') closeBudgetModal();
        if (action === 'save-budget-settings') saveBudgetSettings();
        if (action === 'run-query') runQuery();
        if (action === 'format-sql') formatSQL();
        if (action === 'explain-sql') explainSQL();
        if (action === 'save-query-draft') saveQueryDraft();
        if (action === 'export-query-csv') exportQueryResults('csv');
        if (action === 'export-query-xlsx') exportQueryResults('xlsx');
        if (action === 'generate-sql-nlq') generateSQLFromNLQ();
        if (action === 'clear-nlq') clearNlqPrompt();
        if (action === 'switch-query-mode') switchQueryMode(target.dataset.mode || 'sql');
        if (action === 'run-history-query') rerunQueryFromHistory(target.dataset.historyId);
        if (action === 'clear-query-history') clearQueryHistory();
        /* v2 actions */
        if (action === 'result-tab') setResultTab(target.dataset.tab || 'table');
        if (action === 'qctx-tab')   setQctxTab(target.dataset.tab || 'overview');
        if (action === 'schema-tab') setSchemaTab(target.dataset.tab || 'catalog');
        if (action === 'schema-toggle-table') {
          const fqn = target.dataset.fqn;
          if (fqn) schemaToggleTable(fqn);
        }
        if (action === 'render-result-chart') renderResultChart();
        if (action === 'save-current-query') saveCurrentQuery();
        if (action === 'load-saved-query') {
          const idx = parseInt(target.dataset.index || '-1', 10);
          if (idx >= 0) loadSavedQuery(idx);
        }
        if (action === 'ac-pick') {
          const idx = parseInt(target.dataset.index || '-1', 10);
          if (idx >= 0) { acActiveIdx = idx; insertAutocomplete(); }
        }
        if (action === 'result-prev-page') {
          resultPage = Math.max(1, resultPage - 1);
          renderResults(lastQueryResult);
        }
        if (action === 'result-next-page') {
          resultPage += 1;
          renderResults(lastQueryResult);
        }
        if (action === 'result-sort-col') {
          const idx = parseInt(target.dataset.colIdx || '-1', 10);
          if (idx < 0) return;
          if (resultSortState.colIdx === idx) {
            resultSortState.dir = resultSortState.dir === 'asc' ? 'desc' : 'asc';
          } else {
            resultSortState = { colIdx: idx, dir: 'asc' };
          }
          renderResults(lastQueryResult);
        }
        if (action === 'toggle-result-filter-help') {
          const help = document.getElementById('resultFilterHelp');
          if (!help) return;
          help.style.display = help.style.display === 'none' ? 'block' : 'none';
        }
        if (action === 'open-quality-rules') openQualityRulesPanel();
        if (action === 'asset-mode-candidate') setAssetViewMode('candidates');
        if (action === 'asset-mode-catalog') setAssetViewMode('catalog');
        if (action === 'asset-approve-candidate') approveAssetCandidate(parseInt(target.dataset.assetIdx || '-1', 10));
        if (action === 'asset-reject-candidate') rejectAssetCandidate(parseInt(target.dataset.assetIdx || '-1', 10));
        if (action === 'asset-rollback-version') rollbackAssetVersion(target.dataset.assetFp || '', target.dataset.selectId || '');
        if (action === 'dq-investigate') openQualityInvestigation(target.dataset.asset || 'unknown_asset');
        if (action === 'jump-view') switchView(target.dataset.view || 'home');
        if (action === 'select-glossary') selectGlossary(target.closest('.glossary-item'));
        if (action === 'gov-open-detail') viewGovRequestDetail(target.dataset.govId || '');
        if (action === 'gov-approve') approveGovRequest(target.dataset.govId || '');
        if (action === 'gov-reject') rejectGovRequest(target.dataset.govId || '');
        if (action === 'builder-remove-chip') removeChip(target);
        if (action === 'sort-bi-active') sortBIReports('active');
        if (action === 'sort-bi-idle') sortBIReports('idle');
        if (action === 'req-filter') {
          requirementFilter = target.dataset.filter || 'all';
          requirementFilterByView[currentView] = requirementFilter;
          persistRequirementUiState();
          renderRequirementChecklist(currentView);
        }
        if (action === 'toggle-req-edit-mode') {
          requirementEditMode = !requirementEditMode;
          persistRequirementUiState();
          renderRequirementChecklist(currentView);
        }
        if (action === 'cycle-req-status') {
          const reqId = target.dataset.reqId;
          const rows = REQUIREMENT_MATRIX[currentView] || [];
          const row = rows.find((r) => r.id === reqId);
          if (!row) return;
          if (row.status === 'not_implemented') row.status = 'in_progress';
          else if (row.status === 'in_progress') row.status = 'completed';
          else row.status = 'not_implemented';
          persistRequirementState();
          renderRequirementChecklist(currentView);
        }
        if (action === 'export-req-state') exportRequirementStateJson();
        if (action === 'import-req-state') {
          const fileInput = document.getElementById('reqStateFileInput');
          fileInput?.click();
        }
        if (action === 'reset-req-state') resetRequirementStateToDefault();
        if (action === 'run-secure-coding') {
          setOpsState('Veracode Greenlight/Static Scan 실행 완료 · 중대취약점 0건');
          markRequirementStatus(['SVR-003'], 'completed');
          addEvidence('보안', 'SVR-003 시큐어코딩 점검 결과서', 'Static Scan 완료, High/Critical 0건', ['SVR-003']);
          addSystemNotification('info', '시큐어코딩 점검 완료', 'SVR-003 기준 점검을 완료했습니다.');
          toast('보안 점검', 'SVR-003 시큐어코딩 점검 완료', 'success');
        }
        if (action === 'run-pentest') {
          setOpsState('모의해킹 진단 리포트 생성 · 조치권고 2건');
          markRequirementStatus(['SVR-004'], 'completed');
          addEvidence('보안', 'SVR-004 모의해킹 결과보고서', 'OWASP Top10 기준 점검, Medium 2건 조치권고', ['SVR-004']);
          addSystemNotification('warning', '모의해킹 결과', 'SVR-004 결과: Medium 2건 조치권고');
          toast('모의해킹', 'SVR-004 진단 실행 및 결과 반영', 'success');
        }
        if (action === 'run-infra-vuln') {
          setOpsState('Qualys/Prisma 취약점 수집 및 이행점검 완료');
          markRequirementStatus(['SVR-005', 'SVR-001'], 'completed');
          addEvidence('보안', 'SVR-005 인프라 취약점 보고서', '클라우드/OS/Web-WAS 취약점 점검 및 이행완료', ['SVR-001', 'SVR-005']);
          toast('취약점 진단', 'SVR-005 인프라 진단 완료', 'success');
        }
        if (action === 'run-dr-test') {
          setOpsState('Terraform 기반 DR 복구 리허설 성공 · RTO 18분');
          markRequirementStatus(['TTR-001', 'SFR-003', 'SFR-009'], 'completed');
          addEvidence('테스트', 'TTR-001 장애복구 테스트 결과서', 'RTO 18분, RPO 5분, 복구 시나리오 PASS', ['TTR-001', 'SFR-003', 'SFR-009']);
          addSystemNotification('info', 'DR 테스트', '복구 테스트 성공(RTO 18분, RPO 5분)');
          toast('DR 테스트', 'TTR-001 복구 시나리오 완료', 'success');
        }
        if (action === 'run-lifecycle-job') {
          setOpsState('Retention 정책 작업 완료 · VACUUM/DELETE 리포트 업데이트');
          markRequirementStatus(['SFR-004', 'SFR-010'], 'completed');
          addEvidence('운영', 'SFR-004 데이터 생애주기 작업보고서', 'Retention 정책에 따른 삭제/정리 및 승인로그 반영', ['SFR-004', 'SFR-010']);
          toast('Lifecycle', 'SFR-004 보존주기 작업 완료', 'success');
        }
        if (action === 'run-cdc-recon') {
          markRequirementStatus(['SFR-002'], 'completed');
          addEvidence('운영', 'SFR-002 정합성 검증 리포트', '소스(12,481,920) vs 타겟(12,481,896) · 차이 -24 · Delete log 142건', ['SFR-002', 'SFR-001']);
          toast('정합성 검증', '실행 완료 · 차이 24건 (허용 범위)', 'success');
        }
        if (action === 'open-pipeline-create') {
          toast('파이프라인 생성', '메타데이터 기반 DDL 자동 생성 화면이 곧 열립니다.', 'info');
        }
        if (action === 'simulate-sso-fallback') {
          setOpsState('Ping SSO 장애 감지 · 비상 인증 경로 전환 시뮬레이션 완료');
          markRequirementStatus(['IFR-007', 'SVR-008'], 'completed');
          addEvidence('운영', 'IFR-007 SSO 장애대응 점검서', 'Ping Federate 장애 fallback 인증 흐름 정상', ['IFR-007', 'SVR-008']);
          toast('SSO 장애대응', 'IFR-007 fallback 시나리오 통과', 'success');
        }
        if (action === 'export-audit-log') {
          const lines = ['ts,type,title,msg', ...notifications.slice(0, 200).map((n) => {
            const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
            return [n.ts, n.type, n.title, n.msg].map(esc).join(',');
          })];
          const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `metlife-audit-log-${new Date().toISOString().slice(0,10)}.csv`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(a.href);
          addEvidence('PM', 'SFR-010 Audit 로그 산출물', '권한/알림/승인 이력 CSV 산출 완료', ['SFR-010']);
          toast('Audit Export', 'SFR-010 감사로그를 CSV로 내보냈습니다.', 'success');
        }
        if (action === 'toggle-role') {
          currentUserRole = currentUserRole === 'admin' ? 'user' : 'admin';
          applyRequirementAdminVisibility();
          setOpsState(`현재 역할: ${currentUserRole === 'admin' ? '관리자' : '사용자'} · 관리자 기능 ${currentUserRole === 'admin' ? '활성' : '비활성'}`);
          toast('권한 전환', `현재 역할: ${currentUserRole === 'admin' ? '관리자' : '사용자'}`);
        }
        if (action === 'evidence-filter') {
          evidenceFilter = target.dataset.filter || 'all';
          renderEvidencePanel();
        }
        if (action === 'evidence-date-filter') {
          evidenceDateFilter = target.dataset.filter || 'all';
          renderEvidencePanel();
        }
        if (action === 'evidence-review-filter') {
          evidenceReviewFilter = target.dataset.filter || 'all';
          renderEvidencePanel();
        }
        if (action === 'evidence-toggle-group') {
          evidenceGroupMode = !evidenceGroupMode;
          renderEvidencePanel();
        }
        if (action === 'evidence-open-detail') openEvidenceDetail(target.dataset.evidenceId);
        if (action === 'evidence-review-toggle') {
          const ev = evidenceLogs.find((x) => x.id === target.dataset.evidenceId);
          if (!ev) return;
          if (!ev.reviewed) {
            const comment = window.prompt('검토 승인 코멘트를 입력하세요', '요건 충족 근거 확인 완료');
            if (comment === null) return;
            const normalized = String(comment || '').trim();
            if (normalized.length < 8) {
              toast('입력 필요', '검토 코멘트를 8자 이상 입력해 주세요.');
              return;
            }
            ev.reviewed = true;
            ev.reviewedAt = new Date().toISOString();
            ev.reviewedBy = currentUserRole === 'admin' ? 'PMO Admin' : 'Reviewer';
            ev.reviewComment = normalized;
          } else {
            ev.reviewed = false;
            ev.reviewedAt = '';
            ev.reviewedBy = '';
            ev.reviewComment = '';
          }
          persistEvidenceLogs();
          renderEvidencePanel();
          toast('증적 검토', ev.reviewed ? '검토완료로 승인했습니다.' : '검토완료를 해제했습니다.');
        }
        if (action === 'close-evidence-detail-modal') closeEvidenceDetailModal();
        if (action === 'evidence-export') exportEvidenceCsv();
        if (action === 'spark-hover') {
          const idx = parseInt(target.dataset.idx || '-1', 10);
          const item = evidenceSparkMeta[idx];
          if (!item) return;
          const tip = document.getElementById('evidenceSparkTooltip');
          if (!tip) return;
          tip.textContent = `${item.label} · 완료율 ${item.pct}%`;
          tip.style.display = 'block';
        }
        if (action === 'toggle-copy-policy') {
          copyProtectionEnabled = !copyProtectionEnabled;
          syncSecurityPolicyState();
          toast('보안 정책', copyProtectionEnabled ? '복사/컨텍스트메뉴 차단 활성화' : '복사/컨텍스트메뉴 차단 비활성화');
        }
        if (action === 'start-mfa-flow') {
          document.getElementById('mfaPanel')?.style.setProperty('display', 'block');
          document.getElementById('mfaCodeInput')?.focus();
        }
        if (action === 'verify-mfa-code') {
          const code = document.getElementById('mfaCodeInput')?.value?.trim();
          if (code === '260430') {
            mfaVerified = true;
            document.getElementById('mfaPanel')?.style.setProperty('display', 'none');
            syncSecurityPolicyState();
            toast('MFA 인증', '2차 인증이 완료되었습니다.', 'success');
            const reqs = REQUIREMENT_MATRIX.permission || [];
            reqs.forEach((r) => { if (r.id === 'SVR-008') r.status = 'completed'; });
            renderRequirementChecklist('permission');
          } else {
            toast('MFA 실패', '인증 코드가 올바르지 않습니다.');
          }
        }
        if (action === 'reset-mfa-flow') {
          document.getElementById('mfaPanel')?.style.setProperty('display', 'none');
          const inp = document.getElementById('mfaCodeInput');
          if (inp) inp.value = '';
        }
      });
      document.addEventListener('input', (e) => {
        const action = e.target?.dataset?.action;
        if (action === 'filter-schema') filterSchema(e.target.value);
        if (action === 'filter-glossary') filterGlossary(e.target.value);
        if (action === 'req-search') {
          requirementQueryByView[currentView] = e.target.value || '';
          persistRequirementUiState();
          renderRequirementChecklist(currentView);
        }
        if (action === 'evidence-search') {
          evidenceQuery = e.target.value || '';
          renderEvidencePanel();
        }
        if (action === 'result-col-filter') {
          const idx = parseInt(e.target.dataset.colIdx || '-1', 10);
          if (idx < 0) return;
          const colType = currentResultColumnTypes[idx] || 'text';
          const validation = validateColumnFilterInput(e.target.value || '', colType);
          if (!validation.valid) {
            e.target.classList.add('input-invalid');
            const help = document.getElementById('resultFilterHelp');
            if (help) help.innerHTML = `<div style="color:var(--danger); font-weight:600;">입력 오류</div><div>${escapeHtmlCell(validation.message)}</div>`;
            return;
          }
          e.target.classList.remove('input-invalid');
          resultColumnFilters[idx] = e.target.value || '';
          resultPage = 1;
          renderResults(lastQueryResult);
        }
      });
      document.addEventListener('change', (e) => {
        const action = e.target?.dataset?.action;
        if (action === 'asset-preview-rollback') {
          previewRollbackDiff(
            e.target.dataset.assetFp || '',
            e.target.dataset.selectId || '',
            e.target.dataset.previewId || ''
          );
        }
      });
      document.addEventListener('focusin', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        if (!target.matches('[data-action="result-col-filter"]')) return;
        const idx = parseInt(target.getAttribute('data-col-idx') || '-1', 10);
        if (idx < 0) return;
        const help = document.getElementById('resultFilterHelp');
        if (!help) return;
        const table = document.getElementById('resultsGrid')?.querySelector('table');
        const colName = table?.querySelectorAll('thead tr:first-child th button')?.[idx]?.textContent?.replace(/[▲▼]/g, '').trim() || `컬럼${idx + 1}`;
        const t = currentResultColumnTypes[idx] || 'text';
        const example = t === 'number'
          ? '예: >=1000, <=5000, 100..500'
          : t === 'date'
            ? '예: 2026-01-01..2026-03-31, >=2026-04-01'
            : '예: =ACTIVE, !=LAPSED, 고객';
        help.innerHTML = `<div><strong>${escapeHtmlCell(colName)}</strong> (${t})</div><div>${escapeHtmlCell(example)}</div>`;
      });
      document.addEventListener('mouseover', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        if (!target.matches('[data-action="spark-hover"]')) return;
        const tip = document.getElementById('evidenceSparkTooltip');
        if (tip) tip.style.display = 'block';
      });
      document.addEventListener('mouseout', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        if (!target.matches('[data-action="spark-hover"]')) return;
        const tip = document.getElementById('evidenceSparkTooltip');
        if (tip) tip.style.display = 'none';
      });
      document.addEventListener('change', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.id !== 'reqStateFileInput') return;
        importRequirementStateJson(target.files?.[0]);
        target.value = '';
      });
    }

    function openHelpModal() {
      document.getElementById('helpModal')?.classList.add('show');
    }
    function closeHelpModal() {
      document.getElementById('helpModal')?.classList.remove('show');
    }

    function openNotificationPanel() {
      document.getElementById('notificationModal')?.classList.add('show');
      renderNotificationPanel();
    }
    function closeNotificationModal() {
      document.getElementById('notificationModal')?.classList.remove('show');
    }

    function openBudgetSettingsModal() {
      document.getElementById('budgetModal')?.classList.add('show');
      const inp = document.getElementById('budgetInputM');
      if (inp) inp.value = localStorage.getItem('finopsBudgetM') || inp.value || '250';
    }
    function closeBudgetModal() {
      document.getElementById('budgetModal')?.classList.remove('show');
    }

    function applyFinopsBudgetToUi() {
      const budgetM = Math.max(50, parseInt(localStorage.getItem('finopsBudgetM') || '250', 10) || 250);
      const pct = Math.min(100, Math.round((187 / budgetM) * 100));
      const bp = document.getElementById('finopsBudgetPct');
      if (bp) bp.textContent = String(pct);
    }

    function saveBudgetSettings() {
      const inp = document.getElementById('budgetInputM');
      const n = Math.max(10, parseInt(inp?.value || '250', 10) || 250);
      localStorage.setItem('finopsBudgetM', String(n));
      applyFinopsBudgetToUi();
      toast('예산 저장', `월 상한 ₩ ${n}M 로 저장했습니다.`, 'success');
      closeBudgetModal();
    }

    function openPipelineDetail(p) {
      const statusKo = p.status === 'healthy' ? '정상' : p.status === 'warning' ? '경고' : '실패';
      toast('파이프라인 상세', `${p.name} · ${p.src} · ${statusKo} · 지연 ${p.lat}ms`);
    }

    function refreshIngestionDashboard() {
      const n = document.getElementById('pipelineCount');
      if (n) {
        const base = parseInt(String(n.textContent).replace(/,/g, ''), 10) || 3124;
        n.textContent = (base + Math.floor(Math.random() * 4)).toLocaleString();
      }
      if (tpsChart && tpsChart.data.datasets[0]) {
        const arr = tpsChart.data.datasets[0].data;
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.max(28000, Math.min(56000, Math.round(arr[i] + (Math.random() - 0.5) * 4000)));
        }
        tpsChart.update('none');
      }
      if (statusChart && statusChart.data.datasets[0]) {
        const d = statusChart.data.datasets[0].data;
        const jitter = () => Math.max(0, Math.round(d[0] * (0.002 * (Math.random() - 0.5))));
        d[0] += jitter(); d[1] = Math.max(0, d[1] + jitter()); d[2] = Math.max(0, d[2] + jitter()); d[3] = Math.max(0, d[3] + jitter());
        statusChart.update('none');
      }
      const hm = document.getElementById('heatmap');
      if (hm && hm.querySelector('.heat-cell')) {
        hm.querySelectorAll('.heat-cell').forEach((cell) => {
          const peak = Math.random();
          let bg = '#F5F7F9';
          if (peak > 0.8) bg = '#005A9C';
          else if (peak > 0.6) bg = '#0090DA';
          else if (peak > 0.4) bg = '#7CC8F0';
          else if (peak > 0.2) bg = '#B3DFF7';
          cell.style.background = bg;
        });
      }
      toast('대시보드 갱신', 'TPS·상태 차트·히트맵을 최신 값으로 다시 불러왔습니다.', 'success');
    }

    function formatSQL() {
      const ta = document.getElementById('sqlEditor');
      if (!ta) return;
      let s = ta.value.replace(/\r\n/g, '\n').trim();
      s = s
        .replace(/\s+/g, ' ')
        .replace(/\s*,\s*/g, ',\n       ')
        .replace(/\bFROM\b/gi, '\nFROM ')
        .replace(/\bWHERE\b/gi, '\nWHERE ')
        .replace(/\bGROUP\s+BY\b/gi, '\nGROUP BY ')
        .replace(/\bORDER\s+BY\b/gi, '\nORDER BY ')
        .replace(/\bLIMIT\b/gi, '\nLIMIT ')
        .replace(/\nFROM\s+/gi, '\nFROM ')
        .trim();
      ta.value = s;
      highlightSQL();
      toast('포맷 완료', '주요 SQL 절 기준으로 줄바꿈을 정리했습니다.');
    }

    function explainSQL() {
      const ta = document.getElementById('sqlEditor');
      if (!ta) return;
      try {
        const p = parseSqlQuery(stripSqlComments(ta.value));
        const tbl = normalizeTableName(p.fromTable);
        const filtered = QUERY_TABLES[tbl].rows.filter((r) => evalWhereClause(r, p.whereClause));
        const gb = p.groupBy && p.groupBy.length ? p.groupBy.join(', ') : '(단일 그룹 또는 미집계)';
        toast(
          'EXPLAIN (브라우저 엔진)',
          `${tbl} 시퀀스 스캔 · 필터 후 ${filtered.length.toLocaleString()}행 · GROUP BY ${gb} · LIMIT ${p.limit != null ? p.limit : '없음'}`
        );
      } catch (err) {
        toast('EXPLAIN 실패', err.message || String(err));
      }
    }

    function saveQueryDraft() {
      const ta = document.getElementById('sqlEditor');
      if (!ta) return;
      localStorage.setItem('queryDraft_v1', ta.value);
      toast('저장 완료', '이 브라우저 로컬에 쿼리 초안을 저장했습니다.', 'success');
    }

    function exportQueryResults(kind) {
      const sep = ',';
      const esc = (v) => {
        const t = typeof v === 'number' ? String(v) : String(v);
        if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
        return t;
      };
      const src = lastQueryResult && lastQueryResult.cols && lastQueryResult.rows ? lastQueryResult : { cols: ['안내'], rows: [['먼저 쿼리를 실행해 주세요.']] };
      const lines = [src.cols.join(sep)];
      src.rows.forEach((r) => lines.push(r.map(esc).join(sep)));
      const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: kind === 'xlsx' ? 'query_result_excel_ready.csv' : 'query_result.csv',
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast(
        '파일 저장',
        kind === 'xlsx'
          ? 'Excel에서 바로 여는 용도의 CSV(UTF-8 BOM)로 저장했습니다.'
          : 'CSV 파일을 저장했습니다.',
        'success'
      );
    }

    function sortBIReports(mode) {
      const host = document.getElementById('biReportRows');
      if (!host) return;
      const rows = [...host.querySelectorAll('.bi-list-row[data-monthly]')];
      rows.sort((a, b) => {
        const va = parseInt(a.getAttribute('data-monthly'), 10) || 0;
        const vb = parseInt(b.getAttribute('data-monthly'), 10) || 0;
        return mode === 'active' ? vb - va : va - vb;
      });
      rows.forEach((r) => host.appendChild(r));
      toast(mode === 'active' ? '정렬: 활성순' : '정렬: 미사용순', '월 조회수 기준으로 목록을 재정렬했습니다.');
    }

    function openQualityInvestigation(assetKey) {
      const ticket = Math.floor(Math.random() * 900 + 100);
      toast('DQ 조사 시작', `${assetKey} · 티켓 DQ-INV-${ticket} · 프로파일링 잡이 큐에 등록되었습니다.`);
    }

    function openQualityRulesPanel() {
      addSystemNotification('quality', '품질 규칙 검토', 'DQ 규칙 128건 중 3건이 임계치 경고 상태입니다.');
      toast('DQ 규칙', '규칙 128건 활성 · 최근 수정: completeness_tier_cd v3 · 편집 UI(프로토타입)와 동기화했습니다.', 'success');
    }

    /* ================================================
       Module 1 — Ingestion
       ================================================ */
    let tpsChart, statusChart;
    function initIngestion() {
      const c1 = document.getElementById('tpsChart');
      const c2 = document.getElementById('statusChart');
      if (c1 && typeof Chart !== 'undefined') Chart.getChart(c1)?.destroy();
      if (c2 && typeof Chart !== 'undefined') Chart.getChart(c2)?.destroy();
      // TPS line chart
      const tpsCtx = document.getElementById('tpsChart').getContext('2d');
      const labels = Array.from({length: 30}, (_,i) => `${i+1}m`);
      const seed = [];
      let v = 38000;
      for (let i = 0; i < 30; i++) {
        v += (Math.random() - 0.45) * 3500;
        v = Math.max(28000, Math.min(56000, v));
        seed.push(Math.round(v));
      }
      const grad = tpsCtx.createLinearGradient(0, 0, 0, 280);
      grad.addColorStop(0, 'rgba(0, 144, 218, 0.28)');
      grad.addColorStop(1, 'rgba(0, 144, 218, 0)');
      tpsChart = new Chart(tpsCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'TPS',
            data: seed,
            borderColor: '#0090DA',
            backgroundColor: grad,
            borderWidth: 2.4,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: '#0090DA',
            pointHoverBorderColor: 'white',
            pointHoverBorderWidth: 2,
            fill: true
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#FFFFFF',
              titleColor: '#222222',
              bodyColor: '#4A5568',
              borderColor: '#E2E8F0',
              borderWidth: 1,
              titleFont: { family: 'Pretendard Variable', weight: '600' },
              bodyFont:  { family: 'Pretendard Variable' },
              padding: 10, cornerRadius: 8,
              callbacks: {
                label: (ctx) => `TPS  ${ctx.parsed.y.toLocaleString()}`
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#718096', font: { size: 11 } } },
            y: { grid: { color: '#EDF2F7' }, border: { display: false },
                 ticks: { color: '#718096', font: { size: 11 },
                          callback: (v) => (v/1000).toFixed(0) + 'K' } }
          }
        }
      });

      // live update
      if (window._tpsTimer) clearInterval(window._tpsTimer);
      window._tpsTimer = setInterval(() => {
        if (currentView !== 'ingestion' || !tpsChart) return;
        const arr = tpsChart.data.datasets[0].data;
        let nv = arr[arr.length-1] + (Math.random() - 0.45) * 3500;
        nv = Math.max(28000, Math.min(56000, nv));
        arr.shift(); arr.push(Math.round(nv));
        tpsChart.update('none');
      }, 2200);

      // Status doughnut
      const sCtx = document.getElementById('statusChart').getContext('2d');
      statusChart = new Chart(sCtx, {
        type: 'doughnut',
        data: {
          labels: ['정상', '경고', '실패', '대기'],
          datasets: [{
            data: [2986, 84, 18, 36],
            backgroundColor: ['#0090DA', '#F59E0B', '#EF4444', '#B3DFF7'],
            borderColor: 'white',
            borderWidth: 3,
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: '68%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                font: { family: 'Pretendard Variable', size: 12 },
                color: '#5C7185',
                padding: 14, usePointStyle: true, pointStyle: 'circle', boxWidth: 8
              }
            },
            tooltip: {
              backgroundColor: '#FFFFFF',
              titleColor: '#222222',
              bodyColor: '#4A5568',
              borderColor: '#E2E8F0',
              borderWidth: 1,
              padding: 10, cornerRadius: 8
            }
          }
        }
      });

      // pipeline list
      const pipelines = [
        { name: '계약 원장 CDC', src: 'Oracle → Bronze', tps: 8420, lat: 92, status: 'healthy' },
        { name: '청구 이벤트 스트림', src: 'Kafka → Silver', tps: 6210, lat: 64, status: 'healthy' },
        { name: '고객 마스터 적재', src: 'DB2 → Bronze', tps: 4180, lat: 210, status: 'healthy' },
        { name: '웹 행동로그 수집', src: 'Kinesis → Bronze', tps: 12940, lat: 41, status: 'warning' },
        { name: '상품 마트 빌드', src: 'Silver → Mart', tps: 2810, lat: 318, status: 'healthy' },
        { name: '레거시 보험금 IF', src: 'AS400 → Bronze', tps: 184, lat: 1240, status: 'failed' }
      ];
      const list = document.getElementById('pipelineList');
      list.innerHTML = pipelines.map(p => `
        <div class="pipeline-row" role="button" tabindex="0">
          <span class="status-dot ${p.status}"></span>
          <div>
            <div class="pipeline-name">${p.name}</div>
            <div class="pipeline-meta">${p.src}</div>
          </div>
          <div class="pipeline-num">${p.tps.toLocaleString()}<small>TPS</small></div>
          <div class="pipeline-num">${p.lat}<small>ms</small></div>
          <div>
            ${p.status === 'healthy' ? '<span class="badge badge-success">정상</span>' :
              p.status === 'warning' ? '<span class="badge badge-warning">경고</span>' :
                                        '<span class="badge badge-danger">실패</span>'}
          </div>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      `).join('');
      list.querySelectorAll('.pipeline-row').forEach((row, i) => {
        row.addEventListener('click', () => openPipelineDetail(pipelines[i]));
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPipelineDetail(pipelines[i]);
          }
        });
      });

      // heatmap
      const hm = document.getElementById('heatmap');
      const cells = [];
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          // simulate a workday curve
          const peak = (h >= 9 && h <= 18) ? 0.9 : 0.25;
          const val = Math.min(1, peak * (0.6 + Math.random() * 0.7));
          let bg = '#F5F7F9';
          if (val > 0.8) bg = '#005A9C';
          else if (val > 0.6) bg = '#0090DA';
          else if (val > 0.4) bg = '#7CC8F0';
          else if (val > 0.2) bg = '#B3DFF7';
          cells.push(`<div class="heat-cell" style="background: ${bg};" title="${['일','월','화','수','목','금','토'][d]} ${h}시 · ${(val*60).toFixed(0)}K TPS"></div>`);
        }
      }
      hm.innerHTML = cells.join('');
    }

    /* ================================================
       Module 2 — Query (in-memory SQL engine + Visual builder)
       ================================================ */
    function buildQueryTables() {
      const products = ['미래든든 종신', '슈퍼 변액연금', '건강이 답이다', '평생 든든'];
      const fcRows = [];
      for (let i = 0; i < 52; i++) {
        const cid = `CUS-${104821 + (i % 14)}`;
        const pol = `PL-20260${((i % 4) + 1)}-${String(301 + i).slice(-4)}`;
        const prem = 480000 + ((i * 173427) % 9_200_000);
        const mo = String(1 + (i % 4)).padStart(2, '0');
        const dy = String(8 + (i % 20)).padStart(2, '0');
        const contract_dt = `2026-${mo}-${dy}`;
        const st = i % 13 === 0 ? 'LAPSED' : 'ACTIVE';
        fcRows.push({
          customer_id: cid,
          policy_no: pol,
          product_nm: products[i % products.length],
          premium: prem,
          contract_dt,
          status: st,
          last_paid_dt: `2026-04-${String(12 + (i % 17)).padStart(2, '0')}`
        });
      }
      const custRows = [];
      for (let i = 0; i < 20; i++) {
        custRows.push({
          customer_id: `CUS-${104821 + i}`,
          cust_nm: `김데이터${i + 1}`,
          tier_cd: ['VIP', 'Gold', 'Silver', 'Bronze'][i % 4],
          engagement_score: 22 + ((i * 11) % 72),
          region: ['서울', '경기', '부산', '대전'][i % 4]
        });
      }
      const claimRows = [
        { claim_id: 'CL-99001', customer_id: 'CUS-104821', claim_dt: '2026-02-14', claim_amt: 890000 },
        { claim_id: 'CL-99002', customer_id: 'CUS-104822', claim_dt: '2026-03-02', claim_amt: 1200000 },
        { claim_id: 'CL-99003', customer_id: 'CUS-104823', claim_dt: '2026-04-18', claim_amt: 340000 },
        { claim_id: 'CL-99004', customer_id: 'CUS-104821', claim_dt: '2026-04-28', claim_amt: 2100000 }
      ];
      const prodRows = [
        { product_cd: 'PD01', product_nm: '미래든든 종신', channel_cd: 'GA' },
        { product_cd: 'PD02', product_nm: '슈퍼 변액연금', channel_cd: 'TM' },
        { product_cd: 'PD03', product_nm: '건강이 답이다', channel_cd: 'DIGITAL' }
      ];
      const channelRows = [
        { channel_cd: 'GA', channel_nm: '설계사', region_focus: '전국' },
        { channel_cd: 'TM', channel_nm: '텔레마케팅', region_focus: '수도권' },
        { channel_cd: 'DIGITAL', channel_nm: '디지털', region_focus: '온라인' }
      ];
      const behaveRows = [];
      for (let i = 0; i < 30; i++) {
        behaveRows.push({
          customer_id: `CUS-${104821 + (i % 18)}`,
          session_dt: `2026-04-${String(1 + (i % 27)).padStart(2, '0')}`,
          page_views: 3 + (i % 40),
          conversion_flag: i % 7 === 0 ? 'Y' : 'N'
        });
      }
      const diagRows = [
        { diag_cd: 'D001', diag_nm: '고혈압', severity_cd: 'MILD' },
        { diag_cd: 'D002', diag_nm: '당뇨', severity_cd: 'MOD' },
        { diag_cd: 'D003', diag_nm: '관절염', severity_cd: 'LOW' }
      ];
      return {
        fact_contract: {
          columns: ['customer_id', 'policy_no', 'product_nm', 'premium', 'contract_dt', 'status', 'last_paid_dt'],
          rows: fcRows
        },
        dim_customer: {
          columns: ['customer_id', 'cust_nm', 'tier_cd', 'engagement_score', 'region'],
          rows: custRows
        },
        fact_claim_event: {
          columns: ['claim_id', 'customer_id', 'claim_dt', 'claim_amt'],
          rows: claimRows
        },
        dim_product: {
          columns: ['product_cd', 'product_nm', 'channel_cd'],
          rows: prodRows
        },
        dim_channel: {
          columns: ['channel_cd', 'channel_nm', 'region_focus'],
          rows: channelRows
        },
        fact_behavior: {
          columns: ['customer_id', 'session_dt', 'page_views', 'conversion_flag'],
          rows: behaveRows
        },
        dim_diagnosis: {
          columns: ['diag_cd', 'diag_nm', 'severity_cd'],
          rows: diagRows
        }
      };
    }

    const QUERY_TABLES = buildQueryTables();
    const QUERY_HISTORY_KEY = 'queryHistory_v1';
    const TABLE_DISPLAY_NAMES = {
      fact_contract: 'dm_policy.fact_contract',
      dim_product: 'dm_policy.dim_product',
      dim_channel: 'dm_policy.dim_channel',
      dim_customer: 'dm_customer.dim_customer',
      fact_behavior: 'dm_customer.fact_behavior',
      fact_claim_event: 'dm_claim.fact_claim_event',
      dim_diagnosis: 'dm_claim.dim_diagnosis'
    };

    let lastQueryResult = { cols: [], rows: [] };
    let queryHistory = [];
    let resultSortState = { colIdx: -1, dir: 'asc' };
    let resultFilterText = '';
    let resultColumnFilters = {};
    let resultPage = 1;
    let resultPageSize = 20;
    let resultSampleN = 0;
    let currentResultColumnTypes = [];
    let sqlOverlayResizeBound = false;

    function stripSqlComments(sql) {
      return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
    }

    function normalizeTableName(ref) {
      const r = ref.trim().toLowerCase();
      const base = r.includes('.') ? r.split('.').pop() : r;
      if (!QUERY_TABLES[base]) throw new Error('등록되지 않은 테이블입니다: ' + ref);
      return base;
    }

    function stripOuterDots(ident) {
      const s = String(ident).trim().toLowerCase();
      const dot = s.lastIndexOf('.');
      return dot >= 0 ? s.slice(dot + 1) : s;
    }

    function parseSqlQuery(sqlRaw) {
      let q = stripSqlComments(sqlRaw).replace(/;\s*$/, '').trim();
      let limit = null;
      let m = /\blimit\s+(\d+)\s*$/i.exec(q);
      if (m) {
        limit = parseInt(m[1], 10);
        q = q.slice(0, m.index).trim();
      }
      let orderBy = null;
      m = /\border\s+by\s+(.+)$/i.exec(q);
      if (m) {
        orderBy = m[1].trim();
        q = q.slice(0, m.index).trim();
      }
      let groupBy = null;
      m = /\bgroup\s+by\s+(.+)$/i.exec(q);
      if (m) {
        groupBy = m[1].split(',').map((s) => stripOuterDots(s.trim()));
        q = q.slice(0, m.index).trim();
      }
      let whereClause = null;
      m = /\bwhere\s+(.+)$/i.exec(q);
      if (m) {
        whereClause = m[1].trim();
        q = q.slice(0, m.index).trim();
      }
      m = /\bfrom\s+([\w.]+)\s*$/i.exec(q);
      if (!m) throw new Error('FROM 절을 찾을 수 없습니다.');
      const fromTable = m[1];
      const selectPart = q.slice(0, m.index).replace(/^select\s+/i, '').trim();
      if (!selectPart) throw new Error('SELECT 목록이 비었습니다.');
      return { selectPart, fromTable, whereClause, groupBy, orderBy, limit };
    }

    function splitSelectItems(sel) {
      const parts = [];
      let depth = 0;
      let cur = '';
      for (let i = 0; i < sel.length; i++) {
        const ch = sel[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 0) {
          parts.push(cur.trim());
          cur = '';
          continue;
        }
        cur += ch;
      }
      if (cur.trim()) parts.push(cur.trim());
      return parts;
    }

    function parseSelectExpr(part) {
      part = part.trim();
      let alias = null;
      let expr = part;
      const am = /^(.+?)\s+as\s+(\w+)$/i.exec(part);
      if (am) {
        expr = am[1].trim();
        alias = am[2];
      }
      if (expr === '*') return { type: 'star', alias: '*' };

      let m = /^sum\s*\(\s*(\w+)\s*\)$/i.exec(expr);
      if (m) return { type: 'sum', col: stripOuterDots(m[1]), alias: alias || `sum_${m[1].toLowerCase()}` };

      m = /^count\s*\(\s*\*\s*\)$/i.exec(expr);
      if (m) return { type: 'count_star', alias: alias || 'count_all' };

      m = /^avg\s*\(\s*(\w+)\s*\)$/i.exec(expr);
      if (m) return { type: 'avg', col: stripOuterDots(m[1]), alias: alias || `avg_${m[1].toLowerCase()}` };

      m = /^min\s*\(\s*(\w+)\s*\)$/i.exec(expr);
      if (m) return { type: 'min', col: stripOuterDots(m[1]), alias: alias || `min_${m[1].toLowerCase()}` };

      m = /^max\s*\(\s*(\w+)\s*\)$/i.exec(expr);
      if (m) return { type: 'max', col: stripOuterDots(m[1]), alias: alias || `max_${m[1].toLowerCase()}` };

      const bare = stripOuterDots(expr);
      if (/^\w+$/.test(bare) && !/\(/g.test(expr)) {
        return { type: 'col', col: bare, alias: alias || bare };
      }
      throw new Error('지원하지 않는 SELECT 식입니다: ' + part);
    }

    function parseWhereFragments(whereClause) {
      if (!whereClause) return [];
      return whereClause.split(/\band\b/i).map((s) => s.trim()).filter(Boolean);
    }

    function parseOneCondition(expr) {
      expr = expr.trim();
      const ops = ['>=', '<=', '!=', '=', '>', '<'];
      for (const op of ops) {
        const i = expr.indexOf(op);
        if (i === -1) continue;
        const left = stripOuterDots(expr.slice(0, i).trim());
        let right = expr.slice(i + op.length).trim();
        let val;
        if ((right.startsWith("'") && right.endsWith("'")) || (right.startsWith('"') && right.endsWith('"'))) {
          val = right.slice(1, -1);
        } else if (!Number.isNaN(Number(right))) {
          val = Number(right);
        } else {
          val = stripOuterDots(right);
        }
        return { col: left, op, val };
      }
      throw new Error('WHERE 조건을 해석할 수 없습니다: ' + expr);
    }

    function cmpVals(cell, val, op) {
      const asNum = (x) => {
        const n = Number(x);
        return Number.isNaN(n) ? null : n;
      };
      const nc = asNum(cell);
      const nv = asNum(val);
      if (nc !== null && nv !== null && typeof val === 'number') {
        switch (op) {
          case '=': return nc === nv;
          case '!=': return nc !== nv;
          case '>': return nc > nv;
          case '<': return nc < nv;
          case '>=': return nc >= nv;
          case '<=': return nc <= nv;
        }
      }
      const a = String(cell);
      const b = String(val);
      switch (op) {
        case '=': return a === b;
        case '!=': return a !== b;
        case '>': return a > b;
        case '<': return a < b;
        case '>=': return a >= b;
        case '<=': return a <= b;
      }
      return false;
    }

    function evalWhereClause(row, whereClause) {
      try {
        return parseWhereFragments(whereClause).every((frag) => {
          const { col, op, val } = parseOneCondition(frag);
          return cmpVals(row[col], val, op);
        });
      } catch {
        return false;
      }
    }

    function parseOrderKeys(orderBy) {
      if (!orderBy) return [];
      return orderBy.split(',').map((s) => s.trim()).map((chunk) => {
        const tok = chunk.split(/\s+/).filter(Boolean);
        let dir = 1;
        let col = stripOuterDots(tok[0]);
        const last = tok[tok.length - 1].toUpperCase();
        if (last === 'DESC') dir = -1;
        if (last === 'ASC') dir = 1;
        return { col, dir };
      });
    }

    function sortResultRows(rows, cols, orderBy) {
      const keys = parseOrderKeys(orderBy);
      if (!keys.length) return rows;
      rows.sort((a, b) => {
        for (const { col, dir } of keys) {
          let ia = cols.indexOf(col);
          if (ia < 0) ia = cols.findIndex((c) => c.toLowerCase() === col.toLowerCase());
          if (ia < 0) continue;
          const va = a[ia];
          const vb = b[ia];
          if (va === vb) continue;
          const na = Number(va);
          const nb = Number(vb);
          if (!Number.isNaN(na) && !Number.isNaN(nb)) return na < nb ? -dir : dir;
          return String(va).localeCompare(String(vb), 'ko') * dir;
        }
        return 0;
      });
      return rows;
    }

    function executeAggregate(groupsMap, items, groupCols) {
      const outRows = [];
      for (const [, gRows] of groupsMap) {
        const tuple = {};
        for (const item of items) {
          if (item.type === 'col') {
            if (!groupCols || !groupCols.length) throw new Error('비집계 컬럼은 GROUP BY에 포함되어야 합니다.');
            tuple[item.alias] = gRows[0][item.col];
          } else if (item.type === 'sum') {
            tuple[item.alias] = gRows.reduce((acc, r) => acc + Number(r[item.col] ?? 0), 0);
          } else if (item.type === 'count_star') {
            tuple[item.alias] = gRows.length;
          } else if (item.type === 'avg') {
            const s = gRows.reduce((acc, r) => acc + Number(r[item.col] ?? 0), 0);
            tuple[item.alias] = gRows.length ? s / gRows.length : null;
          } else if (item.type === 'min') {
            tuple[item.alias] = Math.min(...gRows.map((r) => Number(r[item.col])));
          } else if (item.type === 'max') {
            tuple[item.alias] = Math.max(...gRows.map((r) => Number(r[item.col])));
          }
        }
        outRows.push(tuple);
      }
      const cols = items.map((i) => i.alias);
      const rows = outRows.map((o) => cols.map((c) => o[c]));
      return { cols, rows };
    }

    function executeSqlQuery(sqlRaw) {
      const p = parseSqlQuery(sqlRaw);
      const tblKey = normalizeTableName(p.fromTable);
      const table = QUERY_TABLES[tblKey];
      const filtered = table.rows.filter((r) => evalWhereClause(r, p.whereClause));
      const items = splitSelectItems(p.selectPart).map(parseSelectExpr);

      if (items.some((i) => i.type === 'star') && items.length > 1) {
        throw new Error('SELECT *는 다른 컬럼과 함께 사용할 수 없습니다.');
      }

      const aggTypes = ['sum', 'count_star', 'avg', 'min', 'max'];
      const hasAgg = items.some((i) => aggTypes.includes(i.type));
      const dimItems = items.filter((i) => i.type === 'col');

      if (hasAgg && dimItems.length && !(p.groupBy && p.groupBy.length)) {
        throw new Error('일반 컬럼과 집계 함수를 함께 사용할 때는 GROUP BY가 필요합니다.');
      }

      let cols;
      let rows;

      if (!hasAgg) {
        if (items.length === 1 && items[0].type === 'star') {
          cols = table.columns.slice();
          rows = filtered.map((r) => cols.map((c) => r[c]));
        } else {
          cols = items.map((i) => i.alias);
          rows = filtered.map((r) => items.map((it) => {
            if (it.type !== 'col') throw new Error('집계 함수가 없으면 일반 컬럼만 선택할 수 있습니다.');
            return r[it.col];
          }));
        }
      } else {
        const gb = p.groupBy && p.groupBy.length ? p.groupBy : null;
        const map = new Map();
        for (const row of filtered) {
          const key = gb ? gb.map((c) => row[c]).join('\x01') : '__ONE__';
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(row);
        }
        const res = executeAggregate(map, items, gb);
        cols = res.cols;
        rows = res.rows;
      }

      sortResultRows(rows, cols, p.orderBy);
      if (p.limit != null && p.limit >= 0) rows = rows.slice(0, p.limit);

      return { cols, rows };
    }

    function scanEstimate(rowCount) {
      if (rowCount <= 30) return `${Math.max(12, rowCount * 28)} KB`;
      return `${(rowCount * 0.05).toFixed(2)} MB`;
    }

    const SCHEMA = [
      { schema: 'dm_policy', tables: [
        { name: 'fact_contract', cols: 8, rows: '12.4M', columns: [
          { name: 'contract_id', type: 'BIGINT', pii: false },
          { name: 'customer_id', type: 'BIGINT', pii: true },
          { name: 'policy_no',   type: 'STRING', pii: false },
          { name: 'product_cd',  type: 'STRING', pii: false },
          { name: 'contract_dt', type: 'DATE',   pii: false },
          { name: 'premium',     type: 'DECIMAL', pii: false },
          { name: 'status',      type: 'STRING', pii: false },
          { name: 'channel_cd',  type: 'STRING', pii: false }
        ]},
        { name: 'dim_product',   cols: 14, rows: '420', columns: [
          { name: 'product_cd', type: 'STRING', pii: false },
          { name: 'product_nm', type: 'STRING', pii: false },
          { name: 'category',   type: 'STRING', pii: false }
        ]},
        { name: 'dim_channel',   cols: 6, rows: '38', columns: [
          { name: 'channel_cd', type: 'STRING', pii: false },
          { name: 'channel_nm', type: 'STRING', pii: false }
        ]}
      ]},
      { schema: 'dm_customer', tables: [
        { name: 'dim_customer',  cols: 22, rows: '8.1M', columns: [
          { name: 'customer_id',  type: 'BIGINT', pii: true },
          { name: 'cust_nm',      type: 'STRING', pii: true },
          { name: 'phone',        type: 'STRING', pii: true },
          { name: 'address',      type: 'STRING', pii: true },
          { name: 'birth_dt',     type: 'DATE',   pii: true },
          { name: 'gender',       type: 'STRING', pii: false },
          { name: 'tier_cd',      type: 'STRING', pii: false }
        ]},
        { name: 'fact_behavior', cols: 11, rows: '146M', columns: [
          { name: 'event_id',    type: 'BIGINT', pii: false },
          { name: 'customer_id', type: 'BIGINT', pii: true },
          { name: 'event_ts',    type: 'TIMESTAMP', pii: false },
          { name: 'event_type',  type: 'STRING', pii: false }
        ]}
      ]},
      { schema: 'dm_claim', tables: [
        { name: 'fact_claim_event', cols: 16, rows: '5.3M', columns: [
          { name: 'claim_id',    type: 'BIGINT',  pii: false },
          { name: 'customer_id', type: 'BIGINT',  pii: true },
          { name: 'claim_dt',    type: 'DATE',    pii: false },
          { name: 'claim_amt',   type: 'DECIMAL', pii: false },
          { name: 'diagnosis_cd', type: 'STRING', pii: false },
          { name: 'status',       type: 'STRING', pii: false }
        ]},
        { name: 'dim_diagnosis',    cols: 9, rows: '12K', columns: [
          { name: 'diagnosis_cd', type: 'STRING', pii: false },
          { name: 'diagnosis_nm', type: 'STRING', pii: false }
        ]}
      ]}
    ];

    function initQuery() {
      renderSchema(SCHEMA);
      const ta = document.getElementById('sqlEditor');
      updateSqlOverlayOffset();
      if (!sqlOverlayResizeBound) {
        window.addEventListener('resize', updateSqlOverlayOffset);
        sqlOverlayResizeBound = true;
      }
      ta?.addEventListener('input', highlightSQL);
      ta?.addEventListener('scroll', syncSqlEditorViewport);
      ta?.addEventListener('keydown', handleSqlEditorKeydown);
      document.querySelectorAll('#builderBar .builder-clause').forEach((clause) => {
        clause.addEventListener('dragover', (e) => builderDragOver(e, clause));
        clause.addEventListener('dragleave', (e) => builderDragLeave(e, clause));
        clause.addEventListener('drop', (e) => builderDrop(e, clause));
      });
      loadQueryHistory();
      renderQueryHistory();
      const filterInput = document.getElementById('resultFilterInput');
      filterInput?.addEventListener('input', (e) => {
        resultFilterText = e.target.value || '';
        resultPage = 1;
        renderResults(lastQueryResult);
      });
      const sampleInput = document.getElementById('resultSampleNInput');
      sampleInput?.addEventListener('input', (e) => {
        resultSampleN = Math.max(0, parseInt(e.target.value || '0', 10) || 0);
        resultPage = 1;
        renderResults(lastQueryResult);
      });
      const sizeSelect = document.getElementById('resultPageSizeSelect');
      sizeSelect?.addEventListener('change', (e) => {
        resultPageSize = Math.max(1, parseInt(e.target.value || '20', 10) || 20);
        resultPage = 1;
        renderResults(lastQueryResult);
      });
      const assetSearch = document.getElementById('assetCatalogSearch');
      assetSearch?.addEventListener('input', () => renderAssetCandidates());
      const assetRisk = document.getElementById('assetCatalogRisk');
      assetRisk?.addEventListener('change', () => renderAssetCandidates());
      const draft = localStorage.getItem('queryDraft_v1');
      if (ta && draft) ta.value = draft;
      highlightSQL();
      renderAssetCandidates();
      const status = document.getElementById('qStatus');
      try {
        lastQueryResult = executeSqlQuery(ta.value);
        renderResults(lastQueryResult);
        if (status) {
          status.style.color = 'var(--success)';
          status.textContent = '● 성공';
        }
        document.getElementById('qTime').textContent = '42ms';
        document.getElementById('qScan').textContent = scanEstimate(lastQueryResult.rows.length);
        document.getElementById('qRows').textContent = lastQueryResult.rows.length;
        resultSortState = { colIdx: -1, dir: 'asc' };
        resultFilterText = '';
        resultColumnFilters = {};
        resultPage = 1;
        resultSampleN = 0;
        const fi = document.getElementById('resultFilterInput'); if (fi) fi.value = '';
        const sn = document.getElementById('resultSampleNInput'); if (sn) sn.value = '0';
        const ps = document.getElementById('resultPageSizeSelect'); if (ps) ps.value = String(resultPageSize);
      } catch (e) {
        lastQueryResult = { cols: ['메시지'], rows: [[e.message || String(e)]] };
        renderResults(lastQueryResult);
        if (status) {
          status.style.color = 'var(--warning)';
          status.textContent = '● 초기 검증 실패';
        }
      }
      /* v2 init calls */
      try { renderQctxOverview(); } catch(_) {}
      try { renderSavedQueries(); } catch(_) {}
      try { bindResultTabs(); } catch(_) {}
      try { bindQctxTabs(); } catch(_) {}
      try { bindClusterStateUI(); } catch(_) {}
      try { bindSchemaTabs(); } catch(_) {}
      try { bindAutocomplete(); } catch(_) {}
      try { bindChartSelectors(); } catch(_) {}
    }

    /* ================================================
       Query Editor v2 — helpers
       ================================================ */
    let activeResultTab = 'table';
    let activeQctxTab = 'overview';
    let activeSchemaTab = 'catalog';

    function bindResultTabs() {
      // handled by event delegation; just ensure active state
      setResultTab(activeResultTab);
    }
    function setResultTab(tab) {
      activeResultTab = tab;
      document.querySelectorAll('.result-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
      document.querySelectorAll('.results-section').forEach(s => {
        s.classList.toggle('active', s.id === `resultSection-${tab}`);
      });
      if (tab === 'chart') renderResultChart();
      if (tab === 'summary') renderResultSummary();
    }

    function bindQctxTabs() { setQctxTab(activeQctxTab); }
    function setQctxTab(tab) {
      activeQctxTab = tab;
      document.querySelectorAll('.qctx-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
      if (tab === 'overview') renderQctxOverview();
      else if (tab === 'plan') renderQctxPlan();
      else if (tab === 'policy') renderQctxPolicy();
    }

    function renderQctxOverview() {
      const body = document.getElementById('qctxBody');
      if (!body) return;
      const sql = (document.getElementById('sqlEditor')?.value || '').trim();
      const lines = sql.split('\n').length;
      const tableMatch = sql.match(/from\s+([\w.]+)/i);
      const tbl = tableMatch ? tableMatch[1] : '-';
      const rows = lastQueryResult ? lastQueryResult.rows.length : 0;
      const cols = lastQueryResult ? lastQueryResult.cols.length : 0;
      body.innerHTML = `
        <div class="qctx-stat-card">
          <div class="qctx-stat-card-label">대상 테이블</div>
          <div class="qctx-stat-card-value" style="font-family:'JetBrains Mono',monospace; font-size:14px;">${tbl}</div>
        </div>
        <div class="qctx-stat-card">
          <div class="qctx-stat-card-label">결과 행 / 컬럼</div>
          <div class="qctx-stat-card-value">${rows.toLocaleString()} <small>rows · ${cols} cols</small></div>
        </div>
        <div class="qctx-stat-card">
          <div class="qctx-stat-card-label">SQL 라인</div>
          <div class="qctx-stat-card-value">${lines} <small>lines</small></div>
        </div>
        <div class="qctx-stat-card">
          <div class="qctx-stat-card-label">예상 스캔량</div>
          <div class="qctx-stat-card-value">${scanEstimate(rows)}</div>
        </div>
        <div style="font-size:11px; color:var(--ink-500); margin-top:10px; line-height:1.5;">
          ※ Photon 엔진 자동 사용 · 결과는 24시간 캐시 (Cluster suspended 시에도 조회 가능 · SFR-006-3)
        </div>
      `;
    }
    function renderQctxPlan() {
      const body = document.getElementById('qctxBody');
      if (!body) return;
      const sql = (document.getElementById('sqlEditor')?.value || '').toUpperCase();
      const steps = [];
      if (sql.includes('FROM'))   steps.push({ k: 'TABLE SCAN', d: 'Delta Lake · Z-Order on customer_id' });
      if (sql.includes('WHERE'))  steps.push({ k: 'FILTER',     d: 'Pushdown · partition pruning 적용' });
      if (sql.includes('JOIN'))   steps.push({ k: 'JOIN',       d: 'Broadcast Hash Join (작은 테이블)' });
      if (sql.includes('GROUP BY'))   steps.push({ k: 'AGGREGATE', d: 'HashAggregate · partial pre-shuffle' });
      if (sql.includes('ORDER BY'))   steps.push({ k: 'SORT',      d: 'Range partition · Top-K optimization' });
      steps.push({ k: 'OUTPUT', d: `${(lastQueryResult ? lastQueryResult.rows.length : 0)} rows · Photon vectorized` });
      body.innerHTML = steps.map(s => `
        <div class="qplan-step">
          <strong>${s.k}</strong>
          <div class="qplan-step-detail">${s.d}</div>
        </div>
      `).join('');
    }
    function renderQctxPolicy() {
      const body = document.getElementById('qctxBody');
      if (!body) return;
      const sql = (document.getElementById('sqlEditor')?.value || '').toLowerCase();
      const piiCols = ['cust_nm', 'phone', 'address', 'birth_dt'];
      const detected = piiCols.filter(c => sql.includes(c));
      body.innerHTML = `
        <div class="qctx-policy-row">
          <div class="qctx-policy-key">권한 체계 (SFR-008)</div>
          <div class="qctx-policy-val">Unity Catalog · 행/열 단위 RBAC</div>
        </div>
        <div class="qctx-policy-row">
          <div class="qctx-policy-key">PII 컬럼 감지</div>
          <div class="qctx-policy-val">
            ${detected.length === 0
              ? '<span style="color:var(--success);">없음</span>'
              : detected.map(c => `<span class="col-pii">${c}</span>`).join(' ')
            }
          </div>
        </div>
        <div class="qctx-policy-row">
          <div class="qctx-policy-key">동적 마스킹</div>
          <div class="qctx-policy-val">${detected.length > 0 ? '⚠️ 자동 적용 · 해제는 SFR-010 결재' : '대상 없음'}</div>
        </div>
        <div class="qctx-policy-row">
          <div class="qctx-policy-key">감사 로그</div>
          <div class="qctx-policy-val">자동 기록 · SFR-010 / SVR-007 (캡처 차단)</div>
        </div>
        <div class="qctx-policy-row">
          <div class="qctx-policy-key">암호화</div>
          <div class="qctx-policy-val">AES-256 · IBM Gaudium · SVR-009</div>
        </div>
        <div class="qctx-policy-row">
          <div class="qctx-policy-key">캡처/복사 차단</div>
          <div class="qctx-policy-val">SVR-007 활성</div>
        </div>
      `;
    }

    /* Chart selectors */
    function bindChartSelectors() {
      if (!lastQueryResult) return;
      const xs = document.getElementById('resultChartX');
      const ys = document.getElementById('resultChartY');
      if (!xs || !ys) return;
      const opts = lastQueryResult.cols.map(c => `<option value="${c}">${c}</option>`).join('');
      xs.innerHTML = opts;
      ys.innerHTML = opts;
      if (lastQueryResult.cols.length >= 2) {
        ys.value = lastQueryResult.cols[1];
      }
    }
    let resultChartInst;
    function renderResultChart() {
      if (!lastQueryResult) return;
      const canvas = document.getElementById('resultChartCanvas');
      if (!canvas) return;
      const xCol = document.getElementById('resultChartX')?.value || lastQueryResult.cols[0];
      const yCol = document.getElementById('resultChartY')?.value || lastQueryResult.cols[1] || lastQueryResult.cols[0];
      const type = document.getElementById('resultChartType')?.value || 'bar';
      const xIdx = lastQueryResult.cols.indexOf(xCol);
      const yIdx = lastQueryResult.cols.indexOf(yCol);
      const labels = lastQueryResult.rows.slice(0, 30).map(r => String(r[xIdx]));
      const data = lastQueryResult.rows.slice(0, 30).map(r => {
        const v = r[yIdx];
        const n = Number(v);
        return isNaN(n) ? 0 : n;
      });
      if (resultChartInst) { try { resultChartInst.destroy(); } catch(_) {} resultChartInst = null; }
      const ctx = canvas.getContext('2d');
      const useType = type === 'horizontalBar' ? 'bar' : type;
      const isHoriz = type === 'horizontalBar';
      resultChartInst = new Chart(ctx, {
        type: useType,
        data: {
          labels,
          datasets: [{
            label: yCol,
            data,
            backgroundColor: type === 'doughnut'
              ? ['#0090DA','#7FCEB7','#A4D65E','#5AB0D8','#F59E0B','#DC2626','#8E5A2F','#5A6678']
              : 'rgba(0, 144, 218, 0.6)',
            borderColor: '#0090DA',
            borderWidth: 1.6,
            tension: 0.3
          }]
        },
        options: {
          indexAxis: isHoriz ? 'y' : 'x',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: type === 'doughnut' }
          }
        }
      });
    }

    /* Summary stats */
    function renderResultSummary() {
      if (!lastQueryResult) return;
      const host = document.getElementById('resultsSummaryGrid');
      if (!host) return;
      const cols = lastQueryResult.cols;
      const rows = lastQueryResult.rows;
      host.innerHTML = cols.map((col, i) => {
        const values = rows.map(r => r[i]);
        const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
        const nullCount = values.length - nonNull.length;
        const nullPct = values.length === 0 ? 0 : (nullCount / values.length) * 100;
        const numeric = nonNull.map(Number).filter(n => !isNaN(n));
        let body = '';
        if (numeric.length > 0 && numeric.length === nonNull.length) {
          const min = Math.min(...numeric);
          const max = Math.max(...numeric);
          const sum = numeric.reduce((a,b) => a+b, 0);
          const avg = sum / numeric.length;
          body = `
            <div class="summary-row"><span>min</span><span>${min.toLocaleString()}</span></div>
            <div class="summary-row"><span>max</span><span>${max.toLocaleString()}</span></div>
            <div class="summary-row"><span>avg</span><span>${avg.toFixed(2)}</span></div>
            <div class="summary-row"><span>sum</span><span>${sum.toLocaleString()}</span></div>
          `;
        } else {
          // categorical: top 3
          const freq = {};
          nonNull.forEach(v => { const k = String(v); freq[k] = (freq[k] || 0) + 1; });
          const top = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,3);
          body = top.map(([k,v]) => `<div class="summary-row"><span>${k}</span><span>${v}</span></div>`).join('');
        }
        const ctype = numeric.length === nonNull.length && nonNull.length > 0 ? 'NUMERIC' : 'TEXT';
        return `
          <div class="results-summary-card">
            <div class="results-summary-card-name"><span>${col}</span><span class="col-type">${ctype}</span></div>
            ${body}
            <div class="summary-row"><span>null</span><span>${nullCount} (${nullPct.toFixed(1)}%)</span></div>
            <div class="summary-null-bar"><div style="width:${nullPct}%"></div></div>
          </div>
        `;
      }).join('');
    }

    /* Cluster state UI binding */
    function bindClusterStateUI() {
      // Already rendered with hour-based logic in template, no further work needed
    }

    /* Schema tabs */
    function bindSchemaTabs() { setSchemaTab(activeSchemaTab); }
    function setSchemaTab(tab) {
      activeSchemaTab = tab;
      document.querySelectorAll('.schema-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
      if (tab === 'recent') {
        // Filter SCHEMA to tables seen in queryHistory
        const seen = new Set();
        (queryHistory || []).forEach(h => {
          const m = (h.sql || '').match(/from\s+(\w+\.\w+)/gi);
          if (m) m.forEach(s => seen.add(s.replace(/from\s+/i, '').toLowerCase()));
        });
        if (seen.size === 0) {
          renderSchema(SCHEMA);
          return;
        }
        const filtered = SCHEMA.map(s => ({
          ...s,
          tables: s.tables.filter(t => seen.has(`${s.schema}.${t.name}`.toLowerCase()))
        })).filter(s => s.tables.length > 0);
        renderSchema(filtered.length > 0 ? filtered : SCHEMA);
      } else {
        renderSchema(SCHEMA);
      }
    }

    /* Saved queries */
    const SAVED_QUERIES_KEY = 'metlife.savedQueries.v1';
    let savedQueries = [];
    function loadSavedQueries() {
      try {
        const raw = localStorage.getItem(SAVED_QUERIES_KEY);
        savedQueries = raw ? JSON.parse(raw) : [];
      } catch { savedQueries = []; }
    }
    function persistSavedQueries() {
      try { localStorage.setItem(SAVED_QUERIES_KEY, JSON.stringify(savedQueries.slice(0, 30))); } catch(_) {}
    }
    function renderSavedQueries() {
      loadSavedQueries();
      const host = document.getElementById('savedQueriesList');
      if (!host) return;
      if (savedQueries.length === 0) {
        host.innerHTML = '<div class="saved-query-empty">저장된 쿼리가 없습니다.</div>';
        return;
      }
      host.innerHTML = savedQueries.map((q, i) => `
        <div class="saved-query-item" data-action="load-saved-query" data-index="${i}">
          <span class="saved-query-name">${q.name}</span>
          <span class="saved-query-time">${q.timeShort}</span>
        </div>
      `).join('');
    }
    function saveCurrentQuery() {
      const sql = document.getElementById('sqlEditor')?.value || '';
      if (!sql.trim()) { toast('저장 실패', 'SQL이 비어있습니다.'); return; }
      const name = (sql.match(/from\s+(\w+\.\w+)/i) || [])[1] || `query_${Date.now() % 10000}`;
      const now = new Date();
      savedQueries.unshift({
        name,
        sql,
        timeShort: `${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
      });
      savedQueries = savedQueries.slice(0, 30);
      persistSavedQueries();
      renderSavedQueries();
      toast('쿼리 저장', `${name} 저장됨`);
    }
    function loadSavedQuery(idx) {
      const q = savedQueries[idx];
      if (!q) return;
      const ta = document.getElementById('sqlEditor');
      if (ta) {
        ta.value = q.sql;
        highlightSQL();
      }
      toast('쿼리 불러옴', q.name);
    }

    /* SQL Autocomplete */
    let acItems = [];
    let acActiveIdx = 0;
    let acAnchorPos = 0;
    function bindAutocomplete() {
      const ta = document.getElementById('sqlEditor');
      const dd = document.getElementById('sqlAutocomplete');
      if (!ta || !dd) return;
      ta.addEventListener('keyup', (e) => {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
        updateAutocomplete();
      });
      ta.addEventListener('keydown', (e) => {
        if (!dd.classList.contains('show')) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); acActiveIdx = Math.min(acItems.length-1, acActiveIdx+1); renderAutocomplete(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); acActiveIdx = Math.max(0, acActiveIdx-1); renderAutocomplete(); }
        else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertAutocomplete(); }
        else if (e.key === 'Escape') { hideAutocomplete(); }
      });
      ta.addEventListener('blur', () => setTimeout(hideAutocomplete, 160));
    }
    function getCurrentWord(ta) {
      const pos = ta.selectionStart;
      const text = ta.value.slice(0, pos);
      const m = text.match(/[\w.]+$/);
      return m ? { word: m[0], start: pos - m[0].length } : { word: '', start: pos };
    }
    function updateAutocomplete() {
      const ta = document.getElementById('sqlEditor');
      const dd = document.getElementById('sqlAutocomplete');
      if (!ta || !dd) return;
      const { word, start } = getCurrentWord(ta);
      if (word.length < 2) { hideAutocomplete(); return; }
      const KW = ['SELECT','FROM','WHERE','GROUP BY','ORDER BY','LIMIT','JOIN','LEFT JOIN','INNER JOIN','HAVING','DISTINCT','AS','AND','OR','NOT','IN','BETWEEN','LIKE','IS NULL','IS NOT NULL','CASE','WHEN','THEN','ELSE','END'];
      const FN = ['COUNT','SUM','AVG','MAX','MIN','COALESCE','CAST','TO_DATE','DATE_TRUNC','SUBSTR','UPPER','LOWER','TRIM','ROW_NUMBER','RANK'];
      const tables = [];
      const cols = [];
      SCHEMA.forEach(s => s.tables.forEach(t => {
        tables.push({ name: `${s.schema}.${t.name}`, type: 'tbl' });
        (t.columns || []).forEach(c => cols.push({ name: c.name, type: 'col' }));
      }));
      const wl = word.toLowerCase();
      const items = [
        ...KW.filter(k => k.toLowerCase().startsWith(wl)).map(k => ({ name: k, type: 'kw' })),
        ...FN.filter(k => k.toLowerCase().startsWith(wl)).map(k => ({ name: k, type: 'fn' })),
        ...tables.filter(t => t.name.toLowerCase().includes(wl)),
        ...cols.filter(c => c.name.toLowerCase().startsWith(wl))
      ].slice(0, 12);
      if (items.length === 0) { hideAutocomplete(); return; }
      acItems = items;
      acActiveIdx = 0;
      acAnchorPos = start;
      // position dropdown near caret (approx — anchored under editor)
      const editorRect = ta.getBoundingClientRect();
      const containerRect = ta.closest('#editorArea')?.getBoundingClientRect() || editorRect;
      dd.style.left = '20px';
      dd.style.top = `${editorRect.bottom - containerRect.top - 200}px`;
      renderAutocomplete();
      dd.classList.add('show');
    }
    function renderAutocomplete() {
      const dd = document.getElementById('sqlAutocomplete');
      if (!dd) return;
      dd.innerHTML = acItems.map((it, i) => `
        <div class="ac-item ${i === acActiveIdx ? 'active' : ''}" data-action="ac-pick" data-index="${i}">
          <span class="ac-tag ${it.type}">${it.type}</span>
          <span>${it.name}</span>
        </div>
      `).join('');
    }
    function insertAutocomplete() {
      const ta = document.getElementById('sqlEditor');
      const item = acItems[acActiveIdx];
      if (!ta || !item) return;
      const before = ta.value.slice(0, acAnchorPos);
      const after = ta.value.slice(ta.selectionStart);
      ta.value = before + item.name + after;
      ta.selectionStart = ta.selectionEnd = acAnchorPos + item.name.length;
      hideAutocomplete();
      highlightSQL();
    }
    function hideAutocomplete() {
      const dd = document.getElementById('sqlAutocomplete');
      if (dd) dd.classList.remove('show');
    }

    function loadQueryHistory() {
      try {
        const raw = localStorage.getItem(QUERY_HISTORY_KEY);
        queryHistory = raw ? JSON.parse(raw) : [];
      } catch {
        queryHistory = [];
      }
    }

    function persistQueryHistory() {
      localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(queryHistory.slice(0, 20)));
    }

    function addQueryHistory(sql, rowCount, ok = true) {
      queryHistory.unshift({
        id: `QH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ts: new Date().toISOString(),
        sql: String(sql || '').trim(),
        rowCount,
        ok
      });
      persistQueryHistory();
      renderQueryHistory();
    }

    function renderQueryHistory() {
      const host = document.getElementById('queryHistoryList');
      if (!host) return;
      if (!queryHistory.length) {
        host.innerHTML = '<div class="form-help">실행 이력이 없습니다.</div>';
        return;
      }
      host.innerHTML = queryHistory.map((h) => `
        <div class="evidence-row">
          <div class="evidence-head">
            <strong>${h.ok ? '성공' : '실패'} · ${new Date(h.ts).toLocaleString('ko-KR')}</strong>
            <span class="badge ${h.ok ? 'badge-success' : 'badge-danger'}">${h.ok ? `${h.rowCount} rows` : 'error'}</span>
          </div>
          <div class="evidence-detail" style="font-family: ui-monospace, monospace;">${escapeHtmlCell(h.sql.slice(0, 240))}</div>
          <div style="margin-top:8px; display:flex; justify-content:flex-end;">
            <button type="button" class="btn btn-ghost btn-sm" data-action="run-history-query" data-history-id="${h.id}">다시 실행</button>
          </div>
        </div>
      `).join('');
    }

    function rerunQueryFromHistory(id) {
      const item = queryHistory.find((x) => x.id === id);
      if (!item) return;
      const ta = document.getElementById('sqlEditor');
      if (!ta) return;
      ta.value = item.sql;
      highlightSQL();
      runQuery();
    }

    function clearQueryHistory() {
      queryHistory = [];
      persistQueryHistory();
      renderQueryHistory();
      toast('이력 삭제', '쿼리 실행 이력을 비웠습니다.');
    }
    const schemaExpanded = {};
    function renderSchema(data) {
      const host = document.getElementById('schemaTree');
      if (!host) return;
      host.innerHTML = data.map(s => `
        <div style="padding: 8px 10px 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-400);">${s.schema}</div>
        ${s.tables.map(t => {
          const fqn = `${s.schema}.${t.name}`;
          const exp = schemaExpanded[fqn];
          const hasPii = (t.columns || []).some(c => c.pii);
          return `
          <div class="schema-table-v2 ${exp ? 'expanded' : ''}"
               draggable="true"
               data-table="${t.name}"
               data-fqn="${fqn}"
               data-action="schema-toggle-table"
               ondragstart="schemaDragStart(event, '${t.name}')"
               ondragend="schemaDragEnd(event)">
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            ${hasPii ? '<span class="table-pii-dot" title="PII 컬럼 포함"></span>' : ''}
            <span style="flex:1;">${t.name}</span>
            <span class="schema-table-meta">${t.rows}</span>
          </div>
          <div class="schema-columns" style="${exp ? 'display:block' : ''}">
            ${(t.columns || []).map(c => `
              <div class="schema-column" draggable="true"
                   ondragstart="schemaDragStart(event, '${c.name}')"
                   ondragend="schemaDragEnd(event)">
                <span class="col-name">${c.name}</span>
                <span class="col-type">${c.type || ''}</span>
                ${c.pii ? '<span class="col-pii">PII</span>' : ''}
              </div>
            `).join('')}
          </div>
          `;
        }).join('')}
      `).join('');
    }
    function schemaToggleTable(fqn) {
      schemaExpanded[fqn] = !schemaExpanded[fqn];
      renderSchema(SCHEMA);
    }
    function filterSchema(q) {
      q = q.toLowerCase().trim();
      if (!q) { renderSchema(SCHEMA); return; }
      const filtered = SCHEMA.map(s => ({
        ...s, tables: s.tables.filter(t => t.name.toLowerCase().includes(q))
      })).filter(s => s.tables.length > 0);
      renderSchema(filtered);
    }
    function schemaDragStart(e, tableName) {
      const row = e.target.closest('.schema-table');
      if (row) row.classList.add('dragging');
      e.dataTransfer.setData('text/plain', tableName);
      e.dataTransfer.effectAllowed = 'copy';
    }
    function schemaDragEnd(e) {
      e.target.closest('.schema-table')?.classList.remove('dragging');
    }
    function builderDragOver(e, el) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      el.classList.add('over');
    }
    function builderDragLeave(e, el) {
      el.classList.remove('over');
    }
    function builderDrop(e, el) {
      e.preventDefault();
      el.classList.remove('over');
      const name = e.dataTransfer.getData('text/plain');
      if (!name) return;
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${name} <button type="button" data-action="builder-remove-chip">×</button>`;
      el.appendChild(chip);
      toast('필드 추가', `${el.dataset.clause} 절에 ${name} 이 추가되었습니다.`);
      rebuildSQLFromBuilder();
    }

    function getChipSqlText(chip) {
      let s = '';
      chip.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) s += node.textContent;
      });
      return s.trim();
    }

    function removeChip(btn) {
      btn.closest('.chip')?.remove();
      rebuildSQLFromBuilder();
    }

    function pulseUiState(el, className, ms = 320) {
      if (!el) return;
      el.classList.remove(className);
      void el.offsetWidth;
      el.classList.add(className);
      window.setTimeout(() => el.classList.remove(className), ms);
    }

    function rebuildSQLFromBuilder() {
      const ta = document.getElementById('sqlEditor');
      const bar = document.getElementById('builderBar');
      if (!ta || !bar) return;
      const clauseChips = (label) => {
        const el = [...bar.querySelectorAll('.builder-clause')].find((x) => x.dataset.clause === label);
        if (!el) return [];
        return [...el.querySelectorAll('.chip')].map(getChipSqlText).filter(Boolean);
      };
      const selChips = clauseChips('SELECT');
      const fromChips = clauseChips('FROM');
      const whereChips = clauseChips('WHERE');
      const sel = selChips.join(',\n       ') || '*';
      let frm = fromChips[0] || 'dm_policy.fact_contract';
      const shortKey = frm.includes('.') ? frm.split('.').pop() : frm;
      if (TABLE_DISPLAY_NAMES[shortKey]) frm = TABLE_DISPLAY_NAMES[shortKey];
      const whereSql = whereChips.length ? `\nWHERE  ${whereChips.join('\n       AND ')}` : '';
      ta.value = `SELECT ${sel}\nFROM   ${frm}${whereSql}\nLIMIT  500`;
      highlightSQL();
    }

    function switchQueryMode(mode) {
      document.querySelectorAll('.query-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
      const area = document.getElementById('editorArea');
      const builder = document.getElementById('builderBar');
      const editor = document.querySelector('.sql-editor');
      if (!area || !builder || !editor) return;
      area.classList.toggle('mode-visual', mode === 'visual');
      area.classList.toggle('mode-sql', mode === 'sql');
      pulseUiState(area, 'mode-switching', 360);
      pulseUiState(builder, 'builder-emphasis', 380);
      if (mode === 'visual') rebuildSQLFromBuilder();
      updateSqlOverlayOffset();
    }

    function updateSqlOverlayOffset() {
      const editor = document.querySelector('.sql-editor');
      const toolbar = editor?.querySelector('.sql-toolbar');
      if (!editor || !toolbar) return;
      editor.style.setProperty('--sql-toolbar-offset', `${Math.round(toolbar.offsetHeight)}px`);
    }

    function highlightSQL() {
      const ta = document.getElementById('sqlEditor');
      const hl = document.getElementById('sqlHl');
      if (!ta || !hl) return;
      updateSqlOverlayOffset();
      let txt = ta.value
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // comments
      txt = txt.replace(/(--.*$)/gm, '<span class="com">$1</span>');
      // strings
      txt = txt.replace(/'([^']*)'/g, "<span class=\"str\">'$1'</span>");
      // numbers
      txt = txt.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="num">$1</span>');
      // keywords
      const kw = ['SELECT','FROM','WHERE','GROUP','BY','ORDER','LIMIT','AS','AND','OR','JOIN','LEFT','RIGHT','INNER','ON','HAVING','DISTINCT','CASE','WHEN','THEN','ELSE','END','WITH','UNION','INSERT','UPDATE','DELETE'];
      const fns = ['SUM','COUNT','AVG','MIN','MAX','COALESCE','CAST','DATE','DATEADD','EXTRACT'];
      kw.forEach(k => {
        txt = txt.replace(new RegExp(`\\b(${k})\\b`, 'g'), '<span class="kw">$1</span>');
      });
      fns.forEach(f => {
        txt = txt.replace(new RegExp(`\\b(${f})\\b`, 'g'), '<span class="fn">$1</span>');
      });
      hl.innerHTML = txt + '\n';
      renderSqlLineNumbers();
      syncSqlEditorViewport();
    }

    function renderSqlLineNumbers() {
      const ta = document.getElementById('sqlEditor');
      const gutter = document.getElementById('sqlGutter');
      if (!ta || !gutter) return;
      const lineCount = (ta.value.match(/\n/g)?.length || 0) + 1;
      let nums = '';
      for (let i = 1; i <= lineCount; i += 1) nums += `${i}\n`;
      gutter.textContent = nums;
    }

    function syncSqlEditorViewport() {
      const ta = document.getElementById('sqlEditor');
      const hl = document.getElementById('sqlHl');
      const gutter = document.getElementById('sqlGutter');
      if (!ta || !hl || !gutter) return;
      hl.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
      gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
    }

    function handleSqlEditorKeydown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        runQuery();
        return;
      }
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const ta = event.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;
      ta.value = `${value.slice(0, start)}  ${value.slice(end)}`;
      ta.selectionStart = ta.selectionEnd = start + 2;
      highlightSQL();
      syncBuilder();
    }
    function syncBuilder() { /* Visual 빌더는 칩 변경 시 rebuildSQLFromBuilder로 동기화 */ }

    function runQuery() {
      const status = document.getElementById('qStatus');
      const ta = document.getElementById('sqlEditor');
      const scanEl = document.getElementById('qScan');
      const pane = document.querySelector('.query-pane');
      const resultsPane = document.querySelector('.results-pane');
      if (!status || !ta) return;
      pane?.classList.add('is-query-running');
      resultsPane?.classList.add('is-query-running');
      status.style.color = 'var(--info)';
      status.textContent = '◐ 실행 중…';
      pulseUiState(status, 'status-pulse-running', 900);
      const t0 = performance.now();
      setTimeout(() => {
        try {
          const result = executeSqlQuery(ta.value);
          lastQueryResult = result;
          const ms = Math.max(1, Math.round(performance.now() - t0));
          status.style.color = 'var(--success)';
          status.textContent = '● 성공';
          pulseUiState(status, 'status-pulse-success', 560);
          document.getElementById('qTime').textContent = ms + 'ms';
          if (scanEl) scanEl.textContent = scanEstimate(result.rows.length);
          renderResults(result);
          registerQueryAssetCandidate(ta.value, result.rows.length);
          addQueryHistory(ta.value, result.rows.length, true);
          const piiRisk = /\bcust_nm\b|customer|claim|phone|주소|연락처/i.test(ta.value);
          const hint = document.getElementById('nlqPolicyHint');
          if (hint && piiRisk) {
            hint.textContent = '정책 경고: PII 패턴 감지됨 · 승인 워크플로우를 확인하세요.';
            hint.style.color = 'var(--danger)';
          }
          toast('쿼리 완료', `${result.rows.length.toLocaleString()}건 반환 · 브라우저 인메모리 엔진`);
        } catch (err) {
          lastQueryResult = { cols: ['error'], rows: [[err.message || String(err)]] };
          status.style.color = 'var(--danger)';
          status.textContent = '● 오류';
          pulseUiState(status, 'status-pulse-error', 560);
          document.getElementById('qTime').textContent = '—';
          if (scanEl) scanEl.textContent = '—';
          renderResults(lastQueryResult);
          addQueryHistory(ta.value, 0, false);
          toast('실행 오류', err.message || String(err));
        } finally {
          pane?.classList.remove('is-query-running');
          resultsPane?.classList.remove('is-query-running');
        }
      }, 10);
    }

    function renderResults(d) {
      const grid = document.getElementById('resultsGrid');
      if (!grid || !d || !d.cols) return;
      let rows = [...d.rows];
      currentResultColumnTypes = inferColumnTypes(d.cols, d.rows);
      if (resultFilterText.trim()) {
        const q = resultFilterText.trim().toUpperCase();
        rows = rows.filter((r) => r.some((c) => String(c ?? '').toUpperCase().includes(q)));
      }
      const activeColumnFilters = Object.entries(resultColumnFilters).filter(([, v]) => String(v || '').trim());
      if (activeColumnFilters.length) {
        rows = rows.filter((r) => activeColumnFilters.every(([k, v]) => {
          const idx = parseInt(k, 10);
          return evaluateColumnFilter(r[idx], String(v || ''));
        }));
      }
      if (resultSortState.colIdx >= 0) {
        const idx = resultSortState.colIdx;
        const dir = resultSortState.dir === 'asc' ? 1 : -1;
        rows.sort((a, b) => {
          const va = a[idx]; const vb = b[idx];
          if (va === vb) return 0;
          const na = Number(va); const nb = Number(vb);
          if (!Number.isNaN(na) && !Number.isNaN(nb)) return (na - nb) * dir;
          return String(va ?? '').localeCompare(String(vb ?? ''), 'ko') * dir;
        });
      }
      if (resultSampleN > 0) rows = rows.slice(0, resultSampleN);
      const totalPages = Math.max(1, Math.ceil(rows.length / resultPageSize));
      if (resultPage > totalPages) resultPage = totalPages;
      const start = (resultPage - 1) * resultPageSize;
      const pagedRows = rows.slice(start, start + resultPageSize);
      const headers = d.cols.map((c, idx) => {
        const marker = resultSortState.colIdx === idx ? (resultSortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
        return `<th><button type="button" class="btn btn-ghost btn-sm" data-action="result-sort-col" data-col-idx="${idx}">${escapeHtmlCell(String(c))}${marker}</button></th>`;
      }).join('');
      const filterRow = d.cols.map((_, idx) => `
        <th>
          <input
            class="form-input"
            data-action="result-col-filter"
            data-col-idx="${idx}"
            value="${escapeHtmlCell(String(resultColumnFilters[idx] || ''))}"
            placeholder="필터(=,>,<,..)"
            style="padding:5px 7px; font-size:11px; min-width:80px;"
          />
        </th>
      `).join('');
      const body = pagedRows.map(r => `
        <tr>${r.map((c) => {
          const isNum = typeof c === 'number';
          const cls = isNum ? 'num-cell' : '';
          const val = isNum ? c.toLocaleString() : escapeHtmlCell(String(c ?? ''));
          return `<td class="${cls}">${val}</td>`;
        }).join('')}</tr>
      `).join('');
      grid.innerHTML = `<table><thead><tr>${headers}</tr><tr>${filterRow}</tr></thead><tbody>${body}</tbody></table>`;
      pulseUiState(grid, 'grid-refresh', 320);
      renderDynamicFilterHelp(d.cols, currentResultColumnTypes);
      const pg = document.getElementById('resultPageInfo');
      if (pg) pg.textContent = `${resultPage} / ${totalPages}`;
      const qr = document.getElementById('qRows');
      if (qr) qr.textContent = rows.length;
      /* v2: tab badge + auto re-render of active visualisation */
      const tabBadge = document.getElementById('resultTabBadgeRows');
      if (tabBadge) tabBadge.textContent = (d.rows && d.rows.length) ? d.rows.length : 0;
      try { bindChartSelectors(); } catch(_) {}
      if (activeResultTab === 'chart') { try { renderResultChart(); } catch(_) {} }
      if (activeResultTab === 'summary') { try { renderResultSummary(); } catch(_) {} }
      /* v2: refresh context panel for active tab */
      try {
        if (activeQctxTab === 'overview') renderQctxOverview();
        else if (activeQctxTab === 'plan') renderQctxPlan();
        else if (activeQctxTab === 'policy') renderQctxPolicy();
      } catch(_) {}
    }

    function inferColumnTypes(cols, rows) {
      return cols.map((_, idx) => {
        const sample = rows.find((r) => r[idx] !== null && r[idx] !== undefined && String(r[idx]).trim() !== '');
        if (!sample) return 'text';
        const v = sample[idx];
        if (typeof v === 'number') return 'number';
        if (parseDateValue(v) !== null) return 'date';
        const n = Number(v);
        if (!Number.isNaN(n) && String(v).trim() !== '') return 'number';
        return 'text';
      });
    }

    function renderDynamicFilterHelp(cols, types) {
      const help = document.getElementById('resultFilterHelp');
      if (!help) return;
      const lines = cols.map((c, i) => {
        const t = types[i] || 'text';
        const example = t === 'number'
          ? '>=1000, 100..500'
          : t === 'date'
            ? '2026-01-01..2026-03-31, >=2026-04-01'
            : '=ACTIVE, !=LAPSED, 고객';
        return `<div><strong>${escapeHtmlCell(String(c))}</strong> (${t}) · ${escapeHtmlCell(example)}</div>`;
      }).join('');
      help.innerHTML = lines || '=ACTIVE, !=LAPSED, >1000, 2026-01-01..2026-03-31';
    }

    function evaluateColumnFilter(cellValue, rawFilter) {
      const input = String(rawFilter || '').trim();
      if (!input) return true;
      const rangeMatch = input.match(/^(.+)\.\.(.+)$/);
      if (rangeMatch) {
        const startRaw = rangeMatch[1].trim();
        const endRaw = rangeMatch[2].trim();
        const cellDate = parseDateValue(cellValue);
        const startDate = parseDateValue(startRaw);
        const endDate = parseDateValue(endRaw);
        if (cellDate !== null && startDate !== null && endDate !== null) {
          return cellDate >= startDate && cellDate <= endDate;
        }
        const cellNum = Number(cellValue);
        const startNum = Number(startRaw);
        const endNum = Number(endRaw);
        if (!Number.isNaN(cellNum) && !Number.isNaN(startNum) && !Number.isNaN(endNum)) {
          return cellNum >= startNum && cellNum <= endNum;
        }
        return false;
      }
      const m = input.match(/^(>=|<=|!=|=|>|<)\s*(.+)$/);
      if (!m) {
        return String(cellValue ?? '').toUpperCase().includes(input.toUpperCase());
      }
      const op = m[1];
      const rhsText = m[2].trim();
      const lhsNum = Number(cellValue);
      const rhsNum = Number(rhsText);
      const numeric = !Number.isNaN(lhsNum) && !Number.isNaN(rhsNum);
      if (numeric) {
        if (op === '=') return lhsNum === rhsNum;
        if (op === '!=') return lhsNum !== rhsNum;
        if (op === '>') return lhsNum > rhsNum;
        if (op === '<') return lhsNum < rhsNum;
        if (op === '>=') return lhsNum >= rhsNum;
        if (op === '<=') return lhsNum <= rhsNum;
        return false;
      }
      const lhs = String(cellValue ?? '');
      const rhs = rhsText;
      if (op === '=') return lhs === rhs;
      if (op === '!=') return lhs !== rhs;
      if (op === '>') return lhs > rhs;
      if (op === '<') return lhs < rhs;
      if (op === '>=') return lhs >= rhs;
      if (op === '<=') return lhs <= rhs;
      return false;
    }

    function parseDateValue(v) {
      const s = String(v ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      const t = new Date(`${s}T00:00:00`).getTime();
      return Number.isNaN(t) ? null : t;
    }

    function validateColumnFilterInput(rawFilter, colType) {
      const input = String(rawFilter || '').trim();
      if (!input) return { valid: true, message: '' };
      const rangeMatch = input.match(/^(.+)\.\.(.+)$/);
      if (rangeMatch) {
        const left = rangeMatch[1].trim();
        const right = rangeMatch[2].trim();
        if (!left || !right) return { valid: false, message: '구간 필터는 시작값과 종료값이 모두 필요합니다. (예: 100..500)' };
        if (colType === 'date') {
          if (parseDateValue(left) === null || parseDateValue(right) === null) {
            return { valid: false, message: '날짜 구간 형식 오류: YYYY-MM-DD..YYYY-MM-DD' };
          }
        }
        if (colType === 'number') {
          if (Number.isNaN(Number(left)) || Number.isNaN(Number(right))) {
            return { valid: false, message: '숫자 구간 형식 오류: 100..500' };
          }
        }
        return { valid: true, message: '' };
      }
      const opMatch = input.match(/^(>=|<=|!=|=|>|<)\s*(.+)$/);
      if (opMatch) {
        const rhs = opMatch[2].trim();
        if (!rhs) return { valid: false, message: '연산자 뒤에 비교값이 필요합니다.' };
        if (colType === 'date' && /[<>]=?|=|!=/.test(opMatch[1]) && parseDateValue(rhs) === null) {
          return { valid: false, message: '날짜 비교 형식 오류: >=2026-04-01' };
        }
        if (colType === 'number' && Number.isNaN(Number(rhs))) {
          return { valid: false, message: '숫자 비교 형식 오류: >=1000' };
        }
        return { valid: true, message: '' };
      }
      if (/^[=!<>]/.test(input)) {
        return { valid: false, message: '지원하지 않는 연산자 형식입니다. (=, !=, >, <, >=, <= 사용)' };
      }
      return { valid: true, message: '' };
    }

    function escapeHtmlCell(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ================================================
       Module 3 — Permission
       ================================================ */
    function initPermission() {
      renderGovAdminQueue();
      if (mfaVerified) {
        const reqs = REQUIREMENT_MATRIX.permission || [];
        reqs.forEach((r) => { if (r.id === 'SVR-008') r.status = 'completed'; });
      }
      if (copyProtectionEnabled) {
        const reqs = REQUIREMENT_MATRIX.permission || [];
        reqs.forEach((r) => { if (r.id === 'SVR-007') r.status = 'completed'; });
      }
    }
    function openPermModal()  { document.getElementById('permModal').classList.add('show'); }
    function closePermModal() { document.getElementById('permModal').classList.remove('show'); }
    document.addEventListener('click', (e) => {
      if (e.target.id === 'permModal') closePermModal();
      if (e.target.id === 'helpModal') closeHelpModal();
      if (e.target.id === 'notificationModal') closeNotificationModal();
      if (e.target.id === 'budgetModal') closeBudgetModal();
      if (e.target.id === 'govDetailModal') closeGovDetailModal();
      if (e.target.id === 'evidenceDetailModal') closeEvidenceDetailModal();
    });

    /* ================================================
       Module 4 — Lineage
       ================================================ */
    const GLOSSARY = [
      { kor: '유효 계약', eng: 'Active Contract', desc: '계약 상태가 ACTIVE이고 효력 만료일이 도래하지 않은 보험계약.', mapping: 'dm_policy.fact_contract.status' },
      { kor: '월납환산보험료', eng: 'APE', desc: '연납 보험료를 12로 나눈 환산값. 신계약 실적 측정 표준.', mapping: 'dm_policy.fact_contract.ape_amt' },
      { kor: '13회차 유지율', eng: '13M Persistency', desc: '계약 후 13회차 보험료가 정상 납입된 계약의 비율.', mapping: 'dm_policy.kpi_persistency_13m' },
      { kor: '청구 발생률', eng: 'Claim Frequency', desc: '단위 기간 동안 발생한 청구 건수 / 유효 계약 건수.', mapping: 'dm_claim.fact_claim_event.claim_dt' },
      { kor: '고객 등급', eng: 'Customer Tier', desc: 'RFM 기반 고객 가치 등급 (VIP/Gold/Silver/Bronze).', mapping: 'dm_customer.dim_customer.tier_cd' },
      { kor: '디지털 활성도', eng: 'Digital Engagement', desc: '최근 90일 내 디지털 채널 접속 빈도 점수.', mapping: 'dm_customer.fact_behavior.engagement_score' }
    ];
    function initLineage() {
      const workflowMeta = {
        ingest: {
          title: 'Ingest',
          text: '원천 시스템 변경 이벤트를 표준 수집 파이프라인으로 적재하고 스키마 드리프트를 즉시 감지합니다.',
          owner: '데이터수집팀',
          policy: '암호화 전송 · 지연 5분 이내 · 실패 3회시 자동 격리',
          checklist: ['연계 시스템 식별', '적재 SLA 정의', 'CDC 장애 알림 연동']
        },
        standardize: {
          title: 'Standardize',
          text: '비즈니스 용어사전과 연결된 표준 스키마로 정규화하며, 규칙기반 DQ 검사 결과를 자산등급과 함께 등록합니다.',
          owner: '데이터엔지니어링팀',
          policy: '품질 규칙 12종 · 실패 시 격리 · 메타데이터 자동 등록',
          checklist: ['필수 컬럼 검증', '코드체계 표준화', '용어사전 매핑']
        },
        publish: {
          title: 'Publish',
          text: '승인된 자산만 Gold/Serving으로 배포하고 소비 시스템 영향도 및 릴리즈 메모를 동시 배포합니다.',
          owner: '플랫폼운영팀',
          policy: '릴리즈 게이트 통과 후 배포 · 카탈로그 동기화',
          checklist: ['영향 테이블 재검증', '권한 템플릿 적용', '배포 후 헬스체크']
        },
        masking: {
          title: 'Masking',
          text: '민감정보 분류와 사용자 직무를 기준으로 컬럼 단위 동적 마스킹 정책을 적용합니다.',
          owner: '정보보호팀',
          policy: 'SFR-008 · 역할 기반 마스킹 · 예외 만료 자동회수',
          checklist: ['민감등급 판정', '정책 템플릿 선택', '예외권한 만료시점 지정']
        },
        approval: {
          title: 'Approval',
          text: '데이터 오너와 보안 오너의 이중 승인 워크플로우로 변경을 통제하고, 반려 사유를 표준 코드로 관리합니다.',
          owner: '데이터거버넌스팀',
          policy: '2단계 승인 · SLA 24h · 반려사유 코드화',
          checklist: ['요청사유 적정성', '영향범위 검토', '승인/반려 근거 기록']
        },
        audit: {
          title: 'Audit',
          text: '조회, 내보내기, 정책변경, 승인 이력을 통합 감사 로그로 수집하고 증적 패키지를 자동 생성합니다.',
          owner: '내부통제팀',
          policy: 'SFR-010 · 1년 보관 · 월별 증적 자동 생성',
          checklist: ['이벤트 정합성 체크', '보관주기 준수', '감사 리포트 발행']
        }
      };
      const detailHost = document.getElementById('lineageWorkflowDetail');
      const flowBar = document.getElementById('lineageFlowBar');
      const flowPct = document.getElementById('lineageFlowPct');
      const flowStageText = document.getElementById('lineageFlowStageText');
      const flowAutoBtn = document.getElementById('lineageFlowAutoBtn');
      const flowAutoStatus = document.getElementById('lineageAutoStatus');
      const flowRiskStatus = document.getElementById('lineageRiskStatus');
      const flowRows = Array.from(document.querySelectorAll('.lineage-ops-row[data-flow-stage]'));
      const raciBoard = document.querySelector('.lineage-raci-board');
      const govCockpit = document.querySelector('.lineage-gov-cockpit');
      const timelineHost = document.getElementById('lineageTimeline');
      const flowSteps = ['접수', '영향분석', '정책검증', '승인/배포', '사후모니터링'];
      const createTimelineSeed = () => [
        { stage: 0, at: '09:10', text: '정책 변경 요청 등록', status: 'done' },
        { stage: 1, at: '09:48', text: '하위 영향 오브젝트 14개 식별', status: 'done' },
        { stage: 2, at: '10:05', text: '민감정보 정책 충돌 1건 탐지', status: 'risk' },
        { stage: 3, at: '-', text: '오너 승인 대기', status: 'pending' },
        { stage: 4, at: '-', text: '배포 후 품질 모니터링 예정', status: 'pending' }
      ];
      let flowTimelineSeed = createTimelineSeed();
      let flowStageIndex = 0;
      let autoPlayTimer = null;
      let rejectedOnce = false;
      let slaAlertSent = false;

      const randomDelayMs = () => 1100 + Math.floor(Math.random() * 1700);
      const nowTime = () => new Date().toTimeString().slice(0, 5);

      const renderFlowTimeline = () => {
        if (!timelineHost) return;
        timelineHost.innerHTML = flowTimelineSeed.map((item, idx) => {
          const active = idx <= flowStageIndex ? 'active' : '';
          return `
            <div class="lineage-timeline-item ${active}">
              <span class="timeline-dot ${item.status}"></span>
              <div class="timeline-meta">${item.at}</div>
              <div class="timeline-text">${item.text}</div>
            </div>
          `;
        }).join('');
      };

      const renderFlowState = () => {
        const pct = Math.round(((flowStageIndex + 1) / flowSteps.length) * 100);
        if (flowBar) flowBar.style.width = `${pct}%`;
        if (flowPct) flowPct.textContent = `${pct}%`;
        if (flowStageText) flowStageText.textContent = `진행 단계 · ${flowSteps[flowStageIndex]}`;
        if (flowRiskStatus) {
          flowRiskStatus.textContent = flowStageIndex >= 2 ? 'SLA 리스크 · 대응 필요' : 'SLA 리스크 · 감시중';
          flowRiskStatus.classList.toggle('danger', flowStageIndex >= 2);
        }
        flowRows.forEach((row, idx) => {
          row.classList.toggle('active', idx === Math.min(flowStageIndex, 2));
          row.classList.toggle('completed', idx < Math.min(flowStageIndex, 2));
        });
        if (raciBoard) {
          raciBoard.setAttribute('data-active-stage', String(Math.min(flowStageIndex, 4)));
        }
        if (govCockpit) {
          govCockpit.classList.toggle('is-alert', flowStageIndex >= 2);
        }
        renderFlowTimeline();
      };

      const updateAutoUi = (running) => {
        if (flowAutoBtn) flowAutoBtn.textContent = running ? '자동 정지' : '자동 진행';
        if (flowAutoStatus) {
          flowAutoStatus.textContent = running ? 'AUTO · ON' : 'AUTO · OFF';
          flowAutoStatus.classList.toggle('active', running);
        }
      };

      const stopAutoPlay = () => {
        if (autoPlayTimer) {
          clearTimeout(autoPlayTimer);
          autoPlayTimer = null;
        }
        updateAutoUi(false);
      };

      const pushSlaAlertIfNeeded = () => {
        if (slaAlertSent || flowStageIndex < 2) return;
        slaAlertSent = true;
        addSystemNotification('warning', '계보 워크플로우 SLA 초과', '승인 단계가 24시간 SLA를 초과했습니다. 오너 재확인이 필요합니다.');
      };

      const advanceFlow = (source = 'manual') => {
        if (flowStageIndex >= flowSteps.length - 1) {
          stopAutoPlay();
          toast('워크플로우', '사후 모니터링 단계까지 완료되었습니다.', 'success');
          return;
        }

        // 데모 분기: 첫 승인 진입 시 1회 반려 후 재검토 루프로 회귀
        if (flowStageIndex === 2 && !rejectedOnce) {
          rejectedOnce = true;
          flowStageIndex = 1;
          flowTimelineSeed[2] = { stage: 2, at: nowTime(), text: '보안오너 반려 · 마스킹 정책 재검토 요청', status: 'risk' };
          flowTimelineSeed[1] = { stage: 1, at: nowTime(), text: '영향분석 단계로 자동 회귀', status: 'done' };
          renderFlowState();
          addSystemNotification('danger', '승인 반려 발생', '계보 승인 단계에서 반려가 발생하여 영향분석 단계로 회귀했습니다.');
          toast('워크플로우 분기', '승인 반려로 재검토 루프가 실행되었습니다.');
          if (source === 'auto') scheduleAutoAdvance();
          return;
        }

        flowStageIndex += 1;
        flowTimelineSeed[flowStageIndex] = {
          stage: flowStageIndex,
          at: nowTime(),
          text: `${flowSteps[flowStageIndex]} 단계 처리 완료`,
          status: flowStageIndex >= 2 ? 'risk' : 'done'
        };
        renderFlowState();
        pushSlaAlertIfNeeded();
        toast('워크플로우 진행', `${flowSteps[flowStageIndex]} 단계로 전이되었습니다.`);
        if (source === 'auto') scheduleAutoAdvance();
      };

      const scheduleAutoAdvance = () => {
        if (!autoPlayTimer) return;
        clearTimeout(autoPlayTimer);
        autoPlayTimer = setTimeout(() => {
          if (!document.getElementById('lineageFlowNextBtn')) {
            stopAutoPlay();
            return;
          }
          advanceFlow('auto');
        }, randomDelayMs());
      };

      const toggleAutoPlay = () => {
        if (autoPlayTimer) {
          stopAutoPlay();
          toast('워크플로우 자동진행', '자동 진행을 중지했습니다.');
          return;
        }
        autoPlayTimer = setTimeout(() => {}, 0);
        updateAutoUi(true);
        clearTimeout(autoPlayTimer);
        autoPlayTimer = setTimeout(() => {
          advanceFlow('auto');
        }, randomDelayMs());
        toast('워크플로우 자동진행', '랜덤 지연 기반 자동 진행을 시작했습니다.');
      };

      const resetFlow = () => {
        stopAutoPlay();
        flowStageIndex = 0;
        rejectedOnce = false;
        slaAlertSent = false;
        flowTimelineSeed = createTimelineSeed();
        renderFlowState();
        toast('워크플로우', '초기 단계(접수)로 리셋했습니다.');
      };
      const setDetail = (key) => {
        const info = workflowMeta[key];
        if (!detailHost || !info) return;
        detailHost.innerHTML = `
          <div class="workflow-detail-node">${info.title}</div>
          <div class="workflow-detail-text">${info.text}</div>
          <div class="workflow-detail-owner">담당: ${info.owner}</div>
          <div class="workflow-detail-policy">정책: ${info.policy}</div>
          <ul class="workflow-detail-checks">
            ${info.checklist.map((item) => `<li>${item}</li>`).join('')}
          </ul>
        `;
      };
      renderGlossary(GLOSSARY);
      setDetail('ingest');
      renderFlowState();
      document.getElementById('lineageFlowNextBtn')?.addEventListener('click', () => advanceFlow('manual'));
      document.getElementById('lineageFlowResetBtn')?.addEventListener('click', resetFlow);
      flowAutoBtn?.addEventListener('click', toggleAutoPlay);
      flowRows.forEach((row) => {
        row.addEventListener('mouseenter', () => {
          const idx = parseInt(row.getAttribute('data-flow-stage') || '0', 10);
          if (raciBoard) raciBoard.setAttribute('data-hover-stage', String(Math.max(0, Math.min(4, idx))));
        });
        row.addEventListener('mouseleave', () => {
          if (raciBoard) raciBoard.removeAttribute('data-hover-stage');
        });
      });
      document.getElementById('lineageSvg')?.querySelectorAll('.ln-node').forEach((node) => {
        node.style.cursor = 'pointer';
        node.addEventListener('click', () => {
          const lab = node.querySelector('.ln-node-label');
          setDetail(node.dataset.node || '');
          toast('계보 노드', `${lab?.textContent?.trim() || '노드'} · 메타데이터 연계 정보를 불러왔습니다.`);
        });
      });
    }
    function renderGlossary(items) {
      const host = document.getElementById('glossaryList');
      host.innerHTML = items.map((g, i) => `
        <div class="glossary-item ${i === 0 ? 'selected' : ''}" data-action="select-glossary">
          <div class="glossary-term">
            <span class="kor">${g.kor}</span>
            <span class="eng">· ${g.eng}</span>
          </div>
          <div class="glossary-desc">${g.desc}</div>
          <div class="glossary-mapping">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            ${g.mapping}
          </div>
        </div>
      `).join('');
    }
    function selectGlossary(el) {
      if (!el) return;
      document.querySelectorAll('.glossary-item').forEach(i => i.classList.remove('selected'));
      el.classList.add('selected');
    }
    function filterGlossary(q) {
      q = q.toLowerCase().trim();
      if (!q) { renderGlossary(GLOSSARY); return; }
      renderGlossary(GLOSSARY.filter(g =>
        g.kor.toLowerCase().includes(q) ||
        g.eng.toLowerCase().includes(q) ||
        g.desc.toLowerCase().includes(q) ||
        g.mapping.toLowerCase().includes(q)
      ));
    }

    /* ================================================
       Toast
       ================================================ */
    function toast(title, msg, kind='info') {
      const host = document.getElementById('toastHost');
      const el = document.createElement('div');
      el.className = 'toast';
      const bg = kind === 'success' ? 'var(--success-soft)' : 'var(--mint-100)';
      const color = kind === 'success' ? 'var(--success)' : 'var(--mint-700)';
      el.innerHTML = `
        <div class="toast-icon" style="background:${bg}; color:${color};">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="toast-content">
          <div class="toast-title">${title}</div>
          <div class="toast-msg">${msg}</div>
        </div>
      `;
      host.appendChild(el);
      setTimeout(() => {
        el.style.transition = 'opacity 240ms, transform 240ms';
        el.style.opacity = '0';
        el.style.transform = 'translateX(20px)';
        setTimeout(() => el.remove(), 260);
      }, 3200);
    }

    /* ================================================
       Module 0 — Home
       ================================================ */
    function initHome() {
      // 모든 인터랙션이 CSS 애니메이션과 정적 콘텐츠로 구성
      // 추가 차트가 필요할 경우 여기에 작성
    }

    /* ================================================
       Module 5 — Quality
       ================================================ */
    function initQuality() {
      // 막대 애니메이션은 CSS transition 으로 자동 처리
    }

    /* ================================================
       Module 6 — FinOps
       ================================================ */
    let finopsChart;
    function initFinops() {
      const el = document.getElementById('finopsChart');
      if (!el) return;
      if (typeof Chart !== 'undefined') Chart.getChart(el)?.destroy();
      const ctx = el.getContext('2d');
      const labels = Array.from({length: 30}, (_, i) => `${i+1}일`);
      const data = [];
      let v = 7.2;
      for (let i = 0; i < 30; i++) {
        v += (Math.random() - 0.55) * 0.6;
        // 자원 자동 중지 적용 후 (15일 이후) 안정화
        if (i > 14) v = Math.min(v, 6.4);
        v = Math.max(4.5, Math.min(8.8, v));
        data.push(+v.toFixed(2));
      }
      const grad = ctx.createLinearGradient(0, 0, 0, 220);
      grad.addColorStop(0, 'rgba(0, 144, 218, 0.26)');
      grad.addColorStop(1, 'rgba(0, 144, 218, 0)');
      finopsChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: '일 비용',
            data,
            borderColor: '#0090DA',
            backgroundColor: grad,
            borderWidth: 2.4, tension: 0.4,
            pointRadius: 0, pointHoverRadius: 5,
            pointHoverBackgroundColor: '#0090DA',
            pointHoverBorderColor: 'white', pointHoverBorderWidth: 2,
            fill: true
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#FFFFFF',
              titleColor: '#222222',
              bodyColor: '#4A5568',
              borderColor: '#E2E8F0',
              borderWidth: 1,
              padding: 10, cornerRadius: 8,
              callbacks: { label: (ctx) => `₩ ${ctx.parsed.y}M` }
            },
            // annotation removed — pure data line
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#718096', font: { size: 11 }, maxTicksLimit: 10 } },
            y: { grid: { color: '#EDF2F7' }, border: { display: false },
                 ticks: { color: '#718096', font: { size: 11 },
                          callback: (v) => `₩${v}M` } }
          }
        }
      });
      applyFinopsBudgetToUi();
    }

    /* ================================================
       Module 7 — BI
       ================================================ */
    function initBI() {
      document.querySelectorAll('#biReportRows .bi-list-row[data-monthly]').forEach((row) => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          const title = row.querySelector('div div:first-child')?.textContent?.trim() || '리포트';
          toast('리포트 카드', `${title} · 전환 상태 및 의존 SQL 요약을 불러왔습니다.`);
        });
      });
    }

    document.addEventListener('DOMContentLoaded', () => {
      if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = "'Pretendard Variable', Pretendard, system-ui, sans-serif";
      }
      loadRequirementState();
      loadRequirementUiState();
      loadEvidenceLogs();
      initSidebarToggle();
      bindStaticUiEvents();
      bindDelegatedActions();
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) closeSearchSuggest();
      });
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          const inp = document.getElementById('globalSearchInput');
          if (inp && isLoggedIn()) {
            inp.focus();
            inp.select();
            renderSearchSuggest(inp.value);
          }
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && currentView === 'query') {
          const ta = document.getElementById('sqlEditor');
          if (ta && (document.activeElement === ta || e.target === ta)) {
            e.preventDefault();
            runQuery();
          }
        }
      });
      const gin = document.getElementById('globalSearchInput');
      gin?.addEventListener('focus', () => { if (isLoggedIn()) renderSearchSuggest(gin.value); });
      setMetaSearchFilter('all');
      document.addEventListener('copy', (e) => {
        if (!copyProtectionEnabled) return;
        if (!e.target.closest || !e.target.closest('#protectedZone')) return;
        e.preventDefault();
        toast('보안 정책', 'SVR-007 정책: 보호영역 복사가 차단되었습니다.');
      });
      document.addEventListener('cut', (e) => {
        if (!copyProtectionEnabled) return;
        if (!e.target.closest || !e.target.closest('#protectedZone')) return;
        e.preventDefault();
        toast('보안 정책', 'SVR-007 정책: 보호영역 잘라내기가 차단되었습니다.');
      });
      document.addEventListener('contextmenu', (e) => {
        if (!copyProtectionEnabled) return;
        if (!e.target.closest || !e.target.closest('#protectedZone')) return;
        e.preventDefault();
        toast('보안 정책', 'SVR-007 정책: 보호영역 우클릭이 차단되었습니다.');
      });
      document.addEventListener('keydown', (e) => {
        if (!copyProtectionEnabled) return;
        if (e.key === 'PrintScreen') {
          toast('보안 정책', 'SVR-007 시뮬레이션: 화면 캡처 시도가 탐지되었습니다.');
        }
      });

      if (sessionStorage.getItem(AUTH_SESSION_KEY) === '1') {
        enterAppShell();
      }
    });
