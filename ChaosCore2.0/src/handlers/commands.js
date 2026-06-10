// ============================================================
// IMPORTS
// ============================================================

const { commandDefinitions } = require('./commandsDefinitions');

// ============================================================
// COMMANDES
// ============================================================

const { handleEconomyCommand } = require('./commands/economyCommands');
const { handleTicketCommand } = require('./commands/ticketCommands');
const { handleLiveCommand } = require('./commands/liveCommands');
const { handleTwitchCommand } = require('./commands/twitchCommands');
const { handleShopCommand } = require('./commands/shopCommands');
const { handlePollCommand } = require('./commands/pollCommands');
const { handleAdminCommand } = require('./commands/adminCommands');

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

async function handleCommand(interaction, services) {

    // ------------------------------------------------------------
    // ÉCONOMIE
    // ------------------------------------------------------------

    if (await handleEconomyCommand(interaction, services)) {
        return;
    }

    // ------------------------------------------------------------
    // TICKETS DU CHAOS
    // ------------------------------------------------------------

    if (await handleTicketCommand(interaction, services)) {
        return;
    }

    // ------------------------------------------------------------
    // LIVE TWITCH
    // ------------------------------------------------------------

    if (await handleLiveCommand(interaction, services)) {
        return;
    }

    // ------------------------------------------------------------
    // TWITCH
    // ------------------------------------------------------------

    if (await handleTwitchCommand(interaction, services)) {
        return;
    }

    // ------------------------------------------------------------
    // BOUTIQUE
    // ------------------------------------------------------------

    if (await handleShopCommand(interaction, services)) {
        return;
    }

    // ------------------------------------------------------------
    // SONDAGES
    // ------------------------------------------------------------

    if (await handlePollCommand(interaction, services)) {
        return;
    }

    // ------------------------------------------------------------
    // ADMINISTRATION
    // ------------------------------------------------------------

    if (await handleAdminCommand(interaction, services)) {
        return;
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    commandDefinitions,
    handleCommand,
};