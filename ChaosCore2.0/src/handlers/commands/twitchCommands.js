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
            content: "❌ Tu n'as pas l'autorisation d'utiliser cette commande.",
            flags: 64,
        });

        return false;
    }

    return true;
}

// ============================================================
// HELPERS
// ============================================================

function cleanTwitchPseudo(pseudo) {
    return pseudo
        .toLowerCase()
        .replace('@', '')
        .trim();
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

async function handleTwitchCommand(interaction, { sendContestLog }) {
    if (interaction.commandName === 'twitch') {
        await handleTwitchLinkCommand(interaction, sendContestLog);
        return true;
    }

    if (interaction.commandName === 'twitchlinks') {
        await handleTwitchLinksCommand(interaction);
        return true;
    }

    return false;
}

// ============================================================
// /TWITCH
// ============================================================

async function handleTwitchLinkCommand(interaction, sendContestLog) {
    if (!requireTeam(interaction)) {
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const target = interaction.options.getUser('membre');
    const pseudo = cleanTwitchPseudo(
        interaction.options.getString('pseudo')
    );

    await db.setTwitchLink(interaction.guildId, pseudo, target.id);

    await sendContestLog(
        `🔗 **Association Twitch**\n\n` +
        `👤 Discord : ${target}\n` +
        `📺 Twitch : **${pseudo}**\n` +
        `👑 Par : ${interaction.user}`
    ).catch(() => null);

    await interaction.editReply(
        `✅ ${target} est maintenant associé au pseudo Twitch **${pseudo}**.`
    );
}

// ============================================================
// /TWITCHLINKS
// ============================================================

async function handleTwitchLinksCommand(interaction) {
    if (!requireTeam(interaction)) {
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const links = await db.listTwitchLinks(interaction.guildId);

    if (links.length === 0) {
        await interaction.editReply(
            '🔗 Aucune liaison Twitch enregistrée.'
        );

        return;
    }

    const lines = links.slice(0, 30).map(
        link => `📺 **${link.twitch_name}** → <@${link.user_id}>`
    );

    await interaction.editReply(
        `🔗 **Liaisons Twitch enregistrées**\n\n${lines.join('\n')}`
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleTwitchCommand,
};