let raidMode = false;

function isRaidMode() {
    return raidMode;
}

function enableRaidMode() {
    raidMode = true;
}

function disableRaidMode() {
    raidMode = false;
}

module.exports = {
    isRaidMode,
    enableRaidMode,
    disableRaidMode,
};