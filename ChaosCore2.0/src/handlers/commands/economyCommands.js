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

async function handleEconomyCommand(interaction, { sendLog }) {
    if (interaction.commandName === 'solde') {
        await interaction.deferReply({ flags: 64 });

        const userData = await db.getUserPoints(interaction.user.id);

        await interaction.editReply({
            content:
                `🏦 **Oncle'Bich consulte ton compte...**\n\n` +
                `💰 Solde actuel : **${userData.balance} Bichcoins**`,
        });

        return true;
    }

    if (interaction.commandName === 'profil') {
        await interaction.deferReply({ flags: 64 });

        const points = await db.getUserPoints(interaction.user.id);
        const tickets = await db.getTicketUser(interaction.user.id);

        await interaction.editReply({
            content:
                `👤 **Profil ChaosCore**\n\n` +
                `🏦 Bichcoins : **${points.balance}**\n` +
                `🎟️ Tickets du Chaos : **${tickets.tickets}**\n\n` +
                `💬 Messages Twitch : **${tickets.twitch_messages || 0}**\n` +
                `🔴 Présences live : **${tickets.presences || 0}**\n` +
                `✍️ Tickets manuels : **${tickets.manual || 0}**`,
        });

        return true;
    }

    if (interaction.commandName === 'adpoint') {
        if (!requireTeam(interaction)) return true;

        await interaction.deferReply({ flags: 64 });

        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');

        const newBalance = await db.addPoints(target.id, amount);

        await sendLog(
            `🏦 **Ajout de Bichcoins**\n\n` +
            `👤 Membre : ${target}\n` +
            `➕ Montant : **${amount}**\n` +
            `💰 Nouveau solde : **${newBalance}**\n` +
            `👑 Par : ${interaction.user}`
        ).catch(() => null);

        await interaction.editReply(
            `✅ **${amount} Bichcoins** ajoutés à ${target}.\n💰 Nouveau solde : **${newBalance}**`
        );

        return true;
    }

    if (interaction.commandName === 'retpoint') {
        if (!requireTeam(interaction)) return true;

        await interaction.deferReply({ flags: 64 });

        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');

        const newBalance = await db.addPoints(target.id, -amount);

        await sendLog(
            `🏦 **Retrait de Bichcoins**\n\n` +
            `👤 Membre : ${target}\n` +
            `➖ Montant : **${amount}**\n` +
            `💰 Nouveau solde : **${newBalance}**\n` +
            `👑 Par : ${interaction.user}`
        ).catch(() => null);

        await interaction.editReply(
            `✅ **${amount} Bichcoins** retirés à ${target}.\n💰 Nouveau solde : **${newBalance}**`
        );

        return true;
    }

    return false;
}

module.exports = {
    handleEconomyCommand,
};