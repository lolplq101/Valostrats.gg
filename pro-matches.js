// ==========================================
// PRO MATCHES MODULE
// ==========================================

let proMatchesData = [];
let filteredMatches = [];

const proMatchesEls = {
    view: document.getElementById('pro-matches-view'),
    grid: document.getElementById('pro-matches-grid'),
    filterMap: document.getElementById('filter-map'),
    filterTournament: document.getElementById('filter-tournament'),
    filterRegion: document.getElementById('filter-region')
};

// Initialize Pro Matches
async function initProMatches() {
    try {
        const response = await fetch('./data/pro-matches.json');
        proMatchesData = (await response.json()).matches;
        filteredMatches = [...proMatchesData];
        
        setupProMatchesFilters();
        renderProMatches();
    } catch (error) {
        console.error('Failed to load pro matches:', error);
        proMatchesEls.grid.innerHTML = `
            <div class="no-matches">
                <div class="no-matches-icon">⚠️</div>
                <p>Failed to load professional matches. Please try again later.</p>
            </div>
        `;
    }
}

// Setup filter event listeners
function setupProMatchesFilters() {
    if (!proMatchesEls.filterMap) return;
    
    proMatchesEls.filterMap.addEventListener('change', applyFilters);
    proMatchesEls.filterTournament.addEventListener('change', applyFilters);
    proMatchesEls.filterRegion.addEventListener('change', applyFilters);
}

// Apply all filters
function applyFilters() {
    const mapFilter = proMatchesEls.filterMap.value;
    const tournamentFilter = proMatchesEls.filterTournament.value;
    const regionFilter = proMatchesEls.filterRegion.value;
    
    filteredMatches = proMatchesData.filter(match => {
        const matchesMap = mapFilter === 'all' || match.map === mapFilter;
        const matchesTournament = tournamentFilter === 'all' || match.tournament === tournamentFilter;
        const matchesRegion = regionFilter === 'all' || 
            match.team1.region === regionFilter || 
            match.team2.region === regionFilter;
        
        return matchesMap && matchesTournament && matchesRegion;
    });
    
    renderProMatches();
}

// Render match cards
function renderProMatches

() {
    if (!proMatchesEls.grid) return;
    
    if (filteredMatches.length === 0) {
        proMatchesEls.grid.innerHTML = `
            <div class="no-matches">
                <div class="no-matches-icon">🔍</div>
                <p>No matches found with the selected filters.</p>
            </div>
        `;
        return;
    }
    
    proMatchesEls.grid.innerHTML = filteredMatches.map(match => createMatchCard(match)).join('');
}

// Create a match card HTML
function createMatchCard(match) {
    const winner = match.team1.score > match.team2.score ? 'team1' : 'team2';
    
    return `
        <div class="match-card" data-match-id="${match.id}">
            <div class="match-header">
                <div class="match-info">
                    <div class="match-tournament">${match.tournament}</div>
                    <h3 class="match-map">${match.map}</h3>
                </div>
                <div class="match-meta">
                    <span class="match-date">${formatDate(match.date)}</span>
                    <span class="match-patch">Patch ${match.patch}</span>
                </div>
            </div>
            
            <div class="teams-container">
                <div class="team-comp ${winner === 'team1' ? 'winner' : ''}">
                    <div class="team-header">
                        <div class="team-name">
                            ${match.team1.name}
                            <span class="region-badge">${match.team1.region}</span>
                        </div>
                        <div class="team-score">${match.team1.score}</div>
                    </div>
                    <div class="team-agents">
                        ${renderAgentIcons(match.team1.composition)}
                    </div>
                </div>
                
                <div class="team-comp ${winner === 'team2' ? 'winner' : ''}">
                    <div class="team-header">
                        <div class="team-name">
                            ${match.team2.name}
                            <span class="region-badge">${match.team2.region}</span>
                        </div>
                        <div class="team-score">${match.team2.score}</div>
                    </div>
                    <div class="team-agents">
                        ${renderAgentIcons(match.team2.composition)}
                    </div>
                </div>
            </div>
            
            <div class="match-actions">
                <button class="btn-save-comp" onclick="saveProComp('${match.id}', 'team1')">
                    Save ${match.team1.name} Comp
                </button>
                <button class="btn-save-comp" onclick="saveProComp('${match.id}', 'team2')">
                    Save ${match.team2.name} Comp
                </button>
            </div>
        </div>
    `;
}

// Render agent icons
function renderAgentIcons(agentNames) {
    if (!state || !state.agents) return '';
    
    return agentNames.map(agentName => {
        const agent = state.agents.find(a => a.displayName === agentName);
        if (!agent) return '';
        
        return `
            <div class="agent-icon-small" title="${agentName}">
                <img src="${agent.displayIcon}" alt="${agentName}">
            </div>
        `;
    }).join('');
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
}

// Save pro comp to user's saved comps
async function saveProComp(matchId, team) {
    if (!state.user) {
        showToast("Please login to save compositions!", 'warning');
        return;
    }
    
    const match = proMatchesData.find(m => m.id === matchId);
    if (!match) return;
    
    const teamData = team === 'team1' ? match.team1 : match.team2;
    const opponentData = team === 'team1' ? match.team2 : match.team1;
    
    try {
        const db = window.firebaseModules.getFirestore(window.firebaseApp);
        const { collection, addDoc } = window.firebaseModules;
        
        await addDoc(collection(db, "users", state.user.uid, "compositions"), {
            map: match.map,
            agents: teamData.composition,
            notes: `Pro Comp: ${teamData.name} vs ${opponentData.name} (${match.tournament}, ${match.date}) - Score: ${teamData.score}-${opponentData.score}`,
            createdAt: new Date().toISOString()
        });
        
        showToast(`✅ ${teamData.name}'s comp saved!`, 'success');
    } catch (e) {
        console.error("Error saving pro comp:", e);
        showToast("❌ Error saving composition", 'error');
    }
}

// Make functions global
window.saveProComp = saveProComp;
window.initProMatches = initProMatches;
