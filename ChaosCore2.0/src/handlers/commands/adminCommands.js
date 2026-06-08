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

async function handleAdminCommand(
    interaction,
    {
        discordClient,
        sendContestLog,
    }
) {
    if (interaction.commandName === 'ping') {
        await interaction.reply('🏓 ChaosCore est vivant !');
        return true;
    }

    if (interaction.commandName === 'clearoverlay') {
        if (!requireTeam(interaction)) return true;

        await interaction.deferReply({ flags: 64 });

        await db.clearOverlayEvents();

        await interaction.editReply({
            content: '✅ Tous les gages overlay ont été retirés.',
        });

        return true;
    }

    if (interaction.commandName === 'testoverlay') {
        if (!requireTeam(interaction)) return true;

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

        const button = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`complete_overlay_${event.id}`)
                .setLabel('Gage effectué')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success)
        );

        await sendContestLog({
            content:
                `🎮 **Nouveau gage overlay**\n\n` +
                `📺 Viewer : **${interaction.user.username}**\n` +
                `🎁 Récompense : **${rewardName}**\n` +
                `📝 Texte : ${userInput}`,
            components: [button],
        }).catch(() => null);

        await interaction.editReply(
            `✅ Test overlay envoyé.\n\n**${rewardName}** : ${userInput}`
        );

        return true;
    }

    if (interaction.commandName === 'setuproles') {
    if (!requireTeam(interaction)) return true;

    await interaction.deferReply({ flags: 64 });

    const roleChannel = await discordClient.channels
        .fetch(config.SALON_ROLES_ID)
        .catch(() => null);

    if (!roleChannel) {
        await interaction.editReply(
            '❌ Salon rôles introuvable.'
        );

        return true;
    }

    const pingEmbed = new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle('🔔 PINGS')
        .setDescription(
            `Choisis les notifications que tu souhaites recevoir.\n\n` +
            `📹 Ping - Live\n` +
            `🎮 Ping - Game\n` +
            `📰 Ping - Programme`
        );

    const pingButtons = new ActionRowBuilder().addComponents(
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

    const gameEmbed = new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle('🎮 JEUX')
        .setDescription(
            `Choisis les catégories de jeux qui t’intéressent.\n\n` +
            `1️⃣ Jeu - Horreur\n` +
            `2️⃣ Jeu - RPG\n` +
            `3️⃣ Jeu - Tir\n` +
            `4️⃣ Jeu - Sport`
        );

    const gameButtons = new ActionRowBuilder().addComponents(
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

    const platformEmbed = new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle('🕹️ PLATEFORMES')
        .setDescription(
            `Choisis tes plateformes.\n\n` +
            `🟩 Xbox\n` +
            `🟦 PS5\n` +
            `🟨 PC\n` +
            `🟥 Switch`
        );

    const platformButtons = new ActionRowBuilder().addComponents(
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

    await roleChannel.send({
        embeds: [pingEmbed],
        components: [pingButtons],
    });

    await roleChannel.send({
        embeds: [gameEmbed],
        components: [gameButtons],
    });

    await roleChannel.send({
        embeds: [platformEmbed],
        components: [platformButtons],
    });

    await interaction.editReply(
        '✅ Messages de rôles créés avec ChaosCore.'
    );

    return true;
}

    return false;
}

module.exports = {
    handleAdminCommand,
};