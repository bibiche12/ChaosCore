// ============================================================
// IMPORTS
// ============================================================

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

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

function hasModeratorPower(member) {
    return (
        member.roles.cache.has(config.MODERATOR_ROLE_ID) ||
        hasTeamRole(member)
    );
}

async function requireTeam(interaction) {
    if (!hasTeamRole(interaction.member)) {
        await interaction.reply({
            content: "❌ Tu n'as pas l'autorisation d'utiliser cette commande.",
            flags: 64,
        });

        return false;
    }

    return true;
}

async function requireModerator(interaction) {
    if (!hasModeratorPower(interaction.member)) {
        await interaction.reply({
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

async function handleAdminCommand(
    interaction,
    {
        discordClient,
        sendContestLog,
    }
) {
    if (interaction.commandName === 'ping') {
        await handlePingCommand(interaction);
        return true;
    }

    if (interaction.commandName === 'warning') {
        await handleWarningCommand(interaction, discordClient);
        return true;
    }

    if (interaction.commandName === 'clear') {
        await handleClearCommand(interaction);
        return true;
    }

    if (interaction.commandName === 'clearoverlay') {
        await handleClearOverlayCommand(interaction);
        return true;
    }

    if (interaction.commandName === 'testoverlay') {
        await handleTestOverlayCommand(interaction, sendContestLog);
        return true;
    }

    if (interaction.commandName === 'setuproles') {
        await handleSetupRolesCommand(interaction, discordClient);
        return true;
    }

    return false;
}

// ============================================================
// /PING
// ============================================================

async function handlePingCommand(interaction) {
    await interaction.reply('🏓 ChaosCore est vivant !');
}

// ============================================================
// /WARNING
// ============================================================

async function handleWarningCommand(interaction, discordClient) {
    if (!await requireModerator(interaction)) {
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const member = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison') || 'Comportement inadapté';

    if (!member) {
        await interaction.editReply({
            content: '❌ Membre introuvable.',
        });

        return;
    }

    if (member.user.bot) {
        await interaction.editReply({
            content: '❌ Tu ne peux pas warning un bot.',
        });

        return;
    }

    await db.addModerationWarning(
        interaction.guild.id,
        member.id,
        interaction.user.id,
        reason
    );

    const warningCount = await db.countRecentWarnings(
        interaction.guild.id,
        member.id,
        config.WARNING_WINDOW_MS
    );

    await interaction.editReply({
        content:
            `✅ Warning envoyé à ${member}. ` +
            `Total sur 24h : ${warningCount}/${config.WARNING_LIMIT}`,
    });

    await sendPublicWarningMessage(
        interaction,
        member,
        reason,
        warningCount
    );

    if (warningCount >= config.WARNING_LIMIT) {
        await applyWarningRole(member);
        await sendWarningThresholdMessage(
            discordClient,
            member,
            warningCount
        );
    }
}

async function sendPublicWarningMessage(
    interaction,
    member,
    reason,
    warningCount
) {
    await interaction.channel.send(
        `⚠️ ${member}, petit rappel des règles de la communauté.\n\n` +
        `Merci de rester respectueux/se et d'éviter les abus.\n` +
        `Raison : **${reason}**\n\n` +
        `Avertissement : **${warningCount}/${config.WARNING_LIMIT}**`
    );
}

async function applyWarningRole(member) {
    await member.roles.remove(config.ROLE_MEMBRE_ID).catch(() => null);
    await member.roles.add(config.WARNING_ROLE_ID).catch(() => null);
}

async function sendWarningThresholdMessage(
    discordClient,
    member,
    warningCount
) {
    const moderationChannel = await discordClient.channels
        .fetch(config.MODERATION_CHANNEL_ID)
        .catch(() => null);

    if (!moderationChannel) {
        return;
    }

    await moderationChannel.send({
        content:
            `🚨 **Seuil de warnings atteint**\n\n` +
            `👤 Membre : ${member}\n` +
            `⚠️ Warnings sur 24h : **${warningCount}/${config.WARNING_LIMIT}**\n` +
            `📍 Salon explication : <#${config.WARNING_EXPLANATION_CHANNEL_ID}>\n\n` +
            `Après l'entrevue :\n` +
            `✅ Résolu = retrait du rôle Warning\n` +
            `❌ Exclure = kick automatique`,
        components: [buildWarningDecisionButtons(member.id)],
    });
}

function buildWarningDecisionButtons(memberId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`warning_resolve_${memberId}`)
            .setLabel('Résolu')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`warning_kick_${memberId}`)
            .setLabel('Exclure')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    );
}

// ============================================================
// /CLEAR
// ============================================================

async function handleClearCommand(interaction) {
    if (!await requireModerator(interaction)) {
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const amount = interaction.options.getInteger('nombre');

    const deleted = await interaction.channel
        .bulkDelete(amount, true)
        .catch(() => null);

    if (!deleted) {
        await interaction.editReply({
            content: '❌ Impossible de supprimer les messages. Vérifie mes permissions.',
        });

        return;
    }

    await interaction.editReply({
        content: `🧹 ${deleted.size} message(s) supprimé(s).`,
    });
}

// ============================================================
// /CLEAROVERLAY
// ============================================================

async function handleClearOverlayCommand(interaction) {
    if (!await requireTeam(interaction)) {
        return;
    }

    await interaction.deferReply({ flags: 64 });

    await db.clearOverlayEvents();

    await interaction.editReply({
        content: '✅ Tous les gages overlay ont été retirés.',
    });
}

// ============================================================
// /TESTOVERLAY
// ============================================================

async function handleTestOverlayCommand(interaction, sendContestLog) {
    if (!await requireTeam(interaction)) {
        return;
    }

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
        components: [buildOverlayCompleteButton(event.id)],
    }).catch(() => null);

    await interaction.editReply(
        `✅ Test overlay envoyé.\n\n**${rewardName}** : ${userInput}`
    );
}

function buildOverlayCompleteButton(eventId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`complete_overlay_${eventId}`)
            .setLabel('Gage effectué')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
    );
}

// ============================================================
// /SETUPROLES
// ============================================================

async function handleSetupRolesCommand(interaction, discordClient) {
    if (!await requireTeam(interaction)) {
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const roleChannel = await discordClient.channels
        .fetch(config.SALON_ROLES_ID)
        .catch(() => null);

    if (!roleChannel) {
        await interaction.editReply('❌ Salon rôles introuvable.');
        return;
    }

    await roleChannel.send({
        embeds: [buildPingEmbed()],
        components: [buildPingButtons()],
    });

    await roleChannel.send({
        embeds: [buildGameEmbed()],
        components: [buildGameButtons()],
    });

    await roleChannel.send({
        embeds: [buildPlatformEmbed()],
        components: [buildPlatformButtons()],
    });

    await interaction.editReply('✅ Messages de rôles créés avec ChaosCore.');
}

// ============================================================
// EMBEDS AUTORÔLES
// ============================================================

function buildPingEmbed() {
    return new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle('🔔 PINGS')
        .setDescription(
            `Choisis les notifications que tu souhaites recevoir.\n\n` +
            `📹 Ping - Live\n` +
            `🎮 Ping - Game\n` +
            `📰 Ping - Programme`
        );
}

function buildGameEmbed() {
    return new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle('🎮 JEUX')
        .setDescription(
            `Choisis les catégories de jeux qui t'intéressent.\n\n` +
            `1️⃣ Jeu - Horreur\n` +
            `2️⃣ Jeu - RPG\n` +
            `3️⃣ Jeu - Tir\n` +
            `4️⃣ Jeu - Sport`
        );
}

function buildPlatformEmbed() {
    return new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle('🕹️ PLATEFORMES')
        .setDescription(
            `Choisis tes plateformes.\n\n` +
            `🟩 Xbox\n` +
            `🟦 PS5\n` +
            `🟨 PC\n` +
            `🟥 Switch`
        );
}

// ============================================================
// BOUTONS AUTORÔLES
// ============================================================

function buildPingButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('autorole_ping_live')
            .setLabel('Ping - Live')
            .setEmoji('📹')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('autorole_ping_game')
            .setLabel('Ping - Game')
            .setEmoji('🎮')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('autorole_ping_programme')
            .setLabel('Ping - Programme')
            .setEmoji('📰')
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildGameButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('autorole_game_horreur')
            .setLabel('Horreur')
            .setEmoji('1️⃣')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('autorole_game_rpg')
            .setLabel('RPG')
            .setEmoji('2️⃣')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('autorole_game_tir')
            .setLabel('Tir')
            .setEmoji('3️⃣')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('autorole_game_sport')
            .setLabel('Sport')
            .setEmoji('4️⃣')
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildPlatformButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('autorole_platform_xbox')
            .setLabel('Xbox')
            .setEmoji('🟩')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('autorole_platform_ps5')
            .setLabel('PS5')
            .setEmoji('🟦')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('autorole_platform_pc')
            .setLabel('PC')
            .setEmoji('🟨')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('autorole_platform_switch')
            .setLabel('Switch')
            .setEmoji('🟥')
            .setStyle(ButtonStyle.Secondary)
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleAdminCommand,
};