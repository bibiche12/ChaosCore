const config = require('../../config');
const db = require('../../db/queries');
const { requireTeam, checkCommandEnabled } = require('../../utils/guildSettings');

// currency_plural et currency_emoji étaient configurables dans le dashboard
// mais jamais lus — le code utilisait toujours "💰" en dur et fabriquait le
// pluriel en ajoutant un "s", ce qui casse pour toute monnaie au pluriel
// irrégulier et ignore l'emoji choisi par le serveur.
async function getMoneyName(guildId) {
    const economySettings = await db.getModuleSettings(guildId, 'economy').catch(() => null);
    return economySettings?.currency_singular || config.MONEY_NAME;
}

async function getCurrency(guildId) {
    const economySettings = await db.getModuleSettings(guildId, 'economy').catch(() => null);
    const singular = economySettings?.currency_singular || config.MONEY_NAME;
    return {
        singular,
        plural: economySettings?.currency_plural || `${singular}s`,
        emoji: economySettings?.currency_emoji || '💰',
    };
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
    // command_profile_enabled (page Économie → Commandes) était
    // configurable mais jamais lu.
    if (!await checkCommandEnabled(interaction, 'economy', 'profile')) return;
    await interaction.deferReply({ flags: 64 });

    const points  = await db.getUserPoints(interaction.guildId, interaction.user.id);
    const tickets = await db.getTicketUser(interaction.guildId, interaction.user.id);
    const currency = await getCurrency(interaction.guildId);

    await interaction.editReply({
        content:
            `👤 **Profil**\n\n` +
            `${currency.emoji} ${currency.plural} : **${points.balance}**\n` +
            `🎟️ ${config.TICKETS_NAME} : **${tickets.tickets}**\n\n` +
            `💬 Messages Twitch : **${tickets.twitch_messages || 0}**\n` +
            `🔴 Présences live : **${tickets.presences || 0}**\n` +
            `✍️ Tickets manuels : **${tickets.manual || 0}**`,
    });
}

async function handleAddPointsCommand(interaction, sendLog) {
    if (!await checkCommandEnabled(interaction, 'economy', 'adpoint')) return;
    if (!await requireTeam(interaction)) return;

    await interaction.deferReply({ flags: 64 });

    const target     = interaction.options.getUser('membre');
    const amount     = interaction.options.getInteger('montant');
    const newBalance = await db.addPoints(interaction.guildId, target.id, amount);
    const currency   = await getCurrency(interaction.guildId);

    await sendLog(
        `${currency.emoji} **Ajout de ${currency.plural}**\n\n` +
        `👤 Membre : ${target}\n` +
        `➕ Montant : **${amount}**\n` +
        `${currency.emoji} Nouveau solde : **${newBalance}**\n` +
        `👑 Par : ${interaction.user}`
    ).catch(() => null);

    await interaction.editReply(
        `✅ **${amount} ${currency.plural}** ajoutés à ${target}.\n` +
        `${currency.emoji} Nouveau solde : **${newBalance}**`
    );
}

async function handleRemovePointsCommand(interaction, sendLog) {
    if (!await checkCommandEnabled(interaction, 'economy', 'retpoint')) return;
    if (!await requireTeam(interaction)) return;

    await interaction.deferReply({ flags: 64 });

    const target     = interaction.options.getUser('membre');
    const amount     = interaction.options.getInteger('montant');
    const newBalance = await db.addPoints(interaction.guildId, target.id, -amount);
    const currency   = await getCurrency(interaction.guildId);

    await sendLog(
        `${currency.emoji} **Retrait de ${currency.plural}**\n\n` +
        `👤 Membre : ${target}\n` +
        `➖ Montant : **${amount}**\n` +
        `${currency.emoji} Nouveau solde : **${newBalance}**\n` +
        `👑 Par : ${interaction.user}`
    ).catch(() => null);

    await interaction.editReply(
        `✅ **${amount} ${currency.plural}** retirés à ${target}.\n` +
        `${currency.emoji} Nouveau solde : **${newBalance}**`
    );
}

module.exports = { handleEconomyCommand, getCurrency };