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
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 30);
}

function hasTeamRole(member) {
    return member.roles.cache.some(
        role => role.name === config.TEAM_ROLE_NAME
    );
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

    if (customId === 'support_ticket_open') {
        await openSupportTicket(interaction);
        return true;
    }

    if (customId === 'support_ticket_close') {
        await closeSupportTicket(interaction);
        return true;
    }

    return false;
}

async function openSupportTicket(interaction) {
    await interaction.deferReply({ flags: 64 });

    const existingTicket = await db.getOpenSupportTicket(
        interaction.guild.id,
        interaction.user.id
    );

    if (existingTicket) {
        await interaction.editReply({
            content: `❌ Tu as déjà un ticket ouvert : <#${existingTicket.channel_id}>`,
        });

        return;
    }

    const category = await interaction.guild.channels
        .fetch(config.SUPPORT_TICKET_CATEGORY_ID)
        .catch(() => null);

    if (!category) {
        await interaction.editReply({
            content: '❌ Catégorie ticket introuvable.',
        });

        return;
    }

    const channelName = `ticket-${cleanChannelName(interaction.user.username)}`;

    const permissionOverwrites = [
        {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
        },
        {
            id: interaction.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
            ],
        },
        {
            id: interaction.client.user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
            ],
        },
    ];

    if (config.MODERATOR_ROLE_ID) {
        permissionOverwrites.push({
            id: config.MODERATOR_ROLE_ID,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
            ],
        });
    }

    const ticketChannel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites,
        reason: `Ticket support ouvert par ${interaction.user.tag}`,
    });

    await db.createSupportTicket(
        interaction.guild.id,
        interaction.user.id,
        ticketChannel.id
    );

    const embed = new EmbedBuilder()
        .setColor('#7c3aed')
        .setTitle('🎫 Ticket ouvert')
        .setDescription(
            `Bonjour ${interaction.user}, explique ton problème ici.\n\n` +
            `Un membre du staff te répondra dès que possible.`
        )
        .setFooter({ text: 'ChaosCore • Support' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('support_ticket_close')
            .setLabel('Fermer le ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
        content: `${interaction.user}`,
        embeds: [embed],
        components: [row],
    });

    await interaction.editReply({
        content: `✅ Ton ticket a été créé : ${ticketChannel}`,
    });
}

async function closeSupportTicket(interaction) {
    await interaction.deferReply({ flags: 64 });

    const ticket = await db.getSupportTicketByChannel(interaction.channel.id);

    if (!ticket) {
        await interaction.editReply({
            content: "❌ Ce salon n'est pas un ticket ouvert.",
        });

        return;
    }

    const isOwner = ticket.user_id === interaction.user.id;
    const isStaff = hasStaffPower(interaction.member);

    if (!isOwner && !isStaff) {
        await interaction.editReply({
            content: "❌ Tu n'as pas l'autorisation de fermer ce ticket.",
        });

        return;
    }

    await db.closeSupportTicket(interaction.channel.id);

    await interaction.editReply({
        content: '🔒 Ticket fermé. Suppression du salon...',
    });

    setTimeout(() => {
        interaction.channel.delete('Ticket support fermé').catch(() => null);
    }, 3000);
}

module.exports = {
    handleSupportTicketButton,
};