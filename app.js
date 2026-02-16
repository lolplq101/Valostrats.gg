import firebaseConfig from './firebase-config.js';

const API_BASE = 'https://valorant-api.com/v1';

// Initialize Firebase (from global window object injected in index.html)
const { initializeApp, getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
        getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy } 
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
    currentComp: [null, null, null, null, null], // Array of Agent UUIDs
    savedComps: [], // Now loaded from Firestore
    filterRole: 'all',
    user: null // Current Firebase User
};

// Expose state globally for mapban.js
window.state = state;

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
    
    // Saved List
    savedCompsList: document.getElementById('saved-comps-list')
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await Promise.all([fetchMaps(), fetchAgents()]);
        renderMaps();
        els.loading.classList.add('hidden');
        els.mapsGrid.classList.remove('hidden');
    } catch (err) {
        console.error('Failed to load assets', err);
        els.loading.innerHTML = '<p>Error loading data. Please refresh.</p>';
    }

    setupEventListeners();
    setupAuthListener();
    
    // Initialize Map Ban system
    if (typeof initMapBan === 'function') {
        initMapBan();
    }
});

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
        } else {
            // Logged Out
            els.loginBtn.classList.remove('hidden');
            els.logoutBtn.classList.add('hidden');
            els.userDisplay.classList.add('hidden');
            state.savedComps = []; // Clear data
            renderSavedComps();
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
        alert("Please Login to save comps!");
        return;
    }
    if (!state.currentMap) return;
    
    // Validate comp (optional: check if at least 1 agent selected?)
    const hasAgent = state.currentComp.some(a => a !== null);
    if(!hasAgent) {
        alert("Please select at least one agent.");
        return;
    }

    const name = els.compNameInput.value.trim() || `${state.currentMap.displayName} Comp`;
    const notes = els.stratNotesInput.value;
    
    const newComp = {
        date: new Date().toISOString(),
        mapId: state.currentMap.uuid,
        name: name,
        notes: notes,
        agents: [...state.currentComp]
    };
    
    try {
        els.saveCompBtn.innerText = "Saving...";
        els.saveCompBtn.disabled = true;
        
        // Save to: users/{uid}/comps/{docId}
        const userCompsRef = collection(db, "users", state.user.uid, "comps");
        await addDoc(userCompsRef, newComp);
        
        alert('Composition Saved to Cloud!');
        await loadCompsFromFirestore(); // Refresh list
    } catch (e) {
        console.error("Error saving doc: ", e);
        alert("Error saving: " + e.message);
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
        els.agentsGrid.appendChild(div);
    });
}

function renderSlots() {
    els.agentSlots.forEach((slot, index) => {
        const agentUuid = state.currentComp[index];
        slot.innerHTML = ''; 
        slot.classList.remove('filled');
        slot.onclick = null;
        
        if (agentUuid) {
            const agent = state.agents.find(a => a.uuid === agentUuid);
            if (agent) {
                const img = document.createElement('img');
                img.src = agent.displayIcon;
                slot.appendChild(img);
                slot.classList.add('filled');
                slot.onclick = () => updateSlot(index, null);
            }
        }
        
        slot.ondragover = (e) => { e.preventDefault(); slot.style.borderColor = 'var(--text-primary)'; };
        slot.ondragleave = () => { slot.style.borderColor = ''; };
        slot.ondrop = (e) => {
            e.preventDefault();
            slot.style.borderColor = '';
            const uuid = e.dataTransfer.getData('text/plain');
            if (uuid) updateSlot(index, uuid);
        };
    });
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
        
        // Actions
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
            // In Firestore, index is not safe, use DocID
        };

        const rightSide = document.createElement('div');
        rightSide.style.display = 'flex';
        rightSide.style.alignItems = 'center';
        rightSide.appendChild(slotsDiv);
        rightSide.appendChild(document.createTextNode('\u00A0\u00A0')); 
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
    els.compNameInput.value = '';
    els.stratNotesInput.value = '';
    
    els.currentMapName.innerText = map.displayName;
    els.mapImage.src = map.splash;
    
    renderSlots();
    renderAgentsPicker();
    switchView('builder');
}

function addToFirstEmptySlot(uuid) {
    if (state.currentComp.includes(uuid)) {
        alert("Agent already in composition!");
        return;
    }
    const emptyIndex = state.currentComp.findIndex(s => s === null);
    if (emptyIndex !== -1) {
        updateSlot(emptyIndex, uuid);
    } else {
        alert("Comp is full! Click an agent slot to remove one first.");
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
    els.compNameInput.value = comp.name;
    els.stratNotesInput.value = comp.notes || '';
    renderSlots();
}

function switchView(viewName) {
    els.mapsGrid.classList.add('hidden');
    els.compBuilder.classList.add('hidden');
    els.savedCompsView.classList.add('hidden');
    
    // Hide map ban view
    const mapBanView = document.getElementById('mapban-view');
    if (mapBanView) mapBanView.classList.add('hidden');
    
    els.viewMapsBtn.classList.remove('active');
    els.viewSavedBtn.classList.remove('active');
    
    // Remove mapban active if exists
    const mapBanBtn = document.getElementById('view-mapban-btn');
    if (mapBanBtn) mapBanBtn.classList.remove('active');
    
    if (viewName === 'maps') {
        els.mapsGrid.classList.remove('hidden');
        els.viewMapsBtn.classList.add('active');
        state.currentMap = null;
    } else if (viewName === 'builder') {
        els.compBuilder.classList.remove('hidden');
    } else if (viewName === 'mapban') {
        if (mapBanView) {
            mapBanView.classList.remove('hidden');
            if (mapBanBtn) mapBanBtn.classList.add('active');
        }
    } else if (viewName === 'saved') {
        if (!state.user) {
             alert("Please login first!");
        }
        renderSavedComps();
        els.savedCompsView.classList.remove('hidden');
        els.viewSavedBtn.classList.add('active');
    }
}

// Expose switchView globally for mapban.js
window.switchView = switchView;

function setupEventListeners() {
    els.viewMapsBtn.onclick = () => switchView('maps');
    els.viewSavedBtn.onclick = () => switchView('saved');
    els.backToMapsBtn.onclick = () => switchView('maps');
    els.saveCompBtn.onclick = saveCurrentComp;
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
