/**
 * TimeUpdater class for real-time updates of account age
 */
class TimeUpdater {
    constructor(timeFormatter) {
        this.timeFormatter = timeFormatter;
        this.updateInterval = null;
    }

    /**
     * Start updating account ages every second
     */
    start() {
        // Update immediately
        this.updateAllAccountAges();
        
        // Then update every second
        this.updateInterval = setInterval(() => {
            this.updateAllAccountAges();
        }, 1000);
        
        console.info('[TimeUpdater] Started real-time updates');
    }

    /**
     * Stop updating
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.info('[TimeUpdater] Stopped real-time updates');
        }
    }

    /**
     * Update all account ages on the page
     */
    updateAllAccountAges() {
        // Find all player cards with timecreated attribute
        const cards = document.querySelectorAll('.player-card[data-timecreated]');
        
        cards.forEach(card => {
            const timecreated = parseInt(card.getAttribute('data-timecreated'));
            if (!timecreated) return;
            
            // Find the relative time element
            const relativeTimeEl = card.querySelector('.account-date-relative');
            if (!relativeTimeEl) return;
            
            // Update the time
            const dateObj = this.timeFormatter.formatAccountDate(timecreated);
            if (dateObj.relativeTime) {
                relativeTimeEl.textContent = dateObj.relativeTime;
            }
        });
    }
}
