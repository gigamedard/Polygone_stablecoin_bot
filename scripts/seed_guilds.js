const axios = require('axios');
require("dotenv").config();

const API_URL = "http://localhost:8000/api/bot/sync-guild";

const guilds = [
    {
        contract_address: "0xf1e1BA184a3018ff952fADD493554D0Ed27f6115",
        name: "Shadow Igris",
        asset: "USDC", // Mock Name
        curr_liquidity: 0
    },
    {
        contract_address: "0xA40Dba8d13582E802B4192bdcA7FebD34cB42c4b",
        name: "Shadow Tank",
        asset: "USDC",
        curr_liquidity: 0
    }
];

async function seed() {
    console.log("Seeding Guilds to Laravel API...");
    for (const guild of guilds) {
        try {
            const res = await axios.post(API_URL, guild);
            console.log(`✅ Synced ${guild.name}:`, res.data.message);
        } catch (e) {
            console.error(`❌ Failed to sync ${guild.name}:`, e.message);
            if (e.response) console.error(e.response.data);
        }
    }
}

seed();
