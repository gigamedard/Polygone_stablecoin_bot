require("@nomicfoundation/hardhat-toolbox");
// require("@nomicfoundation/hardhat-ethers");
// require("@nomicfoundation/hardhat-chai-matchers");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
      },
      {
        version: "0.7.6",
      },
    ],
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
        enabled: process.env.FORK_ENABLED === "true",
      },
      chainId: 137
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 137,
      gasPrice: 500000000000, // 500 Gwei
      gas: 10000000
    },
  },
};
