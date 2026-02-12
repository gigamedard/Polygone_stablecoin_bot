const fs = require('fs');
const path = require('path');

class BotState {
    constructor() {
        this.stateFile = path.join(__dirname, 'bot_state.json');
        this.data = {
            currentHoldToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Default USDC
            entryPrice: '1000000', // Mock 1.00 USDC
            entryTimestamp: Date.now(),
            status: 'SEARCH' // SEARCH, HOLD
        };
        this.loadState();
    }

    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                this.data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
            }
        } catch (e) {
            console.error("Failed to load state", e);
        }
    }

    saveState() {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error("Failed to save state", e);
        }
    }

    updateHold(token, price) {
        this.data.currentHoldToken = token;
        this.data.entryPrice = price.toString();
        this.data.entryTimestamp = Date.now();
        this.data.status = 'HOLD';
        this.saveState();
    }

    resetToSearch(token) {
        this.data.currentHoldToken = token;
        this.data.status = 'SEARCH';
        this.saveState();
    }
}

module.exports = BotState;
