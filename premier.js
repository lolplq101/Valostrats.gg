// ==========================================
// VALORANT PREMIER MODE
// oh_hell_nah #whaat | AP (India)
// ==========================================

const PREMIER_CONFIG = {
    teamName: 'oh_hell_nah',
    teamTag: 'whaat',
    region: 'ap',
    apiBase: 'https://api.henrikdev.xyz/valorant/v1/premier',
    qualifyThreshold: 600,
    pointsWin: 100,
    pointsLoss: 25,
    matchWindow: '8:30 – 9:30 PM IST',
    playoffSignIn: '8:00 PM IST',
};

// Hard-coded V26A1 schedule as fallback (API also returns this)
const FALLBACK_SCHEDULE = [
    { week: 1, map: 'Split',   startDate: '2026-01-14', endDate: '2026-01-18' },
    { week: 2, map: 'Breeze',  startDate: '2026-01-21', endDate: '2026-01-25' },
    { week: 3, map: 'Pearl',   startDate: '2026-01-28', endDate: '2026-02-01' },
    { week: 4, map: 'Bind',    startDate: '2026-02-04', endDate: '2026-02-08' },
    { week: 5, map: 'Abyss',   startDate: '2026-02-11', endDate: '2026-02-15' },
    { week: 6, map: 'Corrode', startDate: '2026-02-18', endDate: '2026-02-22' },
    { week: 7, map: 'Haven',   startDate: '2026-02-25', endDate: '2026-02-28' },
];
const PLAYOFF_DATE = '2026-03-01';

// ==========================================
// STATE
// ==========================================

const premierState = {
    apiKey: null,
    teamId: null,
    schedule: [...FALLBACK_SCHEDULE],
    matchHistory: [],
    leaderboard: [],
    linkedComps: {}, // { week1: [compDocId, ...], ... }
    fetching: false,  // guard against concurrent loads
    error: null,
};

// ==========================================
// INIT
// ==========================================

async function initPremier() {
    premierState.apiKey = localStorage.getItem('henrik_api_key') || null;

    // Always render the static calendar immediately — never block on a spinner
    await loadLinkedComps();
    renderPremierView();

    // If no key, show the modal (but calendar is already visible behind it)
    if (!premierState.apiKey) {
        showApiKeyModal();
        return;
    }

    // Fetch live data in the background without blocking the UI
    if (!premierState.fetching) {
        fetchLiveData();
    }
}

async function fetchLiveData() {
    if (premierState.fetching) return;
    premierState.fetching = true;
    premierState.error = null;

    try {
        // Step 1: Resolve team ID (cached in localStorage)
        let teamId = localStorage.getItem('premier_team_id');
        if (!teamId) {
            teamId = await fetchTeamId();
            if (teamId) localStorage.setItem('premier_team_id', teamId);
        }
        premierState.teamId = teamId;

        // Step 2: Fetch season schedule from API
        try {
            const season = await henrikGetWithTimeout(`/seasons/${PREMIER_CONFIG.region}`);
            if (season?.data?.scheduled_events?.length) {
                premierState.schedule = parseSeason(season.data.scheduled_events);
            }
        } catch (e) {
            console.warn('Season fetch failed, using fallback schedule:', e.message);
        }

        // Step 3: Fetch match history
        if (premierState.teamId) {
            try {
                const hist = await henrikGetWithTimeout(`/${premierState.teamId}/history`);
                premierState.matchHistory = hist?.data || [];
            } catch (e) {
                console.warn('Match history fetch failed:', e.message);
            }
        }

        // Step 4: Fetch leaderboard
        try {
            const lb = await henrikGetWithTimeout(`/leaderboard/${PREMIER_CONFIG.region}`);
            premierState.leaderboard = lb?.data || [];
        } catch (e) {
            console.warn('Leaderboard fetch failed:', e.message);
        }

    } catch (e) {
        premierState.error = e.message;
        console.error('Premier load error:', e);
    }

    premierState.fetching = false;
    renderPremierView(); // re-render with live data
}

// ==========================================
// API HELPERS
// ==========================================

function fetchWithTimeout(url, options = {}, ms = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

async function henrikGetWithTimeout(path) {
    const res = await fetchWithTimeout(`${PREMIER_CONFIG.apiBase}${path}`, {
        headers: { 'Authorization': premierState.apiKey }
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return res.json();
}

// Keep old name as alias
async function henrikGet(path) {
    return henrikGetWithTimeout(path);
}

async function fetchTeamId() {
    const data = await henrikGet(`/${PREMIER_CONFIG.teamName}/${PREMIER_CONFIG.teamTag}`);
    return data?.data?.id || null;
}

function parseSeason(events) {
    // Map API scheduled_events to our week format
    return events
        .filter(e => e.type === 'RANKED_GAME_WEEK' || e.type === 'GAME_WEEK')
        .map((e, i) => ({
            week: i + 1,
            map: e.map_selection?.display_name || `Week ${i + 1}`,
            startDate: e.start_time?.split('T')[0] || '',
            endDate: e.end_time?.split('T')[0] || '',
        }))
        .slice(0, 7);
}

// ==========================================
// POINTS CALCULATION
// ==========================================

function calcPoints() {
    let total = 0;
    const byWeek = {};

    premierState.matchHistory.forEach(match => {
        const matchDate = match.metadata?.started_at || match.started_at || '';
        const week = getWeekForDate(matchDate);
        if (!week) return;

        const key = `week${week}`;
        if (!byWeek[key]) byWeek[key] = { wins: 0, losses: 0, pts: 0 };

        const won = match.teams?.red?.won || match.won;
        if (won) {
            byWeek[key].wins++;
            byWeek[key].pts += PREMIER_CONFIG.pointsWin;
        } else {
            byWeek[key].losses++;
            byWeek[key].pts += PREMIER_CONFIG.pointsLoss;
        }
        total += won ? PREMIER_CONFIG.pointsWin : PREMIER_CONFIG.pointsLoss;
    });

    return { total, byWeek };
}

function getWeekForDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    for (const week of premierState.schedule) {
        const start = new Date(week.startDate);
        const end = new Date(week.endDate);
        end.setDate(end.getDate() + 1); // inclusive
        if (d >= start && d < end) return week.week;
    }
    return null;
}

function getCurrentWeek() {
    const today = new Date();
    for (const week of premierState.schedule) {
        const start = new Date(week.startDate);
        const end = new Date(week.endDate);
        end.setDate(end.getDate() + 1);
        if (today >= start && today < end) return week.week;
    }
    return null;
}

function formatDateRange(start, end) {
    const opts = { month: 'short', day: 'numeric' };
    const s = new Date(start).toLocaleDateString('en-IN', opts);
    const e = new Date(end).toLocaleDateString('en-IN', opts);
    return `${s} – ${e}`;
}

// ==========================================
// FIREBASE — LINKED COMPS
// ==========================================

async function loadLinkedComps() {
    if (!window.state?.user) return;
    try {
        const { getFirestore, doc, getDoc } = window.firebaseModules;
        const db = getFirestore(window.firebaseApp);
        const snap = await getDoc(doc(db, 'users', window.state.user.uid, 'premier', 'linkedComps'));
        if (snap.exists()) premierState.linkedComps = snap.data() || {};
    } catch (e) {
        console.warn('Could not load linked comps:', e.message);
    }
}

async function saveLinkedComps() {
    if (!window.state?.user) return;
    try {
        const { getFirestore, doc, setDoc } = window.firebaseModules;
        const db = getFirestore(window.firebaseApp);
        await setDoc(doc(db, 'users', window.state.user.uid, 'premier', 'linkedComps'),
            premierState.linkedComps);
    } catch (e) {
        console.warn('Could not save linked comps:', e.message);
    }
}

async function linkCompToWeek(weekKey, compDocId) {
    if (!premierState.linkedComps[weekKey]) premierState.linkedComps[weekKey] = [];
    if (!premierState.linkedComps[weekKey].includes(compDocId)) {
        premierState.linkedComps[weekKey].push(compDocId);
        await saveLinkedComps();
        renderPremierView();
    }
}

async function unlinkCompFromWeek(weekKey, compDocId) {
    premierState.linkedComps[weekKey] = (premierState.linkedComps[weekKey] || [])
        .filter(id => id !== compDocId);
    await saveLinkedComps();
    renderPremierView();
}

// ==========================================
// COMP PICKER MODAL
// ==========================================

function openCompPickerForWeek(weekKey) {
    if (!window.state?.user) { showToast('Login to link comps', 'warning'); return; }
    if (!window.state?.savedComps?.length) { showToast('No saved comps yet', 'info'); return; }

    const modal = document.getElementById('premier-comp-picker-modal');
    const list = document.getElementById('premier-comp-picker-list');
    const linked = premierState.linkedComps[weekKey] || [];

    list.innerHTML = window.state.savedComps.map(comp => {
        const mapName = window.state.maps?.find(m => m.uuid === comp.mapId)?.displayName || 'Unknown';
        const isLinked = linked.includes(comp.docId);
        return `
            <div class="comp-picker-row ${isLinked ? 'comp-picker-linked' : ''}"
                 onclick="window.toggleCompLink('${weekKey}', '${comp.docId}', this)">
                <div class="comp-picker-info">
                    <span class="comp-picker-name">${comp.name || 'Untitled'}</span>
                    <span class="comp-picker-map">${mapName}</span>
                </div>
                <span class="comp-picker-check">${isLinked ? '✓ Linked' : '+ Link'}</span>
            </div>
        `;
    }).join('');

    modal.dataset.weekKey = weekKey;
    modal.classList.remove('hidden');
}

window.toggleCompLink = async function(weekKey, compDocId, el) {
    const linked = premierState.linkedComps[weekKey] || [];
    if (linked.includes(compDocId)) {
        await unlinkCompFromWeek(weekKey, compDocId);
    } else {
        await linkCompToWeek(weekKey, compDocId);
    }
    // Update picker row visually
    const isNowLinked = (premierState.linkedComps[weekKey] || []).includes(compDocId);
    el.querySelector('.comp-picker-check').textContent = isNowLinked ? '✓ Linked' : '+ Link';
    el.classList.toggle('comp-picker-linked', isNowLinked);
};

window.closePremierCompPicker = function() {
    document.getElementById('premier-comp-picker-modal').classList.add('hidden');
    renderPremierView(); // refresh linked comp chips
};

// ==========================================
// RENDERING
// ==========================================

function renderPremierView() {
    const container = document.getElementById('premier-content');
    if (!container) return;

    const { total, byWeek } = calcPoints();
    const qualified = total >= PREMIER_CONFIG.qualifyThreshold;
    const currentWeek = getCurrentWeek();
    const today = new Date();
    const playoffDate = new Date(PLAYOFF_DATE);
    const isPlayoffWeek = today >= playoffDate;

    // ---- Season Header ----
    const headerHTML = `
        <div class="premier-header">
            <div class="premier-header-left">
                <div class="premier-season-label">PREMIER — V26A1</div>
                <div class="premier-team-name">${PREMIER_CONFIG.teamName} <span class="premier-team-tag">#${PREMIER_CONFIG.teamTag}</span></div>
            </div>
            <div class="premier-header-right">
                <div class="premier-pts-block">
                    <div class="premier-pts-number">${total}</div>
                    <div class="premier-pts-label">/ ${PREMIER_CONFIG.qualifyThreshold} pts</div>
                </div>
                <div class="premier-qualify-badge ${qualified ? 'qualified' : 'not-qualified'}">
                    ${qualified ? '✅ QUALIFIED' : `${PREMIER_CONFIG.qualifyThreshold - total} pts to go`}
                </div>
            </div>
        </div>
        <div class="premier-match-window-global">
            🕗 Match Window (India): <strong>${PREMIER_CONFIG.matchWindow}</strong> · Playoffs Sign-in: <strong>${PREMIER_CONFIG.playoffSignIn}</strong>
        </div>
    `;

    // ---- Weekly Calendar ----
    const weeksHTML = premierState.schedule.map(week => {
        const weekKey = `week${week.week}`;
        const weekData = byWeek[weekKey] || { wins: 0, losses: 0, pts: 0 };
        const isCurrent = week.week === currentWeek;
        const isPast = new Date(week.endDate) < today;
        const weekLinkedComps = (premierState.linkedComps[weekKey] || [])
            .map(id => window.state?.savedComps?.find(c => c.docId === id))
            .filter(Boolean);

        let resultBadge = '';
        if (isPast && weekData.wins + weekData.losses > 0) {
            resultBadge = `<span class="result-badge wins">${weekData.wins}W ${weekData.losses}L</span>
                           <span class="week-pts">+${weekData.pts} pts</span>`;
        } else if (isPast && premierState.teamId) {
            resultBadge = `<span class="result-badge no-play">No match played</span>`;
        }

        // Map image from valorant-api
        const mapObj = window.state?.maps?.find(m =>
            m.displayName.toLowerCase() === week.map.toLowerCase());
        const mapImg = mapObj?.splash || mapObj?.displayIcon || '';

        const compChips = weekLinkedComps.map(comp => `
            <div class="premier-comp-chip">
                <span>${comp.name || 'Untitled'}</span>
                <button class="chip-load-btn" onclick="window.loadComp && window.loadComp(${JSON.stringify(comp).replace(/"/g, '&quot;')})" title="Load into Builder">▶</button>
                <button class="chip-remove-btn" onclick="window.unlinkCompFromWeek('${weekKey}', '${comp.docId}')" title="Unlink">×</button>
            </div>
        `).join('');

        return `
            <div class="week-row ${isCurrent ? 'week-current' : ''} ${isPast ? 'week-past' : ''}">
                ${mapImg ? `<div class="week-map-thumb" style="background-image:url('${mapImg}')"></div>` : '<div class="week-map-thumb week-map-thumb--empty"></div>'}
                <div class="week-info">
                    <div class="week-top-row">
                        <span class="week-num">WK ${week.week}</span>
                        <span class="week-map-name">${week.map.toUpperCase()}</span>
                        <span class="week-dates">${formatDateRange(week.startDate, week.endDate)}</span>
                        ${isCurrent ? `<span class="current-week-tag">THIS WEEK</span>` : ''}
                        ${resultBadge}
                    </div>
                    <div class="week-comps-row">
                        ${compChips}
                        <button class="add-comp-to-week-btn" onclick="window.openCompPickerForWeek('${weekKey}')">+ Link Comp</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Playoff row
    const playoffRow = `
        <div class="week-row playoff-row ${isPlayoffWeek ? 'week-current' : ''}">
            <div class="week-map-thumb playoff-thumb">🏆</div>
            <div class="week-info">
                <div class="week-top-row">
                    <span class="week-num">🏆</span>
                    <span class="week-map-name">PLAYOFFS</span>
                    <span class="week-dates">March 1, 2026</span>
                    ${isPlayoffWeek ? `<span class="current-week-tag">TODAY</span>` : ''}
                    <span class="playoff-signin">Sign-in: ${PREMIER_CONFIG.playoffSignIn}</span>
                </div>
            </div>
        </div>
    `;

    // ---- Error banner ----
    const errorBanner = premierState.error ? `
        <div class="premier-error-banner">
            ⚠️ Live data unavailable: ${premierState.error}. Showing cached / fallback data.
        </div>` : '';

    // ---- No API key notice ----
    const noKeyBanner = !premierState.apiKey ? `
        <div class="premier-no-key-banner">
            🔑 No API key set — showing static schedule only.
            <button class="btn-link" onclick="window.showApiKeyModal()">Add Key</button>
        </div>` : '';

    // ---- Leaderboard ----
    const lbHTML = renderLeaderboard(total);

    container.innerHTML = `
        ${errorBanner}
        ${noKeyBanner}
        ${headerHTML}
        <div class="premier-body">
            <div class="premier-calendar">
                <div class="premier-section-title">SEASON CALENDAR</div>
                ${weeksHTML}
                ${playoffRow}
            </div>
            <div class="premier-sidebar">
                ${lbHTML}
            </div>
        </div>
    `;
}

function renderLeaderboard(myTotal) {
    if (!premierState.leaderboard.length && !premierState.apiKey) {
        return `<div class="leaderboard-panel">
            <div class="premier-section-title">LEADERBOARD</div>
            <div class="lb-empty">Add API key to view standings</div>
        </div>`;
    }

    if (!premierState.leaderboard.length) {
        return `<div class="leaderboard-panel">
            <div class="premier-section-title">LEADERBOARD</div>
            <div class="lb-empty">No leaderboard data yet</div>
        </div>`;
    }

    const myTeamNameLower = PREMIER_CONFIG.teamName.toLowerCase();
    const rows = premierState.leaderboard.slice(0, 20).map((team, i) => {
        const isMe = team.team_name?.toLowerCase() === myTeamNameLower;
        return `
            <div class="lb-row ${isMe ? 'lb-row-me' : ''}">
                <span class="lb-rank">#${i + 1}</span>
                <span class="lb-name">${team.team_name || '—'} <span class="lb-tag">#${team.team_tag || ''}</span></span>
                <span class="lb-pts">${team.points ?? '—'} pts</span>
            </div>
        `;
    }).join('');

    return `
        <div class="leaderboard-panel">
            <div class="premier-section-title">DIVISION STANDINGS</div>
            <div class="lb-list">${rows}</div>
            <button class="refresh-lb-btn" onclick="window.refreshPremierData()">🔄 Refresh</button>
        </div>
    `;
}

// ==========================================
// API KEY MODAL
// ==========================================

function showApiKeyModal() {
    document.getElementById('api-key-modal').classList.remove('hidden');
}

window.closeApiKeyModal = function() {
    document.getElementById('api-key-modal').classList.add('hidden');
};

window.saveApiKey = async function() {
    const input = document.getElementById('api-key-input');
    const key = input?.value?.trim();
    if (!key) { showToast('Please enter a key', 'warning'); return; }
    localStorage.setItem('henrik_api_key', key);
    premierState.apiKey = key;
    localStorage.removeItem('premier_team_id'); // force re-fetch team ID
    window.closeApiKeyModal();
    showToast('API key saved!', 'success');
    premierState.fetching = false; // allow a fresh fetch
    fetchLiveData();
};

window.clearApiKey = function() {
    localStorage.removeItem('henrik_api_key');
    localStorage.removeItem('premier_team_id');
    premierState.apiKey = null;
    premierState.teamId = null;
    premierState.matchHistory = [];
    premierState.leaderboard = [];
    renderPremierView();
    showToast('API key removed', 'info');
};

// ==========================================
// GLOBALS
// ==========================================

window.initPremier = initPremier;
window.showApiKeyModal = showApiKeyModal;
window.openCompPickerForWeek = openCompPickerForWeek;
window.unlinkCompFromWeek = unlinkCompFromWeek;
window.refreshPremierData = function() {
    premierState.fetching = false; // reset guard so refresh always works
    fetchLiveData();
};
