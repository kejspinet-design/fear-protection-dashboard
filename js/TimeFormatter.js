/**
 * TimeFormatter class for handling Russian date/time formatting and pluralization
 * Validates: Requirements 13.1, 13.4
 */
class TimeFormatter {
    /**
     * Pluralize Russian words based on count
     * @param {number} count - The number to determine pluralization
     * @param {Array<string>} forms - Array of three forms: [one, few, many]
     *   Example: ['день', 'дня', 'дней'] for "day"
     * @returns {string} The correctly pluralized form
     * 
     * Russian pluralization rules:
     * - Use form[0] (one) when count ends in 1 but not 11 (1, 21, 31, 41, ...)
     * - Use form[1] (few) when count ends in 2-4 but not 12-14 (2, 3, 4, 22, 23, 24, ...)
     * - Use form[2] (many) for all other cases (0, 5-20, 25-30, ...)
     */
    pluralize(count, forms) {
        const absCount = Math.abs(count);
        const lastDigit = absCount % 10;
        const lastTwoDigits = absCount % 100;
        
        // Special case: 11-14 always use "many" form
        if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
            return forms[2]; // many
        }
        
        // Check last digit
        if (lastDigit === 1) {
            return forms[0]; // one
        }
        
        if (lastDigit >= 2 && lastDigit <= 4) {
            return forms[1]; // few
        }
        
        // All other cases (0, 5-9, and already handled 11-14)
        return forms[2]; // many
    }

    /**
     * Format account age from Unix timestamp to current time
     * @param {number} unixTimestamp - Unix timestamp (seconds since epoch) of account creation
     * @returns {string} Formatted age string in Russian
     * 
     * Validates: Requirements 3.5, 13.4, 13.5
     * 
     * Example output: "2 дня 5 часов 30 минут 15 секунд назад"
     */
    formatAccountAge(unixTimestamp) {
        // Calculate time difference in milliseconds
        const now = Date.now();
        const accountCreated = unixTimestamp * 1000; // Convert to milliseconds
        const diffMs = now - accountCreated;
        
        // Calculate time units
        const totalSeconds = Math.floor(diffMs / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        // Apply Russian pluralization
        const daysText = this.pluralize(days, ['день', 'дня', 'дней']);
        const hoursText = this.pluralize(hours, ['час', 'часа', 'часов']);
        const minutesText = this.pluralize(minutes, ['минута', 'минуты', 'минут']);
        const secondsText = this.pluralize(seconds, ['секунда', 'секунды', 'секунд']);
        
        // Format output string
        return `${days} ${daysText} ${hours} ${hoursText} ${minutes} ${minutesText} ${seconds} ${secondsText} назад`;
    }

    /**
     * Format report date with Russian localization
     * @param {string|Date} date - Date to format
     * @returns {string} Formatted date string
     * 
     * Validates: Requirements 5.5, 5.6, 5.7, 13.2, 13.3, 13.5
     * 
     * Examples:
     * - Today: "сегодня, 15:32"
     * - Yesterday: "вчера, 12:10"
     * - Older: "15.04.2026, 09:45"
     */
    formatReportDate(date) {
        const reportDate = new Date(date);
        const now = new Date();
        
        // Reset time to midnight for date comparison
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const reportMidnight = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate());
        
        const diffDays = Math.floor((todayMidnight - reportMidnight) / (1000 * 60 * 60 * 24));
        
        // Format time as HH:MM
        const hours = String(reportDate.getHours()).padStart(2, '0');
        const minutes = String(reportDate.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;
        
        if (diffDays === 0) {
            return `сегодня, ${timeStr}`;
        } else if (diffDays === 1) {
            return `вчера, ${timeStr}`;
        } else {
            // Format as DD.MM.YYYY, HH:MM
            const day = String(reportDate.getDate()).padStart(2, '0');
            const month = String(reportDate.getMonth() + 1).padStart(2, '0');
            const year = reportDate.getFullYear();
            return `${day}.${month}.${year}, ${timeStr}`;
        }
    }

    /**
     * Format last update timestamp
     * @param {Date} date - Date to format
     * @returns {string} Formatted timestamp string
     * 
     * Validates: Requirements 6.4, 6.5, 13.2, 13.3
     * 
     * Example: "Последнее обновление: 15.04.2026 14:32:45"
     */
    formatLastUpdate(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `Последнее обновление: ${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * Format account date with full date and relative time
     * @param {number} unixTimestamp - Unix timestamp (seconds since epoch)
     * @returns {Object} Object with fullDate and relativeTime
     * 
     * Example: { fullDate: "15.04.2026", relativeTime: "2 дня 5 часов 30 минут 15 секунд назад" }
     */
    formatAccountDate(unixTimestamp) {
        const accountCreated = new Date(unixTimestamp * 1000);
        const now = new Date();
        
        // Full date format: DD.MM.YYYY
        const day = String(accountCreated.getDate()).padStart(2, '0');
        const month = String(accountCreated.getMonth() + 1).padStart(2, '0');
        const year = accountCreated.getFullYear();
        const fullDate = `${day}.${month}.${year}`;
        
        // Relative time with hours, minutes, seconds
        const diffMs = now - accountCreated;
        const totalSeconds = Math.floor(diffMs / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        let relativeTime = '';
        
        if (days > 0) {
            const daysText = this.pluralize(days, ['день', 'дня', 'дней']);
            const hoursText = this.pluralize(hours, ['час', 'часа', 'часов']);
            const minutesText = this.pluralize(minutes, ['минута', 'минуты', 'минут']);
            const secondsText = this.pluralize(seconds, ['секунда', 'секунды', 'секунд']);
            relativeTime = `${days} ${daysText} ${hours} ${hoursText} ${minutes} ${minutesText} ${seconds} ${secondsText} назад`;
        } else if (hours > 0) {
            const hoursText = this.pluralize(hours, ['час', 'часа', 'часов']);
            const minutesText = this.pluralize(minutes, ['минута', 'минуты', 'минут']);
            const secondsText = this.pluralize(seconds, ['секунда', 'секунды', 'секунд']);
            relativeTime = `${hours} ${hoursText} ${minutes} ${minutesText} ${seconds} ${secondsText} назад`;
        } else if (minutes > 0) {
            const minutesText = this.pluralize(minutes, ['минута', 'минуты', 'минут']);
            const secondsText = this.pluralize(seconds, ['секунда', 'секунды', 'секунд']);
            relativeTime = `${minutes} ${minutesText} ${seconds} ${secondsText} назад`;
        } else {
            const secondsText = this.pluralize(seconds, ['секунда', 'секунды', 'секунд']);
            relativeTime = `${seconds} ${secondsText} назад`;
        }
        
        return { fullDate, relativeTime };
    }
}
