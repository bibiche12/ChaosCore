const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const config = require('../../config');
const db = require('../../db/queries');

function hasTeamRole(member) {
    return member.roles.cache.some(role => role.name === config.TEAM_ROLE_NAME);
}

async function handleSupportTicketCommand(interaction) {
    if (interaction.commandName !== 'setupticket') return false;

    if (!hasTeamRole(interaction.member)) {
        await interaction.reply({ content: "❌ Tu n'as pas l'autorisation d'utiliser cette commande.", flags: 64 });
        return true;
    }

    // Lire le salon depuis server_settings
    const serverSettings = await db.getServerSettings(interaction.guildId).catch(() => null);
    const panelChannelId = serverSettings?.support_ticket_panel_channel_id || config.SUPPORT_TICKET_PANEL_CHANNEL_ID;

    const channel = await interaction.guild.channels.fetch(panelChannelId).catch(() => null);
    if (!channel) {
        await interaction.reply({ content: '❌ Salon panneau ticket introuvable. Configure-le dans le dashboard.', flags: 64 });
        return true;
    }

    const embed = new EmbedBuilder()
        .setColor('#7c3aed')
        .setTitle('🎫 Besoin d\'aide ?')
        .setDescription(`Clique sur le bouton ci-dessous pour ouvrir un ticket privé.\n\nUn membre du staff te répondra dès que possible.`)
        .setFooter({ text: 'ChaosCore • Support' });

    await channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('support_ticket_open').setLabel('Ouvrir un ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary)
        )],
    });

    await interaction.reply({ content: `✅ Panneau ticket envoyé dans ${channel}.`, flags: 64 });
    return true;
}

module.exports = { handleSupportTicketCommand };