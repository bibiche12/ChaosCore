// ============================================================
// IMPORTS
// ============================================================

const config = require('../../config');
const security = require('../../services/security');
const db = require('../../db/queries');
const { requireTeam, checkCommandEnabled } = require('../../utils/guildSettings');

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
    if (!await requireTeam(interaction)) {
        return;
    }

    security.disableRaidMode(interaction.guildId);

    const securitySettings = await db.getModuleSettings(interaction.guildId, 'security').catch(() => null);
    const securityChannelId = securitySettings?.logs_channel_id || config.SECURITY_LOG_CHANNEL_ID;

    // Si raid_lock_server avait verrouillé le serveur, /raidoff doit le
    // déverrouiller symétriquement — sinon le serveur restait bloqué pour
    // tout le monde sans aucun moyen de revenir en arrière depuis le dashboard.
    let unlockMessage = '';
    if (securitySettings?.raid_lock_server && interaction.guild) {
        const everyoneRole = interaction.guild.roles.everyone;
        await everyoneRole.setPermissions(
            everyoneRole.permissions.add('SendMessages', 'CreateInstantInvite'),
            'Déverrouillage manuel après fin de raid'
        ).catch(() => null);
        unlockMessage = '\n🔓 Le serveur a été déverrouillé.';
    }

    const securityChannel = await discordClient.channels
        .fetch(securityChannelId)
        .catch(() => null);

    if (securityChannel) {
        await securityChannel.send(
            `🛡️ **Mode Raid désactivé**${unlockMessage}\n\n` +
            `👤 Par : ${interaction.user}`
        );
    }

    await interaction.reply({
        content: `✅ Mode raid désactivé.${unlockMessage}`,
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
    // command_scan_enabled était configurable dans le dashboard Twitch
    // mais jamais lu — la commande restait toujours active.
    if (!await checkCommandEnabled(interaction, 'twitch', 'scan')) return;
    if (!await requireTeam(interaction)) {
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const guildId = interaction.guildId;
    const dbMod = require('../../db/queries');
    const settings = await dbMod.getServerSettings(guildId).catch(() => null);
    const twitchUsername = settings?.twitch_username || config.TWITCH_USERNAME;
    const result = await twitchService.checkTwitchLive(
        discordClient,
        guildId,
        twitchUsername,
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
    // command_live_enabled était configurable mais jamais lu.
    if (!await checkCommandEnabled(interaction, 'twitch', 'live')) return;
    if (!await requireTeam(interaction)) {
        return;
    }

    const liveState = twitchService.getLiveState(interaction.guildId);

    if (liveState.liveContestActive) {
        await interaction.reply({
            content: '⚠️ Un live est déjà actif dans ChaosCore.',
            flags: 64,
        });

        return;
    }

    twitchService.setLiveActive(interaction.guildId, true);
    twitchService.resetCurrentLive(interaction.guildId);

    await interaction.reply(
        '🔴 Comptage Tickets du Chaos activé pour le live.'
    );

    const ticketSettings = await db.getModuleSettings(interaction.guildId, 'tickets').catch(() => null);
    const ticketPresence = ticketSettings?.ticket_presence || config.TICKET_PRESENCE;
    const ticketPer10Msg = ticketSettings?.ticket_every_10_messages || config.TICKET_EVERY_10_MESSAGES;

    await sendContestLog(
        `🔴 **Live concours démarré**\n\n` +
        `Présence : **+${ticketPresence} Tickets**\n` +
        `Messages : **+${ticketPer10Msg} Tickets tous les 10 messages non-spam**`
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
    // command_stop_enabled était configurable mais jamais lu.
    if (!await checkCommandEnabled(interaction, 'twitch', 'stop')) return;
    if (!await requireTeam(interaction)) {
        return;
    }

    const liveState = twitchService.getLiveState(interaction.guildId);

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

    const summary = twitchService.generateLiveStatsSummary(interaction.guildId, participants);

    twitchService.stopCurrentLive(interaction.guildId);

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