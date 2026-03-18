import firebaseConfig from './firebase-config.js';

const API_BASE = 'https://valorant-api.com/v1';

// Initialize Firebase (from global window object injected in index.html)
const { initializeApp, getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
        getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, updateDoc } 
        = window.firebaseModules;

let app, auth, db;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase Init Error: Check firebase-config.js", e);
}

// State
const state = {
    maps: [],
    agents: [],
    currentMap: null,
    currentComp: [null, null, null, null, null],     // Primary picks
    secondaryComp: [null, null, null, null, null],   // Secondary (alt) picks
    activeSecondarySlot: null, // index of secondary slot being targeted, or null
    savedComps: [],
    filterRole: 'Duelist',
    user: null
};

// Agent Costs Data
const agentCosts = {
    "Brimstone": { credits: 650, orbs: 8 },
    "Viper": { credits: 500, orbs: 9 },
    "Omen": { credits: 600, orbs: 7 },
    "Killjoy": { credits: 600, orbs: 9 },
    "Cypher": { credits: 500, orbs: 7 },
    "Sova": { credits: 700, orbs: 8 },
    "Sage": { credits: 700, orbs: 7 },
    "Phoenix": { credits: 600, orbs: 6 },
    "Jett": { credits: 550, orbs: 8 },
    "Reyna": { credits: 700, orbs: 7 },
    "Raze": { credits: 700, orbs: 8 },
    "Breach": { credits: 700, orbs: 8 },
    "Skye": { credits: 700, orbs: 8 },
    "Yoru": { credits: 850, orbs: 8 },
    "Astra": { credits: 600, orbs: 7 },
    "KAY/O": { credits: 700, orbs: 8 },
    "Chamber": { credits: 1000, orbs: 8 },
    "Neon": { credits: 500, orbs: 8 },
    "Fade": { credits: 700, orbs: 8 },
    "Harbor": { credits: 500, orbs: 7 },
    "Gekko": { credits: 550, orbs: 8 },
    "Deadlock": { credits: 700, orbs: 7 },
    "Iso": { credits: 500, orbs: 7 },
    "Clove": { credits: 600, orbs: 8 },
    "Vyse": { credits: 500, orbs: 8 },
    "Tejo": { credits: 750, orbs: 9 },
    "Waylay": { credits: 600, orbs: 8 },
    "Veto": { credits: 600, orbs: 7 }
};

// Agent Attributes System
const agentAttributes = {
    // Controllers
    "Brimstone": ["Smoke", "Molly", "Stun"],
    "Viper": ["Smoke", "Wall", "Molly", "Debuff"],
    "Omen": ["Smoke", "Flash", "Teleport"],
    "Astra": ["Smoke", "Stun", "Slow", "Suppress"],
    "Harbor": ["Smoke", "Wall", "Slow", "Stun"],
    "Clove": ["Smoke", "Slow", "Revive"],
    
    // Sentinels
    "Killjoy": ["Trap", "Damage", "Debuff", "Suppress"],
    "Cypher": ["Trap", "Recon", "Slow"],
    "Sage": ["Wall", "Slow", "Heal", "Revive"],
    "Chamber": ["Trap", "Teleport", "Slow"],
    "Deadlock": ["Trap", "Wall", "Stun"],
    "Vyse": ["Flash", "Wall", "Slow", "Damage", "Suppress"],
    
    // Initiators
    "Sova": ["Recon", "Damage"],
    "Breach": ["Flash", "Stun", "Damage"],
    "Skye": ["Flash", "Heal", "Recon"],
    "KAY/O": ["Flash", "Molly", "Suppress", "Revive"],
    "Fade": ["Recon", "Slow", "Debuff"],
    "Gekko": ["Flash", "Stun", "Recon"],
    "Tejo": ["Flash", "Damage", "Stun"],
    "Waylay": ["Trap", "Slow", "Recon"],
    
    // Duelists
    "Phoenix": ["Flash", "Molly", "Wall", "Heal", "Revive"],
    "Jett": ["Smoke", "Mobility"],
    "Reyna": ["Flash", "Heal", "Mobility"],
    "Raze": ["Damage", "Mobility"],
    "Yoru": ["Flash", "Teleport", "Recon", "Debuff"],
    "Neon": ["Wall", "Stun", "Mobility"],
    "Iso": ["Wall", "Debuff", "Suppress"],
    "Veto": ["Flash", "Damage", "Mobility"]
};

// Expose state globally for mapban.js
window.state = state;

// Toast notification system
function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✓',
        error: '✗',
        info: 'ℹ',
        warning: '⚠'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.success}</span>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
window.showToast = showToast;

// DOM Elements
const els = {
    app: document.getElementById('app'),
    loading: document.getElementById('loading'),
    mapsGrid: document.getElementById('maps-grid'),
    compBuilder: document.getElementById('comp-builder'),
    savedCompsView: document.getElementById('saved-comps-view'),
    
    // Navbar
    viewMapsBtn: document.getElementById('view-maps-btn'),
    viewSavedBtn: document.getElementById('view-saved-btn'),
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    userDisplay: document.getElementById('user-display'),

    // Builder
    backToMapsBtn: document.getElementById('back-to-maps'),
    saveCompBtn: document.getElementById('save-comp-btn'),
    currentMapName: document.getElementById('current-map-name'),
    mapImage: document.getElementById('map-image'),
    agentSlots: document.querySelectorAll('.agent-slot'),
    agentsGrid: document.getElementById('agents-grid'),
    roleFilters: document.querySelectorAll('.role-filter'),
    compNameInput: document.getElementById('comp-name-input'),
    stratNotesInput: document.getElementById('strat-notes-input'),
    totalCredits: document.getElementById('total-credits'),
    totalOrbs: document.getElementById('total-orbs'),
    attributesList: document.getElementById('attributes-list'),
    
    // Saved List
    savedCompsList: document.getElementById('saved-comps-list'),

    // Strat Board
    stratboardView: document.getElementById('stratboard-view')
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await Promise.all([fetchMaps(), fetchAgents()]);
        renderMaps();
        els.loading.classList.add('hidden');
        
        // Show home screen first
        switchView('home');

        // Auto-load shared comp if URL contains ?comp=VLR-XXXX
        const urlParams = new URLSearchParams(window.location.search);
        const compCode = urlParams.get('comp');
        if (compCode && window.loadSharedComp) {
            // Small delay so agents/maps are available for the preview render
            setTimeout(() => window.loadSharedComp(compCode), 300);
        }

        // Initialize roster after agents are loaded
        if (window.initRoster) {
            window.initRoster();
        }
        
        // Add feature card navigation
        document.getElementById('feature-maps')?.addEventListener('click', () => {
            switchView('maps');
        });
        
        document.getElementById('feature-mapban')?.addEventListener('click', () => {
            switchView('mapban');
        });
        
        document.getElementById('feature-roster')?.addEventListener('click', () => {
            switchView('roster');
        });

        document.getElementById('feature-stratboard')?.addEventListener('click', () => {
            switchView('stratboard');
        });
        
    } catch (err) {
        console.error('Failed to load assets', err);
        els.loading.innerHTML = '<p>Error loading data. Please refresh.</p>';
    }


    setupEventListeners();
    setupAuthListener();
    setupDropdown();
    
    // Initialize Map Ban system
    if (typeof initMapBan === 'function') {
        initMapBan();
    }
});

// Dropdown menu functionality
function setupDropdown() {
    const dropdownBtn = document.getElementById('strat-tools-btn');
    const dropdownMenu = document.getElementById('strat-tools-menu');
    
    if (!dropdownBtn || !dropdownMenu) return;
    
    // Toggle dropdown on button click
    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('show');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.nav-dropdown')) {
            dropdownMenu.classList.remove('show');
        }
    });
    
    // Handle dropdown item clicks
    const dropdownItems = dropdownMenu.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(item => {
        item.addEventListener('click', () => {
            dropdownMenu.classList.remove('show');
        });
    });
}


// Auth Logic
function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        state.user = user;
        if (user) {
            // Logged In
            els.loginBtn.classList.add('hidden');
            els.logoutBtn.classList.remove('hidden');
            els.userDisplay.classList.remove('hidden');
            els.userDisplay.textContent = `Hi, ${user.displayName.split(' ')[0]}`;
            console.log("User logged in:", user.uid);
            await loadCompsFromFirestore();
            // Init team sharing panel
            if (window.initTeamSharing) window.initTeamSharing();
        } else {
            // Logged Out
            els.loginBtn.classList.remove('hidden');
            els.logoutBtn.classList.add('hidden');
            els.userDisplay.classList.add('hidden');
            state.savedComps = []; // Clear data
            renderSavedComps();
            // Reset team panel
            if (window.renderTeamPanel) window.renderTeamPanel();
        }
    });
}

async function login() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Login Failed", error);
        alert("Login failed: " + error.message);
    }
}

async function logout() {
    try {
        await signOut(auth);
        alert("Logged out!");
        switchView('maps');
    } catch (error) {
        console.error("Logout Failed", error);
    }
}

// Data Fetching (API)
async function fetchMaps() {
    const res = await fetch(`${API_BASE}/maps`);
    const data = await res.json();
    // Filter out Non-Competitive maps (TDM, Range, Training)
    const excludedMaps = [
        'The Range', 'Basic Training', 'KAY/O', // Training/Test
        'District', 'Kasbah', 'Piazza', 'Drift', 'Glitch', // Team Deathmatch
        'Skirmish A', 'Skirmish B', 'Skirmish C' // Skirmish
    ];
    state.maps = data.data.filter(m => !excludedMaps.includes(m.displayName)); 
    state.maps.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function fetchAgents() {
    const res = await fetch(`${API_BASE}/agents?isPlayableCharacter=true`);
    const data = await res.json();
    state.agents = data.data;
    state.agents = state.agents.filter(a => a.role != null);
    state.agents.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Firestore Operations
async function saveCurrentComp() {
    if (!state.user) {
        showToast("Please login to save comps!", 'warning');
        return;
    }
    if (!state.currentMap) return;
    
    // Validate comp (optional: check if at least 1 agent selected?)
    const hasAgent = state.currentComp.some(a => a !== null);
    if(!hasAgent) {
        showToast("Please select at least one agent", 'warning');
        return;
    }

    const name = els.compNameInput.value.trim() || `${state.currentMap.displayName} Comp`;
    const notes = els.stratNotesInput.value;
    
    const newComp = {
        date: new Date().toISOString(),
        mapId: state.currentMap.uuid,
        name: name,
        notes: notes,
        agents: [...state.currentComp],
        secondaryAgents: [...state.secondaryComp]
    };
    
    try {
        els.saveCompBtn.innerText = "Saving...";
        els.saveCompBtn.disabled = true;
        
        // Check if a comp with this exact name already exists
        const existingComp = state.savedComps.find(c => c.name.toLowerCase() === name.toLowerCase());
        
        if (existingComp) {
            // Overwrite existing comp
            const compDocRef = doc(db, "users", state.user.uid, "comps", existingComp.docId);
            await updateDoc(compDocRef, newComp);
            showToast('Existing composition updated!', 'success');
        } else {
            // Save as new comp
            const userCompsRef = collection(db, "users", state.user.uid, "comps");
            await addDoc(userCompsRef, newComp);
            showToast('Composition saved to cloud!', 'success');
        }
        
        await loadCompsFromFirestore(); // Refresh list
    } catch (e) {
        console.error("Error saving doc: ", e);
        showToast("Error saving: " + e.message, 'error');
    } finally {
        els.saveCompBtn.innerText = "Save Comp";
        els.saveCompBtn.disabled = false;
    }
}

async function loadCompsFromFirestore() {
    if (!state.user) return;
    
    try {
        const userCompsRef = collection(db, "users", state.user.uid, "comps");
        const q = query(userCompsRef, orderBy("date", "desc"));
        const querySnapshot = await getDocs(q);
        
        state.savedComps = [];
        querySnapshot.forEach((doc) => {
            state.savedComps.push({
                docId: doc.id, // Firestore Doc ID
                ...doc.data()
            });
        });
        
        // If we are currently in 'saved' view, refresh it
        if (!els.savedCompsView.classList.contains('hidden')) {
            renderSavedComps();
        }
    } catch (e) {
        console.error("Error loading comps: ", e);
    }
}

async function deleteComp(docId) {
    if (!confirm('Are you sure you want to delete this comp permanently?')) return;
    
    try {
        await deleteDoc(doc(db, "users", state.user.uid, "comps", docId));
        // Remove from local state
        state.savedComps = state.savedComps.filter(c => c.docId !== docId);
        renderSavedComps();
    } catch (e) {
        console.error("Error deleting: ", e);
        alert("Failed to delete.");
    }
}

// Rendering & Actions
function renderMaps() {
    els.mapsGrid.innerHTML = '';
    state.maps.forEach(map => {
        const card = document.createElement('div');
        card.className = 'map-card';
        card.onclick = () => openBuilder(map);
        
        const img = document.createElement('img');
        img.src = map.splash; // Use high-quality splash image
        img.alt = map.displayName;
        
        const name = document.createElement('div');
        name.className = 'map-card-name';
        name.innerText = map.displayName;
        
        card.appendChild(img);
        card.appendChild(name);
        els.mapsGrid.appendChild(card);
    });
}

function renderAgentsPicker() {
    els.agentsGrid.innerHTML = '';
    const filtered = state.filterRole === 'all' 
        ? state.agents 
        : state.agents.filter(a => a.role && a.role.displayName === state.filterRole);
        
    filtered.forEach(agent => {
        const div = document.createElement('div');
        div.className = 'agent-card-picker';
        div.draggable = true;
        div.dataset.uuid = agent.uuid;
        div.title = agent.displayName;
        
        div.ondragstart = (e) => {
            e.dataTransfer.setData('text/plain', agent.uuid);
            e.dataTransfer.effectAllowed = 'copy';
        };
        
        div.onclick = () => addToFirstEmptySlot(agent.uuid);

        const img = document.createElement('img');
        img.src = agent.displayIcon;
        div.appendChild(img);
        
        const name = document.createElement('div');
        name.className = 'agent-card-name';
        name.innerText = agent.displayName;
        div.appendChild(name);
        
        els.agentsGrid.appendChild(div);
    });
}

function renderSlots() {
    els.agentSlots.forEach((slot, index) => {
        const agentUuid = state.currentComp[index];
        const secUuid  = state.secondaryComp[index];
        slot.innerHTML = '';
        slot.classList.remove('filled');
        slot.onclick = null;

        // ---- Secondary pick box (rendered INSIDE the slot wrapper, above) ----
        const secBox = document.createElement('div');
        secBox.className = 'secondary-slot';
        const isTargeted = state.activeSecondarySlot === index;
        if (isTargeted) secBox.classList.add('secondary-slot--active');

        if (secUuid) {
            const secAgent = state.agents.find(a => a.uuid === secUuid);
            if (secAgent) {
                const img = document.createElement('img');
                img.src = secAgent.displayIcon;
                img.className = 'secondary-slot-img';
                secBox.appendChild(img);
                secBox.title = `Alt: ${secAgent.displayName} — click to clear`;
                secBox.classList.add('secondary-slot--filled');
                secBox.onclick = (e) => {
                    e.stopPropagation();
                    // Clear secondary pick
                    state.secondaryComp[index] = null;
                    state.activeSecondarySlot = null;
                    renderSlots();
                };
            }
        } else {
            // Empty secondary — clicking targets this slot for next agent pick
            const plus = document.createElement('span');
            plus.textContent = '+';
            plus.className = 'secondary-slot-plus';
            secBox.appendChild(plus);
            secBox.title = 'Click to set alt pick for this player';
            secBox.onclick = (e) => {
                e.stopPropagation();
                // Toggle targeting: clicking again deselects
                if (state.activeSecondarySlot === index) {
                    state.activeSecondarySlot = null;
                } else {
                    state.activeSecondarySlot = index;
                }
                renderSlots(); // re-render to update highlight
            };
        }
        slot.appendChild(secBox);

        // ---- Primary agent slot ----
        const primaryBox = document.createElement('div');
        primaryBox.className = 'primary-slot';

        if (agentUuid) {
            const agent = state.agents.find(a => a.uuid === agentUuid);
            if (agent) {
                const img = document.createElement('img');
                img.src = agent.displayIcon;
                primaryBox.appendChild(img);
                slot.classList.add('filled');
                primaryBox.onclick = () => updateSlot(index, null);
            }
        }

        slot.appendChild(primaryBox);

        // Drag-and-drop onto the primary area
        slot.ondragover = (e) => { e.preventDefault(); slot.style.borderColor = 'var(--text-primary)'; };
        slot.ondragleave = () => { slot.style.borderColor = ''; };
        slot.ondrop = (e) => {
            e.preventDefault();
            slot.style.borderColor = '';
            const uuid = e.dataTransfer.getData('text/plain');
            if (uuid) updateSlot(index, uuid);
        };
    });
    updateCompStats();
    updateCompAttributes();
}

function updateCompStats() {
    if (!els.totalCredits || !els.totalOrbs) {
        console.error('Total credits/orbs DOM elements not found');
        return;
    }
    
    let credits = 0;
    let orbs = 0;
    
    console.log('Updating comp stats. Current comp:', state.currentComp);
    
    state.currentComp.forEach((uuid, index) => {
        if (!uuid) return;
        const agent = state.agents.find(a => a.uuid === uuid);
        if (agent) {
            console.log(`Slot ${index}: ${agent.displayName}`);
            const cost = agentCosts[agent.displayName];
            
            if (cost) {
                console.log(`  Credits: ${cost.credits}, Orbs: ${cost.orbs}`);
                credits += cost.credits;
                orbs += cost.orbs;
            } else {
                console.warn(`Cost data missing for: "${agent.displayName}"`);
            }
        }
    });
    
    console.log(`Total - Credits: ${credits}, Orbs: ${orbs}`);
    
    // Update DOM directly (no animation for debugging)
    els.totalCredits.textContent = credits;
    els.totalOrbs.textContent = orbs;
}

function updateCompAttributes() {
    if (!els.attributesList) return;
    
    const attributeCounts = {};
    
    state.currentComp.forEach(uuid => {
        if (!uuid) return;
        const agent = state.agents.find(a => a.uuid === uuid);
        if (agent) {
            const attributes = agentAttributes[agent.displayName];
            if (attributes) {
                attributes.forEach(attr => {
                    attributeCounts[attr] = (attributeCounts[attr] || 0) + 1;
                });
            }
        }
    });
    
    // Clear and rebuild attribute badges
    els.attributesList.innerHTML = '';
    
    if (Object.keys(attributeCounts).length === 0) {
        els.attributesList.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.75rem;">No agents selected</span>';
        return;
    }
    
    // Sort attributes by count (descending) then alphabetically
    const sortedAttributes = Object.entries(attributeCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    
    sortedAttributes.forEach(([attr, count]) => {
        const badge = document.createElement('div');
        badge.className = 'attribute-badge';
        badge.innerHTML = `${attr} <span class="count">${count}</span>`;
        els.attributesList.appendChild(badge);
    });
}

function animateValue(obj, start, end, duration) {
    if (start === end) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end;
        }
    };
    window.requestAnimationFrame(step);
}

function renderSavedComps() {
    els.savedCompsList.innerHTML = '';
    
    if (!state.user) {
        els.savedCompsList.innerHTML = '<p class="empty-msg">Please Login to view your saved comps.</p>';
        return;
    }

    if (state.savedComps.length === 0) {
        els.savedCompsList.innerHTML = '<p class="empty-msg">No saved comps yet. Go make some!</p>';
        return;
    }
    
    state.savedComps.forEach((comp) => {
        const div = document.createElement('div');
        div.className = 'saved-comp-card';
        
        const info = document.createElement('div');
        info.className = 'saved-comp-info';
        
        const mapName = state.maps.find(m => m.uuid === comp.mapId)?.displayName || 'Unknown Map';
        const dateStr = new Date(comp.date).toLocaleDateString();
        
        info.innerHTML = `<h4>${comp.name || 'Untitled Comp'}</h4><p>${mapName} • ${dateStr}</p>`;
        
        const slotsDiv = document.createElement('div');
        slotsDiv.className = 'saved-comp-slots';
        
        comp.agents.forEach(uuid => {
             const ag = state.agents.find(a => a.uuid === uuid);
             const mini = document.createElement('div');
             mini.className = 'mini-slot';
             if (ag) {
                 const img = document.createElement('img');
                 img.src = ag.displayIcon;
                 mini.appendChild(img);
             }
             slotsDiv.appendChild(mini);
        });
        
        // Actions row
        const shareBtn = document.createElement('button');
        shareBtn.className = 'share-comp-btn';
        if (comp.shareCode) {
            shareBtn.className = 'share-code-badge';
            shareBtn.innerText = comp.shareCode;
            shareBtn.title = 'Click to copy / share again';
            shareBtn.onclick = (e) => {
                e.stopPropagation();
                window.shareComp(comp.docId);
            };
        } else {
            shareBtn.innerText = '🔗 Share';
            shareBtn.title = 'Generate a share code';
            shareBtn.onclick = (e) => {
                e.stopPropagation();
                window.shareComp(comp.docId);
            };
        }

        const loadBtn = document.createElement('button');
        loadBtn.className = 'icon-btn';
        loadBtn.innerText = 'Load';
        loadBtn.onclick = () => loadComp(comp);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'icon-btn';
        deleteBtn.innerText = '🗑'; 
        deleteBtn.style.marginLeft = '0.5rem';
        deleteBtn.style.color = '#ff4655';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteComp(comp.docId);
        };

        const stratBtn = document.createElement('button');
        stratBtn.className = 'open-stratboard-btn';
        stratBtn.innerText = '🗺️ Strat';
        stratBtn.title = 'Open on Strat Board';
        stratBtn.onclick = (e) => {
            e.stopPropagation();
            if (window.openStratBoard) window.openStratBoard(comp);
        };

        const rightSide = document.createElement('div');
        rightSide.style.display = 'flex';
        rightSide.style.alignItems = 'center';
        rightSide.style.gap = '0.5rem';
        rightSide.appendChild(slotsDiv);
        rightSide.appendChild(shareBtn);
        rightSide.appendChild(stratBtn);
        rightSide.appendChild(loadBtn);
        rightSide.appendChild(deleteBtn);
        
        div.appendChild(info);
        div.appendChild(rightSide);
        els.savedCompsList.appendChild(div);
    });
}

function openBuilder(map) {
    state.currentMap = map;
    state.currentComp = [null, null, null, null, null];
    state.secondaryComp = [null, null, null, null, null];
    state.activeSecondarySlot = null;
    els.compNameInput.value = '';
    els.stratNotesInput.value = '';
    
    els.currentMapName.innerText = map.displayName;
    els.mapImage.src = map.splash;
    
    renderSlots();
    renderAgentsPicker();
    switchView('builder');
}

function addToFirstEmptySlot(uuid) {
    // If a secondary slot is targeted, fill that first
    if (state.activeSecondarySlot !== null) {
        const idx = state.activeSecondarySlot;
        // Don't allow same agent as primary in same slot
        if (state.currentComp[idx] === uuid) {
            showToast('Same agent is already the primary pick for this player', 'warning');
            return;
        }
        state.secondaryComp[idx] = uuid;
        state.activeSecondarySlot = null; // clear target — done
        renderSlots();
        return;
    }

    // Normal primary slot fill
    if (state.currentComp.includes(uuid)) {
        showToast('Agent already in composition!', 'warning');
        return;
    }
    const emptyIndex = state.currentComp.findIndex(s => s === null);
    if (emptyIndex !== -1) {
        updateSlot(emptyIndex, uuid);
    } else {
        showToast('Comp is full! Click an agent to remove them first.', 'warning');
    }
}

function updateSlot(index, uuid) {
    if (uuid && state.currentComp.includes(uuid)) {
         const existingIdx = state.currentComp.indexOf(uuid);
         if (existingIdx !== -1 && existingIdx !== index) {
             state.currentComp[existingIdx] = state.currentComp[index];
             state.currentComp[index] = uuid;
         } else if (existingIdx === -1) {
             state.currentComp[index] = uuid;
         }
    } else {
        state.currentComp[index] = uuid;
    }
    renderSlots();
}

function loadComp(comp) {
    const map = state.maps.find(m => m.uuid === comp.mapId);
    if (!map) {
        alert('Map data missing for this comp.');
        return;
    }
    
    openBuilder(map);
    state.currentComp = [...comp.agents];
    state.secondaryComp = comp.secondaryAgents ? [...comp.secondaryAgents] : [null, null, null, null, null];
    els.compNameInput.value = comp.name || '';
    els.stratNotesInput.value = comp.notes || '';
    renderSlots();
}

function switchView(viewName) {
    // Hide all view sections
    els.mapsGrid.classList.add('hidden');
    els.compBuilder.classList.add('hidden');
    els.savedCompsView.classList.add('hidden');
    
    const homeScreen = document.getElementById('home-screen');
    const mapBanView = document.getElementById('mapban-view');
    const rosterView = document.getElementById('roster-view');
    if (homeScreen) homeScreen.classList.add('hidden');
    if (mapBanView) mapBanView.classList.add('hidden');
    if (rosterView) rosterView.classList.add('hidden');
    if (els.stratboardView) els.stratboardView.classList.add('hidden');
    
    // Reset button states (including dropdown items)
    const dropdownItems = document.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(item => item.classList.remove('active'));
    els.viewSavedBtn.classList.remove('active');
    
    // Show selected view
    if (viewName === 'home') {
        if (homeScreen) homeScreen.classList.remove('hidden');
    } else if (viewName === 'maps') {
        els.mapsGrid.classList.remove('hidden');
        document.getElementById('view-maps-btn')?.classList.add('active');
        state.currentMap = null;
    } else if (viewName === 'builder') {
        els.compBuilder.classList.remove('hidden');
    } else if (viewName === 'mapban') {
        if (mapBanView) {
            mapBanView.classList.remove('hidden');
            document.getElementById('view-mapban-btn')?.classList.add('active');
        }
    } else if (viewName === 'roster') {
        if (rosterView) {
            rosterView.classList.remove('hidden');
            document.getElementById('view-roster-btn')?.classList.add('active');
            // Load roster data when viewing
            if (window.loadRosterFromFirebase) {
                window.loadRosterFromFirebase();
            }
        }
    } else if (viewName === 'saved') {
        if (!state.user) {
            showToast("Please login first!", 'warning');
        }
        renderSavedComps();
        els.savedCompsView.classList.remove('hidden');
        els.viewSavedBtn.classList.add('active');
    } else if (viewName === 'stratboard') {
        if (els.stratboardView) {
            els.stratboardView.classList.remove('hidden');
            document.getElementById('view-stratboard-btn')?.classList.add('active');
            // One-time init
            if (!window._stratboardInited && window.initStratBoard) {
                window._stratboardInited = true;
                window.initStratBoard();
            }
        }
    }
}

// Expose switchView globally for mapban.js
window.switchView = switchView;

// Expose for team-sharing.js and premier.js
window.state = state;
window.openBuilder = openBuilder;
window.renderSlots = renderSlots;
window.renderSavedComps = renderSavedComps;
window.firebaseApp = app;

function setupEventListeners() {
    // Navigation - using onclick for immediate assignment
    els.viewMapsBtn.onclick = () => switchView('maps');
    els.viewSavedBtn.onclick = () => switchView('saved');
    els.backToMapsBtn.onclick = () => switchView('maps');
    
    // Dropdown items - wait for DOM to be ready
    const mapBanBtn = document.getElementById('view-mapban-btn');
    const rosterBtn = document.getElementById('view-roster-btn');
    
    if (mapBanBtn) mapBanBtn.onclick = () => switchView('mapban');
    if (rosterBtn) rosterBtn.onclick = () => switchView('roster');

    const stratboardBtn = document.getElementById('view-stratboard-btn');
    if (stratboardBtn) stratboardBtn.onclick = () => switchView('stratboard');
    
    // Comp builder actions
    els.saveCompBtn.onclick = saveCurrentComp;
    
    // Login/Logout
    els.loginBtn.onclick = login;
    els.logoutBtn.onclick = logout;
    
    els.roleFilters.forEach(btn => {
        btn.onclick = () => {
            els.roleFilters.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.filterRole = btn.dataset.role;
            renderAgentsPicker();
        };
    });
}
