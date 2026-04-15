/**
 * StateManager class for maintaining application state
 * Validates: Requirements 3.2-3.10, 4.2-4.6, 5.2-5.3, 6.1-6.3, 7.4
 */
class StateManager {
    constructor() {
        this.servers = [];
        this.players = new Map(); // Map<steam_id, PlayerData>
        this.reports = [];
        this.lastUpdate = null;
    }

    /**
     * Update servers data
     * @param {Array} servers - Array of server objects
     * 
     * Validates: Requirements 3.2
     */
    updateServers(servers) {
        this.servers = servers || [];
        this.lastUpdate = new Date();
        console.info('[StateManager] Servers updated:', this.servers.length);
    }

    /**
     * Update players data
     * @param {Array} players - Array of player data objects with server info
     * 
     * Validates: Requirements 3.2, 4.2
     */
    updatePlayers(players) {
        this.players.clear();
        if (players && Array.isArray(players)) {
            players.forEach(playerData => {
                const steamId = playerData.player?.steam_id || playerData.steamid;
                if (steamId) {
                    this.players.set(steamId, playerData);
                }
            });
        }
        console.info('[StateManager] Players updated:', this.players.size);
    }

    /**
     * Update reports data
     * @param {Array} reports - Array of report objects
     * 
     * Validates: Requirements 5.2
     */
    updateReports(reports) {
        this.reports = reports || [];
        console.info('[StateManager] Reports updated:', this.reports.length);
    }

    /**
     * Get new accounts (age ≤ 4 days priority, fill to 10 with youngest)
     * @param {number} maxAge - Maximum age in days for priority (default 4)
     * @returns {Array} Array of exactly 10 player data objects sorted by age
     * 
     * Validates: Requirements 3.2, 3.3, 3.4, 3.6, 3.7, 3.8, 3.10, 10.2
     */
    getNewAccounts(maxAge = 4) {
        const now = Date.now();
        const maxAgeMs = maxAge * 24 * 60 * 60 * 1000; // Convert days to milliseconds
        
        // Convert Map to Array and filter players with timecreated
        const playersWithAge = Array.from(this.players.values())
            .filter(playerData => playerData.timecreated)
            .map(playerData => {
                const accountAge = now - (playerData.timecreated * 1000);
                return {
                    ...playerData,
                    accountAgeMs: accountAge,
                    accountAgeDays: accountAge / (24 * 60 * 60 * 1000)
                };
            });
        
        // Sort by age (newest first)
        playersWithAge.sort((a, b) => a.accountAgeMs - b.accountAgeMs);
        
        // Prioritize accounts ≤ 4 days
        const newAccounts = playersWithAge.filter(p => p.accountAgeMs <= maxAgeMs);
        
        // If fewer than 10, fill with youngest accounts
        if (newAccounts.length < 10) {
            const remaining = playersWithAge.filter(p => p.accountAgeMs > maxAgeMs);
            newAccounts.push(...remaining.slice(0, 10 - newAccounts.length));
        }
        
        // Return exactly 10 players (or fewer if not enough data)
        const result = newAccounts.slice(0, 10);
        console.info('[StateManager] New accounts filtered:', result.length);
        return result;
    }

    /**
     * Get VAC-banned players from the new accounts list
     * @returns {Array} Array of player data objects with VAC bans
     * 
     * Validates: Requirements 4.2, 4.3, 4.6
     */
    getVACBannedPlayers() {
        const newAccounts = this.getNewAccounts();
        
        // Filter players with VAC bans
        const bannedPlayers = newAccounts.filter(playerData => {
            return playerData.NumberOfVACBans && playerData.NumberOfVACBans > 0;
        });
        
        // Sort by DaysSinceLastBan (most recent first)
        bannedPlayers.sort((a, b) => {
            const aDays = a.DaysSinceLastBan || Infinity;
            const bDays = b.DaysSinceLastBan || Infinity;
            return aDays - bDays;
        });
        
        console.info('[StateManager] VAC banned players filtered:', bannedPlayers.length);
        return bannedPlayers;
    }

    /**
     * Get recent reports (first 10)
     * @param {number} limit - Maximum number of reports to return (default 10)
     * @returns {Array} Array of report objects
     * 
     * Validates: Requirements 5.3
     */
    getRecentReports(limit = 10) {
        const result = this.reports.slice(0, limit);
        console.info('[StateManager] Recent reports filtered:', result.length);
        return result;
    }

    /**
     * Get total number of servers
     * @returns {number} Server count
     * 
     * Validates: Requirements 6.1
     */
    getTotalServers() {
        return this.servers.length;
    }

    /**
     * Get total number of players across all servers
     * @returns {number} Total player count
     * 
     * Validates: Requirements 6.2, 6.3
     */
    getTotalPlayers() {
        return this.servers.reduce((total, server) => {
            // Real API structure: server.live_data.players
            const liveData = server.live_data || {};
            const playersList = liveData.players || [];
            return total + playersList.length;
        }, 0);
    }
}
