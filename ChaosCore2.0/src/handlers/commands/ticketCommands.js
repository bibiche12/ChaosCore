const config = require('../../config');
const db = require('../../db/queries');
const { requireTeam, checkCommandEnabled } = require('../../utils/guildSettings');

async function getTicketsName(guildId) {
    const ticketSettings = await db.getModuleSettings(guildId, 'tickets').catch(() => null);
    return ticketSettings?.unit_plural || config.TICKETS_NAME;
}

async function handleTicketCommand(interaction, { sendContestLog }) {
    if (interaction.commandName === 'adticket') {
        await handleAddTicketCommand(interaction, sendContestLog);
        return true;
    }
    if (interaction.commandName === 'retticket') {
        await handleRemoveTicketCommand(interaction, sendContestLog);
        return true;
    }
    if (interaction.commandName === 'resume') {
        await handleResumeCommand(interaction);
        return true;
    }
    return false;
}

async function handleAddTicketCommand(interaction, sendContestLog) {
    if (!await checkCommandEnabled(interaction, 'tickets', 'adticket')) return;
    if (!await requireTeam(interaction)) return;

    await interaction.deferReply({ flags: 64 });

    const target = interaction.options.getUser('membre');
    const amount = interaction.options.getInteger('montant');
    const ticketsName = await getTicketsName(interaction.guildId);

    await db.addTickets(interaction.guildId, target.id, amount, 'manual');

    await sendContestLog(
        `🎟️ **Ajout manuel de ${ticketsName}**\n\n` +
        `👤 Membre : ${target}\n` +
        `➕ Montant : **${amount}**\n` +
        `👑 Par : ${interaction.user}`
    ).catch(() => null);

    await interaction.editReply(
        `✅ **${amount} ${ticketsName}** ajoutés à ${target}.`
    );
}

async function handleRemoveTicketCommand(interaction, sendContestLog) {
    if (!await checkCommandEnabled(interaction, 'tickets', 'retticket')) return;
    if (!await requireTeam(interaction)) return;

    await interaction.deferReply({ flags: 64 });

    const target = interaction.options.getUser('membre');
    const amount = interaction.options.getInteger('montant');
    const ticketsName = await getTicketsName(interaction.guildId);

    await db.addTickets(interaction.guildId, target.id, -amount, 'manual');

    await sendContestLog(
        `🎟️ **Retrait manuel de ${ticketsName}**\n\n` +
        `👤 Membre : ${target}\n` +
        `➖ Montant : **${amount}**\n` +
        `👑 Par : ${interaction.user}`
    ).catch(() => null);

    await interaction.editReply(
        `✅ **${amount} ${ticketsName}** retirés à ${target}.`
    );
}

async function handleResumeCommand(interaction) {
    // command_resume_enabled (page Twitch → Commandes) était configurable
    // mais jamais lu, malgré que /resume soit physiquement gérée ici.
    if (!await checkCommandEnabled(interaction, 'twitch', 'resume')) return;
    await interaction.deferReply();

    const top = await db.getTopTickets(interaction.guildId, 20);
    const ticketsName = await getTicketsName(interaction.guildId);

    if (top.length === 0) {
        await interaction.editReply(`🎟️ Aucun ${ticketsName} enregistré pour le moment.`);
        return;
    }

    const lines = top.map((data, index) =>
        `**${index + 1}.** <@${data.user_id}> — **${data.tickets} ${ticketsName}**`
    );

    await interaction.editReply(
        `🏆 **Classement ${ticketsName}**\n\n${lines.join('\n')}`
    );
}

module.exports = { handleTicketCommand };