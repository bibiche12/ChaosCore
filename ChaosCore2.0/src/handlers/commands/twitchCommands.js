// ============================================================
// IMPORTS
// ============================================================

const config = require('../../config');
const db = require('../../db/queries');
const { requireTeam, checkCommandEnabled } = require('../../utils/guildSettings');

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
    // command_twitch_enabled était configurable dans le dashboard mais
    // jamais lu — la commande restait toujours active peu importe le choix.
    if (!await checkCommandEnabled(interaction, 'twitch', 'twitch')) return;
    if (!await requireTeam(interaction)) {
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
    if (!await requireTeam(interaction)) {
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