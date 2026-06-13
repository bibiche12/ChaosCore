const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const config = require('../../config');

function hasTeamRole(member) {
    return member.roles.cache.some(
        role => role.name === config.TEAM_ROLE_NAME
    );
}

async function handleSupportTicketCommand(interaction) {
    if (interaction.commandName !== 'setupticket') {
        return false;
    }

    if (!hasTeamRole(interaction.member)) {
        await interaction.reply({
            content: "❌ Tu n'as pas l'autorisation d'utiliser cette commande.",
            flags: 64,
        });

        return true;
    }

    const channel = await interaction.guild.channels
        .fetch(config.SUPPORT_TICKET_PANEL_CHANNEL_ID)
        .catch(() => null);

    if (!channel) {
        await interaction.reply({
            content: '❌ Salon panneau ticket introuvable.',
            flags: 64,
        });

        return true;
    }

    const embed = new EmbedBuilder()
        .setColor('#7c3aed')
        .setTitle('🎫 Besoin d’aide ?')
        .setDescription(
            `Clique sur le bouton ci-dessous pour ouvrir un ticket privé.\n\n` +
            `Un membre du staff te répondra dès que possible.`
        )
        .setFooter({ text: 'ChaosCore • Support' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('support_ticket_open')
            .setLabel('Ouvrir un ticket')
            .setEmoji('🎫')
            .setStyle(ButtonStyle.Primary)
    );

    await channel.send({
        embeds: [embed],
        components: [row],
    });

    await interaction.reply({
        content: `✅ Panneau ticket envoyé dans ${channel}.`,
        flags: 64,
    });

    return true;
}

module.exports = {
    handleSupportTicketCommand,
};