// Виртуальный скроллинг для оптимизации производительности
// Рендерит только видимые элементы + буфер

const INITIAL_LOAD = 10; // Начальная загрузка - ОГРАНИЧЕНО ДО 10
const MAX_ITEMS = 10; // МАКСИМУМ 10 карточек
const LOAD_MORE_COUNT = 15; // Сколько загружать при скролле
const SCROLL_THRESHOLD = 200; // Порог в пикселях до конца для загрузки

// Настройка виртуального скроллинга для контейнеров
function setupVirtualScrolling() {
    const containers = [
        { id: 'allPlayers', type: 'all' },
        { id: 'unconfiguredPlayers', type: 'unconfigured' },
        { id: 'reportsPlayers', type: 'reports' }
    ];

    containers.forEach(({ id, type }) => {
        const container = document.getElementById(id);
        if (!container) return;

        // Throttled scroll handler
        const handleScroll = throttle(() => {
            loadMoreOnScroll(container, type);
        }, 100);

        container.addEventListener('scroll', handleScroll);
    });
}

// Загрузка дополнительных элементов при скролле
function loadMoreOnScroll(container, type) {
    // ОТКЛЮЧЕНО: Не загружаем больше 10 элементов
    return;
    
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    const scrollHeight = container.scrollHeight;

    // Проверяем, близко ли к концу
    if (scrollTop + containerHeight >= scrollHeight - SCROLL_THRESHOLD) {
        const list = getList(type);
        if (!list) return;

        const currentLoaded = state.virtualScroll[type].loaded || INITIAL_LOAD;
        
        // ОГРАНИЧЕНИЕ: Не больше MAX_ITEMS (10)
        if (currentLoaded >= MAX_ITEMS) return;
        
        // Если есть ещё элементы для загрузки
        if (currentLoaded < list.length) {
            const newLoaded = Math.min(currentLoaded + LOAD_MORE_COUNT, list.length, MAX_ITEMS);
            state.virtualScroll[type].loaded = newLoaded;
            
            // Добавляем новые элементы
            appendItems(container, type, currentLoaded, newLoaded);
        }
    }
}

// Получение списка по типу
function getList(type) {
    switch (type) {
        case 'all':
            return state.allPlayersList;
        case 'unconfigured':
            return state.unconfiguredPlayersList;
        case 'reports':
            return state.activeReportsList;
        default:
            return null;
    }
}

// Добавление элементов в конец списка
function appendItems(container, type, startIndex, endIndex) {
    const list = getList(type);
    if (!list) return;

    // ОГРАНИЧЕНИЕ: Не добавляем больше MAX_ITEMS
    if (startIndex >= MAX_ITEMS) return;
    endIndex = Math.min(endIndex, MAX_ITEMS);

    const fragment = document.createDocumentFragment();
    const itemsToAdd = list.slice(startIndex, endIndex);

    itemsToAdd.forEach((item) => {
        let card;
        if (type === 'reports') {
            card = createReportCard(item);
        } else {
            const { player, server, steamProfile } = item;
            card = createPlayerCard(player, server, steamProfile);
        }
        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

// Рендеринг виртуального списка (начальная загрузка)
function renderVirtualList(type) {
    const containerId = type === 'all' ? 'allPlayers' : 
                       type === 'unconfigured' ? 'unconfiguredPlayers' : 
                       'reportsPlayers';
    
    const container = document.getElementById(containerId);
    if (!container) return;

    const list = getList(type);
    if (!list || list.length === 0) {
        container.innerHTML = '';
        state.virtualScroll[type].loaded = 0;
        return;
    }

    // Сохраняем позицию скролла
    const scrollTop = container.scrollTop;

    // ОГРАНИЧЕНИЕ: Загружаем максимум MAX_ITEMS (10)
    const loadCount = Math.min(INITIAL_LOAD, list.length, MAX_ITEMS);
    state.virtualScroll[type].loaded = loadCount;

    const fragment = document.createDocumentFragment();
    const itemsToRender = list.slice(0, loadCount);

    itemsToRender.forEach((item) => {
        let card;
        if (type === 'reports') {
            card = createReportCard(item);
        } else {
            const { player, server, steamProfile } = item;
            card = createPlayerCard(player, server, steamProfile);
        }
        fragment.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(fragment);

    // Восстанавливаем позицию скролла
    if (scrollTop > 0) {
        container.scrollTop = scrollTop;
    }
}

// Инкрементальное обновление списка (добавление/удаление элементов)
function updateVirtualListIncremental(type, newList) {
    const containerId = type === 'all' ? 'allPlayers' : 
                       type === 'unconfigured' ? 'unconfiguredPlayers' : 
                       'reportsPlayers';
    
    const container = document.getElementById(containerId);
    if (!container) return;

    // Сохраняем позицию скролла
    const scrollTop = container.scrollTop;

    // Получаем текущие карточки
    const existingCards = Array.from(container.children);
    const existingIds = new Set(
        existingCards.map(card => 
            card.getAttribute('data-player-id') || card.getAttribute('data-report-id')
        ).filter(Boolean)
    );

    // Создаём Set новых ID
    const newIds = new Set(newList.map(item => getItemId(item, type)));

    // Находим удалённые элементы
    const removedIds = [...existingIds].filter(id => !newIds.has(id));
    
    // Удаляем карточки с анимацией
    if (removedIds.length > 0) {
        removedIds.forEach(id => {
            const card = container.querySelector(`[data-player-id="${id}"], [data-report-id="${id}"]`);
            if (card) {
                card.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.95)';
                setTimeout(() => card.remove(), 200);
            }
        });
    }

    // Находим новые элементы
    const addedItems = newList.filter(item => !existingIds.has(getItemId(item, type)));
    
    // Добавляем новые карточки (только если они в пределах загруженных)
    const currentLoaded = state.virtualScroll[type].loaded || INITIAL_LOAD;
    
    if (addedItems.length > 0 && existingCards.length < currentLoaded) {
        const itemsToAdd = addedItems.slice(0, currentLoaded - existingCards.length + addedItems.length);
        
        if (itemsToAdd.length > 0) {
            const fragment = document.createDocumentFragment();
            
            itemsToAdd.forEach((item) => {
                let card;
                if (type === 'reports') {
                    card = createReportCard(item);
                } else {
                    const { player, server, steamProfile } = item;
                    card = createPlayerCard(player, server, steamProfile);
                }
                card.style.opacity = '0';
                card.style.transform = 'scale(0.95)';
                card.style.transition = 'opacity 0.3s ease-in, transform 0.3s ease-in';
                fragment.appendChild(card);
            });

            // Добавляем в начало списка
            if (container.firstChild) {
                container.insertBefore(fragment, container.firstChild);
            } else {
                container.appendChild(fragment);
            }
            
            // Анимация появления
            requestAnimationFrame(() => {
                const newCards = Array.from(container.children).slice(0, itemsToAdd.length);
                newCards.forEach(card => {
                    card.style.opacity = '1';
                    card.style.transform = 'scale(1)';
                });
            });
        }
    }

    // Восстанавливаем позицию скролла
    requestAnimationFrame(() => {
        if (scrollTop > 0) {
            container.scrollTop = scrollTop;
        }
    });
}

// Получение уникального ID элемента
function getItemId(item, type) {
    if (type === 'reports') {
        return item.id;
    } else {
        return item.player?.steam_id || Math.random();
    }
}

// Инициализация виртуального скроллинга для списка
function initVirtualList(type) {
    const list = getList(type);
    
    const container = document.getElementById(
        type === 'all' ? 'allPlayers' : 
        type === 'unconfigured' ? 'unconfiguredPlayers' : 
        'reportsPlayers'
    );

    if (!container) return;

    // Если список пустой - очищаем контейнер
    if (!list || list.length === 0) {
        container.innerHTML = '';
        state.virtualScroll[type].loaded = 0;
        return;
    }

    // Если контейнер пустой - делаем первую загрузку
    if (container.children.length === 0) {
        renderVirtualList(type);
    } else {
        // Инкрементальное обновление
        updateVirtualListIncremental(type, list);
    }
}
