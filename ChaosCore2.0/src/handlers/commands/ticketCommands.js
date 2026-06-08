const db = require('../../db/queries');
const config = require('../../config');

function hasTeamRole(member) {
    return member.roles.cache.some(role => role.name === config.TEAM_ROLE_NAME);
}

function requireTeam(interaction) {
    if (!hasTeamRole(interaction.member)) {
        interaction.reply({
            content: '❌ Tu n’as pas l’autorisation d’utiliser cette commande.',
            flags: 64,
        });

        return false;
    }

    return true;
}

async function handleTicketCommand(interaction, { sendContestLog }) {
    if (interaction.commandName === 'tickets') {
        await interaction.deferReply({ flags: 64 });

        const ticketData = await db.getTicketUser(interaction.user.id);

        await interaction.editReply({
            content:
                `🎟️ **Tes Tickets du Chaos**\n\n` +
                `Total : **${ticketData.tickets}**\n` +
                `✍️ Manuels : **${ticketData.manual || 0}**\n` +
                `💬 Messages Twitch : **${ticketData.twitch_messages || 0}**\n` +
                `🔴 Présences live : **${ticketData.presences || 0}**`,
        });

        return true;
    }

    if (interaction.commandName === 'adticket') {
        if (!requireTeam(interaction)) return true;

        await interaction.deferReply({ flags: 64 });

        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');

        await db.addTickets(target.id, amount, 'manual');

        await sendContestLog(
            `🎟️ **Ajout manuel de Tickets**\n\n` +
            `👤 Membre : ${target}\n` +
            `➕ Montant : **${amount} Tickets**\n` +
            `👑 Par : ${interaction.user}`
        ).catch(() => null);

        await interaction.editReply(
            `✅ **${amount} Tickets du Chaos** ajoutés à ${target}.`
        );

        return true;
    }

    if (interaction.commandName === 'retticket') {
        if (!requireTeam(interaction)) return true;

        await interaction.deferReply({ flags: 64 });

        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');

        await db.addTickets(target.id, -amount, 'manual');

        await sendContestLog(
            `🎟️ **Retrait manuel de Tickets**\n\n` +
            `👤 Membre : ${target}\n` +
            `➖ Montant : **${amount} Tickets**\n` +
            `👑 Par : ${interaction.user}`
        ).catch(() => null);

        await interaction.editReply(
            `✅ **${amount} Tickets du Chaos** retirés à ${target}.`
        );

        return true;
    }

    if (interaction.commandName === 'resume') {
        await interaction.deferReply();

        const top = await db.getTopTickets(20);

        if (top.length === 0) {
            await interaction.editReply('🎟️ Aucun ticket enregistré pour le moment.');
            return true;
        }

        const lines = top.map((data, index) =>
            `**${index + 1}.** <@${data.user_id}> — **${data.tickets} Tickets**`
        );

        await interaction.editReply(
            `🏆 **Classement Tickets du Chaos**\n\n${lines.join('\n')}`
        );

        return true;
    }

    return false;
}

module.exports = {
    handleTicketCommand,
};