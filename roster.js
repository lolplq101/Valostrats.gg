// ==========================================
// TEAM ROSTER MANAGER
// ==========================================

const rosterState = {
    teamName: '',
    players: [
        { name: '', agentPool: [] },
        { name: '', agentPool: [] },
        { name: '', agentPool: [] },
        { name: '', agentPool: [] },
        { name: '', agentPool: [] }
    ]
};

let currentPlayerIndex = null; // Track which player is selecting an agent
let selectedAgentsTemp = []; // Temporary storage for multi-select

const rosterEls = {
    viewRosterBtn: document.getElementById('view-roster-btn'),
    rosterView: document.getElementById('roster-view'),
    teamNameInput: document.getElementById('team-name-input'),
    playersGrid: document.getElementById('players-grid'),
    saveRosterBtn: document.getElementById('save-roster-btn'),
    agentSelectorModal: document.getElementById('agent-selector-modal'),
    agentSelectorGrid: document.getElementById('agent-selector-grid')
};


function initRoster() {
    if (!rosterEls.viewRosterBtn) return; // Safety check
    
    rosterEls.viewRosterBtn.onclick = () => switchView('roster');
    rosterEls.saveRosterBtn.onclick = saveRoster;
    rosterEls.teamNameInput.oninput = (e) => {
        rosterState.teamName = e.target.value;
    };
    
    // Only render if agents are loaded
    if (state && state.agents && state.agents.length > 0) {
        renderRoster();
        loadRosterFromFirebase();
    }
}

function renderRoster() {
    if (!rosterEls.playersGrid) return; // Safety check
    if (!state || !state.agents) return; // Wait for agents to load
    
    rosterEls.playersGrid.innerHTML = '';
    
    rosterState.players.forEach((player, index) => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        playerCard.dataset.playerIndex = index;
        
        playerCard.innerHTML = `
            <div class="player-number">Player ${index + 1}</div>
            <input type="text" 
                   class="player-name-input" 
                   placeholder="Player ${index + 1} Name"
                   value="${player.name}"
                   data-player-index="${index}">
            <span class="agent-pool-label">Agent Pool:</span>
            <div class="agent-pool" data-player-index="${index}">
                ${renderAgentPool(player.agentPool, index)}
                <div class="add-agent-btn" onclick="openAgentSelector(${index})">
                    <span>+</span>
                </div>
            </div>
        `;
        
        // Add event listener for player name input
        const nameInput = playerCard.querySelector('.player-name-input');
        nameInput.oninput = (e) => {
            rosterState.players[index].name = e.target.value;
        };
        
        rosterEls.playersGrid.appendChild(playerCard);
    });
}

function renderAgentPool(agentPool, playerIndex) {
    if (!state || !state.agents) return ''; // Safety check
    
    return agentPool.map(agentName => {
        const agent = state.agents.find(a => a.displayName === agentName);
        if (!agent) return '';
        
        return `
            <div class="agent-pool-item" title="${agentName}">
                <img src="${agent.displayIcon}" alt="${agentName}">
                <div class="remove-agent" onclick="removeAgentFromPool(${playerIndex}, '${agentName}')">×</div>
            </div>
        `;
    }).join('');
}

function openAgentSelector(playerIndex) {
    currentPlayerIndex = playerIndex;
    selectedAgentsTemp = [...rosterState.players[playerIndex].agentPool]; // Copy current agents
    rosterEls.agentSelectorModal.classList.remove('hidden');
    renderAgentSelector();
}

function closeAgentSelector() {
    rosterEls.agentSelectorModal.classList.add('hidden');
    currentPlayerIndex = null;
    selectedAgentsTemp = [];
}

function renderAgentSelector() {
    if (!state || !state.agents) return; // Safety check
    
    rosterEls.agentSelectorGrid.innerHTML = '';
    
    state.agents.forEach(agent => {
        const card = document.createElement('div');
        card.className = 'agent-selector-card';
        
        // Mark as selected if in temp selection
        if (selectedAgentsTemp.includes(agent.displayName)) {
            card.classList.add('selected');
        }
        
        card.onclick = () => toggleAgentSelection(agent.displayName, card);
        
        card.innerHTML = `
            <img src="${agent.displayIcon}" alt="${agent.displayName}">
            <div class="agent-name">${agent.displayName}</div>
        `;
        
        rosterEls.agentSelectorGrid.appendChild(card);
    });
}

function toggleAgentSelection(agentName, cardElement) {
    const index = selectedAgentsTemp.indexOf(agentName);
    
    if (index > -1) {
        // Remove from selection
        selectedAgentsTemp.splice(index, 1);
        cardElement.classList.remove('selected');
    } else {
        // Add to selection
        selectedAgentsTemp.push(agentName);
        cardElement.classList.add('selected');
    }
}

function confirmAgentSelection() {
    if (currentPlayerIndex !== null) {
        rosterState.players[currentPlayerIndex].agentPool = [...selectedAgentsTemp];
        renderRoster();
        showToast(`${selectedAgentsTemp.length} agent(s) selected`, 'success');
    }
    closeAgentSelector();
}


function removeAgentFromPool(playerIndex, agentName) {
    const player = rosterState.players[playerIndex];
    player.agentPool = player.agentPool.filter(a => a !== agentName);
    renderRoster();
    showToast(`${agentName} removed`, 'info');
}

async function saveRoster() {
    if (!state.user) {
        showToast("Please login to save roster!", 'warning');
        return;
    }
    
    if (!rosterState.teamName.trim()) {
        showToast("⚠️ Please enter a team name before saving!", 'warning');
        return;
    }
    
    // Check if at least one player has a name
    const playersWithNames = rosterState.players.filter(p => p.name.trim());
    if (playersWithNames.length === 0) {
        showToast("⚠️ Please enter at least one player name!", 'warning');
        return;
    }
    
    // Warn if some players are empty
    const emptyPlayers = rosterState.players.filter(p => !p.name.trim());
    if (emptyPlayers.length > 0) {
        showToast(`Note: ${emptyPlayers.length} player(s) have no name`, 'info');
    }
    
    try {
        const db = window.firebaseModules.getFirestore(window.firebaseApp);
        const { doc, setDoc } = window.firebaseModules;
        
        const rosterRef = doc(db, "users", state.user.uid, "roster", "current");
        await setDoc(rosterRef, {
            teamName: rosterState.teamName,
            players: rosterState.players,
            updatedAt: new Date().toISOString()
        });
        
        showToast('✅ Roster saved successfully!', 'success');
    } catch (e) {
        console.error("Error saving roster: ", e);
        showToast("❌ Error saving: " + e.message, 'error');
    }
}

async function loadRosterFromFirebase() {
    if (!state.user) return;
    
    try {
        const db = window.firebaseModules.getFirestore(window.firebaseApp);
        const { doc, getDoc } = window.firebaseModules;
        
        const rosterRef = doc(db, "users", state.user.uid, "roster", "current");
        const docSnap = await getDoc(rosterRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            rosterState.teamName = data.teamName || '';
            rosterState.players = data.players || rosterState.players;
            
            rosterEls.teamNameInput.value = rosterState.teamName;
            renderRoster();
        }
    } catch (e) {
        console.error("Error loading roster: ", e);
    }
}

// Make functions global for onclick handlers
window.openAgentSelector = openAgentSelector;
window.closeAgentSelector = closeAgentSelector;
window.removeAgentFromPool = removeAgentFromPool;
window.confirmAgentSelection = confirmAgentSelection;

// Initialize when ready - called from app.js after agents are loaded
window.initRoster = initRoster;
window.loadRosterFromFirebase = loadRosterFromFirebase;

