const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const config = require('../../config');
const db = require('../../db/queries');
const { requireTeam, requireModerator } = require('../../utils/guildSettings');

async function handleAdminCommand(interaction, { discordClient, sendContestLog }) {
    if (interaction.commandName === 'ping') { await handlePingCommand(interaction); return true; }
    if (interaction.commandName === 'warning') { await handleWarningCommand(interaction, discordClient); return true; }
    if (interaction.commandName === 'clear') { await handleClearCommand(interaction); return true; }
    if (interaction.commandName === 'clearoverlay') { await handleClearOverlayCommand(interaction); return true; }
    if (interaction.commandName === 'testoverlay') { await handleTestOverlayCommand(interaction, sendContestLog); return true; }
    if (interaction.commandName === 'setuproles') { await handleSetupRolesCommand(interaction, discordClient); return true; }
    return false;
}

async function handlePingCommand(interaction) {
    await interaction.reply('🏓 ChaosCore est vivant !');
}

async function handleWarningCommand(interaction, discordClient) {
    if (!await requireModerator(interaction)) return;

    await interaction.deferReply({ flags: 64 });

    const member = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison') || 'Comportement inadapté';

    if (!member) { await interaction.editReply({ content: '❌ Membre introuvable.' }); return; }
    if (member.user.bot) { await interaction.editReply({ content: '❌ Tu ne peux pas warning un bot.' }); return; }

    const guildId = interaction.guild.id;

    // Lire depuis guild_module_settings (dashboard) en priorité
    const securitySettings = await db.getModuleSettings(guildId, 'security').catch(() => null);
    const serverSettings = await db.getServerSettings(guildId).catch(() => null);

    const warningLimit = securitySettings?.warning_limit || config.WARNING_LIMIT;
    const warningWindowMs = (securitySettings?.warning_time_window || 24) * 60 * 60 * 1000;

    // Rôle et salon warning — dashboard security d'abord, sinon server_settings, sinon config
    const warningRoleId = securitySettings?.warning_role_id
        || serverSettings?.warning_role_id
        || config.WARNING_ROLE_ID;

    const memberRoleId = serverSettings?.member_role_id || config.ROLE_MEMBRE_ID;

    const moderationChannelId = securitySettings?.moderation_channel_id
        || serverSettings?.moderation_channel_id
        || config.MODERATION_CHANNEL_ID;

    const warningExplanationChannelId = securitySettings?.warning_channel_id
        || serverSettings?.warning_explanation_channel_id
        || config.WARNING_EXPLANATION_CHANNEL_ID;

    await db.addModerationWarning(guildId, member.id, interaction.user.id, reason);

    const warningCount = await db.countRecentWarnings(guildId, member.id, warningWindowMs);

    await interaction.editReply({
        content: `✅ Warning envoyé à ${member}. Total sur 24h : ${warningCount}/${warningLimit}`,
    });

    await interaction.channel.send(
        `⚠️ ${member}, petit rappel des règles de la communauté.\n\n` +
        `Merci de rester respectueux/se et d'éviter les abus.\n` +
        `Raison : **${reason}**\n\n` +
        `Avertissement : **${warningCount}/${warningLimit}**`
    );

    if (warningCount >= warningLimit) {
        await member.roles.remove(memberRoleId).catch(() => null);
        await member.roles.add(warningRoleId).catch(() => null);

        const moderationChannel = await discordClient.channels.fetch(moderationChannelId).catch(() => null);
        if (moderationChannel) {
            await moderationChannel.send({
                content:
                    `🚨 **Seuil de warnings atteint**\n\n` +
                    `👤 Membre : ${member}\n` +
                    `⚠️ Warnings sur 24h : **${warningCount}/${warningLimit}**\n` +
                    `📍 Salon explication : <#${warningExplanationChannelId}>\n\n` +
                    `Après l'entrevue :\n` +
                    `✅ Résolu = retrait du rôle Warning\n` +
                    `❌ Exclure = kick automatique`,
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`warning_resolve_${member.id}`).setLabel('Résolu').setEmoji('✅').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`warning_kick_${member.id}`).setLabel('Exclure').setEmoji('❌').setStyle(ButtonStyle.Danger)
                )],
            });
        }
    }
}

async function handleClearCommand(interaction) {
    if (!await requireModerator(interaction)) return;
    await interaction.deferReply({ flags: 64 });
    const amount = interaction.options.getInteger('nombre');
    const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
    if (!deleted) { await interaction.editReply({ content: '❌ Impossible de supprimer les messages.' }); return; }
    await interaction.editReply({ content: `🧹 ${deleted.size} message(s) supprimé(s).` });
}

async function handleClearOverlayCommand(interaction) {
    if (!await requireTeam(interaction)) return;
    await interaction.deferReply({ flags: 64 });
    // guildId requis — sans filtre, cette commande effaçait les gages
    // overlay de TOUS les serveurs ChaosCore en une seule exécution.
    await db.clearOverlayEvents(interaction.guildId);
    await interaction.editReply({ content: '✅ Tous les gages overlay ont été retirés.' });
}

async function handleTestOverlayCommand(interaction, sendContestLog) {
    if (!await requireTeam(interaction)) return;
    await interaction.deferReply({ flags: 64 });

    const rewardName = interaction.options.getString('reward');
    const userInput = interaction.options.getString('texte');

    const event = await db.insertChannelPointEvent({
        guildId: interaction.guildId,
        twitchName: interaction.user.username,
        discordId: interaction.user.id,
        rewardName,
        userInput,
        ticketsAwarded: 0,
        showOnOverlay: true,
    });

    await sendContestLog({
        content:
            `🎮 **Nouveau gage overlay**\n\n` +
            `📺 Viewer : **${interaction.user.username}**\n` +
            `🎁 Récompense : **${rewardName}**\n` +
            `📝 Texte : ${userInput}`,
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`complete_overlay_${event.id}`).setLabel('Gage effectué').setEmoji('✅').setStyle(ButtonStyle.Success)
        )],
    }).catch(() => null);

    await interaction.editReply(`✅ Test overlay envoyé.\n\n**${rewardName}** : ${userInput}`);
}

async function handleSetupRolesCommand(interaction, discordClient) {
    if (!await requireTeam(interaction)) return;
    await interaction.deferReply({ flags: 64 });

    const guildId = interaction.guild.id;

    // Lire le salon depuis la DB
    const autoroleSettings = await db.getModuleSettings(guildId, 'autoroles').catch(() => null);
    const rolesChannelId = autoroleSettings?.main_channel_id || config.SALON_ROLES_ID;
    const roleChannel = await discordClient.channels.fetch(rolesChannelId).catch(() => null);
    if (!roleChannel) {
        await interaction.editReply('❌ Salon rôles introuvable. Configure-le dans le dashboard → Autorôles → Salons.');
        return;
    }

    // Lire les panneaux depuis la DB
    const { getAutorolePanels } = require('../utils/guildSettings');
    const panels = await getAutorolePanels(guildId);

    if (!panels || panels.length === 0) {
        await interaction.editReply('❌ Aucun panneau configuré. Crée des panneaux dans le dashboard → Autorôles → Panneaux.');
        return;
    }

    // Envoyer chaque panneau
    let count = 0;
    for (const panel of panels) {
        if (!panel.roles || panel.roles.length === 0) continue;

        const embed = new EmbedBuilder()
            .setColor(0x9146ff)
            .setTitle(panel.name)
            .setDescription(panel.description || 'Choisis tes rôles.');

        const buttons = panel.roles.slice(0, 5).map(role =>
            new ButtonBuilder()
                .setCustomId('autorole_db_' + role.role_id)
                .setLabel(role.role_name)
                .setEmoji(role.emoji || '🎭')
                .setStyle(ButtonStyle.Secondary)
        );

        const row = new ActionRowBuilder().addComponents(buttons);
        await roleChannel.send({ embeds: [embed], components: [row] });
        count++;
    }

    await interaction.editReply('✅ ' + count + ' panneau(x) publiés depuis la DB !');
}

module.exports = { handleAdminCommand };