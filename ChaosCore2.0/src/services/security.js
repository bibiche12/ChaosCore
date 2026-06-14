const raidModes = new Map();
function isRaidMode(guildId) { return raidModes.get(guildId) === true; }
function enableRaidMode(guildId) { raidModes.set(guildId, true); }
function disableRaidMode(guildId) { raidModes.set(guildId, false); }
module.exports = { isRaidMode, enableRaidMode, disableRaidMode };
