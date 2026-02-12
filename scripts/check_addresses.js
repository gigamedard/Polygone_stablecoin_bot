const { ethers } = require("ethers");

const tokens = {
    "FRAX": "0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF42",
    "MAI": "0xa3fa99a148fa48d14ed51d610c367c61876997f1", // Corrected
    "LUSD": "0x23001f892c0420ebe9ec03296093629185498801"
};

for (const [name, addr] of Object.entries(tokens)) {
    try {
        const checksum = ethers.getAddress(addr.toLowerCase());
        console.log(`${name}: "${checksum}"`);
    } catch (e) {
        console.error(`${name}: INVALID (${addr}) - ${e.message}`);
    }
}
