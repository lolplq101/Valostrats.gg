/* ============================================
   STRAT BOARD — Interactive Tactical Canvas
   Hybrid approach: <img> map + transparent <canvas> overlay
   ============================================ */

'use strict';

// ---- Constants ----
const STROKE_COLORS = ['#ff4655', '#ffffff', '#ffd700', '#4caf50', '#64b5f6', '#ff9800'];
const STROKE_WIDTHS = [2, 4, 7];
const TOKEN_RADIUS  = 22;  // px on canvas (CSS pixels)
const ARROW_HEAD    = 13;

// ---- State ----
const stratState = {
    map:           null,
    side:          'attack',
    tool:          'arrow',
    color:         '#ff4655',
    lineWidth:     2,
    tokens:        [],
    strokes:       [],
    currentStroke: null,
    labels:        [],
    history:       [],
    showCallouts:  false,
    activeDrag:    null,
    drawing:       false,
    maps:          [],
    callouts:      [],
    currentDocId:  null,
    savedStrats:   [],
    showSavedPanel: false,
    name:          'Untitled Strat',
};

// ---- Element refs ----
let canvas, ctx;
let mapImgEl = null;   // the <img> element for the map background

// ---- Get rendered bounds of the map image inside its container ----
// (accounts for object-fit: contain letterboxing)
function getMapImgBounds() {
    if (!mapImgEl || !mapImgEl.naturalWidth) return null;
    const el   = mapImgEl;
    const rect = el.getBoundingClientRect();
    const nW   = el.naturalWidth;
    const nH   = el.naturalHeight;
    const elW  = rect.width;
    const elH  = rect.height;
    const imgRatio = nW / nH;
    const elRatio  = elW / elH;

    let renderedW, renderedH, offsetX, offsetY;
    if (imgRatio > elRatio) {
        // image wider — letterbox top/bottom
        renderedW = elW;
        renderedH = elW / imgRatio;
        offsetX   = 0;
        offsetY   = (elH - renderedH) / 2;
    } else {
        // image taller — letterbox left/right
        renderedH = elH;
        renderedW = elH * imgRatio;
        offsetX   = (elW - renderedW) / 2;
        offsetY   = 0;
    }
    return { x: offsetX, y: offsetY, w: renderedW, h: renderedH };
}

// ---- Convert clientX/Y mouse event to canvas coordinates ----
function eventToCanvas(e) {
    const r     = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
        x: touch.clientX - r.left,
        y: touch.clientY - r.top,
    };
}

// ---- Convert callout world coords → canvas coords ----
function calloutToCanvas(callout, map) {
    if (!map?.xMultiplier) return null;
    const bounds = getMapImgBounds();
    if (!bounds) return null;
    const nx = callout.location.x * map.xMultiplier + map.xScalarToAdd;
    const ny = callout.location.y * map.yMultiplier + map.yScalarToAdd;
    return {
        x: bounds.x + nx * bounds.w,
        y: bounds.y + ny * bounds.h,
    };
}

// ---- Main render function ----
function render() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Callout labels
    if (stratState.showCallouts && stratState.map?.callouts) {
        ctx.save();
        ctx.font = 'bold 11px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        stratState.map.callouts.forEach(c => {
            const pos = calloutToCanvas(c, stratState.map);
            if (!pos) return;
            const label   = `${c.superRegionName} ${c.regionName}`;
            const metrics = ctx.measureText(label);
            const w = metrics.width + 8, h = 16;
            ctx.fillStyle = 'rgba(0,0,0,0.60)';
            roundRect(ctx, pos.x - w/2, pos.y - h/2, w, h, 3);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 200, 70, 0.9)';
            ctx.fillText(label, pos.x, pos.y + 4);
        });
        ctx.restore();
    }

    // Finished strokes
    stratState.strokes.forEach(s => drawStroke(ctx, s));

    // Current stroke (being drawn)
    if (stratState.currentStroke) drawStroke(ctx, stratState.currentStroke);

    // Text labels
    stratState.labels.forEach(lbl => {
        ctx.save();
        ctx.font        = 'bold 14px "Outfit", sans-serif';
        ctx.textAlign   = 'left';
        ctx.fillStyle   = lbl.color || '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur  = 4;
        ctx.fillText(lbl.text, lbl.x, lbl.y);
        ctx.restore();
    });

    // Agent tokens
    stratState.tokens.forEach(t => { if (t.placed) drawToken(ctx, t); });
}

function drawStroke(c, s) {
    if (!s?.points || s.points.length < 2) return;
    c.save();
    c.strokeStyle = s.color;
    c.lineWidth   = s.width;
    c.lineCap     = 'round';
    c.lineJoin    = 'round';
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur  = 3;

    if (s.type === 'arrow') {
        const p0 = s.points[0], p1 = s.points[s.points.length - 1];
        c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
        const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        c.fillStyle = s.color;
        c.beginPath();
        c.moveTo(p1.x, p1.y);
        c.lineTo(p1.x - ARROW_HEAD * Math.cos(angle - Math.PI/7),
                 p1.y - ARROW_HEAD * Math.sin(angle - Math.PI/7));
        c.lineTo(p1.x - ARROW_HEAD * Math.cos(angle + Math.PI/7),
                 p1.y - ARROW_HEAD * Math.sin(angle + Math.PI/7));
        c.closePath(); c.fill();
    } else if (s.type === 'pen') {
        c.beginPath(); c.moveTo(s.points[0].x, s.points[0].y);
        s.points.slice(1).forEach(p => c.lineTo(p.x, p.y));
        c.stroke();
    }
    c.restore();
}

function drawToken(c, t) {
    const r = TOKEN_RADIUS;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.8)';
    c.shadowBlur  = 10;

    // Coloured ring
    const ring = stratState.side === 'attack' ? '#ff4655' : '#6ab0ff';
    c.beginPath();
    c.arc(t.x, t.y, r + 3, 0, Math.PI * 2);
    c.fillStyle = ring;
    c.fill();

    // Clip to circle for agent image
    c.save();
    c.beginPath();
    c.arc(t.x, t.y, r, 0, Math.PI * 2);
    c.clip();
    if (t._img && t._img.complete && t._img.naturalWidth > 0) {
        c.drawImage(t._img, t.x - r, t.y - r, r * 2, r * 2);
    } else {
        c.fillStyle = 'rgba(30,40,55,1)';
        c.fillRect(t.x - r, t.y - r, r * 2, r * 2);
        c.fillStyle = '#fff';
        c.font = 'bold 14px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(t.displayName?.[0] ?? '?', t.x, t.y);
    }
    c.restore(); // restore clip
    c.restore(); // restore shadow
}

function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y,     x + w, y + r,     r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x,     y + h, x,     y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y,     x + r, y,             r);
    c.closePath();
}

// ---- Resize: match canvas to its CSS rendered size ----
function resizeCanvas() {
    if (!canvas) return;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    if (W === 0 || H === 0) return;
    if (canvas.width === W && canvas.height === H) { render(); return; }
    canvas.width  = W;
    canvas.height = H;
    render();
}

// ---- Load map into the <img> element ----
function loadMapImage(map) {
    stratState.map = map;
    if (!mapImgEl) return;
    const url = map.displayIcon;
    if (!url) { mapImgEl.src = ''; render(); return; }
    mapImgEl.onload  = () => render();
    mapImgEl.onerror = () => render();
    mapImgEl.src = url;

    // Update the side tint overlay colour
    updateSideTint();
}

// Update the tint div colour
function updateSideTint() {
    const tint = document.getElementById('map-side-tint');
    if (!tint) return;
    tint.style.background = stratState.side === 'attack'
        ? 'rgba(255, 70, 85, 0.08)'
        : 'rgba(100, 150, 255, 0.08)';
}

// ---- Agent Tray ----
function buildAgentTray() {
    const tray = document.getElementById('agent-tray');
    if (!tray) return;
    tray.innerHTML = '<span class="agent-tray-label">Drag to map</span>';
    stratState.tokens.forEach((t, i) => {
        const div = document.createElement('div');
        div.className = 'tray-agent-token' + (t.placed ? ' placed' : '');
        div.title = t.displayName;
        div.dataset.index = i;
        const img = document.createElement('img');
        img.src = t.displayIcon;
        img.alt = t.displayName;
        div.appendChild(img);
        div.addEventListener('mousedown', e => {
            if (t.placed) return;
            e.preventDefault();
            startTrayDrag(i, e);
        });
        tray.appendChild(div);
    });
}

// Ghost drag from tray
let trayGhost = null, trayDragIndex = -1;
function startTrayDrag(index, e) {
    trayDragIndex = index;
    trayGhost = document.createElement('div');
    trayGhost.style.cssText = `position:fixed;width:52px;height:52px;border-radius:50%;
        overflow:hidden;border:2px solid #ff4655;pointer-events:none;
        z-index:9999;opacity:0.9;transform:translate(-50%,-50%);`;
    const gi = document.createElement('img');
    gi.src = stratState.tokens[index].displayIcon;
    gi.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    trayGhost.appendChild(gi);
    document.body.appendChild(trayGhost);
    moveTrayGhost(e);
    document.addEventListener('mousemove', onTrayGhostMove);
    document.addEventListener('mouseup',   onTrayGhostDrop);
}
function moveTrayGhost(e) {
    if (!trayGhost) return;
    trayGhost.style.left = e.clientX + 'px';
    trayGhost.style.top  = e.clientY + 'px';
}
function onTrayGhostMove(e) { moveTrayGhost(e); }
function onTrayGhostDrop(e) {
    document.removeEventListener('mousemove', onTrayGhostMove);
    document.removeEventListener('mouseup',   onTrayGhostDrop);
    if (trayGhost) { trayGhost.remove(); trayGhost = null; }
    if (trayDragIndex < 0) return;
    const rect = canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom) {
        trayDragIndex = -1; return;
    }
    placeToken(trayDragIndex, e.clientX - rect.left, e.clientY - rect.top);
    trayDragIndex = -1;
}
function placeToken(index, cx, cy) {
    const t = stratState.tokens[index];
    if (!t) return;
    t.x = cx; t.y = cy; t.placed = true;
    buildAgentTray(); pushHistory(); render();
}

// ---- Hit testing ----
function tokenAtPoint(cx, cy) {
    for (let i = stratState.tokens.length - 1; i >= 0; i--) {
        const t = stratState.tokens[i];
        if (!t.placed) continue;
        if (Math.hypot(cx - t.x, cy - t.y) <= TOKEN_RADIUS + 6) return i;
    }
    return -1;
}
function labelAtPoint(cx, cy) {
    ctx.save(); ctx.font = 'bold 14px "Outfit", sans-serif';
    for (let i = stratState.labels.length - 1; i >= 0; i--) {
        const l = stratState.labels[i];
        const w = ctx.measureText(l.text).width;
        if (cx >= l.x && cx <= l.x + w && cy <= l.y && cy >= l.y - 16) {
            ctx.restore(); return i;
        }
    }
    ctx.restore(); return -1;
}

// ---- Canvas event handlers ----
function onPointerDown(e) {
    if (!stratState.map) return;
    e.preventDefault();
    const pt = eventToCanvas(e);

    if (e.button === 2) {
        const ti = tokenAtPoint(pt.x, pt.y);
        if (ti >= 0) { stratState.tokens[ti].placed = false; buildAgentTray(); pushHistory(); render(); }
        return;
    }

    const tool = stratState.tool;

    if (tool === 'select' || tool === 'arrow') {
        const ti = tokenAtPoint(pt.x, pt.y);
        if (ti >= 0) {
            stratState.activeDrag = { type:'token', index:ti,
                offX: pt.x - stratState.tokens[ti].x,
                offY: pt.y - stratState.tokens[ti].y };
            canvas.style.cursor = 'grabbing';
            return;
        }
        if (tool === 'select') {
            const li = labelAtPoint(pt.x, pt.y);
            if (li >= 0) {
                stratState.activeDrag = { type:'label', index:li,
                    offX: pt.x - stratState.labels[li].x,
                    offY: pt.y - stratState.labels[li].y };
                return;
            }
        }
    }

    if (tool === 'label') {
        const text = prompt('Enter callout label:');
        if (text?.trim()) { stratState.labels.push({ text:text.trim(), x:pt.x, y:pt.y, color:stratState.color }); pushHistory(); render(); }
        return;
    }

    if (tool === 'eraser') {
        const ti = tokenAtPoint(pt.x, pt.y);
        if (ti >= 0) { stratState.tokens[ti].placed = false; buildAgentTray(); pushHistory(); render(); return; }
        const li = labelAtPoint(pt.x, pt.y);
        if (li >= 0) { stratState.labels.splice(li,1); pushHistory(); render(); return; }
        let best = -1, bestDist = 35;
        stratState.strokes.forEach((s,i) => s.points.forEach(p => {
            const d = Math.hypot(pt.x-p.x, pt.y-p.y);
            if (d < bestDist) { bestDist = d; best = i; }
        }));
        if (best >= 0) { stratState.strokes.splice(best,1); pushHistory(); render(); }
        return;
    }

    if (tool === 'arrow' && stratState.activeDrag) return;
    stratState.drawing = true;
    stratState.currentStroke = { type: tool==='pen'?'pen':'arrow', color:stratState.color, width:stratState.lineWidth, points:[pt] };
}

function onPointerMove(e) {
    if (!stratState.map) return;
    e.preventDefault();
    const pt = eventToCanvas(e);
    if (stratState.activeDrag) {
        const d = stratState.activeDrag;
        if (d.type === 'token') { const t = stratState.tokens[d.index]; t.x = pt.x - d.offX; t.y = pt.y - d.offY; }
        else { const l = stratState.labels[d.index]; l.x = pt.x - d.offX; l.y = pt.y - d.offY; }
        render(); return;
    }
    if (!stratState.drawing || !stratState.currentStroke) return;
    stratState.currentStroke.points.push(pt);
    render();
}

function onPointerUp() {
    if (stratState.activeDrag) {
        if (stratState.activeDrag.type === 'token') canvas.style.cursor = '';
        stratState.activeDrag = null; pushHistory(); render(); return;
    }
    if (stratState.drawing && stratState.currentStroke) {
        if (stratState.currentStroke.points.length >= 2) { stratState.strokes.push(stratState.currentStroke); pushHistory(); }
        stratState.currentStroke = null; stratState.drawing = false; render();
    }
}

// ---- History / undo ----
function pushHistory() {
    stratState.history.push({
        strokes: JSON.parse(JSON.stringify(stratState.strokes)),
        labels:  JSON.parse(JSON.stringify(stratState.labels)),
        tokens:  stratState.tokens.map(t => ({ ...t })),
    });
    if (stratState.history.length > 50) stratState.history.shift();
}

function undo() {
    if (stratState.history.length <= 1) return;
    stratState.history.pop();
    const prev = stratState.history[stratState.history.length - 1];
    if (!prev) return;
    stratState.strokes = JSON.parse(JSON.stringify(prev.strokes));
    stratState.labels  = JSON.parse(JSON.stringify(prev.labels));
    stratState.tokens  = prev.tokens.map(t => {
        const copy = { ...t };
        if (!copy._img) { copy._img = new Image(); copy._img.src = copy.displayIcon; }
        return copy;
    });
    buildAgentTray(); render();
}

function clearBoard() {
    if (!confirm('Clear all drawings and tokens?')) return;
    stratState.strokes = []; stratState.labels = [];
    stratState.tokens.forEach(t => { t.placed=false; t.x=0; t.y=0; });
    stratState.history = [];
    buildAgentTray(); render();
}

// ---- Save / Load (Firestore) ----
async function saveStrat() {
    if (!window.state?.user) { window.showToast?.('Please log in to save strats','warning'); return; }
    if (!stratState.map)     { window.showToast?.('Select a map first','warning'); return; }
    const { getFirestore, collection, addDoc, doc, updateDoc } = window.firebaseModules;
    const db = getFirestore(window.firebaseApp);
    const payload = {
        userId:  window.state.user.uid, name: stratState.name,
        mapId:   stratState.map.uuid,   side: stratState.side,
        tokens:  stratState.tokens.filter(t=>t.placed).map(t=>({uuid:t.uuid,x:t.x,y:t.y})),
        strokes: stratState.strokes, labels: stratState.labels, date: Date.now(),
    };
    try {
        if (stratState.currentDocId) { await updateDoc(doc(db,'stratboards',stratState.currentDocId),payload); }
        else { const r = await addDoc(collection(db,'stratboards'),payload); stratState.currentDocId=r.id; }
        window.showToast?.('Strat saved!','success');
        loadSavedStrats();
    } catch(err) { console.error(err); window.showToast?.('Save failed','error'); }
}

async function loadSavedStrats() {
    if (!window.state?.user) return;
    const { getFirestore, collection, getDocs, query, where, orderBy } = window.firebaseModules;
    const db = getFirestore(window.firebaseApp);
    try {
        const q = query(collection(db,'stratboards'), where('userId','==',window.state.user.uid), orderBy('date','desc'));
        const snap = await getDocs(q);
        stratState.savedStrats = snap.docs.map(d=>({docId:d.id,...d.data()}));
        renderSavedStratsPanel();
    } catch(e) { console.warn('Could not load strats:',e); }
}

function renderSavedStratsPanel() {
    const panel = document.getElementById('saved-strats-panel');
    if (!panel) return;
    if (!stratState.savedStrats.length) { panel.innerHTML='<p style="color:var(--text-secondary);font-size:0.82rem;text-align:center;padding:0.5rem;">No saved strats yet</p>'; return; }
    panel.innerHTML='';
    stratState.savedStrats.forEach(strat => {
        const mapName = stratState.maps.find(m=>m.uuid===strat.mapId)?.displayName||'Map';
        const row = document.createElement('div');
        row.className = 'saved-strat-item';
        row.innerHTML = `<div class="saved-strat-item-name">${strat.name||'Untitled'}</div><div class="saved-strat-item-meta">${mapName}</div><button class="saved-strat-delete" title="Delete">&times;</button>`;
        row.querySelector('.saved-strat-delete').onclick = async e => { e.stopPropagation(); await deleteStrat(strat.docId); };
        row.onclick = () => { loadStratFromSaved(strat); toggleSavedPanel(false); };
        panel.appendChild(row);
    });
}

async function deleteStrat(docId) {
    const { getFirestore, doc, deleteDoc } = window.firebaseModules;
    try { await deleteDoc(doc(getFirestore(window.firebaseApp),'stratboards',docId)); await loadSavedStrats(); }
    catch(e) { window.showToast?.('Delete failed','error'); }
}

function loadStratFromSaved(strat) {
    const map = stratState.maps.find(m=>m.uuid===strat.mapId);
    if (map) { document.getElementById('strat-map-select').value=strat.mapId; setMap(map); }
    stratState.side = strat.side||'attack'; updateSideUI();
    stratState.name = strat.name||'Untitled Strat';
    const ni = document.getElementById('strat-name-input');
    if (ni) ni.value = stratState.name;
    strat.tokens?.forEach(saved => {
        const idx = stratState.tokens.findIndex(t=>t.uuid===saved.uuid);
        if (idx>=0) { stratState.tokens[idx].placed=true; stratState.tokens[idx].x=saved.x; stratState.tokens[idx].y=saved.y; }
    });
    stratState.strokes=strat.strokes||[]; stratState.labels=strat.labels||[];
    stratState.currentDocId=strat.docId;
    pushHistory(); buildAgentTray(); render();
}

function toggleSavedPanel(force) {
    const panel = document.getElementById('saved-strats-panel');
    if (!panel) return;
    const visible = force!==undefined ? force : !stratState.showSavedPanel;
    stratState.showSavedPanel = visible;
    panel.classList.toggle('visible', visible);
    if (visible) loadSavedStrats();
}

// ---- Export PNG ----
function exportPNG() {
    const out = document.createElement('canvas');
    out.width  = canvas.width;
    out.height = canvas.height;
    const oc = out.getContext('2d');
    // Draw map image if available
    if (mapImgEl?.naturalWidth) {
        const bounds = getMapImgBounds();
        if (bounds) {
            oc.fillStyle = '#080c10';
            oc.fillRect(0,0,out.width,out.height);
            oc.globalAlpha = 0.88;
            oc.drawImage(mapImgEl, bounds.x, bounds.y, bounds.w, bounds.h);
            oc.globalAlpha = 1;
        }
    }
    oc.drawImage(canvas, 0, 0);
    const link = document.createElement('a');
    link.href     = out.toDataURL('image/png');
    link.download = `${stratState.name.replace(/\s+/g,'_')}_${stratState.map?.displayName||'strat'}.png`;
    link.click();
}

// ---- Side UI ----
function updateSideUI() {
    const atk = document.getElementById('side-attack-btn');
    const def = document.getElementById('side-defence-btn');
    if (atk) atk.className = 'side-btn' + (stratState.side==='attack'  ? ' active-attack'  : '');
    if (def) def.className = 'side-btn' + (stratState.side==='defence' ? ' active-defence' : '');
    updateSideTint(); render();
}

// ---- Map selector ----
function setMap(map) {
    stratState.map = map;
    loadMapImage(map);
    // Hide empty msg
    const msg = document.getElementById('canvas-empty-msg');
    if (msg) msg.style.display = 'none';
}

function populateMapSelector(maps) {
    const sel = document.getElementById('strat-map-select');
    if (!sel) return;
    const competitive = maps.filter(m => m.displayIcon && m.xMultiplier);
    sel.innerHTML = '<option value="">— Select Map —</option>';
    competitive.forEach(m => { const o = document.createElement('option'); o.value=m.uuid; o.textContent=m.displayName; sel.appendChild(o); });
    stratState.maps = maps;
}

// ---- Tool selector ----
function setTool(tool) {
    stratState.tool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tool-${tool}`)?.classList.add('active');
    canvas.className = '';
    if (tool==='select')  canvas.classList.add('tool-select');
    else if (tool==='pen') canvas.classList.add('tool-pen');
    else if (tool==='eraser') canvas.classList.add('tool-eraser');
    else if (tool==='label') canvas.classList.add('tool-label');
    else canvas.classList.add('tool-arrow');
}

// ---- Colour & width ----
function buildColorSwatches() {
    const c = document.getElementById('strat-colors');
    if (!c) return;
    c.innerHTML='';
    STROKE_COLORS.forEach(col => {
        const sw = document.createElement('button');
        sw.className = 'color-swatch' + (col===stratState.color?' active':'');
        sw.style.background = col;
        sw.onclick = () => { stratState.color=col; c.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('active')); sw.classList.add('active'); };
        c.appendChild(sw);
    });
}

function buildLineWidths() {
    const c = document.getElementById('strat-widths');
    if (!c) return;
    c.innerHTML='';
    STROKE_WIDTHS.forEach((w,i) => {
        const btn = document.createElement('button');
        btn.className = 'tool-btn line-width-btn'+(i===0?' active':'');
        const dot = document.createElement('span');
        dot.style.cssText = `width:${w+4}px;height:${w+4}px;background:var(--text-secondary);border-radius:50%;display:block;pointer-events:none;`;
        btn.appendChild(dot);
        btn.onclick = () => { stratState.lineWidth=w; c.querySelectorAll('.tool-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); };
        c.appendChild(btn);
    });
}

// ---- Populate tokens ----
function populateAllAgents() {
    const allAgents = window.state?.agents || [];
    stratState.tokens = allAgents.map(a => {
        const img = new Image(); img.src = a.displayIcon;
        return { uuid:a.uuid, displayIcon:a.displayIcon, displayName:a.displayName, placed:false, x:0, y:0, _img:img };
    });
    buildAgentTray();
}

// ---- Init ----
async function initStratBoard() {
    canvas   = document.getElementById('strat-canvas');
    mapImgEl = document.getElementById('strat-map-img');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // Use ResizeObserver — fires after layout is computed, even after view is shown
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(canvas);

    // Also handle window resize
    window.addEventListener('resize', () => { setTimeout(resizeCanvas, 50); });

    // Populate maps
    const maps = window.state?.maps || [];
    populateMapSelector(maps);
    if (!maps.length) {
        try {
            const res  = await fetch('https://valorant-api.com/v1/maps');
            const data = await res.json();
            if (window.state) window.state.maps = data.data||[];
            populateMapSelector(data.data||[]);
        } catch(e) { console.warn('Map fetch failed',e); }
    }

    buildColorSwatches();
    buildLineWidths();
    setTool('arrow');
    populateAllAgents();

    // Map selector
    document.getElementById('strat-map-select')?.addEventListener('change', function() {
        const m = stratState.maps.find(x=>x.uuid===this.value);
        if (m) setMap(m);
    });

    // Side buttons
    document.getElementById('side-attack-btn')?.addEventListener('click',  () => { stratState.side='attack';  updateSideUI(); });
    document.getElementById('side-defence-btn')?.addEventListener('click', () => { stratState.side='defence'; updateSideUI(); });

    // Tool buttons
    ['arrow','pen','eraser','label','select'].forEach(t => {
        document.getElementById(`tool-${t}`)?.addEventListener('click', () => setTool(t));
    });

    // Callout toggle
    document.getElementById('callout-toggle-btn')?.addEventListener('click', function() {
        stratState.showCallouts = !stratState.showCallouts;
        this.classList.toggle('active', stratState.showCallouts);
        render();
    });

    // Undo / Clear / Save / Export / Load
    document.getElementById('strat-undo-btn')?.addEventListener('click', undo);
    document.getElementById('strat-clear-btn')?.addEventListener('click', clearBoard);
    document.getElementById('strat-save-btn')?.addEventListener('click', saveStrat);
    document.getElementById('strat-export-btn')?.addEventListener('click', exportPNG);
    document.getElementById('strat-load-btn')?.addEventListener('click', () => toggleSavedPanel());

    // Strat name
    document.getElementById('strat-name-input')?.addEventListener('input', function() { stratState.name=this.value; });

    // Canvas events
    canvas.addEventListener('mousedown',   onPointerDown);
    canvas.addEventListener('mousemove',   onPointerMove);
    canvas.addEventListener('mouseup',     onPointerUp);
    canvas.addEventListener('mouseleave',  onPointerUp);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('touchstart',  e => { e.preventDefault(); onPointerDown(e); }, {passive:false});
    canvas.addEventListener('touchmove',   e => { e.preventDefault(); onPointerMove(e); }, {passive:false});
    canvas.addEventListener('touchend',    e => { e.preventDefault(); onPointerUp();    }, {passive:false});

    pushHistory();
}

// ---- Public: open from comp ----
function openStratBoard(comp) {
    if (window.switchView) window.switchView('stratboard');
    if (!window._stratboardInited) { return; } // switchView will init
    _loadComp(comp);
}

function _loadComp(comp) {
    stratState.strokes=[]; stratState.labels=[]; stratState.currentDocId=null;
    stratState.name = comp.name ? `${comp.name} Strat` : 'Untitled Strat';
    const ni = document.getElementById('strat-name-input');
    if (ni) ni.value = stratState.name;

    const map = stratState.maps.find(m=>m.uuid===comp.mapId);
    if (map) { document.getElementById('strat-map-select').value=map.uuid; setMap(map); }

    const allAgents = window.state?.agents||[];
    stratState.tokens = (comp.agents||[]).slice(0,5).map(uuid => {
        const a = allAgents.find(x=>x.uuid===uuid);
        if (!a) return null;
        const img = new Image(); img.src = a.displayIcon;
        return { uuid:a.uuid, displayIcon:a.displayIcon, displayName:a.displayName, placed:false, x:0, y:0, _img:img };
    }).filter(Boolean);

    pushHistory(); buildAgentTray(); render();
    window.showToast?.(`Loaded "${comp.name}" — drag agents onto the map`,'success');
}

window.initStratBoard = initStratBoard;
window.openStratBoard = openStratBoard;
window._loadComp      = _loadComp;
