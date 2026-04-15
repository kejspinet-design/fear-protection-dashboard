// Константы
const API_BASE_URL = window.location.origin; // Используем текущий домен
const API_STATUS_URL = `${API_BASE_URL}/api/status`;

// Debounce функция для оптимизации
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle функция для ограничения частоты вызовов
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Функция для получения toast сообщений
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// WebSocket подключение
let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 1000; // 1 секунда
const MAX_RECONNECT_DELAY = 30000; // 30 секунд
let reconnectTimeout = null;
let lastDataUpdateTime = null;
let noDataWarningShown = false;

// Константы для ленивой загрузки - увеличено для лучшей производительности
const ITEMS_PER_PAGE = 20; // Увеличено с 10 до 20
const RENDER_BUFFER = 5; // Буфер для предзагрузки

// Глобальное состояние
let state = {
    serversData: [],
    isUpdating: false,
    lastUpdateTime: null,
    allPlayersData: [], // Храним все данные для фильтрации
    searchQuery: '', // Поисковый запрос
    showUnconfigured: (() => {
        const saved = localStorage.getItem('showUnconfigured');
        return saved !== null ? saved === 'true' : true;
    })(),
    lastPlayersHash: null,
    playerCardsMap: new Map(),
    lastUpdateTimestamp: null,
    missingPlayersCount: new Map(),
    missingReportsCount: new Map(),
    // Виртуальный скроллинг
    allPlayersList: [],
    unconfiguredPlayersList: [],
    reportsList: [],
    virtualScroll: {
        all: { loaded: 0 },
        unconfigured: { loaded: 0 },
        reports: { loaded: 0 }
    },
    reportsLoaded: false,
    lastReportsHash: null,
    reportCardsMap: new Map(),
    activeReportsList: []
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    // Инициализируем observer для lazy loading при загрузке страницы
    initImageObserver();
    
    // Обновление времени в репортах каждую секунду (реальное время)
    setInterval(() => {
        const reportsContainer = document.getElementById('reportsPlayers');
        if (reportsContainer) {
            const visibleCards = reportsContainer.querySelectorAll('.report-card');
            visibleCards.forEach(card => {
                const createdAtMs = parseInt(card.getAttribute('data-report-created-at') || '0');
                if (!createdAtMs) return;
                const el = card.querySelector('.report-time');
                if (!el) return;
                const text = formatReportDate(createdAtMs);
                el.textContent = `Время: ${text}`;
            });
        }
    }, 1000); // Каждую секунду для реального времени
    
    // Обновление относительного времени создания аккаунтов
    setInterval(() => {
        const containers = [
            document.getElementById('allPlayers'),
            document.getElementById('unconfiguredPlayers'),
            document.getElementById('reportsPlayers')
        ];
        
        containers.forEach(container => {
            if (!container) return;
            const visibleCards = container.querySelectorAll('.player-card, .report-card');
            visibleCards.forEach(card => {
                const tc = parseInt(card.getAttribute('data-timecreated') || '0');
                if (!tc) return;
                
                // Обновляем новую структуру (account-date-relative)
                const relEl = card.querySelector('.account-date-relative');
                const dateObj = formatAccountDate(tc);
                if (relEl) {
                    relEl.textContent = dateObj.relativeTime;
                }
                
                // Обновляем title в account-date-info
                const accountDateInfo = card.querySelector('.account-date-info');
                if (accountDateInfo) {
                    accountDateInfo.setAttribute('title', 
                        dateObj.relativeTime ? 
                        `Аккаунт создан: ${dateObj.fullDate} ${dateObj.relativeTime}` : 
                        `Аккаунт создан: ${dateObj.fullDate}`
                    );
                }
                
                // Поддержка старой структуры для репортов (account-relative-time)
                const oldRelEl = card.querySelector('.account-relative-time');
                if (oldRelEl) {
                    oldRelEl.textContent = dateObj.relativeTime;
                }
                const accountContainer = card.querySelector('.account-created');
                if (accountContainer) {
                    accountContainer.setAttribute('title', 
                        dateObj.relativeTime ? 
                        `Аккаунт создан: ${dateObj.fullDate} ${dateObj.relativeTime}` : 
                        `Аккаунт создан: ${dateObj.fullDate}`
                    );
                }
            });
        });
    }, 1000); // Каждую секунду для точного отображения времени
});

async function initializeApp() {
    // Настраиваем UI
    setupEventListeners();
    updateStatus('Инициализация...', 'active');

    // Проверяем статус сервера
    try {
        const statusResponse = await fetch(API_STATUS_URL);
        const status = await statusResponse.json();

        if (!status.steamApiKeyConfigured) {
            updateStatus('Steam API ключ не настроен на сервере', 'error');
            showError('Steam API ключ не настроен. Проверьте файл .env на сервере и добавьте STEAM_API_KEY=ваш_ключ');
            return;
        }

        updateStatus('Работает', 'active');
        hideError();

        // Подключаемся к WebSocket
        connectWebSocket();

        // Загружаем репорты один раз при старте
        await loadReports();

    } catch (error) {
        console.error('Ошибка при проверке статуса сервера:', error);
        updateStatus('Ошибка подключения к серверу', 'error');
        showError('Не удалось подключиться к серверу. Убедитесь, что сервер запущен на http://localhost:3000');
    }
}

function setupEventListeners() {
    // Переключатель показа ненастроенных профилей
    const showUnconfiguredToggle = document.getElementById('showUnconfiguredToggle');
    if (showUnconfiguredToggle) {
        // Загружаем сохраненное состояние
        showUnconfiguredToggle.checked = state.showUnconfigured;
        
        showUnconfiguredToggle.addEventListener('change', (e) => {
            state.showUnconfigured = e.target.checked;
            // Сохраняем состояние в localStorage
            localStorage.setItem('showUnconfigured', e.target.checked.toString());
            // Пересоздаем карточки с учетом нового фильтра
            applyUnconfiguredFilter();
        });
    }

    // Поле поиска с debounce
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    
    if (searchInput) {
        // Отключаем autocomplete браузера и очищаем поле при загрузке
        searchInput.setAttribute('autocomplete', 'off');
        searchInput.value = '';
        state.searchQuery = '';
        if (clearSearchBtn) {
            clearSearchBtn.style.display = 'none';
        }
        
        const debouncedSearch = debounce((query) => {
            state.searchQuery = query;
            
            if (!query) {
                // Очищаем контейнер и перерисовываем с виртуальным скроллингом
                renderVirtualList('all');
                renderVirtualList('unconfigured');
            } else {
                // Фильтруем данные
                filterPlayerCards(query);
            }
        }, 300);
        
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            
            // Показываем/скрываем кнопку очистки
            if (clearSearchBtn) {
                clearSearchBtn.style.display = query ? 'flex' : 'none';
            }
            
            debouncedSearch(query);
        });
        
        // Фокус на поле поиска
        searchInput.addEventListener('focus', () => {
            searchInput.parentElement?.classList.add('focused');
        });
        
        searchInput.addEventListener('blur', () => {
            searchInput.parentElement?.classList.remove('focused');
        });
    }
    
    // Кнопка очистки поиска
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                state.searchQuery = '';
                clearSearchBtn.style.display = 'none';
                searchInput.focus();
                
                // Возвращаемся к виртуальному скроллингу
                renderVirtualList('all');
                renderVirtualList('unconfigured');
            }
        });
    }
    
    // Настройка виртуального скроллинга
    setupVirtualScrolling();
}

// Подключение к WebSocket с exponential backoff
function connectWebSocket() {
    if (socket && socket.connected) {
        return; // Уже подключен
    }
    
    // Очищаем предыдущий таймаут переподключения
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    
    socket = io(API_BASE_URL, {
        reconnection: false // Отключаем автоматическое переподключение, делаем вручную
    });
    
    socket.on('connect', () => {
        console.log('✅ WebSocket подключен');
        reconnectAttempts = 0; // Сбрасываем счетчик при успешном подключении
        updateStatus('Работает', 'active');
        hideError();
        noDataWarningShown = false;
        lastDataUpdateTime = Date.now();
    });
    
    socket.on('disconnect', (reason) => {
        console.log('❌ WebSocket отключен:', reason);
        updateStatus('Переподключение...', 'error');
        
        // Переподключение только если это не было инициировано клиентом
        if (reason !== 'io client disconnect') {
            scheduleReconnect();
        }
    });
    
    socket.on('connect_error', (error) => {
        console.error('Ошибка подключения WebSocket:', error);
        updateStatus('Ошибка подключения', 'error');
        scheduleReconnect();
    });
    
    // Получаем обновления данных
    socket.on('serversUpdate', (data) => {
        lastDataUpdateTime = Date.now();
        noDataWarningShown = false;
        handleServerUpdate(data, false); // false - не первое обновление
    });
    
    // Слушаем события репортов от Fear WebSocket
    socket.on('newReport', (report) => {
        console.log('📨 Новый репорт получен:', report);
        handleNewReport(report);
    });
    
    socket.on('reportAccepted', (data) => {
        console.log('📨 Репорт принят:', data);
        handleReportAccepted(data);
    });
    
    socket.on('error', (error) => {
        console.error('Ошибка WebSocket:', error);
        showError(`Ошибка: ${error.message || 'Неизвестная ошибка'}`);
    });


}

// Планирование переподключения с exponential backoff
function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ Превышено максимальное количество попыток переподключения');
        updateStatus('Не удалось подключиться', 'error');
        showError('Не удалось подключиться к серверу. Пожалуйста, обновите страницу.');
        return;
    }
    
    // Вычисляем задержку с exponential backoff
    const delay = Math.min(
        INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
        MAX_RECONNECT_DELAY
    );
    
    reconnectAttempts++;
    console.log(`🔄 Попытка переподключения ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} через ${delay}ms`);
    
    reconnectTimeout = setTimeout(() => {
        connectWebSocket();
    }, delay);
}

// Проверка отсутствия данных и показ заглушки
function checkDataAvailability() {
    const now = Date.now();
    const NO_DATA_THRESHOLD = 10000; // 10 секунд
    
    if (lastDataUpdateTime && (now - lastDataUpdateTime) > NO_DATA_THRESHOLD) {
        if (!noDataWarningShown) {
            showNoDataWarning();
            noDataWarningShown = true;
        }
    } else if (lastDataUpdateTime && (now - lastDataUpdateTime) <= NO_DATA_THRESHOLD) {
        if (noDataWarningShown) {
            hideNoDataWarning();
            noDataWarningShown = false;
        }
    }
}

// Показ предупреждения об отсутствии данных
function showNoDataWarning() {
    const allPlayersContainer = document.getElementById('allPlayers');
    const unconfiguredContainer = document.getElementById('unconfiguredPlayers');
    
    // Проверяем, есть ли уже предупреждение
    if (document.getElementById('noDataWarning')) return;
    
    const warning = document.createElement('div');
    warning.id = 'noDataWarning';
    warning.className = 'no-data-warning';
    warning.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>
            <strong>Ожидание данных с серверов...</strong>
            <p>Данные не обновлялись более 10 секунд. Проверьте подключение к серверу.</p>
        </div>
    `;
    
    if (allPlayersContainer && allPlayersContainer.children.length === 0) {
        allPlayersContainer.appendChild(warning);
    }
    
    if (unconfiguredContainer && unconfiguredContainer.children.length === 0) {
        unconfiguredContainer.appendChild(warning);
    }
}

// Скрытие предупреждения об отсутствии данных
function hideNoDataWarning() {
    const warning = document.getElementById('noDataWarning');
    if (warning) {
        warning.remove();
    }
}

// Запуск периодической проверки доступности данных
setInterval(checkDataAvailability, 2000); // Проверяем каждые 2 секунды

// Обработка обновлений через WebSocket (без throttle для мгновенного обновления)
function handleServerUpdate(data, isInitial = true) {
    state.serversData = data.servers || [];
    state.reportsList = data.reports || [];

    // Флаг, что репорты загружены
    if (data.reports && data.reports.length >= 0) {
        state.reportsLoaded = true;
    }
    
    // Логируем информацию о типах игр на серверах
    if (state.serversData.length > 0) {
        const gameTypes = state.serversData.reduce((acc, server) => {
            const gameType = server.mode?.name || 'Unknown';
            acc[gameType] = (acc[gameType] || 0) + 1;
            return acc;
        }, {});
        console.log('📊 Типы игр на серверах:', gameTypes);
    }

    // Обновление статистики
    updateStats(state.serversData);

    // Обновляем данные игроков
    updatePlayersData(state.serversData);
    
    // Обновляем счетчики секций
    updateSectionCounts();
    
    // Проверяем, есть ли уже карточки (первая загрузка или обновление)
    const allPlayersContainer = document.getElementById('allPlayers');
    const unconfiguredContainer = document.getElementById('unconfiguredPlayers');
    const hasExistingCards = allPlayersContainer && allPlayersContainer.children.length > 0;
    
    if (hasExistingCards) {
        // Обновление - используем синхронизацию с правильной сортировкой
        updateExistingCards(state.serversData);
    } else {
        // Первая загрузка - используем виртуальный скроллинг
        initVirtualList('all');
        initVirtualList('unconfigured');
    }

    // Отображаем репорты
    if (state.serversData && state.serversData.length > 0) {
        updateReportsData();
        initVirtualList('reports');
    }

    state.lastUpdateTime = new Date();
    state.lastUpdateTimestamp = Date.now();
    lastDataUpdateTime = Date.now();
    updateStatus('Работает', 'active');

    // Скрываем предупреждение
    if (noDataWarningShown) {
        hideNoDataWarning();
        noDataWarningShown = false;
    }
}

// Обработка нового репорта от Fear WebSocket
function handleNewReport(report) {
    console.log('✅ Новый репорт добавлен:', report.id);
    
    // Проверяем, есть ли уже такой репорт
    const exists = state.reportsList.some(r => r.id === report.id);
    if (exists) {
        console.log('⚠️  Репорт уже существует, пропускаем');
        return;
    }
    
    // Добавляем репорт в начало списка
    state.reportsList.unshift(report);
    
    // Обновляем activeReportsList (только активные игроки)
    updateReportsData();
    
    // Обновляем отображение через виртуальный скроллинг
    initVirtualList('reports');
    
    // Показываем уведомление
    showToast('Новый репорт получен', 'info');
}

// Обработка принятого репорта от Fear WebSocket
function handleReportAccepted(data) {
    const { id: reportId } = data;
    console.log('✅ Репорт принят, удаляем из списка:', reportId);
    
    // Удаляем репорт из списка
    state.reportsList = state.reportsList.filter(r => r.id !== reportId);
    
    // Обновляем activeReportsList
    updateReportsData();
    
    // Обновляем отображение через виртуальный скроллинг
    initVirtualList('reports');
    
    // Показываем уведомление
    showToast('Репорт был принят', 'success');
}

// Функция для создания хеша данных игроков
// Включаем только действительно важные данные, которые влияют на отображение
// Сортируем для стабильности хеша
function createPlayersHash(serversData) {
    const relevantData = serversData
        .map(server => ({
            id: server.id,
            players: (server.live_data?.players || [])
                .filter(p => p.steam_id) // Фильтруем только игроков с steam_id
                .map(p => ({
                    steam_id: p.steam_id,
                    // Включаем только данные, которые влияют на отображение карточки
                    nickname: p.nickname || '',
                    kills: p.kills || 0,
                    deaths: p.deaths || 0,
                    ping: p.ping || 0,
                    profilestate: p.steamProfile?.profilestate,
                    timecreated: p.steamProfile?.timecreated || 0,
                    personaname: p.steamProfile?.personaname || ''
                }))
                .sort((a, b) => (a.steam_id || '').localeCompare(b.steam_id || '')) // Сортируем по steam_id для стабильности
        }))
        .filter(server => server.players.length > 0) // Убираем серверы без игроков
        .sort((a, b) => (a.id || 0) - (b.id || 0)); // Сортируем серверы по id
    
    return JSON.stringify(relevantData);
}

// Функция для создания хеша данных репортов (улучшенная)
function createReportsHash(activeReportsList) {
    const relevantData = activeReportsList
        .map(report => ({
            id: report.id,
            intruder_steamid: report.intruder_steamid,
            sender_steamid: report.sender_steamid,
            reason: report.reason || '',
            server_name: report.server_name || '',
            sender: report.sender || '',
            intruder: report.intruder || '',
            created_at: report.created_at,
            sender_avatar: report.sender_avatar || '',
            intruder_avatar: report.intruder_avatar || '',
            server_ip: report.server_ip || '',
            server_port: report.server_port || ''
        }))
        .sort((a, b) => {
            // Сортируем по времени создания для стабильного хеша
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            if (timeA !== timeB) return timeB - timeA; // Новые сначала
            return (a.id || 0) - (b.id || 0);
        });

    return JSON.stringify(relevantData);
}

// Функция для обновления данных репортов без перерисовки
function updateReportsData() {
    const activePlayersSet = new Set();
    state.serversData.forEach(server => {
        if (server.live_data && server.live_data.players) {
            server.live_data.players.forEach(player => {
                if (player.steam_id) {
                    activePlayersSet.add(normalizeSteamId(player.steam_id));
                }
            });
        }
    });

    state.activeReportsList = (state.reportsList || []).filter(report => {
        const normalizedReportSteamId = normalizeSteamId(report.intruder_steamid);
        return activePlayersSet.has(normalizedReportSteamId);
    });

    // Обновляем счётчик
    const reportsCountEl = document.getElementById('reportsCount');
    if (reportsCountEl) {
        reportsCountEl.textContent = String(state.activeReportsList.length);
    }
}

// Функция для обновления данных без перерисовки карточек
function updatePlayersData(serversData) {
    // Собираем ВСЕХ игроков
    const unconfiguredPlayers = [];
    const allPlayers = [];

    serversData.forEach(server => {
        if (server.live_data && server.live_data.players) {
            server.live_data.players.forEach(player => {
                if (!player.steam_id) return;

                const steamProfile = player.steamProfile;
                
                if (steamProfile) {
                    const timecreated = steamProfile.timecreated || 0;
                    const isUnconfigured = steamProfile.profilestate === 0 || 
                                          steamProfile.profilestate === undefined;
                    
                    const playerData = {
                        player,
                        server,
                        steamProfile,
                        timecreated
                    };

                    if (isUnconfigured) {
                        unconfiguredPlayers.push(playerData);
                    }
                    
                    allPlayers.push(playerData);
                } else {
                    allPlayers.push({
                        player,
                        server,
                        steamProfile: null,
                        timecreated: 0
                    });
                }
            });
        }
    });

    // Сортировка
    unconfiguredPlayers.sort((a, b) => (b.timecreated || 0) - (a.timecreated || 0));
    allPlayers.sort((a, b) => (b.timecreated || 0) - (a.timecreated || 0));

    // Обновляем списки в state
    state.allPlayersList = allPlayers;
    state.unconfiguredPlayersList = unconfiguredPlayers;
    
    // Обновляем счетчики
    const allPlayersCountEl = document.getElementById('allPlayersCount');
    if (allPlayersCountEl) {
        allPlayersCountEl.textContent = allPlayers.length;
    }
    
    const unconfiguredCountEl = document.getElementById('unconfiguredCount');
    if (unconfiguredCountEl) {
        unconfiguredCountEl.textContent = unconfiguredPlayers.length;
    }
}

function displayPlayers(serversData) {
    const unconfiguredContainer = document.getElementById('unconfiguredPlayers');
    const allPlayersContainer = document.getElementById('allPlayers');
    const emptyUnconfigured = document.getElementById('emptyUnconfigured');
    const emptyAllPlayers = document.getElementById('emptyAllPlayers');
    
    if (!unconfiguredContainer || !allPlayersContainer) return;

    // Всегда пересобираем и пересортировываем списки игроков
    const allPlayers = [];
    const unconfiguredPlayers = [];

    serversData.forEach(server => {
        if (server.live_data && server.live_data.players) {
            server.live_data.players.forEach(player => {
                if (!player.steam_id) return;

                const steamProfile = state.steamProfiles.get(player.steam_id);
                const isUnconfigured = steamProfile && (
                    steamProfile.profilestate === 0 || 
                    steamProfile.profilestate === undefined
                );

                const playerData = {
                    player,
                    server,
                    steamProfile: steamProfile || null,
                    timecreated: steamProfile?.timecreated || 0
                };

                if (isUnconfigured) {
                    unconfiguredPlayers.push(playerData);
                }
                allPlayers.push(playerData);
            });
        }
    });

    // Сортировка по времени создания аккаунта (новые сначала)
    unconfiguredPlayers.sort((a, b) => (b.timecreated || 0) - (a.timecreated || 0));
    allPlayers.sort((a, b) => (b.timecreated || 0) - (a.timecreated || 0));

    // Обновляем списки в state
    state.allPlayersList = allPlayers;
    state.unconfiguredPlayersList = unconfiguredPlayers;
    
    // Обновляем счетчики
    const allPlayersCountEl = document.getElementById('allPlayersCount');
    if (allPlayersCountEl) {
        allPlayersCountEl.textContent = allPlayers.length;
    }
    
    const unconfiguredCountEl = document.getElementById('unconfiguredCount');
    if (unconfiguredCountEl) {
        unconfiguredCountEl.textContent = unconfiguredPlayers.length;
    }
    
    // Проверяем, есть ли уже карточки
    const hasExistingCards = allPlayersContainer.querySelectorAll('.player-card').length > 0;
    
    if (hasExistingCards) {
        // Обновляем существующие карточки и синхронизируем с новыми данными
        // syncCardsWithData теперь сама применяет поиск если он активен
        syncCardsWithData(allPlayersContainer, allPlayers, false);
        syncCardsWithData(unconfiguredContainer, unconfiguredPlayers, true);
        return;
    }
    
    // Первая загрузка - создаем карточки через виртуальный скроллинг
    state.allPlayersLoaded = 0;
    state.unconfiguredPlayersLoaded = 0;
    
    // Сохраняем позицию прокрутки перед обновлением
    const allPlayersScrollTop = allPlayersContainer.scrollTop;
    const unconfiguredScrollTop = unconfiguredContainer.scrollTop;
    
    // Сбрасываем счетчики загруженных элементов при обновлении данных
    state.allPlayersLoaded = 0;
    state.unconfiguredPlayersLoaded = 0;

    // Синхронизируем переключатель с сохраненным состоянием перед рендерингом
    const showUnconfiguredToggle = document.getElementById('showUnconfiguredToggle');
    if (showUnconfiguredToggle) {
        showUnconfiguredToggle.checked = state.showUnconfigured;
    }

    // Настраиваем обработчики прокрутки (только один раз)
    if (!state.scrollHandlersSetup) {
        setupScrollHandlers();
        state.scrollHandlersSetup = true;
    }
    
    // Быстрая очистка без анимации для избежания мерцания
    // Используем прямое удаление, так как данные изменились и нужно обновить
    allPlayersContainer.innerHTML = '';
    unconfiguredContainer.innerHTML = '';
    
    // Восстанавливаем поисковый запрос в поле ввода, если он был
    const searchInput = document.getElementById('searchInput');
    if (searchInput && state.searchQuery) {
        searchInput.value = state.searchQuery;
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        if (clearSearchBtn) {
            clearSearchBtn.style.display = state.searchQuery ? 'flex' : 'none';
        }
    }
    
    // Загружаем первые элементы сразу
    loadMorePlayers('all', true);
    loadMorePlayers('unconfigured', true);
    
    // Восстанавливаем позицию прокрутки после загрузки
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (allPlayersScrollTop > 0 && allPlayersContainer.scrollHeight >= allPlayersScrollTop) {
                allPlayersContainer.scrollTop = allPlayersScrollTop;
            }
            if (unconfiguredScrollTop > 0 && unconfiguredContainer.scrollHeight >= unconfiguredScrollTop) {
                unconfiguredContainer.scrollTop = unconfiguredScrollTop;
            }
        });
    });
    
    // Проверяем пустые состояния
    if (state.allPlayersList.length === 0) {
        if (emptyAllPlayers) {
            emptyAllPlayers.style.display = 'flex';
        }
    } else {
        if (emptyAllPlayers) {
            emptyAllPlayers.style.display = 'none';
        }
    }
    
    if (state.unconfiguredPlayersList.length === 0) {
        if (emptyUnconfigured) {
            emptyUnconfigured.style.display = 'flex';
        }
    } else {
        if (emptyUnconfigured) {
            emptyUnconfigured.style.display = 'none';
        }
    }
    
    // Загрузка элементов происходит в requestAnimationFrame выше
    // loadMorePlayers теперь сама применяет поиск если он активен
}

function createPlayerCard(player, server, steamProfile, isUnconfigured) {
    const card = document.createElement('div');
    card.className = `player-card ${isUnconfigured ? 'unconfigured-player' : ''}`;
    
    // Добавляем уникальный ID для инкрементального обновления
    card.setAttribute('data-player-id', player.steam_id || '');
    
    // Данные для поиска - сохраняем в data-атрибут
    const searchData = [
        player.nickname || '',
        player.steam_id || '',
        steamProfile?.personaname || ''
    ].join(' ').toLowerCase();
    card.setAttribute('data-search', searchData);
    
    // Проверка различий
    const differences = checkPlayerDifferences(player, steamProfile);
    if (differences.hasDifferences) {
        card.classList.add('has-difference');
    }

    // Аватары: если отличаются, показываем оба
    const defaultAvatar = 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';
    let serverAvatarUrl = player.avatar || defaultAvatar;
    let steamAvatarUrl = steamProfile?.avatarfull || defaultAvatar;
    let avatarUrl = steamAvatarUrl; // По умолчанию показываем Steam аватар
    
    // Никнеймы: если отличаются, показываем оба
    const serverNickname = player.nickname || 'Неизвестно';
    let steamDisplayName = steamProfile?.personaname || serverNickname;
    let displayName = steamDisplayName; // По умолчанию показываем Steam ник

    // Steam аккаунт создан - для центральной части
    let accountDateInfoHtml = '';
    if (steamProfile && steamProfile.timecreated) {
        const dateObj = formatAccountDate(steamProfile.timecreated);
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

    // Информация о сервере (используем правильные поля из API)
    const serverIp = server.ip || 'N/A';
    const serverPort = server.port || 'N/A';
    const serverName = server.site_name || server.name || 'Неизвестный сервер';
    const serverLocation = server.location || 'N/A';
    const serverMap = server.live_data?.map_name || server.map || 'N/A';
    
    // Определяем тип игры (CS2 или CS:GO)
    const gameType = server.mode?.name === 'CS:GO' ? 'CS:GO' : 'CS2';
    const gameTypeClass = gameType === 'CS:GO' ? 'game-type-csgo' : 'game-type-cs2';

    // Информация о сервере для правой части
    const serverInfoRightHtml = `
        <div class="server-info-right ${gameTypeClass}">
            <div class="game-type-badge">
                <img src="assets/${gameType === 'CS2' ? 'counter-strike-2.svg' : 'counter-strike-go.svg'}" alt="${gameType}" class="game-type-icon">
                <span class="game-type-label">${gameType}</span>
            </div>
            <div class="server-details-compact">
                <div class="server-detail-line">${escapeHtml(serverName)}</div>
                <div class="server-detail-line">📍${escapeHtml(serverLocation)} 🗺️${escapeHtml(serverMap)}</div>
                <div class="server-detail-line">🌐${serverIp}:${serverPort}</div>
            </div>
        </div>
    `;

    // Блок с различиями (только если есть реальные различия)
    let differencesHeaderHtml = '';
    if (differences.hasDifferences) {
        // Новая структура: FearProject слева, Steam справа
        differencesHeaderHtml = `
            <div class="player-header-differences">
                <div class="player-data-side fear-side">
                    <div class="data-side-label">FearProject</div>
                    <img data-src="${serverAvatarUrl}" alt="FearProject" class="player-avatar lazy" onerror="this.src='${defaultAvatar}'">
                    <div class="player-info">
                        <div class="player-name">${escapeHtml(serverNickname)}</div>
                        <div class="player-steamid">${player.steam_id || 'N/A'}</div>
                    </div>
                </div>
                <div class="difference-indicator">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 8 21 12 17 16"></polyline>
                        <polyline points="7 16 3 12 7 8"></polyline>
                        <line x1="21" y1="12" x2="3" y2="12"></line>
                    </svg>
                </div>
                <div class="player-data-side steam-side">
                    <div class="data-side-label">Steam</div>
                    <img data-src="${steamAvatarUrl}" alt="Steam" class="player-avatar lazy" onerror="this.src='${defaultAvatar}'">
                    <div class="player-info">
                        <div class="player-name">${escapeHtml(steamProfile?.personaname || 'N/A')}</div>
                        <div class="player-steamid">${player.steam_id || 'N/A'}</div>
                    </div>
                </div>
            </div>
            <div class="time-server-row">
                ${accountDateInfoHtml}
                ${serverInfoRightHtml}
            </div>
        `;
    }

    // Если есть различия, не показываем стандартный header
    const showHeader = !differences.hasDifferences;
    const headerHtml = showHeader ? `
        <div class="player-header">
            <img data-src="${avatarUrl}" alt="${escapeHtml(displayName)}" class="player-avatar lazy" onerror="this.src='${defaultAvatar}'">
            <div class="player-info">
                <div class="player-name">${escapeHtml(displayName)}</div>
                <div class="player-steamid">${player.steam_id || 'N/A'}</div>
            </div>
            ${accountDateInfoHtml}
            ${serverInfoRightHtml}
        </div>
    ` : differencesHeaderHtml;
    
    // Steam ID внизу (показываем только если есть различия)
    const steamIdBottomHtml = '';

    card.innerHTML = `
        ${headerHtml}
        
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
        
        <div class="player-actions">
            <div class="btn-group">
                <button class="btn btn-compact" onclick="openSteamProfile('${player.steam_id || ''}')" title="Профиль Steam">
                    <span>Профиль Steam</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </button>
                <button class="btn btn-compact" onclick="openFearProfile('${player.steam_id || ''}')" title="Профиль на FearProject">
                    <span>Профиль Fear</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </button>
            </div>
            <button class="btn" onclick="copySteamID('${player.steam_id || ''}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                SteamID
            </button>
            <button class="btn" onclick="copyServerAddress('${serverIp}', '${serverPort}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
                IP:PORT
            </button>
            <button class="btn btn-primary" onclick="connectToServer('${serverIp}', '${serverPort}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                Подключиться
            </button>
        </div>
    `;

    if (steamProfile && steamProfile.timecreated) {
        card.setAttribute('data-timecreated', String(steamProfile.timecreated));
    }

    // Сохраняем SteamID в data-атрибут для быстрого поиска (нормализованный)
    const normalizedSteamId = normalizeSteamId(player.steam_id);
    card.setAttribute('data-steam-id', normalizedSteamId);
    card.setAttribute('data-timecreated', String(steamProfile?.timecreated || 0));
    // Устанавливаем время последнего обновления даты при создании карточки
    card.setAttribute('data-last-update-time', String(Date.now()));
    
    // Инициализируем lazy loading для изображений в карточке
    initLazyLoadForCard(card);
    
    // Добавляем обработчики клика для копирования имени и Steam ID
    const playerNameEl = card.querySelector('.player-name');
    const playerSteamIdEl = card.querySelector('.player-steamid');
    
    if (playerNameEl) {
        playerNameEl.addEventListener('click', function(e) {
            e.stopPropagation();
            const text = this.textContent.trim();
            copyToClipboardWithAnimation(text, this);
        });
    }
    
    if (playerSteamIdEl) {
        playerSteamIdEl.addEventListener('click', function(e) {
            e.stopPropagation();
            const text = this.textContent.trim();
            copyToClipboardWithAnimation(text, this);
        });
    }
    
    return card;
}

// Инициализация Intersection Observer для lazy loading
let imageObserver = null;

function initImageObserver() {
    if (imageObserver) return; // Observer уже создан
    
    imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const dataSrc = img.getAttribute('data-src');
                if (dataSrc) {
                    img.src = dataSrc;
                    img.classList.remove('lazy');
                    img.classList.add('lazy-loaded');
                    imageObserver.unobserve(img);
                }
            }
        });
    }, {
        rootMargin: '50px' // Начинаем загрузку за 50px до появления в viewport
    });
}

// Инициализация lazy loading для изображений в карточке
function initLazyLoadForCard(card) {
    if (!imageObserver) {
        initImageObserver();
    }
    
    const lazyImages = card.querySelectorAll('img.lazy');
    lazyImages.forEach(img => {
        imageObserver.observe(img);
    });
}

// Нормализация SteamID для консистентности
function normalizeSteamId(steamId) {
    if (!steamId) return '';
    return String(steamId).trim();
}

// Функция для синхронизации карточек с отсортированными данными
function syncCardsWithData(container, playersList, isUnconfigured) {
    if (!container) return;
    
    // Сохраняем текущую позицию скролла
    const scrollTop = container.scrollTop;
    
    // ОГРАНИЧЕНИЕ: показываем только первые 10 карточек
    const MAX_CARDS = 10;
    
    // Фильтруем список для контейнера "Все игроки"
    let filteredPlayersList = playersList;
    if (container.id === 'allPlayers') {
        filteredPlayersList = playersList.filter(({ player, steamProfile }) => {
            // Проверяем фильтр ненастроенных профилей
            const playerIsUnconfigured = steamProfile && (
                steamProfile.profilestate === 0 || 
                steamProfile.profilestate === undefined
            );
            
            // Если фильтр выключен и профиль ненастроенный - скрываем
            if (!state.showUnconfigured && playerIsUnconfigured) {
                return false;
            }
            
            // Если активен поиск - проверяем соответствие
            if (state.searchQuery) {
                return matchesSearchQuery(player, steamProfile, state.searchQuery);
            }
            
            return true;
        });
    }
    
    const limitedPlayersList = filteredPlayersList.slice(0, MAX_CARDS);
    
    // Создаем Map из текущих данных для быстрого доступа
    const playersMap = new Map();
    limitedPlayersList.forEach((playerData, index) => {
        const steamId = normalizeSteamId(playerData.player.steam_id);
        if (steamId) {
            playersMap.set(steamId, { ...playerData, sortIndex: index });
        }
    });
    
    // Получаем все существующие карточки
    const existingCards = Array.from(container.querySelectorAll('.player-card'));
    const existingCardsMap = new Map();
    
    existingCards.forEach(card => {
        const steamId = normalizeSteamId(card.getAttribute('data-steam-id'));
        if (steamId) {
            existingCardsMap.set(steamId, card);
        }
    });
    
    // 1. Удаляем карточки игроков, которых больше нет в топ-10
    existingCards.forEach(card => {
        const steamId = normalizeSteamId(card.getAttribute('data-steam-id'));
        if (steamId && !playersMap.has(steamId)) {
            // Игрок не в топ-10 - удаляем мгновенно без анимации
            // чтобы избежать дёргания при скролле
            if (card.parentElement) {
                card.remove();
            }
        }
    });
    
    // 2. Обновляем существующие карточки и добавляем новые в правильном порядке
    limitedPlayersList.forEach((playerData, targetIndex) => {
        const steamId = normalizeSteamId(playerData.player.steam_id);
        if (!steamId) return;
        
        const { player, server, steamProfile } = playerData;
        let card = existingCardsMap.get(steamId);
        
        if (card) {
            // Карточка существует - обновляем данные
            updateCardData(card, player, server, steamProfile);
            
            // Обновляем timecreated если изменился
            const newTimecreated = steamProfile?.timecreated || 0;
            const currentTimecreated = parseInt(card.getAttribute('data-timecreated') || '0');
            if (newTimecreated !== currentTimecreated) {
                card.setAttribute('data-timecreated', String(newTimecreated));
            }
        } else {
            // Новая карточка - создаем
            // Определяем является ли игрок ненастроенным
            const playerIsUnconfigured = steamProfile && (
                steamProfile.profilestate === 0 || 
                steamProfile.profilestate === undefined
            );
            // Показываем оранжевую полосу только если это контейнер "Все игроки" (не ненастроенные)
            const showUnconfiguredBorder = playerIsUnconfigured && !isUnconfigured;
            card = createPlayerCard(player, server, steamProfile, showUnconfiguredBorder);
            card.setAttribute('data-timecreated', String(steamProfile?.timecreated || 0));
            card.style.animationDelay = '0s'; // Без задержки анимации при обновлениях
            existingCardsMap.set(steamId, card);
        }
        
        // 3. Проверяем позицию карточки и перемещаем если нужно
        const currentIndex = Array.from(container.children).indexOf(card);
        
        if (currentIndex === -1) {
            // Карточки нет в DOM - вставляем в правильную позицию
            const nextCard = container.children[targetIndex];
            if (nextCard) {
                container.insertBefore(card, nextCard);
            } else {
                container.appendChild(card);
            }
        } else if (currentIndex !== targetIndex) {
            // Карточка не на своем месте - перемещаем
            // Но только если разница больше 0 (карточка должна сдвинуться)
            const nextCard = container.children[targetIndex];
            if (nextCard && nextCard !== card) {
                // Проверяем что это действительно другая позиция
                const cardAtTarget = container.children[targetIndex];
                if (cardAtTarget !== card) {
                    container.insertBefore(card, nextCard);
                }
            } else if (!nextCard && currentIndex !== container.children.length - 1) {
                // Перемещаем в конец только если карточка не последняя
                container.appendChild(card);
            }
        }
    });
    
    // Восстанавливаем позицию скролла после обновления
    // Используем requestAnimationFrame для плавности
    requestAnimationFrame(() => {
        if (scrollTop > 0) {
            container.scrollTop = scrollTop;
        }
    });
}

// Функция для обновления данных в существующих карточках (оптимизированная)
function updateExistingCards(serversData) {
    const allPlayersContainer = document.getElementById('allPlayers');
    const unconfiguredContainer = document.getElementById('unconfiguredPlayers');
    
    if (!allPlayersContainer || !unconfiguredContainer) return;
    
    // Используем requestAnimationFrame для плавного обновления
    requestAnimationFrame(() => {
        updateCardsInBatches(allPlayersContainer, unconfiguredContainer, serversData);
    });
}

// Батчинг обновлений для избежания лагов
function updateCardsInBatches(allPlayersContainer, unconfiguredContainer, serversData) {
    // Пересобираем и пересортировываем списки игроков
    const allPlayers = [];
    const unconfiguredPlayers = [];

    serversData.forEach(server => {
        if (server.live_data && server.live_data.players) {
            server.live_data.players.forEach(player => {
                const steamId = normalizeSteamId(player.steam_id);
                if (!steamId) return;

                const steamProfile = player.steamProfile;
                const isUnconfigured = steamProfile && (
                    steamProfile.profilestate === 0 || 
                    steamProfile.profilestate === undefined
                );

                const playerData = {
                    player,
                    server,
                    steamProfile: steamProfile || null,
                    timecreated: steamProfile?.timecreated || 0
                };

                if (isUnconfigured) {
                    unconfiguredPlayers.push(playerData);
                }
                allPlayers.push(playerData);
            });
        }
    });

    // Сортировка по времени создания аккаунта (новые сначала)
    unconfiguredPlayers.sort((a, b) => (b.timecreated || 0) - (a.timecreated || 0));
    allPlayers.sort((a, b) => (b.timecreated || 0) - (a.timecreated || 0));

    // Обновляем списки в state
    state.allPlayersList = allPlayers;
    state.unconfiguredPlayersList = unconfiguredPlayers;

    // Синхронизируем DOM с отсортированными данными
    // syncCardsWithData теперь сама применяет поиск если он активен
    syncCardsWithData(allPlayersContainer, allPlayers, false);
    syncCardsWithData(unconfiguredContainer, unconfiguredPlayers, true);

    // Обновляем счетчики
    updateSectionCounts();
}

// Функция для обновления данных в существующей карточке
function updateCardData(card, player, server, steamProfile) {
    // Обновляем статистику (kills, deaths, ping) только если значения изменились
    const killsEl = card.querySelector('.kills');
    const deathsEl = card.querySelector('.deaths');
    const pingEl = card.querySelector('.ping');
    
    if (killsEl) {
        const newKills = player.kills || 0;
        const currentKills = parseInt(killsEl.textContent) || 0;
        if (newKills !== currentKills) {
            killsEl.textContent = newKills;
        }
    }
    
    if (deathsEl) {
        const newDeaths = player.deaths || 0;
        const currentDeaths = parseInt(deathsEl.textContent) || 0;
        if (newDeaths !== currentDeaths) {
            deathsEl.textContent = newDeaths;
        }
    }
    
    if (pingEl) {
        const newPing = `${player.ping || 0}ms`;
        const currentPing = pingEl.textContent;
        if (newPing !== currentPing) {
            pingEl.textContent = newPing;
        }
    }
    
    // Обновляем информацию о сервере
    const serverNameEl = card.querySelector('.server-name');
    const gameTypePanel = card.querySelector('.game-type-panel');
    const serverInfo = card.querySelector('.server-info');
    const serverDetailsItems = card.querySelectorAll('.server-details .server-detail-item');
    
    if (serverNameEl) {
        const serverName = server.site_name || server.name || 'Неизвестный сервер';
        if (serverNameEl.textContent !== serverName) {
            serverNameEl.textContent = serverName;
        }
    }
    
    // Обновляем тип игры в панели
    if (gameTypePanel && serverInfo) {
        const gameType = server.mode?.name === 'CS:GO' ? 'CS:GO' : 'CS2';
        const gameTypeClass = gameType === 'CS:GO' ? 'game-type-csgo' : 'game-type-cs2';
        const gameTypeTextEl = gameTypePanel.querySelector('.game-type-text');
        
        if (gameTypeTextEl && gameTypeTextEl.textContent !== gameType) {
            gameTypeTextEl.textContent = gameType;
            gameTypePanel.className = `game-type-panel ${gameTypeClass}`;
            serverInfo.className = `server-info ${gameTypeClass}`;
        }
    }
    
    // Обновляем карту (второй элемент в server-details)
    if (serverDetailsItems[1]) {
        const serverMap = server.live_data?.map_name || server.map || 'N/A';
        const serverMapEl = serverDetailsItems[1].querySelector('span:last-child');
        if (serverMapEl && serverMapEl.textContent !== serverMap) {
            serverMapEl.textContent = serverMap;
        }
    }
    
    // Обновляем дату создания аккаунта в новой структуре
    const accountDateInfo = card.querySelector('.account-date-info');
    if (accountDateInfo && steamProfile && steamProfile.timecreated) {
        const tc = steamProfile.timecreated || 0;
        const prevTc = parseInt(card.getAttribute('data-timecreated') || '0');

        // Обновляем ТОЛЬКО если изменился timecreated (новый аккаунт)
        if (prevTc !== tc) {
            const dateObj = formatAccountDate(steamProfile.timecreated);
            
            const accountDateFull = accountDateInfo.querySelector('.account-date-full');
            const accountDateRelative = accountDateInfo.querySelector('.account-date-relative');
            
            if (accountDateFull) {
                accountDateFull.textContent = dateObj.fullDate;
            }
            
            if (accountDateRelative) {
                accountDateRelative.textContent = dateObj.relativeTime || '';
            } else if (dateObj.relativeTime) {
                // Добавляем элемент если его нет
                const accountDateText = accountDateInfo.querySelector('.account-date-text');
                if (accountDateText) {
                    const relativeSpan = document.createElement('span');
                    relativeSpan.className = 'account-date-relative';
                    relativeSpan.textContent = dateObj.relativeTime;
                    accountDateText.appendChild(relativeSpan);
                }
            }
            
            // Обновляем title
            const titleText = dateObj.relativeTime ? `Аккаунт создан: ${dateObj.fullDate} ${dateObj.relativeTime}` : `Аккаунт создан: ${dateObj.fullDate}`;
            accountDateInfo.setAttribute('title', titleText);
            
            // Обновляем атрибут timecreated
            card.setAttribute('data-timecreated', String(tc));
        }
    } else {
        const tc = steamProfile?.timecreated || 0;
        const prevTc = parseInt(card.getAttribute('data-timecreated') || '0');
        if (prevTc !== tc) {
            card.setAttribute('data-timecreated', String(tc));
        }
    }
    
    // Обновляем информацию о сервере в новой структуре
    const serverDetailsCompact = card.querySelector('.server-details-compact');
    if (serverDetailsCompact) {
        const serverDetailLines = serverDetailsCompact.querySelectorAll('.server-detail-line');
        
        // Обновляем название сервера (первая строка)
        if (serverDetailLines[0]) {
            const serverName = server.site_name || server.name || 'Неизвестный сервер';
            if (serverDetailLines[0].textContent !== serverName) {
                serverDetailLines[0].textContent = serverName;
            }
        }
        
        // Обновляем локацию и карту (вторая строка)
        if (serverDetailLines[1]) {
            const serverLocation = server.location || 'N/A';
            const serverMap = server.live_data?.map_name || server.map || 'N/A';
            const newText = `📍${serverLocation} 🗺️${serverMap}`;
            if (serverDetailLines[1].textContent !== newText) {
                serverDetailLines[1].textContent = newText;
            }
        }
        
        // Обновляем IP:PORT (третья строка)
        if (serverDetailLines[2]) {
            const serverIp = server.ip || 'N/A';
            const serverPort = server.port || 'N/A';
            const newText = `🌐${serverIp}:${serverPort}`;
            if (serverDetailLines[2].textContent !== newText) {
                serverDetailLines[2].textContent = newText;
            }
        }
    }
    
    // Обновляем тип игры
    const gameTypeBadge = card.querySelector('.game-type-badge');
    const serverInfoRight = card.querySelector('.server-info-right');
    if (gameTypeBadge && serverInfoRight) {
        const gameType = server.mode?.name === 'CS:GO' ? 'CS:GO' : 'CS2';
        const gameTypeClass = gameType === 'CS:GO' ? 'game-type-csgo' : 'game-type-cs2';
        const gameTypeLabel = gameTypeBadge.querySelector('.game-type-label');
        
        if (gameTypeLabel && gameTypeLabel.textContent !== gameType) {
            gameTypeLabel.textContent = gameType;
            serverInfoRight.className = `server-info-right ${gameTypeClass}`;
            
            // Обновляем иконку
            const gameTypeIcon = gameTypeBadge.querySelector('.game-type-icon');
            if (gameTypeIcon) {
                gameTypeIcon.src = `assets/${gameType === 'CS2' ? 'counter-strike-2.svg' : 'counter-strike-go.svg'}`;
                gameTypeIcon.alt = gameType;
            }
        }
    }
}

function checkPlayerDifferences(player, steamProfile) {
    if (!steamProfile) {
        return { hasDifferences: false };
    }

    const differences = {
        hasDifferences: false,
        nickname: false,
        avatar: false
    };

    // Проверка ника - сравниваем только personaname, без realname
    const serverNickname = (player.nickname || '').trim().toLowerCase();
    const steamNickname = (steamProfile.personaname || '').trim().toLowerCase();
    
    if (serverNickname && steamNickname && serverNickname !== steamNickname) {
        differences.nickname = true;
        differences.hasDifferences = true;
    }

    // Проверка аватарки - сравниваем хеши
    if (player.avatar && steamProfile.avatarhash) {
        const serverAvatarHash = extractAvatarHash(player.avatar);
        if (serverAvatarHash && serverAvatarHash.toLowerCase() !== steamProfile.avatarhash.toLowerCase()) {
            differences.avatar = true;
            differences.hasDifferences = true;
        }
    } else if (player.avatar && !steamProfile.avatarhash) {
        // Если есть аватар на сервере, но нет хеша в Steam - считаем различием
        const serverAvatarHash = extractAvatarHash(player.avatar);
        if (serverAvatarHash) {
            differences.avatar = true;
            differences.hasDifferences = true;
        }
    }

    return differences;
}

function extractAvatarHash(avatarUrl) {
    if (!avatarUrl) return null;
    const match = avatarUrl.match(/\/([a-f0-9]{40})_/);
    return match ? match[1] : null;
}

function updateStats(serversData) {
    // Считаем всех активных игроков
    let activePlayersCount = 0;
    serversData.forEach(server => {
        if (server.live_data && server.live_data.players) {
            server.live_data.players.forEach(player => {
                if (player.steam_id) {
                    activePlayersCount++;
                }
            });
        }
    });

    const playersCountEl = document.getElementById('playersCount');
    const serversCountEl = document.getElementById('serversCount');

    if (playersCountEl) {
        playersCountEl.textContent = activePlayersCount;
    }

    if (serversCountEl) {
        serversCountEl.textContent = serversData.length;
    }
}

function updateStatus(text, statusType = 'active') {
    const statusText = document.getElementById('statusText');
    const statusPulse = document.getElementById('statusPulse');
    const statusIndicator = document.querySelector('.status-indicator');
    
    if (statusText) {
        statusText.textContent = text;
    }

    // Обновление визуального состояния
    if (statusIndicator) {
        statusIndicator.className = `status-indicator status-${statusType}`;
    }

    if (statusPulse) {
        statusPulse.className = `status-pulse pulse-${statusType}`;
    }

    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate && state.lastUpdateTime) {
        const timeStr = state.lastUpdateTime.toLocaleTimeString('ru-RU');
        lastUpdate.textContent = `Последнее обновление: ${timeStr}`;
    }
}

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }
}

function hideError() {
    const errorEl = document.getElementById('errorMessage');
    if (errorEl) {
        errorEl.style.display = 'none';
    }
}

// Глобальные функции для кнопок
window.openSteamProfile = function(steamId) {
    if (!steamId) return;
    const profileUrl = `https://steamcommunity.com/profiles/${steamId}`;
    window.open(profileUrl, '_blank');
    showToast('Профиль открыт', 'success');
};

window.openFearProfile = function(steamId) {
    if (!steamId) return;
    const profileUrl = `https://fearproject.ru/profile/${steamId}`;
    window.open(profileUrl, '_blank');
    showToast('Профиль на FearProject открыт', 'success');
};

// Функция копирования с анимацией
function copyToClipboardWithAnimation(text, element) {
    navigator.clipboard.writeText(text).then(() => {
        // Добавляем класс для анимации
        element.style.transform = 'scale(0.95)';
        element.style.background = 'rgba(0, 212, 170, 0.2)';
        element.style.borderColor = 'rgba(0, 212, 170, 0.5)';
        element.style.color = '#00d4aa';
        
        // Показываем toast
        showToast('Скопировано: ' + text, 'success');
        
        // Возвращаем стиль обратно через 300ms
        setTimeout(() => {
            element.style.transform = '';
            element.style.background = '';
            element.style.borderColor = '';
            element.style.color = '';
        }, 300);
    }).catch(() => {
        showToast('Ошибка копирования', 'error');
    });
}

window.copySteamID = function(steamId) {
    navigator.clipboard.writeText(steamId).then(() => {
        showToast('SteamID скопирован', 'success');
    }).catch(() => {
        showToast('Ошибка копирования', 'error');
    });
};

window.copyServerAddress = function(ip, port) {
    const address = `connect ${ip}:${port}`;
    navigator.clipboard.writeText(address).then(() => {
        showToast('Адрес сервера скопирован', 'success');
    }).catch(() => {
        showToast('Ошибка копирования', 'error');
    });
};

window.connectToServer = function(ip, port) {
    const steamUrl = `steam://connect/${ip}:${port}`;
    window.location.href = steamUrl;
    showToast(`Подключение к ${ip}:${port}...`, 'success');
};

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Функция загрузки следующей порции игроков
function loadMorePlayers(section, isInitial = false) {
    const container = section === 'all' 
        ? document.getElementById('allPlayers')
        : document.getElementById('unconfiguredPlayers');
    
    if (!container) return;
    
    let playersList = section === 'all' 
        ? state.allPlayersList 
        : state.unconfiguredPlayersList;
    
    // Если активен поиск для секции "Все игроки", фильтруем список
    if (section === 'all' && state.searchQuery) {
        const queryLower = state.searchQuery.toLowerCase();
        playersList = playersList.filter(({ player, steamProfile }) => {
            // Проверяем фильтр ненастроенных профилей
            const isUnconfigured = steamProfile && (
                steamProfile.profilestate === 0 || 
                steamProfile.profilestate === undefined
            );
            
            if (!state.showUnconfigured && isUnconfigured) {
                return false;
            }
            
            // Проверяем соответствие поиску
            return matchesSearchQuery(player, steamProfile, state.searchQuery);
        });
    }
    
    const currentLoaded = section === 'all' 
        ? state.allPlayersLoaded 
        : state.unconfiguredPlayersLoaded;
    
    if (currentLoaded >= playersList.length) return; // Все уже загружено
    
    // Определяем, сколько элементов загрузить
    const toLoad = isInitial ? ITEMS_PER_PAGE : ITEMS_PER_PAGE;
    const endIndex = Math.min(currentLoaded + toLoad, playersList.length);
    
    // Загружаем элементы
    let cardsAdded = 0; // Счетчик реально добавленных карточек
    for (let i = currentLoaded; i < endIndex; i++) {
        const { player, server, steamProfile } = playersList[i];
        
        if (section === 'all') {
            // Определяем, является ли игрок ненастроенным
            const isUnconfigured = steamProfile && (
                steamProfile.profilestate === 0 || 
                steamProfile.profilestate === undefined
            );
            
            // Применяем фильтр ненастроенных профилей СРАЗУ при создании
            if (!state.showUnconfigured && isUnconfigured) {
                // Пропускаем ненастроенные профили, если они скрыты
                continue;
            }
            
            const card = createPlayerCard(player, server, steamProfile, isUnconfigured);
            // Добавляем задержку для плавной анимации появления (только для реально добавленных)
            card.style.animationDelay = `${cardsAdded * 0.05}s`;
            container.appendChild(card);
            cardsAdded++;
        } else {
            // Для секции "Ненастроенные профили" все профили ненастроенные, но полосу не показываем
            const card = createPlayerCard(player, server, steamProfile, false);
            // Добавляем задержку для плавной анимации появления
            card.style.animationDelay = `${cardsAdded * 0.05}s`;
            container.appendChild(card);
            cardsAdded++;
        }
    }
    
    // Обновляем счетчик загруженных элементов
    if (section === 'all') {
        state.allPlayersLoaded = endIndex;
    } else {
        state.unconfiguredPlayersLoaded = endIndex;
    }
    
    // Обновляем счетчики
    updateSectionCounts();
}

// Настройка обработчиков прокрутки для ленивой загрузки
function setupScrollHandlers() {
    const allPlayersContainer = document.getElementById('allPlayers');
    const unconfiguredContainer = document.getElementById('unconfiguredPlayers');
    
    // Обработчик для секции "Все игроки"
    if (allPlayersContainer) {
        allPlayersContainer.addEventListener('scroll', () => {
            const scrollTop = allPlayersContainer.scrollTop;
            const scrollHeight = allPlayersContainer.scrollHeight;
            const clientHeight = allPlayersContainer.clientHeight;
            
            // Загружаем следующую порцию, если прокрутили почти до конца (за 100px до конца)
            if (scrollTop + clientHeight >= scrollHeight - 100) {
                loadMorePlayers('all');
            }
        });
    }
    
    // Обработчик для секции "Ненастроенные профили"
    if (unconfiguredContainer) {
        unconfiguredContainer.addEventListener('scroll', () => {
            const scrollTop = unconfiguredContainer.scrollTop;
            const scrollHeight = unconfiguredContainer.scrollHeight;
            const clientHeight = unconfiguredContainer.clientHeight;
            
            // Загружаем следующую порцию, если прокрутили почти до конца (за 100px до конца)
            if (scrollTop + clientHeight >= scrollHeight - 100) {
                loadMorePlayers('unconfigured');
            }
        });
    }
}

// Обновление счетчиков в заголовках секций
function updateSectionCounts() {
    // Счетчик для "Все игроки" - считаем общее количество с учетом фильтров
    const allPlayersCountEl = document.getElementById('allPlayersCount');
    if (allPlayersCountEl) {
        let newCount = 0;
        if (state.allPlayersList.length > 0) {
            // Считаем количество игроков, которые должны быть видны с учетом фильтров
            state.allPlayersList.forEach(({ player, server, steamProfile }) => {
                const isUnconfigured = steamProfile && (
                    steamProfile.profilestate === 0 || 
                    steamProfile.profilestate === undefined
                );
                // Учитываем фильтр ненастроенных профилей
                if (state.showUnconfigured || !isUnconfigured) {
                    newCount++;
                }
            });
        }
        // Обновляем только если значение изменилось
        const currentCount = parseInt(allPlayersCountEl.textContent) || 0;
        if (newCount !== currentCount) {
            allPlayersCountEl.textContent = newCount;
        }
    }
    
    // Счетчик для "Ненастроенные профили" - общее количество
    const unconfiguredCountEl = document.getElementById('unconfiguredCount');
    if (unconfiguredCountEl) {
        const newUnconfiguredCount = state.unconfiguredPlayersList.length;
        // Обновляем только если значение изменилось
        const currentUnconfiguredCount = parseInt(unconfiguredCountEl.textContent) || 0;
        if (newUnconfiguredCount !== currentUnconfiguredCount) {
            unconfiguredCountEl.textContent = newUnconfiguredCount;
        }
    }
}

// Функция для проверки соответствия игрока поисковому запросу
function matchesSearchQuery(player, steamProfile, query) {
    if (!query) return true;
    
    const queryLower = query.toLowerCase();
    const searchData = [
        player.nickname || '',
        player.steam_id || '',
        steamProfile?.personaname || ''
    ].join(' ').toLowerCase();
    
    return searchData.includes(queryLower);
}

// Функция для применения поиска без полной перерисовки (сохраняет позицию прокрутки)
function applySearchFilterWithoutRedraw(query) {
    const allPlayersContainer = document.getElementById('allPlayers');
    if (!allPlayersContainer) return;
    
    const queryLower = query ? query.toLowerCase() : '';
    const MAX_SEARCH_RESULTS = 10;
    
    // Если поиск пустой, показываем первые 10 карточек
    if (!queryLower) {
        const cards = Array.from(allPlayersContainer.querySelectorAll('.player-card'));
        
        // Удаляем все карточки после 10-й
        if (cards.length > MAX_SEARCH_RESULTS) {
            cards.slice(MAX_SEARCH_RESULTS).forEach(card => {
                card.remove();
            });
        }
        
        // Показываем первые 10
        cards.slice(0, MAX_SEARCH_RESULTS).forEach(card => {
            const isUnconfigured = card.classList.contains('unconfigured-player');
            const matchesFilter = state.showUnconfigured || !isUnconfigured;
            
            if (matchesFilter) {
                if (card.style.display === 'none') {
                    card.style.display = '';
                    card.classList.remove('card-hide', 'card-hiding');
                }
            } else {
                if (card.style.display !== 'none') {
                    card.style.display = 'none';
                }
            }
        });
        return;
    }
    
    // Поиск: собираем подходящие карточки
    const cards = Array.from(allPlayersContainer.querySelectorAll('.player-card'));
    const matchingCards = [];
    const nonMatchingCards = [];
    
    cards.forEach(card => {
        const steamId = normalizeSteamId(card.getAttribute('data-steam-id'));
        if (!steamId) {
            nonMatchingCards.push(card);
            return;
        }
        
        // Находим данные игрока в state
        const playerData = state.allPlayersList.find(({ player }) => 
            normalizeSteamId(player.steam_id) === steamId
        );
        
        if (!playerData) {
            nonMatchingCards.push(card);
            return;
        }
        
        const { player, steamProfile } = playerData;
        
        // Проверяем фильтр ненастроенных профилей
        const isUnconfigured = steamProfile && (
            steamProfile.profilestate === 0 || 
            steamProfile.profilestate === undefined
        );
        
        if (!state.showUnconfigured && isUnconfigured) {
            nonMatchingCards.push(card);
            return;
        }
        
        // Проверяем соответствие поиску
        const matches = matchesSearchQuery(player, steamProfile, query);
        
        if (matches) {
            matchingCards.push(card);
        } else {
            nonMatchingCards.push(card);
        }
    });
    
    // Показываем только первые 10 подходящих
    matchingCards.slice(0, MAX_SEARCH_RESULTS).forEach(card => {
        if (card.style.display === 'none') {
            card.style.display = '';
            card.classList.remove('card-hide', 'card-hiding');
        }
    });
    
    // Удаляем лишние подходящие карточки (после 10-й)
    matchingCards.slice(MAX_SEARCH_RESULTS).forEach(card => {
        card.remove();
    });
    
    // Удаляем все неподходящие карточки
    nonMatchingCards.forEach(card => {
        card.remove();
    });
}

function filterPlayerCards(query) {
    const allPlayersContainer = document.getElementById('allPlayers');
    if (!allPlayersContainer) return;
    
    const queryLower = query.toLowerCase();
    
    // Если есть поисковый запрос - фильтруем данные из state и показываем только найденные
    if (queryLower) {
        // Очищаем контейнер
        allPlayersContainer.innerHTML = '';
        
        // Фильтруем данные из state.allPlayersList
        const filteredPlayers = state.allPlayersList.filter(({ player, server, steamProfile }) => {
            // Проверяем фильтр ненастроенных профилей
            const isUnconfigured = steamProfile && (
                steamProfile.profilestate === 0 || 
                steamProfile.profilestate === undefined
            );
            
            if (!state.showUnconfigured && isUnconfigured) {
                return false;
            }
            
            // Проверяем поиск по данным из state
            const searchData = [
                player.nickname || '',
                player.steam_id || '',
                steamProfile?.personaname || ''
            ].join(' ').toLowerCase();
            
            return searchData.includes(queryLower);
        });
        
        // Создаем карточки только для найденных игроков (максимум 10)
        const MAX_SEARCH_RESULTS = 10;
        filteredPlayers.slice(0, MAX_SEARCH_RESULTS).forEach(({ player, server, steamProfile }, index) => {
            const isUnconfigured = steamProfile && (
                steamProfile.profilestate === 0 || 
                steamProfile.profilestate === undefined
            );
            
            const card = createPlayerCard(player, server, steamProfile, isUnconfigured);
            card.style.animationDelay = `${index * 0.02}s`;
            allPlayersContainer.appendChild(card);
        });
        
        // Обновляем счетчик
        updateSectionCounts();
        return;
    }
    
    // Если поиска нет - плавно показываем/скрываем существующие карточки
    const cards = allPlayersContainer.querySelectorAll('.player-card');
    
    cards.forEach((card, index) => {
        const isUnconfigured = card.classList.contains('unconfigured-player');
        
        // Проверяем фильтр ненастроенных профилей
        const matchesFilter = state.showUnconfigured || !isUnconfigured;
        
        if (matchesFilter) {
            // Плавное появление
            if (card.style.display === 'none') {
                // Убираем классы скрытия
                card.classList.remove('card-hiding', 'card-hide');
                
                // Устанавливаем display: block для измерения высоты
                card.style.display = 'block';
                card.style.height = 'auto';
                card.style.marginBottom = '';
                card.style.opacity = '0';
                card.style.transform = 'translateY(-10px)';
                
                // Измеряем реальную высоту содержимого
                const targetHeight = card.scrollHeight;
                const targetMarginBottom = 12;
                
                // Устанавливаем начальную высоту
                card.style.height = '0';
                card.style.marginBottom = '0';
                card.style.overflow = 'hidden';
                
                // Принудительно вызываем reflow
                card.offsetHeight;
                
                // Используем requestAnimationFrame для плавного старта анимации
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        card.style.height = `${targetHeight}px`;
                        card.style.marginBottom = `${targetMarginBottom}px`;
                        card.style.opacity = '1';
                        card.style.transform = 'translateY(0)';
                        card.classList.add('card-showing');
                        
                        // После завершения анимации убираем фиксированную высоту
                        const onTransitionEnd = () => {
                            card.style.height = '';
                            card.style.marginBottom = '';
                            card.style.overflow = '';
                            card.classList.remove('card-showing');
                            card.removeEventListener('transitionend', onTransitionEnd);
                        };
                        card.addEventListener('transitionend', onTransitionEnd);
                    });
                });
            }
        } else {
            // Плавное скрытие
            if (card.style.display !== 'none' && !card.classList.contains('card-hiding')) {
                // Получаем текущую высоту и margin
                const currentHeight = card.offsetHeight;
                const currentMarginBottom = parseInt(window.getComputedStyle(card).marginBottom) || 12;
                
                // Устанавливаем фиксированную высоту для предотвращения пересчета layout
                card.style.height = `${currentHeight}px`;
                card.style.marginBottom = `${currentMarginBottom}px`;
                card.style.overflow = 'hidden';
                
                // Принудительно вызываем reflow для применения стилей
                card.offsetHeight;
                
                // Используем requestAnimationFrame для плавного старта анимации
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        // Добавляем класс для скрытия
                        card.classList.add('card-hiding');
                        card.classList.remove('card-showing');
                        
                        // Анимируем до 0
                        card.style.height = '0';
                        card.style.marginBottom = '0';
                        card.style.opacity = '0';
                        card.style.transform = 'translateY(-10px)';
                        
                        // После завершения анимации устанавливаем display: none
                        const onTransitionEnd = () => {
                            if (card.classList.contains('card-hiding')) {
                                card.style.display = 'none';
                                card.style.height = '';
                                card.style.marginBottom = '';
                                card.style.overflow = '';
                                card.style.opacity = '';
                                card.style.transform = '';
                                card.classList.remove('card-hiding');
                                card.removeEventListener('transitionend', onTransitionEnd);
                            }
                        };
                        card.addEventListener('transitionend', onTransitionEnd);
                    });
                });
            }
        }
    });
    
    // Обновляем счетчик
    updateSectionCounts();
}

// Функция для применения фильтра ненастроенных профилей
function applyUnconfiguredFilter() {
    const allPlayersContainer = document.getElementById('allPlayers');
    if (!allPlayersContainer) return;
    
    // Используем syncCardsWithData которая сама применяет поиск если он активен
    syncCardsWithData(allPlayersContainer, state.allPlayersList, false);
}

function formatAccountDate(timestamp) {
    if (!timestamp) return 'Неизвестно';
    const now = new Date();
    const accountCreated = new Date(timestamp * 1000);
    
    const diffMs = now - accountCreated;
    const diffSeconds = Math.floor(diffMs / 1000);
    
    // Вычисляем компоненты времени
    const years = Math.floor(diffSeconds / (365 * 24 * 60 * 60));
    const days = Math.floor((diffSeconds % (365 * 24 * 60 * 60)) / (24 * 60 * 60));
    const hours = Math.floor((diffSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((diffSeconds % (60 * 60)) / 60);
    const seconds = diffSeconds % 60;
    
    // Формируем строку относительного времени
    const parts = [];
    if (years > 0) parts.push(`${years} ${getYearWord(years)}`);
    if (days > 0) parts.push(`${days} ${getDayWord(days)}`);
    if (hours > 0) parts.push(`${hours} ${getHourWord(hours)}`);
    if (minutes > 0) parts.push(`${minutes} ${getMinuteWord(minutes)}`);
    
    // Показываем секунды только если прошло меньше часа
    const totalHours = Math.floor(diffSeconds / 3600);
    if (totalHours < 1) {
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds} ${getSecondWord(seconds)}`);
    }
    
    const relativeTime = parts.join(', ');
    
        // Форматируем дату создания аккаунта
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                   'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

    const day = accountCreated.getDate();
    const month = months[accountCreated.getMonth()];
    const year = accountCreated.getFullYear();
    const hoursStr = String(accountCreated.getHours()).padStart(2, '0');
    const minutesStr = String(accountCreated.getMinutes()).padStart(2, '0');

    // Возвращаем объект с полной датой и относительным временем
    return {
        fullDate: `${day} ${month} ${year} в ${hoursStr}:${minutesStr}`,
        relativeTime: relativeTime ? `${relativeTime} назад` : ''
    };
}

function getHourWord(hours) {
    if (hours % 10 === 1 && hours % 100 !== 11) return 'час';
    if ([2, 3, 4].includes(hours % 10) && ![12, 13, 14].includes(hours % 100)) return 'часа';
    return 'часов';
}

function getMinuteWord(minutes) {
    if (minutes % 10 === 1 && minutes % 100 !== 11) return 'минута';
    if ([2, 3, 4].includes(minutes % 10) && ![12, 13, 14].includes(minutes % 100)) return 'минуты';
    return 'минут';
}

function getSecondWord(seconds) {
    if (seconds % 10 === 1 && seconds % 100 !== 11) return 'секунда';
    if ([2, 3, 4].includes(seconds % 10) && ![12, 13, 14].includes(seconds % 100)) return 'секунды';
    return 'секунд';
}

function getDayWord(days) {
    if (days % 10 === 1 && days % 100 !== 11) return 'день';
    if ([2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100)) return 'дня';
    return 'дней';
}

function getMonthWord(months) {
    if (months % 10 === 1 && months % 100 !== 11) return 'месяц';
    if ([2, 3, 4].includes(months % 10) && ![12, 13, 14].includes(months % 100)) return 'месяца';
    return 'месяцев';
}

function getYearWord(years) {
    if (years % 10 === 1 && years % 100 !== 11) return 'год';
    if ([2, 3, 4].includes(years % 10) && ![12, 13, 14].includes(years % 100)) return 'года';
    return 'лет';
}

// Функция загрузки репортов (сервер сам обрабатывает авторизацию)
async function loadReports() {
    console.log('🔄 Репорты загружаются через сервер...');
    // Репорты приходят через WebSocket вместе с серверами
}

// Функция отображения репортов (полностью переработанная по аналогии с displayPlayers)
function displayReports(isInitial = true) {
    const reportsContainer = document.getElementById('reportsPlayers');
    const emptyReports = document.getElementById('emptyReports');
    const reportsCountEl = document.getElementById('reportsCount');

    if (!reportsContainer) return;

    // Если репорты еще не загружены, показываем пустое состояние
    if (!state.reportsList || state.reportsList.length === 0) {
        if (emptyReports) {
            emptyReports.style.display = 'flex';
            emptyReports.innerHTML = `
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <p>Ожидание данных репортов...</p>
            `;
        }
        return;
    }

    // Создаем карту активных игроков по SteamID
    const activePlayersSet = new Set();
    state.serversData.forEach(server => {
        if (server.live_data && server.live_data.players) {
            server.live_data.players.forEach(player => {
                if (player.steam_id) {
                    activePlayersSet.add(normalizeSteamId(player.steam_id));
                }
            });
        }
    });

    // Фильтруем репорты только на active игроков
    const activeReportsList = state.reportsList.filter(report => {
        const normalizedReportSteamId = normalizeSteamId(report.intruder_steamid);
        return activePlayersSet.has(normalizedReportSteamId);
    });

    // Сохраняем активные репорты в state
    state.activeReportsList = activeReportsList;

    // Сортируем активные репорты по времени создания (новые сначала)
    activeReportsList.sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return timeB - timeA;
    });

    // Создаем хеш текущих данных репортов
    const newReportsHash = createReportsHash(activeReportsList);
    const dataChanged = newReportsHash !== state.lastReportsHash;

    // Проверяем, есть ли уже отображенные карточки
    const hasExistingCards = reportsContainer.querySelectorAll('.report-card').length > 0;

    if (hasExistingCards) {
        // Карточки есть - обновляем данные в существующих карточках и синхронизируем список
        updateExistingReportCards(activeReportsList);
        state.lastReportsHash = newReportsHash;
        return;
    }

    // Если карточек нет - создаем их (первый запуск)
    state.lastReportsHash = newReportsHash;

    // Сохраняем позицию прокрутки перед обновлением
    const reportsScrollTop = reportsContainer.scrollTop;

    // Сбрасываем счетчики загруженных элементов при обновлении данных
    state.reportsLoaded = 0;

    // Настраиваем обработчики прокрутки (только один раз)
    if (!state.scrollHandlersSetup) {
        setupReportsScrollHandler();
        state.scrollHandlersSetup = true;
    }

    // Быстрая очистка без анимации для избежания мерцания
    reportsContainer.innerHTML = '';

    // Загружаем первые элементы сразу
    loadMoreReports(true);

    // Восстанавливаем позицию прокрутки после загрузки
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (reportsScrollTop > 0 && reportsContainer.scrollHeight >= reportsScrollTop) {
                reportsContainer.scrollTop = reportsScrollTop;
            }
        });
    });

    // Проверяем пустые состояния
    if (activeReportsList.length === 0) {
        if (emptyReports) {
            emptyReports.style.display = 'flex';
            emptyReports.innerHTML = `
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"></path>
                </svg>
                <p>Нет активных игроков с репортами</p>
            `;
        }
    } else {
        if (emptyReports) {
            emptyReports.style.display = 'none';
        }
    }

    // Обновляем счетчик активных репортов
    if (reportsCountEl) {
        reportsCountEl.textContent = activeReportsList.length;
    }
}

// Создание карточки репорта
function createReportCard(report) {
    const card = document.createElement('div');
    card.className = 'report-card player-card';

    // Находим данные участников в state.serversData для получения дополнительной информации
    const findPlayerBySteamId = (steamId) => {
        for (const server of state.serversData) {
            if (server.live_data && server.live_data.players) {
                const player = server.live_data.players.find(p => normalizeSteamId(p.steam_id) === normalizeSteamId(steamId));
                if (player) {
                    return { player, server };
                }
            }
        }
        return null;
    };

    // Данные об участниках
    const senderData = findPlayerBySteamId(report.sender_steamid);
    const intruderData = findPlayerBySteamId(report.intruder_steamid);
    const senderProfile = (senderData && senderData.player && senderData.player.steamProfile) || report.sender_profile || null;
    const intruderProfile = (intruderData && intruderData.player && intruderData.player.steamProfile) || report.intruder_profile || null;

    // Безопасные значения с дефолтами
    const senderName = escapeHtml(report.sender || 'Неизвестный');
    const intruderName = escapeHtml(report.intruder || 'Неизвестный');
    const reason = escapeHtml(report.reason || 'Не указана');
    const serverName = escapeHtml(report.server_name || 'Неизвестный сервер');
    const createdAt = report.created_at ? formatReportDate(report.created_at) : 'Неизвестно';

    // Аватары с fallback
    const defaultAvatar = 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';
    const senderAvatarUrl = report.sender_avatar || defaultAvatar;
    const intruderAvatarUrl = report.intruder_avatar || defaultAvatar;

    // Дополнительная информация о участниках
    let senderExtraInfo = '';
    let intruderExtraInfo = '';

    // Функция для генерации дополнительной информации о участнике
    function getParticipantExtraInfo(steamId, playerData, profileOverride) {
        const participantSteamId = `
            <div class="participant-steamid">
                SteamID: ${steamId || 'N/A'}
                <button class="btn-copy-mini" onclick="copySteamID('${steamId || ''}')" title="Копировать SteamID">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
            </div>
        `;

        let accountInfo = '';
        const timecreated = profileOverride?.timecreated || playerData?.player?.steamProfile?.timecreated;
        if (timecreated) {
            const dateObj = formatAccountDate(timecreated);
            const titleText = dateObj.relativeTime ? `Аккаунт создан: ${dateObj.fullDate} ${dateObj.relativeTime}` : `Аккаунт создан: ${dateObj.fullDate}`;
            accountInfo = `
                <div class="account-created" title="${titleText}">
                    <div class="account-created-row">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span class="account-created-text">Steam аккаунт создан: ${dateObj.fullDate}</span>
                    </div>
                    <span class="account-relative-time">${dateObj.relativeTime || ''}</span>
                </div>
            `;
        } else {
            const visibility = (profileOverride?.communityvisibilitystate ?? playerData?.player?.steamProfile?.communityvisibilitystate);
            const pstate = (profileOverride?.profilestate ?? playerData?.player?.steamProfile?.profilestate);
            const text = (visibility && visibility !== 3) ? 'Профиль скрыт' : (pstate === 0 || pstate === undefined) ? 'Профиль не настроен' : '';
            if (text) {
                accountInfo = `
                    <div class="account-created" title="${text}">
                        <div class="account-created-row">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            <span class="account-created-text">${text}</span>
                        </div>
                    </div>
                `;
            }
        }

        return `${accountInfo}${participantSteamId}`;
    }

    senderExtraInfo = getParticipantExtraInfo(report.sender_steamid, senderData, senderProfile);
    intruderExtraInfo = getParticipantExtraInfo(report.intruder_steamid, intruderData, intruderProfile);

    if (report.id) {
        card.setAttribute('data-report-id', report.id);
    }
    if (report.intruder_steamid) {
        card.setAttribute('data-intruder-steamid', normalizeSteamId(report.intruder_steamid));
    }
    card.setAttribute('data-report-created-at', new Date(report.created_at).getTime());

    card.innerHTML = `
        <div class="report-avatars">
            <!-- ЛЕВАЯ ЧАСТЬ - ОТПРАВИТЕЛЬ -->
            <div class="report-avatar-container">
                <img data-src="${senderAvatarUrl}" alt="Отправитель" class="report-avatar lazy" onerror="this.src='${defaultAvatar}'">
                <div class="report-label">Отправитель</div>
                <div class="report-name">${senderName}</div>
                ${senderExtraInfo}
            </div>

            <!-- СТРЕЛКА ПОСЕРЕДИНЕ -->
            <div class="report-arrow">→</div>

            <!-- ПРАВАЯ ЧАСТЬ - НАРУШИТЕЛЬ -->
            <div class="report-avatar-container">
                <img data-src="${intruderAvatarUrl}" alt="Нарушитель" class="report-avatar lazy" onerror="this.src='${defaultAvatar}'">
                <div class="report-label report-label-reported">Жалоба</div>
                <div class="report-name">${intruderName}</div>
                ${intruderExtraInfo}
            </div>
        </div>

        <div class="report-details">
            <div class="report-reason">
                <span class="report-reason-label">Причина:</span>
                <span class="report-reason-value">${reason}</span>
            </div>
            <div class="report-server">Сервер: ${serverName}</div>
            <div class="report-time">Время: ${createdAt}</div>
        </div>

        <div class="player-actions" style="margin-top: 8px;">
            <div class="btn-group">
                <button class="btn btn-compact" onclick="openFearProfile('${report.sender_steamid || ''}')" title="Профиль Fear отправителя">
                    <span>Профиль Fear</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </button>
                <button class="btn btn-compact" onclick="openSteamProfile('${report.sender_steamid || ''}')" title="Профиль Steam отправителя">
                    <span>Профиль Steam</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </button>
            </div>

            <div class="btn-group">
                <button class="btn btn-compact" onclick="openFearProfile('${report.intruder_steamid || ''}')" title="Профиль Fear нарушителя">
                    <span>Профиль Fear</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </button>
                <button class="btn btn-compact" onclick="openSteamProfile('${report.intruder_steamid || ''}')" title="Профиль Steam нарушителя">
                    <span>Профиль Steam</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </button>
            </div>

            <button class="btn" onclick="copyServerAddress('${report.server_ip || ''}', '${report.server_port || ''}')" title="Копировать адрес сервера">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
                IP:PORT
            </button>

            <button class="btn btn-primary" onclick="connectToServer('${report.server_ip || '0.0.0.0'}', '${report.server_port || '27015'}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                <span>Подключиться</span>
            </button>
        </div>
    `;

    // Инициализируем lazy loading для изображений
    initLazyLoadForCard(card);

    return card;
}

// Функция форматирования даты репорта
function formatReportDate(dateInput) {
    if (dateInput === undefined || dateInput === null) return 'Неизвестно';

    try {
        const date = typeof dateInput === 'number' ? new Date(dateInput) : new Date(dateInput);
        const nowMs = Date.now();
        const diffSec = Math.floor((nowMs - date.getTime()) / 1000);

        if (diffSec < 60) return `${diffSec} сек назад`;
        
        const diffMin = Math.floor(diffSec / 60);
        const remainingSec = diffSec % 60;
        
        if (diffMin < 60) {
            // Показываем минуты и секунды для свежих репортов
            return `${diffMin} мин ${remainingSec} сек назад`;
        }

        const diffHours = Math.floor(diffMin / 60);
        if (diffHours < 24) return `${diffHours} ч назад`;

        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays} дн назад`;

    } catch (error) {
        console.error('Ошибка форматирования даты:', error);
        return 'Неизвестно';
    }
}

// Настройка прокрутки для репортов
function setupReportsScrollHandler() {
    const reportsContainer = document.getElementById('reportsPlayers');
    if (!reportsContainer) return;

    // Удаляем старый обработчик если был
    reportsContainer.removeEventListener('scroll', reportsScrollHandler);

    // Добавляем новый
    reportsContainer.addEventListener('scroll', reportsScrollHandler);
}

function reportsScrollHandler() {
    const container = document.getElementById('reportsPlayers');
    if (!container) return;

    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // Загружаем следующие репорты, если прокрутили почти до конца
    if (scrollTop + clientHeight >= scrollHeight - 100) {
        loadMoreReports();
    }
}

// Функция для обновления существующих карточек репортов (по аналогии с updateExistingCards)
function updateExistingReportCards(activeReportsList) {
    const reportsContainer = document.getElementById('reportsPlayers');
    if (!reportsContainer) return;

    // Создаем карту текущих активных репортов по ID
    const currentReportsMap = new Map();

    activeReportsList.forEach(report => {
        const reportId = report.id;
        if (reportId) {
            currentReportsMap.set(reportId, {
                report,
                createdAt: new Date(report.created_at).getTime()
            });
        }
    });

    // Создаем карту существующих карточек по report.id
    const existingCardsMap = new Map();
    const existingCards = reportsContainer.querySelectorAll('.report-card');

    existingCards.forEach(card => {
        const reportId = card.getAttribute('data-report-id');
        if (reportId) {
            // Проверяем на дубликаты
            if (existingCardsMap.has(reportId)) {
                card.classList.add('card-hide');
                setTimeout(() => {
                    if (card.parentElement) {
                        card.remove();
                    }
                }, 300);
            } else {
                existingCardsMap.set(reportId, card);
            }
        }
    });

    // Обновляем данные в существующих карточках
    existingCardsMap.forEach((card, reportId) => {
        if (currentReportsMap.has(reportId)) {
            // Репорт существует - обновляем данные в карточке
            const { report } = currentReportsMap.get(reportId);
            updateReportCardData(card, report);
            // Сбрасываем счетчик пропусков
            state.missingReportsCount.delete(reportId);
        } else {
            // Репорт не найден в текущем обновлении - увеличиваем счетчик пропусков
            const missingCount = (state.missingReportsCount.get(reportId) || 0) + 1;
            state.missingReportsCount.set(reportId, missingCount);

            // Удаляем карточку только после 3 пропущенных обновлений подряд (3 секунды)
            if (missingCount >= 3) {
                card.classList.add('card-hide');
                setTimeout(() => {
                    if (card.parentElement) {
                        card.remove();
                    }
                    state.missingReportsCount.delete(reportId);
                }, 300);
            }
        }
    });

    // Добавляем новые карточки для репортов, которых еще нет
    const newReports = [];
    currentReportsMap.forEach((reportData, reportId) => {
        if (!existingCardsMap.has(reportId)) {
            // Сбрасываем счетчик пропусков для нового репорта
            state.missingReportsCount.delete(reportId);
            newReports.push({ reportId, ...reportData });
        }
    });

    // Сортируем новых репортов по времени создания (новые сначала)
    newReports.sort((a, b) => b.createdAt - a.createdAt);

    // Добавляем новые карточки в правильном порядке
    newReports.forEach(({ reportId, report, createdAt }) => {
        // Проверяем, что карточки с таким ID еще нет
        const existingCard = reportsContainer.querySelector(`[data-report-id="${reportId}"]`);
        if (existingCard) {
            return; // Карточка уже существует, пропускаем
        }

        const card = createReportCard(report);
        // Сохраняем createdAt в атрибут для быстрого доступа
        card.setAttribute('data-report-created-at', String(createdAt));

        // Находим правильное место для вставки (по дате создания, новые сначала)
        const existingCards = reportsContainer.children;
        let insertBefore = null;

        // Ищем первую карточку, которая старше новой
        for (let i = 0; i < existingCards.length; i++) {
            const existingCardEl = existingCards[i];
            if (!existingCardEl.classList.contains('report-card')) continue;

            const existingCreatedAt = parseInt(existingCardEl.getAttribute('data-report-created-at') || '0');

            // Если текущая карточка старше новой (меньший createdAt), вставляем перед ней
            if (existingCreatedAt < createdAt) {
                insertBefore = existingCardEl;
                break;
            }
        }

        // Вставляем карточку в правильное место
        if (insertBefore) {
            reportsContainer.insertBefore(card, insertBefore);
        } else {
            // Если не нашли место (новая карточка самая старая), добавляем в конец
            reportsContainer.appendChild(card);
        }

        // Обновляем счетчик загруженных
        state.reportsLoaded++;
    });

    // Переупорядочиваем только если изменился createdAt у существующих карточек
    // Это происходит очень редко, поэтому переупорядочивание не должно вызывать мерцание
    {
        const allCards = Array.from(reportsContainer.querySelectorAll('.report-card'));
        if (allCards.length > 1) {
            let hasCreatedAtChanged = false;
            const infos = allCards.map(c => {
                const rid = c.getAttribute('data-report-id');
                const rd = currentReportsMap.get(rid);
                const tc = rd?.createdAt || 0;
                const cur = parseInt(c.getAttribute('data-report-created-at') || '0');
                // Проверяем, изменилось ли значение createdAt у существующей карточки
                if (tc !== cur && cur !== 0) { // cur !== 0 означает, что это не новая карточка
                    hasCreatedAtChanged = true;
                    c.setAttribute('data-report-created-at', String(tc));
                }
                return { el: c, tc };
            });

            if (hasCreatedAtChanged) {
                const desired = infos
                    .slice()
                    .sort((a, b) => (b.tc || 0) - (a.tc || 0))
                    .map(i => i.el);
                const currentOrder = allCards;
                const identical = desired.length === currentOrder.length && desired.every((el, idx) => el === currentOrder[idx]);

                if (!identical) {
                    // Используем более эффективный метод - перемещаем только те карточки, которые нужно
                    const toMove = [];
                    desired.forEach((desiredEl, desiredIdx) => {
                        const currentIdx = currentOrder.indexOf(desiredEl);
                        if (currentIdx !== desiredIdx) {
                            toMove.push({ el: desiredEl, targetIdx: desiredIdx });
                        }
                    });

                    // Перемещаем карточки по одной, начиная с конца, чтобы не нарушить индексы
                    toMove.sort((a, b) => b.targetIdx - a.targetIdx);
                    toMove.forEach(({ el, targetIdx }) => {
                        const targetEl = desired[targetIdx + 1] || null;
                        if (targetEl) {
                            reportsContainer.insertBefore(el, targetEl);
                        } else {
                            reportsContainer.appendChild(el);
                        }
                    });
                }
            }
        }
    }

    // Обновляем счетчик
    if (reportsCountEl) {
        reportsCountEl.textContent = activeReportsList.length;
    }
}



// Функция для обновления данных в существующей карточке репорта
function updateReportCardData(card, report) {
    // Найдем данные участников
    const findPlayerBySteamId = (steamId) => {
        for (const server of state.serversData) {
            if (server.live_data && server.live_data.players) {
                const player = server.live_data.players.find(p => normalizeSteamId(p.steam_id) === normalizeSteamId(steamId));
                if (player) {
                    return { player, server };
                }
            }
        }
        return null;
    };

    const senderData = findPlayerBySteamId(report.sender_steamid);
    const intruderData = findPlayerBySteamId(report.intruder_steamid);

    // Обновляем информацию о сервере в существующих карточках
    const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
    const setHTML = (el, html) => { if (el && el.innerHTML !== html) el.innerHTML = html; };

    if (intruderData?.server) {
        const serverName = intruderData.server.site_name || intruderData.server.name || 'Неизвестный сервер';
        const reportServerEl = card.querySelector('.report-server');
        setText(reportServerEl, `Сервер: ${serverName}`);
    }

    // Обновляем имена участников
    const senderNameEl = card.querySelector('.report-avatar-container:nth-child(1) .report-name');
    setText(senderNameEl, escapeHtml(report.sender || 'Неизвестный'));
    const intruderNameEl = card.querySelector('.report-avatar-container:nth-child(3) .report-name');
    setText(intruderNameEl, escapeHtml(report.intruder || 'Неизвестный'));

    // Обновляем причину
    const reasonEl = card.querySelector('.report-reason .report-reason-value');
    setText(reasonEl, escapeHtml(report.reason || 'Не указана'));

    const groups = card.querySelectorAll('.player-actions .btn-group');
    const senderId = report.sender_steamid || '';
    const intruderId = report.intruder_steamid || '';
    if (groups[0]) {
        const btns = groups[0].querySelectorAll('button');
        if (btns[0]) btns[0].setAttribute('onclick', `openFearProfile('${senderId}')`);
        if (btns[0]) btns[0].setAttribute('title', 'Профиль Fear отправителя');
        if (btns[1]) btns[1].setAttribute('onclick', `openSteamProfile('${senderId}')`);
        if (btns[1]) btns[1].setAttribute('title', 'Профиль Steam отправителя');
    }
    if (groups[1]) {
        const btns = groups[1].querySelectorAll('button');
        if (btns[0]) btns[0].setAttribute('onclick', `openFearProfile('${intruderId}')`);
        if (btns[0]) btns[0].setAttribute('title', 'Профиль Fear нарушителя');
        if (btns[1]) btns[1].setAttribute('onclick', `openSteamProfile('${intruderId}')`);
        if (btns[1]) btns[1].setAttribute('title', 'Профиль Steam нарушителя');
    }

    // Обновляем дату создания аккаунтов участников
    const senderTimecreated = (senderData?.player?.steamProfile?.timecreated) || report.sender_profile?.timecreated;
    if (senderTimecreated) {
        const senderDateObj = formatAccountDate(senderTimecreated);
        const senderAccountEl = card.querySelector('.report-avatar-container:nth-child(1) .account-created, .report-avatar-container:nth-child(1) .no-profile-badge, .report-avatar-container:nth-child(1) .participant-account');
        const titleText = senderDateObj.relativeTime ? `Аккаунт создан: ${senderDateObj.fullDate} ${senderDateObj.relativeTime}` : `Аккаунт создан: ${senderDateObj.fullDate}`;
        if (senderAccountEl && !senderAccountEl.classList.contains('account-created')) {
            senderAccountEl.className = 'account-created';
        }
        setHTML(senderAccountEl, `
            <div class="account-created-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span class="account-created-text">Steam аккаунт создан: ${senderDateObj.fullDate}</span>
            </div>
            <span class="account-relative-time">${senderDateObj.relativeTime || ''}</span>
        `);
        if (senderAccountEl) senderAccountEl.setAttribute('title', titleText);
    }

    const intruderTimecreated = (intruderData?.player?.steamProfile?.timecreated) || report.intruder_profile?.timecreated;
    if (intruderTimecreated) {
        const intruderDateObj = formatAccountDate(intruderTimecreated);
        const intruderAccountEl = card.querySelector('.report-avatar-container:nth-child(3) .account-created, .report-avatar-container:nth-child(3) .no-profile-badge, .report-avatar-container:nth-child(3) .participant-account');
        const titleText2 = intruderDateObj.relativeTime ? `Аккаунт создан: ${intruderDateObj.fullDate} ${intruderDateObj.relativeTime}` : `Аккаунт создан: ${intruderDateObj.fullDate}`;
        if (intruderAccountEl && !intruderAccountEl.classList.contains('account-created')) {
            intruderAccountEl.className = 'account-created';
        }
        setHTML(intruderAccountEl, `
            <div class="account-created-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span class="account-created-text">Steam аккаунт создан: ${intruderDateObj.fullDate}</span>
            </div>
            <span class="account-relative-time">${intruderDateObj.relativeTime || ''}</span>
        `);
        if (intruderAccountEl) intruderAccountEl.setAttribute('title', titleText2);
    }
}



// Загрузка дополнительной порции репортов (ленивая загрузка)
function loadMoreReports(isInitial = false) {
    const container = document.getElementById('reportsPlayers');
    if (!container) return;

    // Используем активные репорты из state (уже отфильтрованные)
    const activeReportsList = state.activeReportsList;

    if (!activeReportsList || state.reportsLoaded >= activeReportsList.length) return; // Все активные уже загружены

    // Определяем, сколько элементов загрузить
    const reportsToLoad = isInitial ? ITEMS_PER_PAGE : ITEMS_PER_PAGE;
    const startIndex = state.reportsLoaded;
    const endIndex = Math.min(startIndex + reportsToLoad, activeReportsList.length);

    // Загружаем элементы
    let cardsAdded = 0; // Счетчик реально добавленных карточек
    for (let i = startIndex; i < endIndex; i++) {
        const report = activeReportsList[i];
        const card = createReportCard(report);

        // Добавляем задержку для плавной анимации появления (только для реально добавленных)
        card.style.animationDelay = `${cardsAdded * 0.05}s`;
        container.appendChild(card);
        cardsAdded++;
    }

    // Обновляем счетчик загруженных элементов
    state.reportsLoaded = endIndex;
}

// Глобальная функция для просмотра деталей репорта
window.viewReportDetails = function(reportId) {
    if (!reportId) return;

    // Получаем детали репорта
    fetch(`https://api.fearproject.ru/reports/${reportId}`, {
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) throw new Error('Не удалось загрузить детали репорта');
        return response.json();
    })
    .then(reportData => {
        showReportModal(reportData);
    })
    .catch(error => {
        console.error('Ошибка загрузки деталей репорта:', error);
        showToast('Не удалось загрузить детали репорта', 'error');
    });
};

// Показ модального окна с деталями репорта
function showReportModal(reportData) {
    // Создаем модальное окно
    const modal = document.createElement('div');
    modal.className = 'modal report-modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 700px;">
            <h2>Детали репорта #${reportData.id || 'N/A'}</h2>

            <div class="report-modal-header">
                <div class="report-participants">
                    <div class="participant">
                        <img src="${reportData.sender_avatar || ''}" alt="Отправитель" class="participant-avatar" onerror="this.src='https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'">
                        <div class="participant-info">
                            <div class="participant-label">Отправитель</div>
                            <div class="participant-name">${escapeHtml(reportData.sender || '')}</div>
                            <div class="participant-steamid">SteamID: ${reportData.sender_steamid || 'N/A'}</div>
                        </div>
                    </div>

                    <div class="report-arrow">→</div>

                    <div class="participant">
                        <img src="${reportData.intruder_avatar || ''}" alt="Нарушитель" class="participant-avatar" onerror="this.src='https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'">
                        <div class="participant-info">
                            <div class="participant-label participant-label-reported">Жалоба на</div>
                            <div class="participant-name">${escapeHtml(reportData.intruder || '')}</div>
                            <div class="participant-steamid">SteamID: ${reportData.intruder_steamid || 'N/A'}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="report-modal-details">
                <div class="detail-row">
                    <strong>Причина:</strong> ${escapeHtml(reportData.reason || '')}
                </div>
                <div class="detail-row">
                    <strong>Сервер:</strong> ${escapeHtml(reportData.server_name || '')} (${reportData.server_ip || ''}:${reportData.server_port || ''})
                </div>
                <div class="detail-row">
                    <strong>Время создания:</strong> ${formatReportDate(reportData.created_at)}
                </div>
                <div class="detail-row">
                    <strong>Статус:</strong> ${reportData.result ? escapeHtml(reportData.result) : 'В обработке'}
                </div>
            </div>

            <div class="report-modal-actions">
                <button class="btn" onclick="openSteamProfile('${reportData.intruder_steamid || ''}')">Профиль нарушителя</button>
                <button class="btn btn-primary" onclick="connectToServer('${reportData.server_ip || '0.0.0.0'}', '${reportData.server_port || '27015'}')">Подключиться к серверу</button>
            </div>

            <div class="modal-buttons">
                <button class="btn" onclick="closeModal()">Закрыть</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Показываем модальное окно
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);

    // Функция закрытия
    window.closeModal = function() {
        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    };

    // Закрытие по клику вне модального окна
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}
// Оптимизированное отображение репортов
function displayReportsOptimized(isInitial = true) {
    const reportsContainer = document.getElementById('reportsPlayers');
    const emptyReports = document.getElementById('emptyReports');
    const reportsCountEl = document.getElementById('reportsCount');
    if (!reportsContainer) return;

    // Если репорты еще не загружены, показываем пустое состояние
    if (!state.reportsLoaded) {
        if (emptyReports) {
            emptyReports.style.display = 'flex';
            emptyReports.innerHTML = `
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <p>нет активных игроков с репортами</p>
            `;
        }
        return;
    }

    // Собираем активных игроков
    const activePlayersSet = new Set();
    state.serversData.forEach(server => {
        if (server.live_data && server.live_data.players) {
            server.live_data.players.forEach(player => {
                if (player.steam_id) {
                    activePlayersSet.add(normalizeSteamId(player.steam_id));
                }
            });
        }
    });

    // Фильтруем репорты нарушителей, которые сейчас в игре
    const activeReportsList = (state.reportsList || [])
        .filter(report => activePlayersSet.has(normalizeSteamId(report.intruder_steamid)))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Обновляем счетчик
    if (reportsCountEl) reportsCountEl.textContent = String(activeReportsList.length);

    // Пустое состояние
    if (activeReportsList.length === 0) {
        if (emptyReports) {
            emptyReports.style.display = 'flex';
            emptyReports.innerHTML = `
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"></path>
                </svg>
                <p>Никаких активных игроков с репортами нет</p>
            `;
        }
        reportsContainer.innerHTML = '';
        state.lastReportsHash = createReportsHash([]);
        state.reportsLoaded = 0;
        return;
    } else if (emptyReports) {
        emptyReports.style.display = 'none';
    }

    const newReportsHash = createReportsHash(activeReportsList);
    const hasExistingCards = reportsContainer.querySelectorAll('.report-card').length > 0;

    if (isInitial || !hasExistingCards) {
        // Первичная отрисовка
        const prevScrollTop = reportsContainer.scrollTop;
        const prevHeight = reportsContainer.scrollHeight;
        reportsContainer.innerHTML = '';
        const reportsToShow = ITEMS_PER_PAGE >= activeReportsList.length ? activeReportsList : activeReportsList.slice(0, ITEMS_PER_PAGE);
        reportsToShow.forEach((report, index) => {
            const card = createReportCard(report);
            card.style.animationDelay = `${index * 0.05}s`;
            reportsContainer.appendChild(card);
            state.reportCardsMap.set(String(report.id), card);
            state.missingReportsCount.set(String(report.id), 0);
        });
        state.reportsLoaded = reportsToShow.length;
        state.lastReportsHash = newReportsHash;
        reportsContainer.scrollTop = prevScrollTop;
        setupReportsScrollHandler();
    } else {
        // Инкрементальное обновление
        updateReportsIncremental(activeReportsList);
        state.lastReportsHash = newReportsHash;
    }
}

// Инкрементальное обновление (без полной перерисовки)
function updateReportsIncremental(activeReportsList) {
    const reportsContainer = document.getElementById('reportsPlayers');
    if (!reportsContainer) return;

    const prevScrollTop = reportsContainer.scrollTop;
    const prevHeight = reportsContainer.scrollHeight;

    const existingCards = Array.from(reportsContainer.querySelectorAll('.report-card'));
    const existingMap = new Map();
    existingCards.forEach(card => {
        const id = String(card.getAttribute('data-report-id'));
        if (id) existingMap.set(id, card);
    });

    const activeMap = new Map(activeReportsList.map(r => [String(r.id), r]));
    const activeIds = new Set(activeMap.keys());

    // Обновление содержимого активных карточек
    activeMap.forEach((report, id) => {
        const card = existingMap.get(id);
        if (card) {
            updateReportCardData(card, report);
            state.missingReportsCount.set(id, 0);
        }
    });

    // Мягкое удаление отсутствующих (после 3 пропусков)
    existingMap.forEach((card, id) => {
        if (!activeIds.has(id)) {
            const miss = (state.missingReportsCount.get(id) || 0) + 1;
            state.missingReportsCount.set(id, miss);
            if (miss >= 3) {
                card.remove();
                state.reportCardsMap.delete(id);
                state.missingReportsCount.delete(id);
            }
        }
    });

    // Добавление новых, максимум 5 за раз, с сохранением порядка
    const toAdd = activeReportsList.filter(r => !existingMap.has(String(r.id)))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);

    toAdd.forEach(report => {
        const card = createReportCard(report);
        card.style.animationDelay = '0s';
        const newCreatedAt = new Date(report.created_at).getTime();
        const allCards = reportsContainer.children;
        let insertBefore = null;
        for (let i = 0; i < allCards.length; i++) {
            const existingCard = allCards[i];
            if (!existingCard.classList || !existingCard.classList.contains('report-card')) continue;
            const existingCreatedAt = parseInt(existingCard.getAttribute('data-report-created-at') || '0');
            if (existingCreatedAt < newCreatedAt) {
                insertBefore = existingCard;
                break;
            }
        }
        if (insertBefore) reportsContainer.insertBefore(card, insertBefore);
        else reportsContainer.appendChild(card);
        state.reportCardsMap.set(String(report.id), card);
        state.missingReportsCount.set(String(report.id), 0);
    });

    const newHeight = reportsContainer.scrollHeight;
    reportsContainer.scrollTop = prevScrollTop;
    state.reportsLoaded = reportsContainer.querySelectorAll('.report-card').length;
}
