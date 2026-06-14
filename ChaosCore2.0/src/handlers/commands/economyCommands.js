const config = require('../../config');
const db = require('../../db/queries');

function hasTeamRole(member) {
    return member.roles.cache.some(role => role.name === config.TEAM_ROLE_NAME);
}

function requireTeam(interaction) {
    if (!hasTeamRole(interaction.member)) {
        interaction.reply({
            content: "❌ Tu n'as pas l'autorisation d'utiliser cette commande.",
            flags: 64,
        });
        return false;
    }
    return true;
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

    await interaction.editReply({
        content:
            `👤 **Profil**\n\n` +
            `🏦 ${config.MONEY_NAME}s : **${points.balance}**\n` +
            `🎟️ ${config.TICKETS_NAME} : **${tickets.tickets}**\n\n` +
            `💬 Messages Twitch : **${tickets.twitch_messages || 0}**\n` +
            `🔴 Présences live : **${tickets.presences || 0}**\n` +
            `✍️ Tickets manuels : **${tickets.manual || 0}**`,
    });
}

async function handleAddPointsCommand(interaction, sendLog) {
    if (!requireTeam(interaction)) return;

    await interaction.deferReply({ flags: 64 });

    const target     = interaction.options.getUser('membre');
    const amount     = interaction.options.getInteger('montant');
    const newBalance = await db.addPoints(interaction.guildId, target.id, amount);

    await sendLog(
        `🏦 **Ajout de ${config.MONEY_NAME}s**\n\n` +
        `👤 Membre : ${target}\n` +
        `➕ Montant : **${amount}**\n` +
        `💰 Nouveau solde : **${newBalance}**\n` +
        `👑 Par : ${interaction.user}`
    ).catch(() => null);

    await interaction.editReply(
        `✅ **${amount} ${config.MONEY_NAME}s** ajoutés à ${target}.\n` +
        `💰 Nouveau solde : **${newBalance}**`
    );
}

async function handleRemovePointsCommand(interaction, sendLog) {
    if (!requireTeam(interaction)) return;

    await interaction.deferReply({ flags: 64 });

    const target     = interaction.options.getUser('membre');
    const amount     = interaction.options.getInteger('montant');
    const newBalance = await db.addPoints(interaction.guildId, target.id, -amount);

    await sendLog(
        `🏦 **Retrait de ${config.MONEY_NAME}s**\n\n` +
        `👤 Membre : ${target}\n` +
        `➖ Montant : **${amount}**\n` +
        `💰 Nouveau solde : **${newBalance}**\n` +
        `👑 Par : ${interaction.user}`
    ).catch(() => null);

    await interaction.editReply(
        `✅ **${amount} ${config.MONEY_NAME}s** retirés à ${target}.\n` +
        `💰 Nouveau solde : **${newBalance}**`
    );
}

module.exports = { handleEconomyCommand };