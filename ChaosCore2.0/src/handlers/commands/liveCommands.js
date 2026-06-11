// ============================================================
// IMPORTS
// ============================================================

const config = require('../../config');
const security = require('../../services/security');

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
// HANDLER PRINCIPAL
// ============================================================

async function handleLiveCommand(
    interaction,
    {
        twitchService,
        discordClient,
        sendContestLog,
        processLivePhrases,
    }
) {
    if (interaction.commandName === 'raidoff') {
        await handleRaidOffCommand(interaction, discordClient);
        return true;
    }

    if (interaction.commandName === 'scan') {
        await handleScanCommand(
            interaction,
            twitchService,
            discordClient,
            processLivePhrases
        );
        return true;
    }

    if (interaction.commandName === 'live') {
        await handleLiveStartCommand(
            interaction,
            twitchService,
            sendContestLog
        );
        return true;
    }

    if (interaction.commandName === 'stop') {
        await handleLiveStopCommand(
            interaction,
            twitchService,
            sendContestLog
        );
        return true;
    }

    return false;
}

// ============================================================
// /RAIDOFF
// ============================================================

async function handleRaidOffCommand(interaction, discordClient) {
    if (!requireTeam(interaction)) {
        return;
    }

    security.disableRaidMode();

    const securityChannel = await discordClient.channels
        .fetch(config.SECURITY_LOG_CHANNEL_ID)
        .catch(() => null);

    if (securityChannel) {
        await securityChannel.send(
            `🛡️ **Mode Raid désactivé**\n\n` +
            `👤 Par : ${interaction.user}`
        );
    }

    await interaction.reply({
        content: '✅ Mode raid désactivé.',
        flags: 64,
    });
}

// ============================================================
// /SCAN
// ============================================================

async function handleScanCommand(
    interaction,
    twitchService,
    discordClient,
    processLivePhrases
) {
    if (!requireTeam(interaction)) {
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const result = await twitchService.checkTwitchLive(
        discordClient,
        async () => {
            if (typeof processLivePhrases === 'function') {
                await processLivePhrases(discordClient).catch(console.error);
            }
        }
    );

    if (result?.started) {
        await interaction.editReply(
            '🔴 Live détecté ! Annonce envoyée et comptage activé.'
        );

        return;
    }

    if (result?.isLive) {
        await interaction.editReply(
            '🔴 Le live est déjà actif dans ChaosCore.'
        );

        return;
    }

    await interaction.editReply(
        '⚫ Aucun live Twitch détecté pour le moment.'
    );
}

// ============================================================
// /LIVE
// ============================================================

async function handleLiveStartCommand(
    interaction,
    twitchService,
    sendContestLog
) {
    if (!requireTeam(interaction)) {
        return;
    }

    const liveState = twitchService.getLiveState();

    if (liveState.liveContestActive) {
        await interaction.reply({
            content: '⚠️ Un live est déjà actif dans ChaosCore.',
            flags: 64,
        });

        return;
    }

    twitchService.setLiveActive(true);
    twitchService.resetCurrentLive();

    await interaction.reply(
        '🔴 Comptage Tickets du Chaos activé pour le live.'
    );

    await sendContestLog(
        `🔴 **Live concours démarré**\n\n` +
        `Présence : **+${config.TICKET_PRESENCE} Tickets**\n` +
        `Messages : **+${config.TICKET_EVERY_10_MESSAGES} Tickets tous les 10 messages non-spam**`
    ).catch(() => null);
}

// ============================================================
// /STOP
// ============================================================

async function handleLiveStopCommand(
    interaction,
    twitchService,
    sendContestLog
) {
    if (!requireTeam(interaction)) {
        return;
    }

    const liveState = twitchService.getLiveState();

    if (!liveState.liveContestActive) {
        await interaction.reply({
            content: '⚠️ Aucun live actif à arrêter.',
            flags: 64,
        });

        return;
    }

    const participants = Object.keys(
        liveState.currentLive.users || {}
    ).length;

    const summary = twitchService.generateLiveStatsSummary(participants);

    twitchService.stopCurrentLive();

    await interaction.reply(
        `⚫ Comptage Tickets du Chaos arrêté. ` +
        `Participants détectés : **${participants}**.`
    );

    await sendContestLog(
        `⚫ **Live concours arrêté**\n\n${summary}`
    ).catch(() => null);
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleLiveCommand,
};