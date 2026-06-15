const {
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const config = require('../../config');
const db = require('../../db/queries');

function cleanChannelName(name) {
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 30);
}

function hasTeamRole(member) {
    return member.roles.cache.some(role => role.name === config.TEAM_ROLE_NAME);
}

function hasStaffPower(member) {
    return (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.roles.cache.has(config.MODERATOR_ROLE_ID) ||
        hasTeamRole(member)
    );
}

async function handleSupportTicketButton(interaction) {
    const { customId } = interaction;
    if (customId === 'support_ticket_open') { await openSupportTicket(interaction); return true; }
    if (customId === 'support_ticket_close') { await closeSupportTicket(interaction); return true; }
    return false;
}

async function openSupportTicket(interaction) {
    await interaction.deferReply({ flags: 64 });

    const guildId = interaction.guild.id;

    // Vérifier ticket existant
    const existingTicket = await db.getOpenSupportTicket(guildId, interaction.user.id);
    if (existingTicket) {
        await interaction.editReply({ content: `❌ Tu as déjà un ticket ouvert : <#${existingTicket.channel_id}>` });
        return;
    }

    // Lire settings depuis guild_module_settings (dashboard) d'abord, sinon config
    const supportSettings = await db.getModuleSettings(guildId, 'support').catch(() => null);
    const serverSettings = await db.getServerSettings(guildId).catch(() => null);

    const categoryId = supportSettings?.support_category_id
        || serverSettings?.support_ticket_category_id
        || config.SUPPORT_TICKET_CATEGORY_ID;

    const teamRoleId = supportSettings?.team_role_id || null;
    const moderatorRoleId = supportSettings?.moderator_role_id || config.MODERATOR_ROLE_ID;
    const pingTeam = supportSettings?.ping_team_on_open !== false;
    const welcomeMessage = supportSettings?.welcome_message
        || "Bienvenue {user} ! Explique ton problème clairement, l'équipe va te répondre dès que possible.";

    const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);
    if (!category) {
        await interaction.editReply({ content: '❌ Catégorie ticket introuvable. Configure-la dans le dashboard → Support → Salons & rôles.' });
        return;
    }

    const channelName = `ticket-${cleanChannelName(interaction.user.username)}`;

    const permissionOverwrites = [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
    ];

    if (moderatorRoleId) {
        permissionOverwrites.push({ id: moderatorRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }
    if (teamRoleId && teamRoleId !== moderatorRoleId) {
        permissionOverwrites.push({ id: teamRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }

    const ticketChannel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites,
        reason: `Ticket support ouvert par ${interaction.user.tag}`,
    });

    await db.createSupportTicket(guildId, interaction.user.id, ticketChannel.id);

    // Message d'ouverture personnalisé
    const msgContent = welcomeMessage
        .replace('{user}', `${interaction.user}`)
        .replace('{username}', interaction.user.username)
        .replace('{server}', interaction.guild.name);

    const embed = new EmbedBuilder()
        .setColor('#7c3aed')
        .setTitle('🎫 Ticket ouvert')
        .setDescription(msgContent)
        .setFooter({ text: 'ChaosCore • Support' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('support_ticket_close').setLabel('Fermer le ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
    );

    // Ping équipe si activé
    let pingContent = `${interaction.user}`;
    if (pingTeam && teamRoleId) pingContent += ` <@&${teamRoleId}>`;

    await ticketChannel.send({ content: pingContent, embeds: [embed], components: [row] });
    await interaction.editReply({ content: `✅ Ton ticket a été créé : ${ticketChannel}` });
}

async function closeSupportTicket(interaction) {
    await interaction.deferReply({ flags: 64 });

    const ticket = await db.getSupportTicketByChannel(interaction.channel.id);
    if (!ticket) { await interaction.editReply({ content: "❌ Ce salon n'est pas un ticket ouvert." }); return; }

    const isOwner = ticket.user_id === interaction.user.id;
    const isStaff = hasStaffPower(interaction.member);

    // Vérifier si l'utilisateur peut fermer
    const supportSettings = await db.getModuleSettings(interaction.guild.id, 'support').catch(() => null);
    const allowUserClose = supportSettings?.allow_user_close !== false;

    if (!isStaff && (!isOwner || !allowUserClose)) {
        await interaction.editReply({ content: "❌ Tu n'as pas l'autorisation de fermer ce ticket." });
        return;
    }

    const closeMessage = (supportSettings?.close_message || 'Ticket fermé. Merci d\'avoir contacté le support.')
        .replace('{staff}', interaction.user.username)
        .replace('{user}', interaction.user.username);

    await db.closeSupportTicket(interaction.channel.id);
    await interaction.editReply({ content: `🔒 ${closeMessage}\n\nSuppression du salon dans 5 secondes...` });

    setTimeout(() => { interaction.channel.delete('Ticket support fermé').catch(() => null); }, 5000);
}

module.exports = { handleSupportTicketButton };