// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GuildVault.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GuildFactory is Ownable {
    GuildVault[] public guilds;
    address public flashArbitrage;
    address public defaultBot;

    event GuildCreated(address indexed guildAddress, string name, address asset);

    constructor(address _flashArbitrage, address _defaultBot) Ownable(msg.sender) {
        flashArbitrage = _flashArbitrage;
        defaultBot = _defaultBot;
    }

    function createGuild(string memory name, address asset) external onlyOwner {
        GuildVault newGuild = new GuildVault(asset, flashArbitrage, defaultBot);
        guilds.push(newGuild);
        emit GuildCreated(address(newGuild), name, asset);
    }

    function getGuilds() external view returns (GuildVault[] memory) {
        return guilds;
    }
}
