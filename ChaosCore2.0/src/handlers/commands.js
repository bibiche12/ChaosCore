const { commandDefinitions } = require('./commandsDefinitions');

const { handleEconomyCommand } = require('./commands/economyCommands');
const { handleTicketCommand } = require('./commands/ticketCommands');
const { handleLiveCommand } = require('./commands/liveCommands');
const { handleTwitchCommand } = require('./commands/twitchCommands');
const { handleShopCommand } = require('./commands/shopCommands');
const { handleAdminCommand } = require('./commands/adminCommands');
const { handlePollCommand } = require('./commands/pollCommands');

async function handleCommand(interaction, services) {
    if (await handleEconomyCommand(interaction, services)) return;
    if (await handleTicketCommand(interaction, services)) return;
    if (await handleLiveCommand(interaction, services)) return;
    if (await handleTwitchCommand(interaction, services)) return;
    if (await handleShopCommand(interaction, services)) return;
    if (await handlePollCommand(interaction, services)) return;
    if (await handleAdminCommand(interaction, services)) return;
}

module.exports = {
    commandDefinitions,
    handleCommand,
    
};