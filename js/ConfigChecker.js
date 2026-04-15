/**
 * ConfigChecker class for parsing config.vdf and checking bans
 */
class ConfigChecker {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.uploadArea = null;
        this.fileInput = null;
        this.resultsColumn = null;
        this.countElement = null;
        
        this.init();
    }

    /**
     * Initialize config checker
     */
    init() {
        this.uploadArea = document.getElementById('configUploadArea');
        this.fileInput = document.getElementById('configFileInput');
        this.resultsColumn = document.getElementById('config-check-column');
        this.countElement = document.getElementById('configCheckCount');
        
        if (!this.uploadArea || !this.fileInput || !this.resultsColumn) {
            console.error('[ConfigChecker] Required elements not found');
            return;
        }
        
        // Bind events
        this.bindEvents();
        
        console.info('[ConfigChecker] Initialized');
    }

    /**
     * Bind drag-and-drop and file input events
     */
    bindEvents() {
        // File input change
        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleFile(file);
            }
        });
        
        // Click to open file dialog
        this.uploadArea.addEventListener('click', () => {
            this.fileInput.click();
        });
        
        // Drag and drop events
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.uploadArea.classList.add('drag-over');
        });
        
        this.uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.uploadArea.classList.remove('drag-over');
        });
        
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.uploadArea.classList.remove('drag-over');
            
            const file = e.dataTransfer.files[0];
            if (file) {
                this.handleFile(file);
            }
        });
    }

    /**
     * Handle uploaded file
     */
    async handleFile(file) {
        console.info('[ConfigChecker] File uploaded:', file.name);
        
        // Validate file
        if (!file.name.endsWith('.vdf') && !file.name.endsWith('.cfg')) {
            alert('Пожалуйста, загрузите файл config.vdf или config.cfg');
            return;
        }
        
        // Show processing state
        this.showProcessing();
        
        try {
            // Read file content
            const content = await this.readFile(file);
            
            // Parse Steam IDs from config
            const steamIds = this.parseSteamIds(content);
            
            console.info('[ConfigChecker] Found Steam IDs:', steamIds.length);
            
            if (steamIds.length === 0) {
                alert('В файле не найдено Steam ID');
                this.showUploadArea();
                return;
            }
            
            // Check bans for each Steam ID
            const results = await this.checkBans(steamIds);
            
            // Render results
            this.renderResults(results);
            
        } catch (error) {
            console.error('[ConfigChecker] Error processing file:', error);
            alert('Ошибка при обработке файла');
            this.showUploadArea();
        }
    }

    /**
     * Read file content
     */
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            
            reader.onerror = (e) => {
                reject(new Error('Failed to read file'));
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * Parse Steam IDs from config.vdf content
     * Looks for patterns like "7656119XXXXXXXXXX"
     */
    parseSteamIds(content) {
        const steamIdPattern = /7656119\d{10}/g;
        const matches = content.match(steamIdPattern);
        
        if (!matches) {
            return [];
        }
        
        // Remove duplicates
        return [...new Set(matches)];
    }

    /**
     * Check bans for Steam IDs using Fear API and UMA.SU API
     */
    async checkBans(steamIds) {
        const results = [];
        
        for (const steamId of steamIds) {
            try {
                // Check Fear bans
                const fearBan = await this.checkFearBan(steamId);
                
                // Check UMA.SU bans
                const umaBan = await this.checkUmaBan(steamId);
                
                results.push({
                    steamId: steamId,
                    fearBanned: fearBan.banned,
                    fearReason: fearBan.reason,
                    umaBanned: umaBan.banned,
                    umaReason: umaBan.reason,
                    isBanned: fearBan.banned || umaBan.banned
                });
                
            } catch (error) {
                console.error(`[ConfigChecker] Error checking ${steamId}:`, error);
                results.push({
                    steamId: steamId,
                    fearBanned: false,
                    fearReason: 'Ошибка проверки',
                    umaBanned: false,
                    umaReason: 'Ошибка проверки',
                    isBanned: false
                });
            }
        }
        
        return results;
    }

    /**
     * Check Fear ban status
     */
    async checkFearBan(steamId) {
        try {
            const response = await fetch(`${this.apiClient.config.fearApiBase}/punishments/search?q=${steamId}&page=1&limit=10&type=1`, {
                method: 'GET',
                mode: 'cors',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                console.warn(`[ConfigChecker] Fear API returned ${response.status} for ${steamId}`);
                return { banned: false, reason: 'Не забанен' };
            }
            
            const data = await response.json();
            
            // Check if any bans found in punishments array
            if (data && data.punishments && Array.isArray(data.punishments) && data.punishments.length > 0) {
                // Found ban(s)
                const ban = data.punishments[0]; // Get first ban
                const reason = ban.reason || 'Забанен';
                const status = ban.status; // 1 = active, 0 = expired
                
                if (status === 1) {
                    return {
                        banned: true,
                        reason: reason
                    };
                } else {
                    return {
                        banned: false,
                        reason: 'Бан истек'
                    };
                }
            } else {
                // No bans found
                return { banned: false, reason: 'Не забанен' };
            }
        } catch (error) {
            console.warn('[ConfigChecker] Fear API check failed:', error);
            return { banned: false, reason: 'Ошибка проверки' };
        }
    }

    /**
     * Check UMA.SU ban status via WebSocket
     */
    async checkUmaBan(steamId) {
        return new Promise((resolve) => {
            try {
                // Create WebSocket connection
                const ws = new WebSocket('wss://yooma.su/api');
                
                // Set timeout for connection
                const timeout = setTimeout(() => {
                    ws.close();
                    resolve({ banned: false, reason: 'Таймаут соединения' });
                }, 10000);
                
                let requestSent = false;
                
                ws.onopen = () => {
                    console.info('[ConfigChecker] UMA.SU WebSocket connected');
                };
                
                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        
                        console.info('[ConfigChecker] UMA.SU response:', data);
                        
                        // If server sends get_type, respond and then send our request
                        if (data.type === 'get_type' && !requestSent) {
                            requestSent = true;
                            
                            // Send request to get punishments
                            const request = {
                                type: 'get_punishments',
                                steamid: steamId
                            };
                            
                            console.info('[ConfigChecker] Sending UMA.SU request:', request);
                            ws.send(JSON.stringify(request));
                            return;
                        }
                        
                        // Check if this is the punishments response
                        if (data.type === 'get_punishments' || data.punishments) {
                            clearTimeout(timeout);
                            
                            // Check if punishments array exists and has items
                            if (data.punishments && Array.isArray(data.punishments) && data.punishments.length > 0) {
                                // Filter punishments by our steamid
                                const userBans = data.punishments.filter(ban => ban.steamid === steamId);
                                
                                if (userBans.length > 0) {
                                    // Found ban(s) for this user
                                    const ban = userBans[0];
                                    const reason = ban.reason || 'Забанен';
                                    const expires = ban.expires;
                                    const now = Math.floor(Date.now() / 1000);
                                    
                                    // Check if ban is still active
                                    if (expires > now) {
                                        resolve({
                                            banned: true,
                                            reason: reason
                                        });
                                    } else {
                                        resolve({
                                            banned: false,
                                            reason: 'Бан истек'
                                        });
                                    }
                                } else {
                                    // No bans found for this user
                                    resolve({ banned: false, reason: 'Не забанен' });
                                }
                            } else {
                                // No bans found
                                resolve({ banned: false, reason: 'Не забанен' });
                            }
                            
                            ws.close();
                        }
                    } catch (error) {
                        console.error('[ConfigChecker] Error parsing UMA.SU response:', error);
                        clearTimeout(timeout);
                        resolve({ banned: false, reason: 'Ошибка парсинга' });
                        ws.close();
                    }
                };
                
                ws.onerror = (error) => {
                    clearTimeout(timeout);
                    console.error('[ConfigChecker] UMA.SU WebSocket error:', error);
                    resolve({ banned: false, reason: 'Ошибка соединения' });
                    ws.close();
                };
                
                ws.onclose = () => {
                    clearTimeout(timeout);
                };
                
            } catch (error) {
                console.warn('[ConfigChecker] UMA.SU check failed:', error);
                resolve({ banned: false, reason: 'Ошибка проверки' });
            }
        });
    }

    /**
     * Show processing state
     */
    showProcessing() {
        this.uploadArea.style.display = 'none';
        this.resultsColumn.style.display = 'flex';
        this.resultsColumn.innerHTML = `
            <div class="config-processing">
                <div class="processing-spinner"></div>
                <p class="processing-text">Обработка файла...</p>
                <p class="processing-subtext">Проверяем игроков на баны</p>
            </div>
        `;
    }

    /**
     * Show upload area
     */
    showUploadArea() {
        this.uploadArea.style.display = 'flex';
        this.resultsColumn.style.display = 'none';
        this.resultsColumn.innerHTML = '';
        this.updateCount(0);
    }

    /**
     * Render check results
     */
    renderResults(results) {
        this.resultsColumn.innerHTML = '';
        this.resultsColumn.style.display = 'flex';
        this.uploadArea.style.display = 'none';
        
        // Count banned players
        const bannedCount = results.filter(r => r.isBanned).length;
        this.updateCount(bannedCount);
        
        // Sort: banned first
        results.sort((a, b) => {
            if (a.isBanned && !b.isBanned) return -1;
            if (!a.isBanned && b.isBanned) return 1;
            return 0;
        });
        
        // Render each result
        results.forEach(result => {
            const card = this.createResultCard(result);
            this.resultsColumn.appendChild(card);
        });
        
        // Add reset button
        const resetButton = document.createElement('button');
        resetButton.className = 'upload-button';
        resetButton.textContent = 'Проверить другой файл';
        resetButton.style.marginTop = '20px';
        resetButton.style.alignSelf = 'center';
        resetButton.onclick = () => this.showUploadArea();
        
        this.resultsColumn.appendChild(resetButton);
    }

    /**
     * Create result card element
     */
    createResultCard(result) {
        const card = document.createElement('div');
        card.className = `ban-status-card ${result.isBanned ? 'banned' : 'clean'}`;
        
        card.innerHTML = `
            <div class="ban-status-header">
                <span class="ban-status-steamid">${result.steamId}</span>
                <span class="ban-status-badge ${result.isBanned ? 'banned' : 'clean'}">
                    ${result.isBanned ? '🚫 Забанен' : '✅ Чист'}
                </span>
            </div>
            <div class="ban-status-details">
                <div class="ban-detail-row">
                    <span class="ban-detail-label">Fear:</span>
                    <span class="ban-detail-value ${result.fearBanned ? 'banned' : 'clean'}">
                        ${result.fearBanned ? '❌ ' + result.fearReason : '✅ Не забанен'}
                    </span>
                </div>
                <div class="ban-detail-row">
                    <span class="ban-detail-label">UMA.SU:</span>
                    <span class="ban-detail-value ${result.umaBanned ? 'banned' : 'clean'}">
                        ${result.umaBanned ? '❌ ' + result.umaReason : '✅ Не забанен'}
                    </span>
                </div>
            </div>
        `;
        
        return card;
    }

    /**
     * Update count badge
     */
    updateCount(count) {
        if (this.countElement) {
            this.countElement.textContent = count;
        }
    }
}
