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
    if (!requireTeam(interaction)) return;

    await interaction.deferReply({ flags: 64 });

    const target = interaction.options.getUser('membre');
    const amount = interaction.options.getInteger('montant');

    await db.addTickets(interaction.guildId, target.id, amount, 'manual');

    await sendContestLog(
        `🎟️ **Ajout manuel de ${config.TICKETS_NAME}**\n\n` +
        `👤 Membre : ${target}\n` +
        `➕ Montant : **${amount}**\n` +
        `👑 Par : ${interaction.user}`
    ).catch(() => null);

    await interaction.editReply(
        `✅ **${amount} ${config.TICKETS_NAME}** ajoutés à ${target}.`
    );
}

async function handleRemoveTicketCommand(interaction, sendContestLog) {
    if (!requireTeam(interaction)) return;

    await interaction.deferReply({ flags: 64 });

    const target = interaction.options.getUser('membre');
    const amount = interaction.options.getInteger('montant');

    await db.addTickets(interaction.guildId, target.id, -amount, 'manual');

    await sendContestLog(
        `🎟️ **Retrait manuel de ${config.TICKETS_NAME}**\n\n` +
        `👤 Membre : ${target}\n` +
        `➖ Montant : **${amount}**\n` +
        `👑 Par : ${interaction.user}`
    ).catch(() => null);

    await interaction.editReply(
        `✅ **${amount} ${config.TICKETS_NAME}** retirés à ${target}.`
    );
}

async function handleResumeCommand(interaction) {
    await interaction.deferReply();

    const top = await db.getTopTickets(interaction.guildId, 20);

    if (top.length === 0) {
        await interaction.editReply(`🎟️ Aucun ${config.TICKETS_NAME} enregistré pour le moment.`);
        return;
    }

    const lines = top.map((data, index) =>
        `**${index + 1}.** <@${data.user_id}> — **${data.tickets} ${config.TICKETS_NAME}**`
    );

    await interaction.editReply(
        `🏆 **Classement ${config.TICKETS_NAME}**\n\n${lines.join('\n')}`
    );
}

module.exports = { handleTicketCommand };