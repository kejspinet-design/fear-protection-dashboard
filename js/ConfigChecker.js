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
            // TODO: Replace with actual Fear API endpoint for ban check
            // For now, return mock data
            const response = await fetch(`${this.apiClient.config.fearApiBase}/bans/${steamId}`);
            
            if (!response.ok) {
                return { banned: false, reason: 'Не забанен' };
            }
            
            const data = await response.json();
            return {
                banned: data.banned || false,
                reason: data.reason || 'Не забанен'
            };
        } catch (error) {
            console.warn('[ConfigChecker] Fear API check failed:', error);
            return { banned: false, reason: 'Не забанен' };
        }
    }

    /**
     * Check UMA.SU ban status
     */
    async checkUmaBan(steamId) {
        try {
            // TODO: Replace with actual UMA.SU API endpoint
            // For now, return mock data
            const response = await fetch(`https://uma.su/api/bans/${steamId}`);
            
            if (!response.ok) {
                return { banned: false, reason: 'Не забанен' };
            }
            
            const data = await response.json();
            return {
                banned: data.banned || false,
                reason: data.reason || 'Не забанен'
            };
        } catch (error) {
            console.warn('[ConfigChecker] UMA.SU API check failed:', error);
            return { banned: false, reason: 'Не забанен' };
        }
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
