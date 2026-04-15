/**
 * Renderer class for transforming data into DOM elements
 * Validates: Requirements 3.1, 3.8-3.9, 4.1, 4.4-4.5, 5.1, 5.4, 5.8, 6.1-6.5, 7.3, 10.1, 14.7-14.8
 */
class Renderer {
    constructor(timeFormatter) {
        this.timeFormatter = timeFormatter;
        
        // Store references to column elements
        this.newAccountsColumn = document.getElementById('new-accounts-column');
        this.vacBansColumn = document.getElementById('vac-bans-column');
        this.reportsColumn = document.getElementById('reports-column');
        
        // Store references to header elements
        this.serverCountEl = document.getElementById('serverCount');
        this.playerCountEl = document.getElementById('playerCount');
        this.lastUpdateEl = document.getElementById('lastUpdate');
        
        // Store references to count badges
        this.newAccountsCountEl = document.getElementById('newAccountsCount');
        this.vacBansCountEl = document.getElementById('vacBansCount');
        this.reportsCountEl = document.getElementById('reportsCount');
    }

    /**
     * Render player card
     * @param {Object} playerData - Object containing player, server, steamProfile, timecreated
     * @returns {HTMLElement} Player card DOM element
     * 
     * Validates: Requirements 3.9, 4.5, 14.7
     */
    renderPlayerCard(playerData) {
        const card = document.createElement('div');
        card.className = 'player-card';
        
        // Extract data
        const player = playerData.player || playerData;
        const server = playerData.server || null;
        const steamProfile = playerData.steamProfile || player.steamProfile || null;
        
        // Use avatar and nickname from Fear API (live_data)
        const defaultAvatar = 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';
        const avatarUrl = player.avatar || steamProfile?.avatarfull || steamProfile?.avatarmedium || defaultAvatar;
        const displayName = player.nickname || steamProfile?.personaname || 'Unknown Player';
        const steamId = player.steam_id || player.steamid || 'N/A';
        
        // Account date info
        let accountDateInfoHtml = '';
        const timecreated = playerData.timecreated || steamProfile?.timecreated;
        if (timecreated) {
            const dateObj = this.timeFormatter.formatAccountDate(timecreated);
            const title = `Аккаунт создан: ${dateObj.fullDate}${dateObj.relativeTime ? ' ' + dateObj.relativeTime : ''}`;
            accountDateInfoHtml = `
                <div class="account-date-info" title="${title}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <div class="account-date-text">
                        <span class="account-date-full">${dateObj.fullDate}</span>
                        ${dateObj.relativeTime ? `<span class="account-date-relative">${dateObj.relativeTime}</span>` : ''}
                    </div>
                </div>
            `;
        } else {
            accountDateInfoHtml = `
                <div class="account-date-info no-profile">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>Профиль скрыт</span>
                </div>
            `;
        }
        
        // Server info (if available)
        let serverInfoRightHtml = '';
        if (server) {
            const serverIp = server.ip || 'N/A';
            const serverPort = server.port || 'N/A';
            const serverName = server.site_name || server.name || 'Неизвестный сервер';
            const serverLocation = server.location || 'N/A';
            const serverMap = server.live_data?.map_name || server.map || 'N/A';
            const gameType = server.mode?.name === 'CS:GO' ? 'CS:GO' : 'CS2';
            const gameTypeClass = gameType === 'CS:GO' ? 'game-type-csgo' : 'game-type-cs2';
            
            serverInfoRightHtml = `
                <div class="server-info-right ${gameTypeClass}">
                    <div class="game-type-badge">
                        <span class="game-type-label">${gameType}</span>
                    </div>
                    <div class="server-details-compact">
                        <div class="server-detail-line">${this.escapeHtml(serverName)}</div>
                        <div class="server-detail-line">📍${this.escapeHtml(serverLocation)} 🗺️${this.escapeHtml(serverMap)}</div>
                        <div class="server-detail-line">🌐${serverIp}:${serverPort}</div>
                    </div>
                </div>
            `;
        }
        
        // Player actions with server buttons
        let playerActionsHtml = '';
        if (server) {
            const serverIp = server.ip || '';
            const serverPort = server.port || '';
            playerActionsHtml = `
                <div class="player-actions">
                    <div class="btn-group">
                        <button class="btn btn-compact" onclick="window.open('https://steamcommunity.com/profiles/${steamId}', '_blank')" title="Профиль Steam">
                            <span>Профиль Steam</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </button>
                        <button class="btn btn-compact" onclick="window.open('https://fearproject.ru/profile/${steamId}', '_blank')" title="Профиль на FearProject">
                            <span>Профиль Fear</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </button>
                    </div>
                    <button class="btn" onclick="navigator.clipboard.writeText('${steamId}').then(() => alert('SteamID скопирован!'))">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        SteamID
                    </button>
                    <button class="btn" onclick="navigator.clipboard.writeText('${serverIp}:${serverPort}').then(() => alert('IP:PORT скопирован!'))">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                        </svg>
                        IP:PORT
                    </button>
                    <button class="btn btn-primary" onclick="window.location.href='steam://connect/${serverIp}:${serverPort}'">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                        </svg>
                        Подключиться
                    </button>
                </div>
            `;
        } else {
            playerActionsHtml = `
                <div class="player-actions">
                    <div class="btn-group">
                        <button class="btn btn-compact" onclick="window.open('https://steamcommunity.com/profiles/${steamId}', '_blank')" title="Профиль Steam">
                            <span>Профиль Steam</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </button>
                        <button class="btn btn-compact" onclick="window.open('https://fearproject.ru/profile/${steamId}', '_blank')" title="Профиль на FearProject">
                            <span>Профиль Fear</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </button>
                    </div>
                    <button class="btn" onclick="navigator.clipboard.writeText('${steamId}').then(() => alert('SteamID скопирован!'))">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        SteamID
                    </button>
                </div>
            `;
        }
        
        card.innerHTML = `
            <div class="player-header">
                <img src="${avatarUrl}" alt="${this.escapeHtml(displayName)}" class="player-avatar" onerror="this.src='${defaultAvatar}'">
                <div class="player-info">
                    <div class="player-name">${this.escapeHtml(displayName)}</div>
                    <div class="player-steamid">${steamId}</div>
                </div>
                ${accountDateInfoHtml}
                ${serverInfoRightHtml}
            </div>
            
            <div class="player-stats">
                <div class="stat-box">
                    <div class="stat-label-small">Убийства</div>
                    <div class="stat-value-small kills">${player.kills || 0}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label-small">Смерти</div>
                    <div class="stat-value-small deaths">${player.deaths || 0}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label-small">Пинг</div>
                    <div class="stat-value-small ping">${player.ping || 0}ms</div>
                </div>
            </div>
            
            ${playerActionsHtml}
        `;
        
        if (timecreated) {
            card.setAttribute('data-timecreated', String(timecreated));
        }
        
        return card;
    }

    /**
     * Render report card
     * @param {Object} report - Report object
     * @returns {HTMLElement} Report card DOM element
     * 
     * Validates: Requirements 5.4, 5.8, 14.8
     */
    renderReportCard(report) {
        const card = document.createElement('div');
        card.className = 'report-card player-card';
        
        // Extract data
        const violatorNick = report.violator?.nickname || report.violator_nickname || 'Unknown';
        const reporterNick = report.reporter?.nickname || report.reporter_nickname || 'Unknown';
        const reason = report.reason || 'Не указана';
        const date = report.date || report.created_at || new Date().toISOString();
        
        // Format date
        const formattedDate = this.timeFormatter.formatReportDate(date);
        
        // Avatars
        const violatorAvatar = report.violator?.avatar || 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg';
        const reporterAvatar = report.reporter?.avatar || 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg';
        
        card.innerHTML = `
            <div class="report-header">
                <div class="report-avatars">
                    <div class="report-avatar-container">
                        <img src="${reporterAvatar}" alt="${this.escapeHtml(reporterNick)}" class="report-avatar">
                        <span class="report-label">Отправитель</span>
                        <span class="report-name">${this.escapeHtml(reporterNick)}</span>
                    </div>
                    <span class="report-arrow">→</span>
                    <div class="report-avatar-container">
                        <img src="${violatorAvatar}" alt="${this.escapeHtml(violatorNick)}" class="report-avatar">
                        <span class="report-label report-label-reported">Нарушитель</span>
                        <span class="report-name">${this.escapeHtml(violatorNick)}</span>
                    </div>
                </div>
            </div>
            <div class="report-details">
                <div class="report-reason">
                    <span class="report-reason-label">Причина:</span>
                    <span class="report-reason-value">${this.escapeHtml(reason)}</span>
                </div>
                <div class="report-time">${formattedDate}</div>
            </div>
        `;
        
        return card;
    }

    /**
     * Render new accounts column
     * @param {Array} players - Array of player objects
     * 
     * Validates: Requirements 3.1, 3.8
     */
    renderNewAccountsColumn(players) {
        this.clearColumn(this.newAccountsColumn);
        
        if (!players || players.length === 0) {
            this.showEmptyState(this.newAccountsColumn, 'Нет новых аккаунтов');
            this.newAccountsCountEl.textContent = '0';
            return;
        }
        
        players.forEach(playerData => {
            // playerData contains: player, server, steamProfile, timecreated
            const card = this.renderPlayerCard(playerData);
            this.newAccountsColumn.appendChild(card);
        });
        
        this.newAccountsCountEl.textContent = players.length;
    }

    /**
     * Render VAC bans column
     * @param {Array} players - Array of VAC-banned player objects
     * 
     * Validates: Requirements 4.1, 4.4
     */
    renderVACBansColumn(players) {
        this.clearColumn(this.vacBansColumn);
        
        if (!players || players.length === 0) {
            this.showEmptyState(this.vacBansColumn, 'Чисто, банов нет');
            this.vacBansCountEl.textContent = '0';
            return;
        }
        
        players.forEach(playerData => {
            // playerData contains: player, server, steamProfile, timecreated
            const card = this.renderPlayerCard(playerData);
            this.vacBansColumn.appendChild(card);
        });
        
        this.vacBansCountEl.textContent = players.length;
    }

    /**
     * Render reports column
     * @param {Array} reports - Array of report objects
     * 
     * Validates: Requirements 5.1
     */
    renderReportsColumn(reports) {
        this.clearColumn(this.reportsColumn);
        
        if (!reports || reports.length === 0) {
            this.showEmptyState(this.reportsColumn, 'Нет репортов');
            this.reportsCountEl.textContent = '0';
            return;
        }
        
        reports.forEach(report => {
            const card = this.renderReportCard(report);
            this.reportsColumn.appendChild(card);
        });
        
        this.reportsCountEl.textContent = reports.length;
    }

    /**
     * Render statistics in header
     * @param {Object} stats - Statistics object with serverCount and playerCount
     * 
     * Validates: Requirements 6.1, 6.2
     */
    renderStatistics(stats) {
        this.serverCountEl.textContent = stats.totalServers || 0;
        this.playerCountEl.textContent = stats.totalPlayers || 0;
    }

    /**
     * Render last update timestamp
     * @param {Date} timestamp - Last update date
     * 
     * Validates: Requirements 6.4, 6.5
     */
    renderLastUpdate(timestamp) {
        const formatted = this.timeFormatter.formatLastUpdate(timestamp);
        this.lastUpdateEl.textContent = formatted;
    }

    /**
     * Show loading indicator
     * 
     * Validates: Requirements 7.3
     */
    showLoading() {
        // Add loading class to body or show loading overlay
        document.body.classList.add('loading');
        console.info('[Renderer] Loading indicator shown');
    }

    /**
     * Hide loading indicator
     * 
     * Validates: Requirements 7.3
     */
    hideLoading() {
        document.body.classList.remove('loading');
        console.info('[Renderer] Loading indicator hidden');
    }

    /**
     * Show error message
     * @param {string} message - Error message to display
     * 
     * Validates: Requirements 10.1
     */
    showError(message) {
        // Create error notification
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-notification';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
        
        console.warn('[Renderer] Error shown:', message);
    }

    /**
     * Clear column content
     * @param {HTMLElement} column - Column element to clear
     * 
     * Validates: Requirements 3.1, 4.1, 5.1
     */
    clearColumn(column) {
        if (column) {
            column.innerHTML = '';
        }
    }

    /**
     * Show empty state in column
     * @param {HTMLElement} column - Column element
     * @param {string} message - Empty state message
     */
    showEmptyState(column, message) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor" opacity="0.5"/>
            </svg>
            <p>${this.escapeHtml(message)}</p>
        `;
        column.appendChild(emptyState);
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
