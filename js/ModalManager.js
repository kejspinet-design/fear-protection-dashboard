/**
 * ModalManager class for handling modal windows
 */
class ModalManager {
    constructor() {
        this.currentModal = null;
        this.init();
    }

    /**
     * Initialize modal manager
     */
    init() {
        // Create modal container
        this.createModalContainer();
        
        // Bind footer links
        this.bindFooterLinks();
        
        console.info('[ModalManager] Initialized');
    }

    /**
     * Create modal container in DOM
     */
    createModalContainer() {
        const modalHTML = `
            <div id="modal-overlay" class="modal-overlay" style="display: none;">
                <div class="modal-container">
                    <div class="modal-header">
                        <h2 id="modal-title"></h2>
                        <button class="modal-close" id="modal-close-btn">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="modal-body" id="modal-body"></div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Bind close events
        document.getElementById('modal-close-btn').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') {
                this.closeModal();
            }
        });
        
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentModal) {
                this.closeModal();
            }
        });
    }

    /**
     * Bind footer links to modal windows
     */
    bindFooterLinks() {
        const aboutLink = document.querySelector('a[href="#about"]');
        const privacyLink = document.querySelector('a[href="#privacy"]');
        const termsLink = document.querySelector('a[href="#terms"]');
        
        if (aboutLink) {
            aboutLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showAboutModal();
            });
        }
        
        if (privacyLink) {
            privacyLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showPrivacyModal();
            });
        }
        
        if (termsLink) {
            termsLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showTermsModal();
            });
        }
    }

    /**
     * Show About modal
     */
    showAboutModal() {
        const title = 'О проекте Fear Protection';
        const content = `
            <div class="modal-section">
                <h3>🛡️ Система мониторинга игровых серверов</h3>
                <p>Fear Protection — это современная система мониторинга игровых серверов Counter-Strike в реальном времени.</p>
            </div>
            
            <div class="modal-section">
                <h3>🎯 Основные возможности</h3>
                <ul>
                    <li><strong>Мониторинг новых аккаунтов</strong> — отслеживание игроков с недавно созданными аккаунтами Steam</li>
                    <li><strong>Детекция VAC банов</strong> — автоматическое обнаружение игроков с VAC банами</li>
                    <li><strong>Система репортов</strong> — просмотр последних жалоб на игроков</li>
                    <li><strong>Обновление в реальном времени</strong> — данные обновляются каждые 30 секунд</li>
                    <li><strong>Подробная статистика</strong> — информация о серверах, игроках и их активности</li>
                </ul>
            </div>
            
            <div class="modal-section">
                <h3>⚡ Технологии</h3>
                <p>Проект использует современные веб-технологии для обеспечения быстрой и стабильной работы:</p>
                <ul>
                    <li>Интеграция с Fear Project API</li>
                    <li>Интеграция с Steam Web API</li>
                    <li>Автоматическое обновление данных</li>
                    <li>Адаптивный дизайн для всех устройств</li>
                </ul>
            </div>
            
            <div class="modal-section">
                <h3>📞 Контакты</h3>
                <p>По всем вопросам обращайтесь на официальный сайт <a href="https://fearproject.ru" target="_blank">fearproject.ru</a></p>
            </div>
        `;
        
        this.openModal(title, content);
    }

    /**
     * Show Privacy modal
     */
    showPrivacyModal() {
        const title = 'Политика конфиденциальности';
        const content = `
            <div class="modal-section">
                <h3>📋 Общие положения</h3>
                <p>Настоящая Политика конфиденциальности определяет порядок обработки и защиты информации о пользователях сервиса Fear Protection.</p>
            </div>
            
            <div class="modal-section">
                <h3>🔍 Какие данные мы собираем</h3>
                <p>Fear Protection собирает только публично доступную информацию:</p>
                <ul>
                    <li><strong>Данные Steam</strong> — публичные профили игроков, доступные через Steam Web API</li>
                    <li><strong>Игровая статистика</strong> — информация о серверах и игроках из Fear Project API</li>
                    <li><strong>VAC статус</strong> — публичная информация о банах из Steam API</li>
                </ul>
                <p><strong>Мы НЕ собираем:</strong></p>
                <ul>
                    <li>Личные данные пользователей</li>
                    <li>Пароли или токены доступа</li>
                    <li>Платежную информацию</li>
                    <li>Историю браузера</li>
                </ul>
            </div>
            
            <div class="modal-section">
                <h3>🔒 Как мы защищаем данные</h3>
                <ul>
                    <li>Все данные получаются из официальных публичных API</li>
                    <li>Мы не храним персональные данные пользователей</li>
                    <li>Соединение защищено современными протоколами безопасности</li>
                </ul>
            </div>
            
            <div class="modal-section">
                <h3>🍪 Использование cookies</h3>
                <p>Сайт использует минимальное количество cookies для обеспечения корректной работы сервиса. Мы не используем cookies для отслеживания или рекламы.</p>
            </div>
            
            <div class="modal-section">
                <h3>📧 Контакты</h3>
                <p>По вопросам конфиденциальности обращайтесь: <a href="https://fearproject.ru/support" target="_blank">fearproject.ru/support</a></p>
            </div>
            
            <div class="modal-section modal-footer-note">
                <p><em>Последнее обновление: 15 апреля 2026 года</em></p>
            </div>
        `;
        
        this.openModal(title, content);
    }

    /**
     * Show Terms modal
     */
    showTermsModal() {
        const title = 'Условия использования';
        const content = `
            <div class="modal-section">
                <h3>📜 Общие условия</h3>
                <p>Используя сервис Fear Protection, вы соглашаетесь с настоящими Условиями использования.</p>
            </div>
            
            <div class="modal-section">
                <h3>✅ Разрешенное использование</h3>
                <ul>
                    <li>Просмотр информации о серверах и игроках</li>
                    <li>Мониторинг игровой активности</li>
                    <li>Использование данных для модерации серверов</li>
                    <li>Личное некоммерческое использование</li>
                </ul>
            </div>
            
            <div class="modal-section">
                <h3>❌ Запрещенное использование</h3>
                <ul>
                    <li><strong>Автоматический парсинг</strong> — использование ботов или скриптов для массового сбора данных</li>
                    <li><strong>DDoS атаки</strong> — попытки перегрузить сервис запросами</li>
                    <li><strong>Обход защиты</strong> — попытки получить несанкционированный доступ</li>
                    <li><strong>Коммерческое использование</strong> — продажа или перепродажа данных без разрешения</li>
                    <li><strong>Харассмент</strong> — использование данных для преследования игроков</li>
                </ul>
            </div>
            
            <div class="modal-section">
                <h3>⚖️ Ответственность</h3>
                <p>Сервис предоставляется "как есть" без каких-либо гарантий:</p>
                <ul>
                    <li>Мы не гарантируем 100% точность данных</li>
                    <li>Мы не несем ответственности за действия третьих лиц</li>
                    <li>Сервис может быть временно недоступен для обслуживания</li>
                    <li>Мы оставляем за собой право изменять условия использования</li>
                </ul>
            </div>
            
            <div class="modal-section">
                <h3>🔄 Изменения условий</h3>
                <p>Мы оставляем за собой право изменять настоящие Условия использования в любое время. Продолжение использования сервиса после внесения изменений означает ваше согласие с новыми условиями.</p>
            </div>
            
            <div class="modal-section">
                <h3>📧 Контакты</h3>
                <p>По вопросам использования сервиса обращайтесь: <a href="https://fearproject.ru/support" target="_blank">fearproject.ru/support</a></p>
            </div>
            
            <div class="modal-section modal-footer-note">
                <p><em>Последнее обновление: 15 апреля 2026 года</em></p>
            </div>
        `;
        
        this.openModal(title, content);
    }

    /**
     * Open modal with title and content
     */
    openModal(title, content) {
        const overlay = document.getElementById('modal-overlay');
        const titleEl = document.getElementById('modal-title');
        const bodyEl = document.getElementById('modal-body');
        
        titleEl.textContent = title;
        bodyEl.innerHTML = content;
        
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        this.currentModal = title;
        
        console.info('[ModalManager] Opened modal:', title);
    }

    /**
     * Close current modal
     */
    closeModal() {
        const overlay = document.getElementById('modal-overlay');
        overlay.style.display = 'none';
        document.body.style.overflow = '';
        
        this.currentModal = null;
        
        console.info('[ModalManager] Closed modal');
    }
}
