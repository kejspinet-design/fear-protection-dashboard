# Fear Protection Dashboard

Современная система мониторинга игровых серверов Counter-Strike в реальном времени.

## 🎯 Возможности

- **Мониторинг новых аккаунтов** — отслеживание игроков с недавно созданными аккаунтами Steam
- **Детекция VAC банов** — автоматическое обнаружение игроков с VAC банами
- **Система репортов** — просмотр последних жалоб на игроков
- **Обновление в реальном времени** — данные обновляются каждые 30 секунд
- **Подробная статистика** — информация о серверах, игроках и их активности

## 🚀 Технологии

- Vanilla JavaScript (ES6+)
- HTML5 & CSS3
- Fear Project API
- Steam Web API
- Node.js (для CORS прокси)

## 📦 Установка

### Локальная разработка

1. Клонируйте репозиторий:
```bash
git clone <repository-url>
cd fear-protection-dashboard
```

2. Установите зависимости:
```bash
npm install
```

3. Запустите прокси-сервер:
```bash
npm start
```

4. Откройте `index.html` в браузере или используйте Live Server

## 🌐 Деплой на Vercel

### Автоматический деплой

1. Подключите репозиторий к Vercel
2. Vercel автоматически определит настройки
3. Деплой произойдет автоматически

### Ручной деплой

```bash
npm install -g vercel
vercel
```

## 📁 Структура проекта

```
fear-protection-dashboard/
├── css/
│   ├── dashboard.css      # Основные стили
│   └── style.css          # Стили карточек
├── js/
│   ├── APIClient.js       # API клиент
│   ├── App.js             # Главный класс приложения
│   ├── AutoRefreshTimer.js # Таймер автообновления
│   ├── ModalManager.js    # Управление модальными окнами
│   ├── Renderer.js        # Рендеринг UI
│   ├── StateManager.js    # Управление состоянием
│   ├── TimeFormatter.js   # Форматирование времени
│   └── TimeUpdater.js     # Обновление времени в реальном времени
├── index.html             # Главная страница
├── proxy-server.js        # CORS прокси сервер
├── package.json           # Зависимости проекта
└── app.ico               # Иконка приложения
```

## 🔧 Конфигурация

### API Endpoints

Проект использует следующие API:

- **Fear Project API**: `https://api.fearproject.ru/servers/`
- **Steam Web API**: `https://api.steampowered.com/`

### Прокси сервер

Для обхода CORS ограничений используется Node.js прокси на порту 3000:

```javascript
// Локальная разработка
fearApiBase: 'http://localhost:3000/api/fear'
steamApiBase: 'http://localhost:3000/api/steam'

// Production (Vercel)
fearApiBase: 'https://your-app.vercel.app/api/fear'
steamApiBase: 'https://your-app.vercel.app/api/steam'
```

## 🎨 Дизайн

- Современный тёмный дизайн с оранжевыми акцентами
- Glassmorphism эффекты
- Анимированный градиентный фон
- Адаптивная вёрстка для всех устройств
- Плавные анимации и переходы

## 📝 Лицензия

© 2026 Fear Protection. Все права защищены.

## 🤝 Контакты

По всем вопросам обращайтесь на [fearproject.ru](https://fearproject.ru)
