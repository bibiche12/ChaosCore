// ============================================================
// IMPORTS
// ============================================================

const config = require('../../config');
const db = require('../../db/queries');

// ============================================================
// PERMISSIONS
// ============================================================

function hasTeamRole(member) {
    return member.roles.cache.some(
        role => role.name === config.TEAM_ROLE_NAME
    );
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

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

async function handleEconomyCommand(interaction, { sendLog }) {
    if (interaction.commandName === 'solde') {
        await handleBalanceCommand(interaction);
        return true;
    }

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

// ============================================================
// /SOLDE
// ============================================================

async function handleBalanceCommand(interaction) {
    await interaction.deferReply({ flags: 64 });

    const userData = await db.getUserPoints(interaction.user.id);

    await interaction.editReply({
        content:
            `🏦 **Oncle'Bich consulte ton compte...**\n\n` +
            `💰 Solde actuel : **${userData.balance} Bichcoins**`,
    });
}

// ============================================================
// /PROFIL
// ============================================================

async function handleProfileCommand(interaction) {
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
}

// ============================================================
// /ADPOINT
// ============================================================

async function handleAddPointsCommand(interaction, sendLog) {
    if (!requireTeam(interaction)) {
        return;
    }

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
        `✅ **${amount} Bichcoins** ajoutés à ${target}.\n` +
        `💰 Nouveau solde : **${newBalance}**`
    );
}

// ============================================================
// /RETPOINT
// ============================================================

async function handleRemovePointsCommand(interaction, sendLog) {
    if (!requireTeam(interaction)) {
        return;
    }

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
        `✅ **${amount} Bichcoins** retirés à ${target}.\n` +
        `💰 Nouveau solde : **${newBalance}**`
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleEconomyCommand,
};