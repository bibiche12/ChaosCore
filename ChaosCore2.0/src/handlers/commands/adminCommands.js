const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const config = require('../../config');
const db = require('../../db/queries');

function hasTeamRole(member) {
    return member.roles.cache.some(role => role.name === config.TEAM_ROLE_NAME);
}

function hasModeratorPower(member) {
    return member.roles.cache.has(config.MODERATOR_ROLE_ID) || hasTeamRole(member);
}

async function requireTeam(interaction) {
    if (!hasTeamRole(interaction.member)) {
        await interaction.reply({ content: "❌ Tu n'as pas l'autorisation d'utiliser cette commande.", flags: 64 });
        return false;
    }
    return true;
}

async function requireModerator(interaction) {
    if (!hasModeratorPower(interaction.member)) {
        await interaction.reply({ content: "❌ Tu n'as pas l'autorisation d'utiliser cette commande.", flags: 64 });
        return false;
    }
    return true;
}

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

    // Lire les settings sécurité depuis le dashboard
    const securitySettings = await db.getModuleSettings(guildId, 'security').catch(() => null);
    const serverSettings = await db.getServerSettings(guildId).catch(() => null);

    const warningLimit = securitySettings?.warning_limit || config.WARNING_LIMIT;
    const warningWindowMs = (securitySettings?.warning_time_window || 24) * 60 * 60 * 1000;

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
        // Rôle warning depuis server_settings
        const warningRoleId = serverSettings?.warning_role_id || config.WARNING_ROLE_ID;
        const memberRoleId = serverSettings?.member_role_id || config.ROLE_MEMBRE_ID;

        await member.roles.remove(memberRoleId).catch(() => null);
        await member.roles.add(warningRoleId).catch(() => null);

        // Salon modération depuis server_settings
        const moderationChannelId = serverSettings?.moderation_channel_id || config.MODERATION_CHANNEL_ID;
        const warningExplanationChannelId = serverSettings?.warning_explanation_channel_id || config.WARNING_EXPLANATION_CHANNEL_ID;

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
    await db.clearOverlayEvents();
    await interaction.editReply({ content: '✅ Tous les gages overlay ont été retirés.' });
}

async function handleTestOverlayCommand(interaction, sendContestLog) {
    if (!await requireTeam(interaction)) return;
    await interaction.deferReply({ flags: 64 });

    const rewardName = interaction.options.getString('reward');
    const userInput = interaction.options.getString('texte');

    const event = await db.insertChannelPointEvent({
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

    // Lire le salon rôles depuis server_settings
    const serverSettings = await db.getServerSettings(interaction.guildId).catch(() => null);
    const rolesChannelId = serverSettings?.step_1_role_id ? config.SALON_ROLES_ID : config.SALON_ROLES_ID;

    const roleChannel = await discordClient.channels.fetch(config.SALON_ROLES_ID).catch(() => null);
    if (!roleChannel) { await interaction.editReply('❌ Salon rôles introuvable.'); return; }

    await roleChannel.send({
        embeds: [new EmbedBuilder().setColor(0x2f3136).setTitle('🔔 PINGS').setDescription(`Choisis les notifications que tu souhaites recevoir.\n\n📹 Ping - Live\n🎮 Ping - Game\n📰 Ping - Programme`)],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('autorole_ping_live').setLabel('Ping - Live').setEmoji('📹').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('autorole_ping_game').setLabel('Ping - Game').setEmoji('🎮').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('autorole_ping_programme').setLabel('Ping - Programme').setEmoji('📰').setStyle(ButtonStyle.Secondary)
        )],
    });

    await roleChannel.send({
        embeds: [new EmbedBuilder().setColor(0x2f3136).setTitle('🎮 JEUX').setDescription(`Choisis les catégories de jeux qui t'intéressent.\n\n1️⃣ Jeu - Horreur\n2️⃣ Jeu - RPG\n3️⃣ Jeu - Tir\n4️⃣ Jeu - Sport`)],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('autorole_game_horreur').setLabel('Horreur').setEmoji('1️⃣').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('autorole_game_rpg').setLabel('RPG').setEmoji('2️⃣').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('autorole_game_tir').setLabel('Tir').setEmoji('3️⃣').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('autorole_game_sport').setLabel('Sport').setEmoji('4️⃣').setStyle(ButtonStyle.Secondary)
        )],
    });

    await roleChannel.send({
        embeds: [new EmbedBuilder().setColor(0x2f3136).setTitle('🕹️ PLATEFORMES').setDescription(`Choisis tes plateformes.\n\n🟩 Xbox\n🟦 PS5\n🟨 PC\n🟥 Switch`)],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('autorole_platform_xbox').setLabel('Xbox').setEmoji('🟩').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('autorole_platform_ps5').setLabel('PS5').setEmoji('🟦').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('autorole_platform_pc').setLabel('PC').setEmoji('🟨').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('autorole_platform_switch').setLabel('Switch').setEmoji('🟥').setStyle(ButtonStyle.Secondary)
        )],
    });

    await interaction.editReply('✅ Messages de rôles créés avec ChaosCore.');
}

module.exports = { handleAdminCommand };