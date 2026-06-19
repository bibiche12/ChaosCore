const config = require('../../config');
const db = require('../../db/queries');
const { requireTeam } = require('../../utils/guildSettings');

async function getMoneyName(guildId) {
    const economySettings = await db.getModuleSettings(guildId, 'economy').catch(() => null);
    return economySettings?.currency_singular || config.MONEY_NAME;
}

async function handleEconomyCommand(interaction, { sendLog }) {
    if (interaction.commandName === 'profil') {
        await handleProfileCommand(interaction);
        return true;
    }
    if (interaction.commandName === 'adpoint') {
        await handleAddPointsCommand(interaction, sendLog);
        return true;
    }
    if (interaction.commandName === 'retpoint') {
        await handleRemovePointsCommand(interaction, sendLog);
        return true;
    }
    return false;
}

async function handleProfileCommand(interaction) {
    await interaction.deferReply({ flags: 64 });

    const points  = await db.getUserPoints(interaction.guildId, interaction.user.id);
    const tickets = await db.getTicketUser(interaction.guildId, interaction.user.id);
    const moneyName = await getMoneyName(interaction.guildId);

    await interaction.editReply({
        content:
            `👤 **Profil**\n\n` +
            `🏦 ${moneyName}s : **${points.balance}**\n` +
            `🎟️ ${config.TICKETS_NAME} : **${tickets.tickets}**\n\n` +
            `💬 Messages Twitch : **${tickets.twitch_messages || 0}**\n` +
            `🔴 Présences live : **${tickets.presences || 0}**\n` +
            `✍️ Tickets manuels : **${tickets.manual || 0}**`,
    });
}

async function handleAddPointsCommand(interaction, sendLog) {
    if (!await requireTeam(interaction)) return;

    await interaction.deferReply({ flags: 64 });

    const target     = interaction.options.getUser('membre');
    const amount     = interaction.options.getInteger('montant');
    const newBalance = await db.addPoints(interaction.guildId, target.id, amount);
    const moneyName  = await getMoneyName(interaction.guildId);

    await sendLog(
        `🏦 **Ajout de ${moneyName}s**\n\n` +
        `👤 Membre : ${target}\n` +
        `➕ Montant : **${amount}**\n` +
        `💰 Nouveau solde : **${newBalance}**\n` +
        `👑 Par : ${interaction.user}`
    ).catch(() => null);

    await interaction.editReply(
        `✅ **${amount} ${moneyName}s** ajoutés à ${target}.\n` +
        `💰 Nouveau solde : **${newBalance}**`
    );
}

async function handleRemovePointsCommand(interaction, sendLog) {
    if (!await requireTeam(interaction)) return;

    await interaction.deferReply({ flags: 64 });

    const target     = interaction.options.getUser('membre');
    const amount     = interaction.options.getInteger('montant');
    const newBalance = await db.addPoints(interaction.guildId, target.id, -amount);
    const moneyName  = await getMoneyName(interaction.guildId);

    await sendLog(
        `🏦 **Retrait de ${moneyName}s**\n\n` +
        `👤 Membre : ${target}\n` +
        `➖ Montant : **${amount}**\n` +
        `💰 Nouveau solde : **${newBalance}**\n` +
        `👑 Par : ${interaction.user}`
    ).catch(() => null);

    await interaction.editReply(
        `✅ **${amount} ${moneyName}s** retirés à ${target}.\n` +
        `💰 Nouveau solde : **${newBalance}**`
    );
}

module.exports = { handleEconomyCommand };