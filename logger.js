const fs = require('fs');
const path = require('path');

// Determine log file path
const LOG_FILE = path.join(__dirname, 'logs.md');

// Ensure log file exists or create it with a header
if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '# Bot Logs\n\n');
}

/**
 * Appends a message to the logs.md file with a timestamp.
 * @param {string} level - The log level (INFO, WARN, ERROR, OPPORTUNITY).
 * @param {string} message - The message to log.
 */
function logToFile(level, message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, logLine);
}

const logger = {
    info: (message) => {
        logToFile('INFO', message);
    },

    warn: (message) => {
        logToFile('WARN', message);
    },

    error: (message, error = '') => {
        const fullMessage = error ? `${message} ${error}` : message;
        logToFile('ERROR', fullMessage);
        // Errors are usually critical enough to show in console too, or at least a summary
        console.error(`❌ ${fullMessage}`);
    },

    opportunity: (message) => {
        logToFile('OPPORTUNITY', message);
        console.log(`✅ ${message}`);
    },

    // Special method for transaction success/failure that should be visible
    transaction: (message) => {
        logToFile('TRANSACTION', message);
        console.log(`🚀 ${message}`);
    }
};

module.exports = logger;
