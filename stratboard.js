/* ============================================
   STRAT BOARD — Interactive Tactical Canvas
   ============================================ */

'use strict';

// ---- Constants ----
const STROKE_COLORS = ['#ff4655', '#ffffff', '#ffd700', '#4caf50', '#64b5f6', '#ff9800'];
const STROKE_WIDTHS = [2, 4, 7];
const TOKEN_RADIUS  = 24;  // px on the canvas
const ARROW_HEAD    = 14;  // px arrow-head size

// ---- State ----
const stratState = {
    map:          null,
    side:         'attack',
    tool:         'arrow',
    color:        '#ff4655',
    lineWidth:    2,
    tokens:       [],      // [{uuid, displayIcon, displayName, x, y, placed}]
    strokes:      [],      // finished strokes
    currentStroke: null,   // stroke being drawn right now
    labels:       [],      // [{text, x, y}]
    history:      [],      // undo stack
    showCallouts: false,
    activeDrag:   null,    // {type:'token'|'label', index, offX, offY}
    drawing:      false,
    maps:         [],      // from valorant-api
    agents:       [],      // from window.state.agents
    callouts:     [],      // from map data
    compAgents:   [],      // pre-populated from comp, [] if standalone
    currentDocId: null,    // Firestore docId if editing saved strat
    savedStrats:  [],
    showSavedPanel: false,
    name:         'Untitled Strat',
};

// ---- Canvas refs (set in init) ----
let bgCanvas, bgCtx, canvas, ctx;
let mapImg = null;

// ---- Coordinate helpers ----
function canvasRect()       { return canvas.getBoundingClientRect(); }
function eventToCanvas(e) {
    const r = canvasRect();
    const touch = e.touches ? e.touches[0] : e;
    // Return CSS-pixel coordinates within the canvas.
    // The ctx.setTransform(dpr,...) takes care of mapping these to the buffer.
    return {
        x: touch.clientX - r.left,
        y: touch.clientY - r.top,
    };
}

// ---- Callout world-to-canvas ----
function calloutToCanvas(callout, map) {
    if (!map || !map.xMultiplier) return null;
    const nx = callout.location.x * map.xMultiplier + map.xScalarToAdd;
    const ny = callout.location.y * map.yMultiplier + map.yScalarToAdd;
    // Use CSS pixel dimensions (same space as drawing coords after ctx.setTransform)
    const W = canvas.offsetWidth  || canvas.style.width.replace('px','') * 1  || 800;
    const H = canvas.offsetHeight || canvas.style.height.replace('px','') * 1 || 600;
    return { x: nx * W, y: ny * H };
}

// ---- Draw everything on the interactive canvas ----
function render() {
    if (!ctx) return;
    const W = canvas.offsetWidth  || parseInt(canvas.style.width)  || canvas.width;
    const H = canvas.offsetHeight || parseInt(canvas.style.height) || canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Callout labels
    if (stratState.showCallouts && stratState.map?.callouts) {
        ctx.save();
        ctx.font = 'bold 11px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        stratState.map.callouts.forEach(c => {
            const pos = calloutToCanvas(c, stratState.map);
            if (!pos) return;
            const label = `${c.superRegionName} ${c.regionName}`;
            const metrics = ctx.measureText(label);
            const w = metrics.width + 8;
            const h = 16;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            roundRect(ctx, pos.x - w/2, pos.y - h/2, w, h, 3);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 200, 70, 0.9)';
            ctx.fillText(label, pos.x, pos.y + 4);
        });
        ctx.restore();
    }

    // Finished strokes
    stratState.strokes.forEach(s => drawStroke(ctx, s));

    // Current stroke in progress
    if (stratState.currentStroke) drawStroke(ctx, stratState.currentStroke);

    // Text labels
    stratState.labels.forEach((lbl, i) => {
        ctx.save();
        ctx.font = 'bold 14px "Outfit", sans-serif';
        ctx.textAlign  = 'left';
        ctx.fillStyle  = lbl.color || '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur  = 4;
        ctx.fillText(lbl.text, lbl.x, lbl.y);
        ctx.restore();
    });

    // Agent tokens
    stratState.tokens.forEach(t => {
        if (!t.placed) return;
        drawToken(ctx, t);
    });
}

function drawStroke(c, s) {
    if (!s.points || s.points.length < 2) return;
    c.save();
    c.strokeStyle = s.color;
    c.lineWidth   = s.width;
    c.lineCap     = 'round';
    c.lineJoin    = 'round';
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur  = 3;

    if (s.type === 'arrow') {
        const p0 = s.points[0];
        const p1 = s.points[s.points.length - 1];
        // Line
        c.beginPath();
        c.moveTo(p0.x, p0.y);
        c.lineTo(p1.x, p1.y);
        c.stroke();
        // Arrow head
        const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        c.fillStyle = s.color;
        c.beginPath();
        c.moveTo(p1.x, p1.y);
        c.lineTo(p1.x - ARROW_HEAD * Math.cos(angle - Math.PI / 7),
                 p1.y - ARROW_HEAD * Math.sin(angle - Math.PI / 7));
        c.lineTo(p1.x - ARROW_HEAD * Math.cos(angle + Math.PI / 7),
                 p1.y - ARROW_HEAD * Math.sin(angle + Math.PI / 7));
        c.closePath();
        c.fill();
    } else if (s.type === 'pen') {
        c.beginPath();
        c.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
            c.lineTo(s.points[i].x, s.points[i].y);
        }
        c.stroke();
    }

    c.restore();
}

function drawToken(c, t) {
    const r = TOKEN_RADIUS;
    c.save();

    // Drop shadow
    c.shadowColor = 'rgba(0,0,0,0.7)';
    c.shadowBlur  = 8;

    // Ring colour
    const ring = stratState.side === 'attack' ? '#ff4655' : '#6ab0ff';
    c.beginPath();
    c.arc(t.x, t.y, r + 3, 0, Math.PI * 2);
    c.fillStyle = ring;
    c.fill();

    // Draw agent icon inside clipped circle
    c.beginPath();
    c.arc(t.x, t.y, r, 0, Math.PI * 2);
    c.clip();

    if (t._img && t._img.complete) {
        c.drawImage(t._img, t.x - r, t.y - r, r * 2, r * 2);
    } else {
        c.fillStyle = 'rgba(30,40,55,1)';
        c.fill();
        c.fillStyle = '#fff';
        c.font = 'bold 12px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(t.displayName?.[0] ?? '?', t.x, t.y);
    }

    c.restore();
}

function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
}

// ---- Map rendering (background canvas) ----
function renderBackground() {
    if (!bgCtx || !bgCanvas) return;
    // Work in CSS-pixel space (ctx is scaled by dpr via setTransform)
    const W = bgCanvas.offsetWidth  || parseInt(bgCanvas.style.width)  || bgCanvas.width;
    const H = bgCanvas.offsetHeight || parseInt(bgCanvas.style.height) || bgCanvas.height;

    bgCtx.clearRect(0, 0, W, H);

    // Dark fill
    bgCtx.fillStyle = '#080c10';
    bgCtx.fillRect(0, 0, W, H);

    if (mapImg && mapImg.complete && mapImg.naturalWidth > 0) {
        bgCtx.globalAlpha = 0.88;
        bgCtx.drawImage(mapImg, 0, 0, W, H);
        bgCtx.globalAlpha = 1;

        // Side-tint overlay
        bgCtx.fillStyle = stratState.side === 'attack'
            ? 'rgba(255, 70, 85, 0.07)'
            : 'rgba(100, 150, 255, 0.07)';
        bgCtx.fillRect(0, 0, W, H);
    } else {
        // Placeholder grid
        bgCtx.strokeStyle = 'rgba(255,255,255,0.05)';
        bgCtx.lineWidth = 1;
        for (let x = 0; x < W; x += 50) {
            bgCtx.beginPath(); bgCtx.moveTo(x, 0); bgCtx.lineTo(x, H); bgCtx.stroke();
        }
        for (let y = 0; y < H; y += 50) {
            bgCtx.beginPath(); bgCtx.moveTo(0, y); bgCtx.lineTo(W, y); bgCtx.stroke();
        }
        bgCtx.fillStyle = 'rgba(255,255,255,0.15)';
        bgCtx.font = 'bold 20px "Oswald", sans-serif';
        bgCtx.textAlign = 'center';
        bgCtx.fillText('Select a map to begin', W / 2, H / 2);
    }
}

// ---- Resize canvas to fill its CSS container (no distortion) ----
function resizeCanvases() {
    const wrapper = document.querySelector('.canvas-wrapper');
    if (!wrapper || !canvas || !bgCanvas) return;

    const W = wrapper.clientWidth;
    const H = wrapper.clientHeight;
    if (W === 0 || H === 0) return;

    // Scale for high-DPI screens (retina etc.)
    const dpr = window.devicePixelRatio || 1;

    // Internal buffer = actual CSS size × dpr → crisp on retina, no stretch
    bgCanvas.width  = Math.round(W * dpr);
    bgCanvas.height = Math.round(H * dpr);
    canvas.width    = Math.round(W * dpr);
    canvas.height   = Math.round(H * dpr);

    // CSS size stays at the layout size
    bgCanvas.style.width  = `${W}px`;
    bgCanvas.style.height = `${H}px`;
    canvas.style.width    = `${W}px`;
    canvas.style.height   = `${H}px`;

    // Scale the drawing context so all coordinates stay in CSS-pixel space
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    renderBackground();
    render();
}

// ---- Load map image ----
function loadMapImage(map) {
    stratState.map = map;
    stratState.callouts = map.callouts || [];

    const url = map.displayIcon;
    if (!url) { mapImg = null; renderBackground(); render(); return; }

    mapImg = new Image();
    mapImg.crossOrigin = 'anonymous';
    mapImg.onload  = () => { renderBackground(); render(); };
    mapImg.onerror = () => { mapImg = null; renderBackground(); };
    mapImg.src = url;
}

// ---- Populate agent tray ----
function buildAgentTray() {
    const tray = document.getElementById('agent-tray');
    if (!tray) return;
    tray.innerHTML = '<span class="agent-tray-label">Drag to map</span>';

    stratState.tokens.forEach((t, i) => {
        const div = document.createElement('div');
        div.className = 'tray-agent-token' + (t.placed ? ' placed' : '');
        div.title = t.displayName;
        div.dataset.index = i;

        const img = new Image();
        img.src = t.displayIcon;
        img.alt = t.displayName;
        div.appendChild(img);

        // Drag from tray onto canvas via mouse
        div.addEventListener('mousedown', (e) => {
            if (t.placed) return;
            e.preventDefault();
            startTrayDrag(i, e);
        });

        tray.appendChild(div);
    });
}

// Ghost element for tray drag
let trayGhost = null;
let trayDragIndex = -1;

function startTrayDrag(index, e) {
    trayDragIndex = index;
    trayGhost = document.createElement('div');
    trayGhost.style.cssText = `
        position:fixed; width:48px; height:48px; border-radius:50%;
        overflow:hidden; border:2px solid #ff4655; pointer-events:none;
        z-index:9999; opacity:0.85; transform:translate(-50%,-50%);
    `;
    const img = document.createElement('img');
    img.src = stratState.tokens[index].displayIcon;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    trayGhost.appendChild(img);
    document.body.appendChild(trayGhost);
    moveTrayGhost(e);

    document.addEventListener('mousemove', onTrayGhostMove);
    document.addEventListener('mouseup', onTrayGhostDrop);
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

    // Check if drop is over canvas
    const rect = canvasRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom) {
        trayDragIndex = -1;
        return;
    }

    const cx = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);

    placeToken(trayDragIndex, cx, cy);
    trayDragIndex = -1;
}

function placeToken(index, cx, cy) {
    const t = stratState.tokens[index];
    if (!t) return;
    t.x = cx;
    t.y = cy;
    t.placed = true;
    buildAgentTray();
    pushHistory();
    render();
}

// ---- Hit-test token at canvas coord ----
function tokenAtPoint(cx, cy) {
    for (let i = stratState.tokens.length - 1; i >= 0; i--) {
        const t = stratState.tokens[i];
        if (!t.placed) continue;
        const dx = cx - t.x, dy = cy - t.y;
        if (Math.sqrt(dx*dx + dy*dy) <= TOKEN_RADIUS + 4) return i;
    }
    return -1;
}

// ---- Hit-test label ----
function labelAtPoint(cx, cy) {
    ctx.save();
    ctx.font = 'bold 14px "Outfit", sans-serif';
    for (let i = stratState.labels.length - 1; i >= 0; i--) {
        const l = stratState.labels[i];
        const w = ctx.measureText(l.text).width;
        if (cx >= l.x && cx <= l.x + w && cy <= l.y && cy >= l.y - 14) {
            ctx.restore();
            return i;
        }
    }
    ctx.restore();
    return -1;
}

// ---- Canvas input handlers ----
function onPointerDown(e) {
    if (!stratState.map) return;
    e.preventDefault();
    const pt = eventToCanvas(e);

    // Right-click: remove token under cursor
    if (e.button === 2) {
        const ti = tokenAtPoint(pt.x, pt.y);
        if (ti >= 0) {
            stratState.tokens[ti].placed = false;
            stratState.tokens[ti].x = 0;
            stratState.tokens[ti].y = 0;
            buildAgentTray();
            pushHistory();
            render();
        }
        return;
    }

    const tool = stratState.tool;

    // Select tool — drag token or label
    if (tool === 'select' || tool === 'arrow') {
        const ti = tokenAtPoint(pt.x, pt.y);
        if (ti >= 0) {
            stratState.activeDrag = { type: 'token', index: ti,
                offX: pt.x - stratState.tokens[ti].x,
                offY: pt.y - stratState.tokens[ti].y };
            canvas.style.cursor = 'grabbing';
            return;
        }
        if (tool === 'select') {
            const li = labelAtPoint(pt.x, pt.y);
            if (li >= 0) {
                stratState.activeDrag = { type: 'label', index: li,
                    offX: pt.x - stratState.labels[li].x,
                    offY: pt.y - stratState.labels[li].y };
                return;
            }
        }
    }

    // Label tool — prompt for text
    if (tool === 'label') {
        const text = prompt('Enter callout label:');
        if (text && text.trim()) {
            stratState.labels.push({ text: text.trim(), x: pt.x, y: pt.y, color: stratState.color });
            pushHistory();
            render();
        }
        return;
    }

    // Eraser — check token or label or stroke
    if (tool === 'eraser') {
        const ti = tokenAtPoint(pt.x, pt.y);
        if (ti >= 0) {
            stratState.tokens[ti].placed = false;
            buildAgentTray();
            pushHistory(); render(); return;
        }
        const li = labelAtPoint(pt.x, pt.y);
        if (li >= 0) {
            stratState.labels.splice(li, 1);
            pushHistory(); render(); return;
        }
        // Remove nearest stroke end-point
        let best = -1, bestDist = 30;
        stratState.strokes.forEach((s, i) => {
            s.points.forEach(p => {
                const d = Math.hypot(pt.x - p.x, pt.y - p.y);
                if (d < bestDist) { bestDist = d; best = i; }
            });
        });
        if (best >= 0) {
            stratState.strokes.splice(best, 1);
            pushHistory(); render();
        }
        return;
    }

    // Drawing tools (arrow / pen)
    if (tool === 'arrow' && stratState.activeDrag) return;  // dragging token
    stratState.drawing = true;
    stratState.currentStroke = {
        type:   tool === 'pen' ? 'pen' : 'arrow',
        color:  stratState.color,
        width:  stratState.lineWidth,
        points: [pt],
    };
}

function onPointerMove(e) {
    if (!stratState.map) return;
    e.preventDefault();
    const pt = eventToCanvas(e);

    // Dragging token or label
    if (stratState.activeDrag) {
        const d = stratState.activeDrag;
        if (d.type === 'token') {
            const t = stratState.tokens[d.index];
            t.x = pt.x - d.offX;
            t.y = pt.y - d.offY;
        } else {
            const l = stratState.labels[d.index];
            l.x = pt.x - d.offX;
            l.y = pt.y - d.offY;
        }
        render();
        return;
    }

    if (!stratState.drawing || !stratState.currentStroke) return;
    stratState.currentStroke.points.push(pt);
    render();
}

function onPointerUp(e) {
    if (stratState.activeDrag) {
        if (stratState.activeDrag.type === 'token') canvas.style.cursor = '';
        stratState.activeDrag = null;
        pushHistory();
        render();
        return;
    }

    if (stratState.drawing && stratState.currentStroke) {
        const s = stratState.currentStroke;
        if (s.points.length >= 2) {
            stratState.strokes.push(s);
            pushHistory();
        }
        stratState.currentStroke = null;
        stratState.drawing = false;
        render();
    }
}

// ---- History / undo ----
function pushHistory() {
    stratState.history.push({
        strokes:  JSON.parse(JSON.stringify(stratState.strokes)),
        labels:   JSON.parse(JSON.stringify(stratState.labels)),
        tokens:   stratState.tokens.map(t => ({ ...t })),
    });
    if (stratState.history.length > 50) stratState.history.shift();
}

function undo() {
    if (stratState.history.length <= 1) return;
    stratState.history.pop(); // remove current
    const prev = stratState.history[stratState.history.length - 1];
    if (!prev) return;
    stratState.strokes = JSON.parse(JSON.stringify(prev.strokes));
    stratState.labels  = JSON.parse(JSON.stringify(prev.labels));
    stratState.tokens  = prev.tokens.map(t => ({ ...t }));
    // Re-attach image refs
    stratState.tokens.forEach(t => {
        const orig = (window.state?.agents || []).find(a => a.uuid === t.uuid);
        if (orig) {
            if (!t._img) { t._img = new Image(); t._img.src = t.displayIcon; }
        }
    });
    buildAgentTray();
    render();
}

function clearBoard() {
    if (!confirm('Clear all drawings and tokens?')) return;
    stratState.strokes = [];
    stratState.labels  = [];
    stratState.tokens.forEach(t => { t.placed = false; t.x = 0; t.y = 0; });
    stratState.history = [];
    buildAgentTray();
    render();
}

// ---- Save / Load (Firestore) ----
async function saveStrat() {
    if (!window.state?.user) { showToast?.('Please log in to save strats', 'warning'); return; }
    if (!stratState.map) { showToast?.('Select a map first', 'warning'); return; }

    const { getFirestore, collection, addDoc, doc, updateDoc, serverTimestamp } = window.firebaseModules;
    const db = getFirestore(window.firebaseApp);

    const payload = {
        userId:  window.state.user.uid,
        name:    stratState.name,
        mapId:   stratState.map.uuid,
        side:    stratState.side,
        tokens:  stratState.tokens.filter(t => t.placed).map(t => ({ uuid: t.uuid, x: t.x, y: t.y })),
        strokes: stratState.strokes,
        labels:  stratState.labels,
        date:    Date.now(),
    };

    try {
        if (stratState.currentDocId) {
            await updateDoc(doc(db, 'stratboards', stratState.currentDocId), payload);
        } else {
            const ref = await addDoc(collection(db, 'stratboards'), payload);
            stratState.currentDocId = ref.id;
        }
        showToast?.('Strat saved!', 'success');
        loadSavedStrats();
    } catch (err) {
        console.error('Save strat error', err);
        showToast?.('Save failed — check Firestore rules', 'error');
    }
}

async function loadSavedStrats() {
    if (!window.state?.user) return;
    const { getFirestore, collection, getDocs, query, where, orderBy } = window.firebaseModules;
    const db = getFirestore(window.firebaseApp);
    try {
        const q = query(
            collection(db, 'stratboards'),
            where('userId', '==', window.state.user.uid),
            orderBy('date', 'desc')
        );
        const snap = await getDocs(q);
        stratState.savedStrats = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
        renderSavedStratsPanel();
    } catch (e) {
        console.warn('Could not load strats:', e);
    }
}

function renderSavedStratsPanel() {
    const panel = document.getElementById('saved-strats-panel');
    if (!panel) return;

    if (stratState.savedStrats.length === 0) {
        panel.innerHTML = '<p style="color:var(--text-secondary);font-size:0.82rem;text-align:center;padding:0.5rem;">No saved strats yet</p>';
        return;
    }

    panel.innerHTML = '';
    stratState.savedStrats.forEach(strat => {
        const mapName = stratState.maps.find(m => m.uuid === strat.mapId)?.displayName || 'Map';
        const row = document.createElement('div');
        row.className = 'saved-strat-item';
        row.innerHTML = `
            <div class="saved-strat-item-name">${strat.name || 'Untitled'}</div>
            <div class="saved-strat-item-meta">${mapName}</div>
            <button class="saved-strat-delete" title="Delete">&times;</button>
        `;
        row.querySelector('.saved-strat-delete').onclick = async (e) => {
            e.stopPropagation();
            await deleteStrat(strat.docId);
        };
        row.onclick = () => { loadStratFromSaved(strat); toggleSavedPanel(false); };
        panel.appendChild(row);
    });
}

async function deleteStrat(docId) {
    const { getFirestore, doc, deleteDoc } = window.firebaseModules;
    const db = getFirestore(window.firebaseApp);
    try {
        await deleteDoc(doc(db, 'stratboards', docId));
        await loadSavedStrats();
    } catch (e) {
        showToast?.('Delete failed', 'error');
    }
}

function loadStratFromSaved(strat) {
    // Set map
    const map = stratState.maps.find(m => m.uuid === strat.mapId);
    if (map) {
        document.getElementById('strat-map-select').value = strat.mapId;
        setMap(map);
    }

    // Side
    stratState.side = strat.side || 'attack';
    updateSideUI();

    // Name
    stratState.name = strat.name || 'Untitled Strat';
    const ni = document.getElementById('strat-name-input');
    if (ni) ni.value = stratState.name;

    // Tokens — place at saved positions
    strat.tokens?.forEach(saved => {
        const idx = stratState.tokens.findIndex(t => t.uuid === saved.uuid);
        if (idx >= 0) {
            stratState.tokens[idx].placed = true;
            stratState.tokens[idx].x = saved.x;
            stratState.tokens[idx].y = saved.y;
        }
    });

    stratState.strokes = strat.strokes || [];
    stratState.labels  = strat.labels  || [];
    stratState.currentDocId = strat.docId;

    pushHistory();
    buildAgentTray();
    render();
}

function toggleSavedPanel(force) {
    const panel = document.getElementById('saved-strats-panel');
    if (!panel) return;
    const visible = force !== undefined ? force : !stratState.showSavedPanel;
    stratState.showSavedPanel = visible;
    panel.classList.toggle('visible', visible);
    if (visible) loadSavedStrats();
}

// ---- Export PNG ----
function exportPNG() {
    // Merge bg + interactive canvas
    const out = document.createElement('canvas');
    out.width  = canvas.width;
    out.height = canvas.height;
    const oc = out.getContext('2d');
    oc.drawImage(bgCanvas, 0, 0);
    oc.drawImage(canvas, 0, 0);

    const link = document.createElement('a');
    link.href     = out.toDataURL('image/png');
    link.download = `${stratState.name.replace(/\s+/g, '_')}_${stratState.map?.displayName || 'strat'}.png`;
    link.click();
}

// ---- Side selector ----
function updateSideUI() {
    const atk = document.getElementById('side-attack-btn');
    const def = document.getElementById('side-defence-btn');
    if (!atk || !def) return;
    atk.className = 'side-btn' + (stratState.side === 'attack'  ? ' active-attack'  : '');
    def.className = 'side-btn' + (stratState.side === 'defence' ? ' active-defence' : '');
    renderBackground(); render();
}

// ---- Map selector ----
function setMap(map) {
    stratState.map = map;
    loadMapImage(map);
    render();
}

function populateMapSelector(maps) {
    const sel = document.getElementById('strat-map-select');
    if (!sel) return;
    // Filter to competitive maps only (have displayIcon + xMultiplier > 0)
    const competitive = maps.filter(m => m.displayIcon && m.xMultiplier);
    sel.innerHTML = '<option value="">— Select Map —</option>';
    competitive.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.uuid;
        opt.textContent = m.displayName;
        sel.appendChild(opt);
    });
    stratState.maps = maps;
}

// ---- Tool selector ----
function setTool(tool) {
    stratState.tool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`tool-${tool}`);
    if (btn) btn.classList.add('active');

    // Update cursor
    canvas.className = '';
    if (tool === 'select') canvas.classList.add('tool-select');
    else if (tool === 'pen') canvas.classList.add('tool-pen');
    else if (tool === 'eraser') canvas.classList.add('tool-eraser');
    else if (tool === 'label') canvas.classList.add('tool-label');
    else canvas.classList.add('tool-arrow');
}

// ---- Pre-populate from comp ----
function populateFromComp(agents) {
    // agents: array of agent UUIDs from comp
    const allAgents = window.state?.agents || [];
    stratState.tokens = agents.slice(0, 5).map((uuid, i) => {
        const agent = allAgents.find(a => a.uuid === uuid);
        if (!agent) return null;
        const img = new Image();
        img.src = agent.displayIcon;
        // Place tokens in a row near bottom centre
        return {
            uuid:        agent.uuid,
            displayIcon: agent.displayIcon,
            displayName: agent.displayName,
            placed:      false,
            x: 0, y: 0,
            _img: img,
        };
    }).filter(Boolean);
    buildAgentTray();
}

function populateAllAgents() {
    const allAgents = window.state?.agents || [];
    stratState.tokens = allAgents.map(agent => {
        const img = new Image();
        img.src = agent.displayIcon;
        return {
            uuid:        agent.uuid,
            displayIcon: agent.displayIcon,
            displayName: agent.displayName,
            placed:      false,
            x: 0, y: 0,
            _img: img,
        };
    });
    buildAgentTray();
}

// ---- Colour & line width UI ----
function buildColorSwatches() {
    const container = document.getElementById('strat-colors');
    if (!container) return;
    container.innerHTML = '';
    STROKE_COLORS.forEach(c => {
        const sw = document.createElement('button');
        sw.className  = 'color-swatch' + (c === stratState.color ? ' active' : '');
        sw.style.background = c;
        sw.title = c;
        sw.onclick = () => {
            stratState.color = c;
            container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
        };
        container.appendChild(sw);
    });
}

function buildLineWidths() {
    const container = document.getElementById('strat-widths');
    if (!container) return;
    container.innerHTML = '';
    STROKE_WIDTHS.forEach((w, i) => {
        const btn = document.createElement('button');
        btn.className  = 'tool-btn line-width-btn' + (i === 0 ? ' active' : '');
        btn.title = `Width ${w}`;
        const dot = document.createElement('span');
        dot.style.width  = `${w + 4}px`;
        dot.style.height = `${w + 4}px`;
        btn.appendChild(dot);
        btn.onclick = () => {
            stratState.lineWidth = w;
            container.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
        container.appendChild(btn);
    });
}

// ---- Init ----
async function initStratBoard() {
    // Grab canvas refs
    bgCanvas = document.getElementById('strat-canvas-bg');
    canvas   = document.getElementById('strat-canvas');
    if (!bgCanvas || !canvas) return;

    bgCtx = bgCanvas.getContext('2d');
    ctx   = canvas.getContext('2d');

    // Initial resize
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);

    // Populate map selector from cached maps
    const maps = window.state?.maps || [];
    populateMapSelector(maps);

    // If no cached maps, fetch
    if (!maps.length) {
        try {
            const res  = await fetch('https://valorant-api.com/v1/maps');
            const data = await res.json();
            const allMaps = data.data || [];
            if (window.state) window.state.maps = allMaps;
            populateMapSelector(allMaps);
        } catch (e) { console.warn('Map fetch failed', e); }
    }

    // Build UI controls
    buildColorSwatches();
    buildLineWidths();
    setTool('arrow'); // default tool

    // All agents in tray (standalone mode)
    populateAllAgents();

    // Map selector listener
    const mapSel = document.getElementById('strat-map-select');
    if (mapSel) {
        mapSel.onchange = () => {
            const m = stratState.maps.find(x => x.uuid === mapSel.value);
            if (m) setMap(m);
        };
    }

    // Side buttons
    document.getElementById('side-attack-btn')?.addEventListener('click', () => {
        stratState.side = 'attack'; updateSideUI();
    });
    document.getElementById('side-defence-btn')?.addEventListener('click', () => {
        stratState.side = 'defence'; updateSideUI();
    });

    // Tool buttons
    ['arrow', 'pen', 'eraser', 'label', 'select'].forEach(t => {
        document.getElementById(`tool-${t}`)?.addEventListener('click', () => setTool(t));
    });

    // Callout toggle
    document.getElementById('callout-toggle-btn')?.addEventListener('click', function() {
        stratState.showCallouts = !stratState.showCallouts;
        this.classList.toggle('active', stratState.showCallouts);
        render();
    });

    // Undo / Clear
    document.getElementById('strat-undo-btn')?.addEventListener('click', undo);
    document.getElementById('strat-clear-btn')?.addEventListener('click', clearBoard);

    // Save / Export
    document.getElementById('strat-save-btn')?.addEventListener('click', saveStrat);
    document.getElementById('strat-export-btn')?.addEventListener('click', exportPNG);

    // Load saved strats toggle
    document.getElementById('strat-load-btn')?.addEventListener('click', () => toggleSavedPanel());

    // Strat name input
    document.getElementById('strat-name-input')?.addEventListener('input', function() {
        stratState.name = this.value;
    });

    // Canvas mouse events
    canvas.addEventListener('mousedown',  onPointerDown);
    canvas.addEventListener('mousemove',  onPointerMove);
    canvas.addEventListener('mouseup',    onPointerUp);
    canvas.addEventListener('mouseleave', onPointerUp);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Touch events
    canvas.addEventListener('touchstart',  e => { e.preventDefault(); onPointerDown(e); }, { passive: false });
    canvas.addEventListener('touchmove',   e => { e.preventDefault(); onPointerMove(e); }, { passive: false });
    canvas.addEventListener('touchend',    e => { e.preventDefault(); onPointerUp(e);   }, { passive: false });

    // Initial history point
    pushHistory();
    renderBackground();
    render();
}

// ---- Public: open strat board pre-populated from a comp ----
function openStratBoard(comp) {
    // Switch view
    if (window.switchView) window.switchView('stratboard');

    // Re-init if needed
    if (!canvas) {
        initStratBoard().then(() => {
            _loadComp(comp);
        });
    } else {
        _loadComp(comp);
    }
}

function _loadComp(comp) {
    // Reset board
    stratState.strokes = [];
    stratState.labels  = [];
    stratState.currentDocId = null;
    stratState.name = comp.name ? `${comp.name} Strat` : 'Untitled Strat';
    const ni = document.getElementById('strat-name-input');
    if (ni) ni.value = stratState.name;

    // Set map
    const map = stratState.maps.find(m => m.uuid === comp.mapId);
    if (map) {
        const sel = document.getElementById('strat-map-select');
        if (sel) sel.value = map.uuid;
        setMap(map);
    }

    // Populate tokens from comp agents
    const allAgents = window.state?.agents || [];
    stratState.tokens = (comp.agents || []).slice(0, 5).map(uuid => {
        const a = allAgents.find(x => x.uuid === uuid);
        if (!a) return null;
        const img = new Image();
        img.src = a.displayIcon;
        return { uuid: a.uuid, displayIcon: a.displayIcon, displayName: a.displayName,
                 placed: false, x: 0, y: 0, _img: img };
    }).filter(Boolean);

    pushHistory();
    buildAgentTray();
    render();

    showToast?.(`Loaded "${comp.name}" — drag agents onto the map`, 'success');
}

// ---- Expose ----
window.initStratBoard  = initStratBoard;
window.openStratBoard  = openStratBoard;
