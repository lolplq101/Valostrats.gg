// ==========================================
// MAP BAN SYSTEM LOGIC
// ==========================================

// Map Ban State
const mapBanState = {
    banType: 'all', // 'all', 'competitive', 'custom'
    bestOf: 3, // 1, 2, 3, or 5
    customMaps: [],
    teamA: 'Team A',
    teamB: 'Team B',
    callingTeam: null,
    currentTurn: 0, // 0 = Team A, 1 = Team B
    banSequence: [], // Array of {type: 'ban'|'pick', team: 0|1}
    mapStates: {}, // {mapId: {status: 'available'|'banned'|'picked', team: 0|1, side: 'attack'|'defense'}}
    availableMaps: [],
    competitiveMaps: ['Abyss', 'Ascent', 'Bind', 'Haven', 'Lotus', 'Split', 'Sunset'], // Common comp pool
    coinHistory: [] // Track last 10 flips for balancing
};

// Map Ban DOM Elements
const mapBanEls = {
    viewMapBanBtn: document.getElementById('view-mapban-btn'),
    mapBanView: document.getElementById('mapban-view'),
    
    // Setup
    setup: document.getElementById('mapban-setup'),
    banTypeBtns: document.querySelectorAll('.ban-type-btn'),
    customMapSelector: document.getElementById('custom-map-selector'),
    customMapsGrid: document.getElementById('custom-maps-grid'),
    teamANameInput: document.getElementById('team-a-name'),
    teamBNameInput: document.getElementById('team-b-name'),
    startBanBtn: document.getElementById('start-ban-btn'),
    
    // Coin Toss
    coinToss: document.getElementById('mapban-cointoss'),
    coin: document.getElementById('coin-flip'),
    callTeamA: document.getElementById('call-team-a'),
    callTeamB: document.getElementById('call-team-b'),
    headsTailsChoice: document.getElementById('heads-tails-choice'),
    callingTeamText: document.getElementById('calling-team-text'),
    coinTossResult: document.getElementById('cointoss-result'),
    resultText: document.getElementById('result-text'),
    winnerText: document.getElementById('winner-text'),
    goFirstBtn: document.getElementById('go-first'),
    goSecondBtn: document.getElementById('go-second'),
    
    // Ban/Pick Phase
    banPhase: document.getElementById('mapban-phase'),
    turnIndicator: document.getElementById('turn-indicator'),
    currentTurnTeam: document.getElementById('current-turn-team'),
    currentAction: document.getElementById('current-action'),
    mapBanGrid: document.getElementById('mapban-maps-grid'),
    resetBtn: document.getElementById('reset-ban-btn'),
    summaryTeamA: document.getElementById('summary-team-a'),
    summaryTeamB: document.getElementById('summary-team-b'),
    teamABans: document.getElementById('team-a-bans'),
    teamAPicks: document.getElementById('team-a-picks'),
    teamBBans: document.getElementById('team-b-bans'),
    teamBPicks: document.getElementById('team-b-picks'),
    
    // Side Selection
    sideModal: document.getElementById('side-selection-modal'),
    sideSelectTitle: document.getElementById('side-select-title'),
    pickedMapName: document.getElementById('picked-map-name'),
    sideBtns: document.querySelectorAll('.side-btn')
};

// Initialize Map Ban
function initMapBan() {
    mapBanEls.viewMapBanBtn.onclick = () => switchView('mapban');
    
    // Ban type selection
    mapBanEls.banTypeBtns.forEach(btn => {
        btn.onclick = () => {
            mapBanEls.banTypeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            mapBanState.banType = btn.dataset.type;
            
            if (mapBanState.banType === 'custom') {
                mapBanEls.customMapSelector.classList.remove('hidden');
                renderCustomMapSelector();
            } else {
                mapBanEls.customMapSelector.classList.add('hidden');
            }
        };
    });
    
    // Best Of selection
    const bestOfBtns = document.querySelectorAll('.bestof-btn');
    bestOfBtns.forEach(btn => {
        btn.onclick = () => {
            bestOfBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            mapBanState.bestOf = parseInt(btn.dataset.bestof);
        };
    });
    
    mapBanEls.startBanBtn.onclick = startMapBanProcess;
    
    // Coin toss
    mapBanEls.callTeamA.onclick = () => selectCallingTeam(0);
    mapBanEls.callTeamB.onclick = () => selectCallingTeam(1);
    
    document.querySelectorAll('.choice-btn[data-choice]').forEach(btn => {
        btn.onclick = () => performCoinFlip(btn.dataset.choice);
    });
    
    mapBanEls.goFirstBtn.onclick = () => {
        setupBanSequence(true);
        showBanPhase();
    };
    
    mapBanEls.goSecondBtn.onclick = () => {
        setupBanSequence(false);
        showBanPhase();
    };
    
    // Side selection
    mapBanEls.sideBtns.forEach(btn => {
        btn.onclick = () => selectSide(btn.dataset.side);
    });
    
    mapBanEls.resetBtn.onclick = resetMapBan;
}

function renderCustomMapSelector() {
    mapBanEls.customMapsGrid.innerHTML = '';
    state.maps.forEach(map => {
        const label = document.createElement('label');
        label.className = 'custom-map-checkbox';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
       checkbox.value = map.uuid;
        checkbox.checked = mapBanState.customMaps.includes(map.displayName);
        
        checkbox.onchange = (e) => {
            if (e.target.checked) {
                mapBanState.customMaps.push(map.displayName);
            } else {
                mapBanState.customMaps = mapBanState.customMaps.filter(m => m !== map.displayName);
            }
            label.classList.toggle('selected', e.target.checked);
        };
        
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(map.displayName));
        mapBanEls.customMapsGrid.appendChild(label);
    });
}

function startMapBanProcess() {
    mapBanState.teamA = mapBanEls.teamANameInput.value || 'Team A';
    mapBanState.teamB = mapBanEls.teamBNameInput.value || 'Team B';
    
    // Determine available maps
    if (mapBanState.banType === 'all') {
        mapBanState.availableMaps = state.maps.map(m => m.displayName);
    } else if (mapBanState.banType === 'competitive') {
        mapBanState.availableMaps = state.maps
            .filter(m => mapBanState.competitiveMaps.includes(m.displayName))
            .map(m => m.displayName);
    } else {
        mapBanState.availableMaps = [...mapBanState.customMaps];
    }
    
    // Validate minimum maps based on Best Of format
    const minMapsRequired = {
        1: 2,  // Bo1: need at least 2 maps (1 ban minimum + 1 pick)
        2: 3,  // Bo2: need at least 3 maps (1 ban minimum + 2 picks)
        3: 5,  // Bo3: need at least 5 maps (2 bans minimum + 3 picks)
        5: 7   // Bo5: need at least 7 maps (2 bans + 5 picks)
    };
    
    const minRequired = minMapsRequired[mapBanState.bestOf] || 7;
    
    if (mapBanState.availableMaps.length < minRequired) {
        alert(`Please select at least ${minRequired} maps for Bo${mapBanState.bestOf} format!`);
        return;
    }
    
    // Initialize map states
    mapBanState.mapStates = {};
    mapBanState.availableMaps.forEach(mapName => {
        mapBanState.mapStates[mapName] = { status: 'available', team: null, side: null };
    });
    
    // Show coin toss
    mapBanEls.setup.classList.add('hidden');
    mapBanEls.coinToss.classList.remove('hidden');
    
    // Update team button labels
    mapBanEls.callTeamA.textContent = mapBanState.teamA;
    mapBanEls.callTeamB.textContent = mapBanState.teamB;
}

function selectCallingTeam(team) {
    mapBanState.callingTeam = team;
    const teamName = team === 0 ? mapBanState.teamA : mapBanState.teamB;
    mapBanEls.callingTeamText.textContent = `${teamName} calls:`;
    
    document.querySelector('.cointoss-choice').classList.add('hidden');
    mapBanEls.headsTailsChoice.classList.remove('hidden');
}

function performCoinFlip(call) {
    mapBanEls.headsTailsChoice.classList.add('hidden');
    mapBanEls.coin.classList.add('flipping');
    
    setTimeout(() => {
        mapBanEls.coin.classList.remove('flipping');
        
        
        // Balanced Random Logic (Pseudo-random to avoid streaks)
        let headsProbability = 0.5;
        const history = mapBanState.coinHistory;
        
        if (history.length >= 4) {
             const recent = history.slice(-5);
             const headsCount = recent.filter(r => r === 'heads').length;
             // If recently mostly heads, slight bias to tails, and vice versa
             if (headsCount >= 4) headsProbability = 0.35; // Bias towards tails
             if (headsCount <= 1) headsProbability = 0.65; // Bias towards heads
        }
        
        const result = Math.random() < headsProbability ? 'heads' : 'tails';
        
        // Update history (keep last 10)
        mapBanState.coinHistory.push(result);
        if (mapBanState.coinHistory.length > 10) mapBanState.coinHistory.shift();

        const won = result === call;
        const winner = won ? mapBanState.callingTeam : (mapBanState.callingTeam === 0 ? 1 : 0);
        const winnerName = winner === 0 ? mapBanState.teamA : mapBanState.teamB;
        
        // Visually show the correct coin face
        if (result === 'heads') {
            mapBanEls.coin.style.transform = 'rotateY(0deg)';
        } else {
            mapBanEls.coin.style.transform = 'rotateY(180deg)';
        }
        
        mapBanState.currentTurn = winner;
        
        mapBanEls.resultText.textContent = `Result: ${result.toUpperCase()}! ${winnerName} wins the toss!`;
        mapBanEls.winnerText.textContent = `${winnerName} chooses:`;
        mapBanEls.coinTossResult.classList.remove('hidden');
    }, 1000);
}

function setupBanSequence(goFirst) {
    const first = goFirst ? mapBanState.currentTurn : (mapBanState.currentTurn === 0 ? 1 : 0);
    const second = first === 0 ? 1 : 0;
    
    const totalMaps = mapBanState.availableMaps.length;
    let sequence = [];
    
    switch(mapBanState.bestOf) {
        case 1: // Bo1: Ban all except 1, then pick the last map
            {
                const numBans = totalMaps - 1;
                for (let i = 0; i < numBans; i++) {
                    sequence.push({type: 'ban', team: i % 2 === 0 ? first : second});
                }
                sequence.push({type: 'pick', team: first}); // Pick last remaining
            }
            break;
            
        case 2: // Bo2: Ban until 2 maps remain, then each team picks one
            {
                const numBans = totalMaps - 2;
                for (let i = 0; i < numBans; i++) {
                    sequence.push({type: 'ban', team: i % 2 === 0 ? first : second});
                }
                sequence.push({type: 'pick', team: first}); // First team picks
                sequence.push({type: 'pick', team: second}); // Second team picks
            }
            break;
            
        case 3: // Bo3: Ban-Ban, Pick-Pick, Ban-Ban, Pick decider
            {
                // Initial bans to reduce pool
                const initialBans = Math.max(2, totalMaps - 5); // Leave room for 3 picks + 2 final bans
                const halfInitial = Math.floor(initialBans / 2);
                
                // Initial ban phase
                for (let i = 0; i < halfInitial; i++) {
                    sequence.push({type: 'ban', team: first});
                    sequence.push({type: 'ban', team: second});
                }
                if (initialBans % 2 === 1) {
                    sequence.push({type: 'ban', team: first});
                }
                
                // First two picks
                sequence.push({type: 'pick', team: first});
                sequence.push({type: 'pick', team: second});
                
                // Second ban phase (2 bans)
                sequence.push({type: 'ban', team: first});
                sequence.push({type: 'ban', team: second});
                
                // Decider pick
                sequence.push({type: 'pick', team: first});
            }
            break;
            
        case 5: // Bo5: Ban-Ban, Pick alternating (5 picks total)
            {
                // Initial bans to reduce to manageable pool
                const numBans = totalMaps - 5;
                const halfBans = Math.floor(numBans / 2);
                
                // Ban phase
                for (let i = 0; i < halfBans; i++) {
                    sequence.push({type: 'ban', team: first});
                    sequence.push({type: 'ban', team: second});
                }
                if (numBans % 2 === 1) {
                    sequence.push({type: 'ban', team: first});
                }
                
                // Pick phase - 5 picks alternating
                sequence.push({type: 'pick', team: first});
                sequence.push({type: 'pick', team: second});
                sequence.push({type: 'pick', team: first});
                sequence.push({type: 'pick', team: second});
                sequence.push({type: 'pick', team: first}); // Decider
            }
            break;
            
        default:
            // Fallback to Bo3
            sequence = [
                {type: 'ban', team: first},
                {type: 'ban', team: second},
                {type: 'pick', team: first},
                {type: 'pick', team: second},
                {type: 'ban', team: first},
                {type: 'ban', team: second},
                {type: 'pick', team: first}
            ];
    }
    
    mapBanState.banSequence = sequence;
    mapBanState.currentTurn = first;
}

function showBanPhase() {
    mapBanEls.coinToss.classList.add('hidden');
    mapBanEls.banPhase.classList.remove('hidden');
    
    // Update summary headers
    mapBanEls.summaryTeamA.textContent = mapBanState.teamA;
    mapBanEls.summaryTeamB.textContent = mapBanState.teamB;
    
    renderMapBanGrid();
    updateTurnIndicator();
}

function renderMapBanGrid() {
    mapBanEls.mapBanGrid.innerHTML = '';
    
    mapBanState.availableMaps.forEach(mapName => {
        const mapData = state.maps.find(m => m.displayName === mapName);
        if (!mapData) return;
        
        const card = document.createElement('div');
        card.className = 'mapban-card';
        card.dataset.mapName = mapName;
        
        const mapState = mapBanState.mapStates[mapName];
        if (mapState.status === 'banned') card.classList.add('banned');
        if (mapState.status === 'picked') card.classList.add('picked');
        
        const img = document.createElement('img');
        img.src = mapData.splash;
        img.alt = mapName;
        
        const name = document.createElement('div');
        name.className = 'mapban-card-name';
        name.textContent = mapName;
        
        const overlay = document.createElement('div');
        overlay.className = 'mapban-card-overlay';
        
        if (mapState.status === 'banned') {
            overlay.innerHTML = '<div class="ban-x">✕</div>';
        } else if (mapState.status === 'picked') {
            overlay.innerHTML = '<div class="pick-check">✓</div>';
            
            if (mapState.side) {
                const sideBadge = document.createElement('div');
                sideBadge.className = `side-badge ${mapState.side}`;
                sideBadge.textContent = mapState.side === 'attack' ? '⚔️ ATK' : '🛡️ DEF';
                card.appendChild(sideBadge);
            }
        }
        
        card.appendChild(img);
        card.appendChild(overlay);
        card.appendChild(name);
        
        if (mapState.status === 'available') {
            card.onclick = () => handleMapSelection(mapName);
        }
        
        mapBanEls.mapBanGrid.appendChild(card);
    });
}

function handleMapSelection(mapName) {
    const currentStep = mapBanState.banSequence[getCurrentStepIndex()];
    if (!currentStep) return;
    
    const mapState = mapBanState.mapStates[mapName];
    mapState.status = currentStep.type === 'ban' ? 'banned' : 'picked';
    mapState.team = mapBanState.currentTurn;
    
    if (currentStep.type === 'pick') {
        // Show side selection modal for opposing team
        const opposingTeam = mapBanState.currentTurn === 0 ? 1 : 0;
        const opposingTeamName = opposingTeam === 0 ? mapBanState.teamA : mapBanState.teamB;
        
        mapBanEls.pickedMapName.textContent = mapName;
        mapBanEls.sideSelectTitle.innerHTML = `${opposingTeamName} chooses side for <span id="picked-map-name">${mapName}</span>`;
        mapBanEls.sideModal.classList.remove('hidden');
        mapBanEls.sideModal.dataset.mapName = mapName;
    } else {
        advanceTurn();
        renderMapBanGrid();
        updateSummary();
    }
}

function selectSide(side) {
    const mapName = mapBanEls.sideModal.dataset.mapName;
    mapBanState.mapStates[mapName].side = side;
    mapBanEls.sideModal.classList.add('hidden');
    
    advanceTurn();
    renderMapBanGrid();
    updateSummary();
}

function getCurrentStepIndex() {
    let count = 0;
    for (let mapName in mapBanState.mapStates) {
        if (mapBanState.mapStates[mapName].status !== 'available') {
            count++;
        }
    }
    return count;
}

function advanceTurn() {
    const nextStep = mapBanState.banSequence[getCurrentStepIndex()];
    if (nextStep) {
        mapBanState.currentTurn = nextStep.team;
        updateTurnIndicator();
    } else {
        // Ban phase complete
        mapBanEls.turnIndicator.innerHTML = '<span style="color: #00ff00;">Map Ban Complete!</span>';
    }
}

function updateTurnIndicator() {
    const currentStep = mapBanState.banSequence[getCurrentStepIndex()];
    if (!currentStep) return;
    
    const teamName = currentStep.team === 0 ? mapBanState.teamA : mapBanState.teamB;
    const action = currentStep.type === 'ban' ? 'Ban' : 'Pick';
    
    mapBanEls.currentTurnTeam.textContent = teamName;
    mapBanEls.currentAction.textContent = action;
}

function updateSummary() {
    const teamABans = [];
    const teamAPicks = [];
    const teamBBans = [];
    const teamBPicks = [];
    
    for (let mapName in mapBanState.mapStates) {
        const mapState = mapBanState.mapStates[mapName];
        
        if (mapState.status === 'banned') {
            if (mapState.team === 0) teamABans.push(mapName);
            else teamBBans.push(mapName);
        } else if (mapState.status === 'picked') {
            const pickText = mapState.side ? `${mapName} (${mapState.side === 'attack' ? '⚔️' : '🛡️'})` : mapName;
            if (mapState.team === 0) teamAPicks.push(pickText);
            else teamBPicks.push(pickText);
        }
    }
    
    mapBanEls.teamABans.innerHTML = teamABans.map(m => `<div class="summary-item">${m}</div>`).join('') || '<em>None</em>';
    mapBanEls.teamAPicks.innerHTML = teamAPicks.map(m => `<div class="summary-item">${m}</div>`).join('') || '<em>None</em>';
    mapBanEls.teamBBans.innerHTML = teamBBans.map(m => `<div class="summary-item">${m}</div>`).join('') || '<em>None</em>';
    mapBanEls.teamBPicks.innerHTML = teamBPicks.map(m => `<div class="summary-item">${m}</div>`).join('') || '<em>None</em>';
}

function resetMapBan() {
    if (!confirm('Reset map ban?')) return;
    
    // Hide ban phase, show setup
    mapBanEls.banPhase.classList.add('hidden');
    mapBanEls.coinToss.classList.add('hidden');
    mapBanEls.setup.classList.remove('hidden');
    
    // Reset state
    mapBanState.mapStates = {};
    mapBanState.banSequence = [];
    mapBanState.currentTurn = 0;
    mapBanState.callingTeam = null;
    mapBanState.availableMaps = [];
    
    // Reset coin toss UI
    document.querySelector('.cointoss-choice').classList.remove('hidden');
    mapBanEls.headsTailsChoice.classList.add('hidden');
    mapBanEls.coinTossResult.classList.add('hidden');
    
    // Reset turn indicator (clear completion message)
    mapBanEls.currentTurnTeam.textContent = 'Team A';
    mapBanEls.currentAction.textContent = 'Ban';
    mapBanEls.turnIndicator.innerHTML = `<span id="current-turn-team">Team A</span>'s Turn: <span id="current-action">Ban</span>`;
    
    // Clear map grid completely
    mapBanEls.mapBanGrid.innerHTML = '';
    
    // Clear side selection modal
    mapBanEls.sideModal.classList.add('hidden');
    mapBanEls.sideModal.dataset.mapName = '';
    
    // Clear summaries
    mapBanEls.teamABans.innerHTML = '<em>None</em>';
    mapBanEls.teamAPicks.innerHTML = '<em>None</em>';
    mapBanEls.teamBBans.innerHTML = '<em>None</em>';
    mapBanEls.teamBPicks.innerHTML = '<em>None</em>';
}

// Export for app.js
window.initMapBan = initMapBan;
window.mapBanState = mapBanState;
