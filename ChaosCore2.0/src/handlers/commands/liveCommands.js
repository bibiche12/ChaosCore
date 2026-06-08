const config = require('../../config');
const security = require('../../services/security');

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
        if (!requireTeam(interaction)) return true;

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

        return true;
    }

    if (interaction.commandName === 'scan') {
        if (!requireTeam(interaction)) return true;

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
            return true;
        }

        if (result?.isLive) {
            await interaction.editReply(
                '🔴 Le live est déjà actif dans ChaosCore.'
            );
            return true;
        }

        await interaction.editReply(
            '⚫ Aucun live Twitch détecté pour le moment.'
        );

        return true;
    }

    if (interaction.commandName === 'live') {
        if (!requireTeam(interaction)) return true;

        const liveState = twitchService.getLiveState();

        if (liveState.liveContestActive) {
            await interaction.reply({
                content: '⚠️ Un live est déjà actif dans ChaosCore.',
                flags: 64,
            });

            return true;
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

        return true;
    }

    if (interaction.commandName === 'stop') {
        if (!requireTeam(interaction)) return true;

        const liveState = twitchService.getLiveState();

        if (!liveState.liveContestActive) {
            await interaction.reply({
                content: '⚠️ Aucun live actif à arrêter.',
                flags: 64,
            });

            return true;
        }

        const participants = Object.keys(
            liveState.currentLive.users || {}
        ).length;

        const summary =
            twitchService.generateLiveStatsSummary(participants);

        twitchService.stopCurrentLive();

        await interaction.reply(
            `⚫ Comptage Tickets du Chaos arrêté. Participants détectés : **${participants}**.`
        );

        await sendContestLog(
            `⚫ **Live concours arrêté**\n\n${summary}`
        ).catch(() => null);

        return true;
    }

    return false;
}

module.exports = {
    handleLiveCommand,
};