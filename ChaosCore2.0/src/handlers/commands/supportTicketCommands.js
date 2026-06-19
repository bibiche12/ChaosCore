const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');
const db = require('../../db/queries');
const { hasTeamRole } = require('../../utils/guildSettings');

async function handleSupportTicketCommand(interaction) {
    if (interaction.commandName !== 'setupticket') return false;

    if (!await hasTeamRole(interaction.member) && !interaction.member.permissions.has('Administrator')) {
        await interaction.reply({ content: "❌ Tu n'as pas l'autorisation d'utiliser cette commande.", flags: 64 });
        return true;
    }

    // Lire depuis guild_module_settings (dashboard) d'abord
    const supportSettings = await db.getModuleSettings(interaction.guildId, 'support').catch(() => null);
    const serverSettings = await db.getServerSettings(interaction.guildId).catch(() => null);

    const panelChannelId = supportSettings?.panel_channel_id
        || serverSettings?.support_ticket_panel_channel_id
        || config.SUPPORT_TICKET_PANEL_CHANNEL_ID;

    const panelTitle = supportSettings?.panel_title || '🎫 Besoin d\'aide ?';
    const panelDescription = supportSettings?.panel_description || 'Clique sur le bouton ci-dessous pour ouvrir un ticket privé.\n\nUn membre du staff te répondra dès que possible.';
    const panelButtonLabel = supportSettings?.panel_button_label || 'Ouvrir un ticket';
    const panelButtonEmoji = supportSettings?.panel_button_emoji || '🎫';
    const panelColor = supportSettings?.panel_color || '#7c3aed';

    const channel = await interaction.guild.channels.fetch(panelChannelId).catch(() => null);
    if (!channel) {
        await interaction.reply({ content: '❌ Salon panneau ticket introuvable. Configure-le dans le dashboard → Support → Salons & rôles.', flags: 64 });
        return true;
    }

    const embed = new EmbedBuilder()
        .setColor(panelColor)
        .setTitle(panelTitle)
        .setDescription(panelDescription)
        .setFooter({ text: 'ChaosCore • Support' });

    await channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('support_ticket_open')
                .setLabel(panelButtonLabel)
                .setEmoji(panelButtonEmoji)
                .setStyle(ButtonStyle.Primary)
        )],
    });

    // Réinitialiser le flag panel_refresh_requested
    if (supportSettings) {
        const current = { ...supportSettings, panel_refresh_requested: false };
        await db.pool.query(
            `INSERT INTO guild_module_settings (guild_id, module_name, settings, updated_at) VALUES ($1, 'support', $2, NOW())
             ON CONFLICT (guild_id, module_name) DO UPDATE SET settings = $2, updated_at = NOW()`,
            [interaction.guildId, current]
        ).catch(() => null);
    }

    await interaction.reply({ content: `✅ Panneau ticket envoyé dans ${channel}.`, flags: 64 });
    return true;
}

module.exports = { handleSupportTicketCommand };