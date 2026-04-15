/**
 * AutoRefreshTimer class for managing periodic data updates
 * Validates: Requirements 7.2
 */
class AutoRefreshTimer {
    constructor(interval, callback) {
        this.interval = interval; // milliseconds
        this.callback = callback;
        this.intervalId = null;
        this.isRunning = false;
    }

    /**
     * Start the timer
     * 
     * Validates: Requirements 7.2
     */
    start() {
        if (this.isRunning) {
            console.warn('[AutoRefreshTimer] Timer already running');
            return;
        }
        
        this.intervalId = setInterval(() => {
            console.info('[AutoRefreshTimer] Triggering refresh');
            this.callback();
        }, this.interval);
        
        this.isRunning = true;
        console.info('[AutoRefreshTimer] Timer started with interval:', this.interval);
    }

    /**
     * Stop the timer
     * 
     * Validates: Requirements 7.2
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.isRunning = false;
            console.info('[AutoRefreshTimer] Timer stopped');
        }
    }

    /**
     * Reset the timer (stop and start again)
     * 
     * Validates: Requirements 7.2
     */
    reset() {
        this.stop();
        this.start();
        console.info('[AutoRefreshTimer] Timer reset');
    }
}
