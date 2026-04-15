/**
 * Main App class to coordinate all modules
 * Validates: Requirements 7.1-7.4, 9.2-9.4, 10.2-10.5
 */
class App {
    constructor() {
        // Initialize all modules
        this.timeFormatter = new TimeFormatter();
        
        this.apiClient = new APIClient({
            steamApiKey: 'E060AF2E30A53F487CD115E1067F9983',
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRfaWQiOiI3NjU2MTE5OTUyNDc4MDMyNyIsImlhdCI6MTc3NjAxNjQ5NSwiZXhwIjoxNzc4NjA4NDk1fQ.yv6jyYlSW_BvFCoLgbGGuEWUpe3C4yffW-oXTxqOg_k',
            cookieDomain: '.fearproject.ru'
        });
        
        this.stateManager = new StateManager();
        this.renderer = new Renderer(this.timeFormatter);
        this.timeUpdater = new TimeUpdater(this.timeFormatter);
        this.modalManager = new ModalManager();
        this.configChecker = new ConfigChecker(this.apiClient);
        
        // Auto-refresh timer (30 seconds)
        this.autoRefreshTimer = new AutoRefreshTimer(30000, () => {
            this.fetchAndUpdateData();
        });
        
        console.info('[App] Application initialized');
    }

    /**
     * Fetch and update all data
     * 
     * Validates: Requirements 2.1, 2.2, 2.6, 2.7, 3.2, 3.3, 4.2, 5.2, 7.4, 10.2, 10.3, 10.5
     */
    async fetchAndUpdateData() {
        try {
            console.info('[App] Fetching data...');
            
            // Fetch servers
            const serversData = await this.apiClient.fetchServers();
            console.log('[App] Raw servers data:', serversData);
            
            // Handle different API response structures
            let servers = [];
            if (Array.isArray(serversData)) {
                servers = serversData;
            } else if (serversData && serversData.servers) {
                servers = serversData.servers;
            } else if (serversData && serversData.data) {
                servers = serversData.data;
            }
            
            this.stateManager.updateServers(servers);
            
            // Log first server structure for debugging
            if (servers.length > 0) {
                console.log('[App] First server keys:', Object.keys(servers[0]));
                console.log('[App] First server structure:', JSON.stringify(servers[0], null, 2));
            }
            
            // Extract all steam IDs from server player lists
            const steamIds = new Set(); // Use Set to avoid duplicates
            
            servers.forEach((server, index) => {
                // Real API structure: server.live_data.players
                const liveData = server.live_data || {};
                const playersList = liveData.players || [];
                
                if (index < 3) {
                    console.log(`[App] Server ${index} (${server.site_name}): ${playersList.length} players`);
                }
                
                if (Array.isArray(playersList)) {
                    playersList.forEach(player => {
                        // steam_id is the correct field name
                        const steamId = player.steam_id;
                        if (steamId) {
                            steamIds.add(steamId);
                        }
                    });
                }
            });
            
            const steamIdsArray = Array.from(steamIds);
            console.info('[App] Extracted Steam IDs:', steamIdsArray.length, steamIdsArray.slice(0, 5));
            
            // Fetch Steam player summaries and bans
            if (steamIdsArray.length > 0) {
                const [playerSummaries, playerBans] = await Promise.all([
                    this.apiClient.fetchPlayerSummaries(steamIdsArray),
                    this.apiClient.fetchPlayerBans(steamIdsArray)
                ]);
                
                console.log('[App] Player summaries:', playerSummaries.length);
                console.log('[App] Player bans:', playerBans.length);
                
                // Merge player data with server info
                const playersWithServerInfo = [];
                
                servers.forEach(server => {
                    const liveData = server.live_data || {};
                    const playersList = liveData.players || [];
                    
                    playersList.forEach(player => {
                        if (!player.steam_id) return;
                        
                        // Find Steam profile
                        const steamProfile = playerSummaries.find(p => p.steamid === player.steam_id);
                        
                        // Find ban data
                        const banData = playerBans.find(b => b.SteamId === player.steam_id);
                        
                        // Create player data object with server info
                        const playerData = {
                            player: player,
                            server: server,
                            steamProfile: steamProfile || null,
                            timecreated: steamProfile?.timecreated || 0,
                            NumberOfVACBans: banData?.NumberOfVACBans || 0,
                            DaysSinceLastBan: banData?.DaysSinceLastBan || 0,
                            NumberOfGameBans: banData?.NumberOfGameBans || 0
                        };
                        
                        playersWithServerInfo.push(playerData);
                    });
                });
                
                this.stateManager.updatePlayers(playersWithServerInfo);
            } else {
                console.warn('[App] No Steam IDs found in server data');
            }
            
            // Fetch reports - removed, using config checker instead
            console.info('[App] Reports feature replaced with config checker');
            this.stateManager.updateReports([]);
            
            console.info('[App] Data fetch completed');
            
            // Render updated data
            this.render();
            
        } catch (error) {
            console.error('[App] Error fetching data:', error);
            this.renderer.showError('Не удалось загрузить данные');
            
            // Continue with available data (graceful degradation)
            this.render();
        }
    }

    /**
     * Render all UI components
     * 
     * Validates: Requirements 3.1, 3.8, 3.10, 4.1, 4.3, 4.6, 5.1, 5.3, 6.1, 6.2, 6.4, 6.5, 7.4
     */
    render() {
        console.info('[App] Rendering UI...');
        
        // Get data from state manager
        const newAccounts = this.stateManager.getNewAccounts();
        const vacBannedPlayers = this.stateManager.getVACBannedPlayers();
        
        const stats = {
            totalServers: this.stateManager.getTotalServers(),
            totalPlayers: this.stateManager.getTotalPlayers()
        };
        
        // Render columns
        this.renderer.renderNewAccountsColumn(newAccounts);
        this.renderer.renderVACBansColumn(vacBannedPlayers);
        
        // Render header
        this.renderer.renderStatistics(stats);
        
        // Update last update timestamp
        if (this.stateManager.lastUpdate) {
            this.renderer.renderLastUpdate(this.stateManager.lastUpdate);
        }
        
        console.info('[App] UI rendering completed');
    }

    /**
     * Initialize application
     * 
     * Validates: Requirements 7.1, 7.2, 7.3, 7.4
     */
    async init() {
        console.info('[App] Initializing application...');
        
        // Show loading indicator
        this.renderer.showLoading();
        
        // Fetch and render initial data
        await this.fetchAndUpdateData();
        
        // Hide loading indicator
        this.renderer.hideLoading();
        
        // Start auto-refresh timer
        this.autoRefreshTimer.start();
        
        // Start real-time time updates
        this.timeUpdater.start();
        
        console.info('[App] Application initialized successfully');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
