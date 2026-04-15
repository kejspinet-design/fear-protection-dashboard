/**
 * APIClient class for handling all external API communication
 * Validates: Requirements 2.1-2.8, 10.1-10.5, 11.1-11.5
 */
class APIClient {
    constructor(config) {
        // Auto-detect environment (local vs production)
        const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        const baseUrl = isProduction ? window.location.origin : 'http://localhost:3000';
        
        this.config = {
            fearApiBase: config.fearApiBase || `${baseUrl}/api/fear`,
            steamApiKey: config.steamApiKey || 'E060AF2E30A53F487CD115E1067F9983',
            steamApiBase: config.steamApiBase || `${baseUrl}/api/steam`,
            accessToken: config.accessToken,
            cookieDomain: config.cookieDomain || '.fearproject.ru'
        };
        
        console.info('[APIClient] Environment:', isProduction ? 'Production' : 'Local');
        console.info('[APIClient] Fear API:', this.config.fearApiBase);
        console.info('[APIClient] Steam API:', this.config.steamApiBase);
        
        // Set access token cookie on initialization
        this.setCookie('access_token', this.config.accessToken, {
            domain: this.config.cookieDomain,
            path: '/',
            sameSite: 'Lax'
        });
    }

    /**
     * Set a cookie with specified options
     * @param {string} name - Cookie name
     * @param {string} value - Cookie value
     * @param {Object} options - Cookie options (domain, path, sameSite, expires)
     * 
     * Validates: Requirements 2.4, 2.5, 11.1-11.5
     */
    setCookie(name, value, options = {}) {
        let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
        
        if (options.domain) {
            cookieString += `; domain=${options.domain}`;
        }
        
        if (options.path) {
            cookieString += `; path=${options.path}`;
        }
        
        if (options.sameSite) {
            cookieString += `; SameSite=${options.sameSite}`;
        }
        
        if (options.expires) {
            cookieString += `; expires=${options.expires.toUTCString()}`;
        }
        
        document.cookie = cookieString;
        console.info('[APIClient] Cookie set:', name);
    }

    /**
     * Fetch server list from Fear Project API
     * @returns {Promise<Array>} Array of server objects
     * 
     * Validates: Requirements 2.1, 10.1, 10.3
     */
    async fetchServers() {
        try {
            const response = await fetch(`${this.config.fearApiBase}/servers/`, {
                method: 'GET',
                mode: 'cors',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.info('[APIClient] Servers fetched:', data.length || 0);
            return data;
        } catch (error) {
            console.error('[APIClient] CORS or Network error fetching servers:', error);
            return this.handleError(error, 'fetchServers');
        }
    }

    /**
     * Fetch recent reports from Fear Project API
     * @returns {Promise<Array>} Array of report objects
     * 
     * Validates: Requirements 2.2, 10.1, 10.3
     */
    async fetchReports() {
        try {
            // Try /reports endpoint instead of /reports/recent
            const response = await fetch(`${this.config.fearApiBase}/reports`, {
                method: 'GET',
                mode: 'cors',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                console.warn(`[APIClient] Reports endpoint returned ${response.status}, returning empty array`);
                return [];
            }
            
            const data = await response.json();
            console.info('[APIClient] Reports fetched:', data.length || 0);
            return data;
        } catch (error) {
            console.error('[APIClient] CORS or Network error fetching reports:', error);
            return this.handleError(error, 'fetchReports');
        }
    }

    /**
     * Fetch player summaries from Steam API
     * @param {Array<string>} steamIds - Array of Steam IDs (max 100)
     * @returns {Promise<Array>} Array of player summary objects
     * 
     * Validates: Requirements 2.3, 2.6, 2.8, 10.3
     */
    async fetchPlayerSummaries(steamIds) {
        if (!steamIds || steamIds.length === 0) {
            return [];
        }
        
        try {
            // Batch steam IDs (max 100 per request)
            const batches = [];
            for (let i = 0; i < steamIds.length; i += 100) {
                batches.push(steamIds.slice(i, i + 100));
            }
            
            const allPlayers = [];
            
            for (const batch of batches) {
                const steamIdsParam = batch.join(',');
                const url = `${this.config.steamApiBase}/ISteamUser/GetPlayerSummaries/v2/?key=${this.config.steamApiKey}&steamids=${steamIdsParam}&format=json`;
                
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                if (data.response && data.response.players) {
                    allPlayers.push(...data.response.players);
                }
            }
            
            console.info('[APIClient] Player summaries fetched:', allPlayers.length);
            return allPlayers;
        } catch (error) {
            return this.handleError(error, 'fetchPlayerSummaries');
        }
    }

    /**
     * Fetch player bans from Steam API
     * @param {Array<string>} steamIds - Array of Steam IDs (max 100)
     * @returns {Promise<Array>} Array of player ban objects
     * 
     * Validates: Requirements 2.3, 2.7, 2.8, 10.3
     */
    async fetchPlayerBans(steamIds) {
        if (!steamIds || steamIds.length === 0) {
            return [];
        }
        
        try {
            // Batch steam IDs (max 100 per request)
            const batches = [];
            for (let i = 0; i < steamIds.length; i += 100) {
                batches.push(steamIds.slice(i, i + 100));
            }
            
            const allBans = [];
            
            for (const batch of batches) {
                const steamIdsParam = batch.join(',');
                const url = `${this.config.steamApiBase}/ISteamUser/GetPlayerBans/v1/?key=${this.config.steamApiKey}&steamids=${steamIdsParam}&format=json`;
                
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                if (data.players) {
                    allBans.push(...data.players);
                }
            }
            
            console.info('[APIClient] Player bans fetched:', allBans.length);
            return allBans;
        } catch (error) {
            return this.handleError(error, 'fetchPlayerBans');
        }
    }

    /**
     * Handle API errors gracefully
     * @param {Error} error - The error object
     * @param {string} context - Context where error occurred
     * @returns {Array|null} Empty array or null for graceful degradation
     * 
     * Validates: Requirements 10.1, 10.3, 10.4, 10.5
     */
    handleError(error, context) {
        console.error(`[APIClient] Error in ${context}:`, error.message);
        // Return empty data to allow graceful degradation
        return [];
    }
}
