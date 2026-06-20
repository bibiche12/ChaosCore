const {
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');

const config = require('../../config');
const db = require('../../db/queries');
const { hasTeamRole, hasModeratorPower } = require('../../utils/guildSettings');

function cleanChannelName(name) {
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 30);
}

async function hasStaffPower(member) {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return await hasModeratorPower(member);
}

async function handleSupportTicketButton(interaction) {
    const { customId } = interaction;
    if (customId === 'support_ticket_open') { await openSupportTicket(interaction); return true; }
    if (customId === 'support_ticket_close') { await closeSupportTicket(interaction); return true; }
    if (customId === 'support_ticket_claim') { await claimSupportTicket(interaction); return true; }
    return false;
}

// Le dashboard permet de configurer une liste de catégories (une par ligne)
// dans /support/categories, mais le bot ne s'en servait jamais : le clic sur
// "Ouvrir un ticket" créait toujours directement le salon sans demander de
// catégorie. On affiche désormais un menu de sélection avant de créer le ticket.
async function handleSupportCategorySelect(interaction) {
    if (interaction.customId !== 'support_ticket_category_select') return false;
    await interaction.deferUpdate();
    const category = interaction.values[0];
    await createSupportTicketChannel(interaction, category);
    return true;
}

async function openSupportTicket(interaction) {
    await interaction.deferReply({ flags: 64 });

    const guildId = interaction.guild.id;
    const supportSettings = await db.getModuleSettings(guildId, 'support').catch(() => null);

    // max_open_tickets_per_user était configurable dans le dashboard mais
    // jamais lu — le bot limitait toujours à 1 ticket ouvert par défaut,
    // peu importe la valeur choisie par l'admin.
    const maxOpenTickets = supportSettings?.max_open_tickets_per_user || 1;
    const openTicketsCount = await db.getOpenTicketsCountForUser(guildId, interaction.user.id).catch(() => 0);
    if (openTicketsCount >= maxOpenTickets) {
        const existingTicket = await db.getOpenSupportTicket(guildId, interaction.user.id);
        const channelMention = existingTicket ? ` : <#${existingTicket.channel_id}>` : '.';
        await interaction.editReply({ content: `❌ Tu as déjà atteint la limite de ${maxOpenTickets} ticket(s) ouvert(s)${channelMention}` });
        return;
    }

    // Si les catégories sont activées dans le dashboard, on affiche un menu
    // de sélection avant de créer le ticket plutôt que de le créer directement.
    if (supportSettings?.categories_enabled && supportSettings?.categories) {
        const categoryLabels = supportSettings.categories
            .split('\n')
            .map(c => c.trim())
            .filter(Boolean)
            .slice(0, 25); // limite Discord pour un select menu

        if (categoryLabels.length > 0) {
            const menu = new StringSelectMenuBuilder()
                .setCustomId('support_ticket_category_select')
                .setPlaceholder('Choisis une catégorie')
                .addOptions(categoryLabels.map(label => ({ label: label.slice(0, 100), value: label.slice(0, 100) })));

            await interaction.editReply({
                content: '🎫 Choisis la catégorie qui correspond le mieux à ta demande :',
                components: [new ActionRowBuilder().addComponents(menu)],
            });
            return;
        }
    }

    await createSupportTicketChannel(interaction, null);
}

async function createSupportTicketChannel(interaction, categoryLabel) {
    const guildId = interaction.guild.id;

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

    if (categoryLabel) {
        embed.addFields({ name: 'Catégorie', value: categoryLabel });
    }

    const rowButtons = [
        new ButtonBuilder().setCustomId('support_ticket_close').setLabel('Fermer le ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    ];

    if (supportSettings?.claim_enabled) {
        rowButtons.push(
            new ButtonBuilder().setCustomId('support_ticket_claim').setLabel('Prendre en charge').setEmoji('🙋').setStyle(ButtonStyle.Primary)
        );
    }

    const row = new ActionRowBuilder().addComponents(rowButtons);

    // Ping équipe si activé
    let pingContent = `${interaction.user}`;
    if (pingTeam && teamRoleId) pingContent += ` <@&${teamRoleId}>`;

    await ticketChannel.send({ content: pingContent, embeds: [embed], components: [row] });

    // dm_user_on_open était configurable mais jamais utilisé.
    if (supportSettings?.dm_user_on_open) {
        await interaction.user.send(`🎫 Ton ticket support a été créé sur **${interaction.guild.name}** : ${ticketChannel.toString()}`).catch(() => null);
    }

    const confirmContent = `✅ Ton ticket a été créé : ${ticketChannel}`;
    if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: confirmContent, components: [] });
    }
}

async function closeSupportTicket(interaction) {
    await interaction.deferReply({ flags: 64 });

    const ticket = await db.getSupportTicketByChannel(interaction.channel.id);
    if (!ticket) { await interaction.editReply({ content: "❌ Ce salon n'est pas un ticket ouvert." }); return; }

    const isOwner = ticket.user_id === interaction.user.id;
    const isStaff = await hasStaffPower(interaction.member);

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

    // dm_user_on_close était configurable mais jamais utilisé.
    if (supportSettings?.dm_user_on_close) {
        const ticketOwner = await interaction.guild.members.fetch(ticket.user_id).catch(() => null);
        if (ticketOwner) {
            await ticketOwner.send(`🔒 Ton ticket support sur **${interaction.guild.name}** a été fermé.\n\n${closeMessage}`).catch(() => null);
        }
    }

    // transcript_enabled / archive_channel_id étaient configurables mais
    // jamais utilisés — aucune transcription n'était jamais générée.
    if (supportSettings?.transcript_enabled && supportSettings?.archive_channel_id) {
        await sendTicketTranscript(interaction, ticket, supportSettings.archive_channel_id).catch(() => null);
    }

    // log_channel_id (salon de logs des actions tickets) était configurable
    // mais jamais utilisé — aucune action n'était jamais loggée nulle part.
    if (supportSettings?.log_channel_id) {
        const logChannel = await interaction.guild.channels.fetch(supportSettings.log_channel_id).catch(() => null);
        if (logChannel) {
            await logChannel.send(
                `🔒 **Ticket fermé**\n\n👤 Propriétaire : <@${ticket.user_id}>\n🔐 Fermé par : ${interaction.user}\n📍 Salon : ${interaction.channel.name}`
            ).catch(() => null);
        }
    }

    // closed_category_id permet de déplacer le salon plutôt que de le
    // supprimer immédiatement — il était configurable mais jamais utilisé,
    // le salon était toujours supprimé après 5 secondes fixes.
    if (supportSettings?.closed_category_id) {
        const closedCategory = await interaction.guild.channels.fetch(supportSettings.closed_category_id).catch(() => null);
        if (closedCategory) {
            await interaction.channel.setParent(closedCategory.id, { lockPermissions: false }).catch(() => null);
            await interaction.channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: false }).catch(() => null);

            if (supportSettings?.delete_after_close) {
                const delayMs = (supportSettings?.delete_after_minutes || 60) * 60 * 1000;
                await interaction.editReply({ content: `🔒 ${closeMessage}\n\nSalon déplacé en archive, suppression dans ${supportSettings?.delete_after_minutes || 60} min.` });
                setTimeout(() => { interaction.channel.delete('Ticket support archivé puis supprimé').catch(() => null); }, delayMs);
            } else {
                await interaction.editReply({ content: `🔒 ${closeMessage}\n\nSalon déplacé en archive.` });
            }
            return;
        }
    }

    // Comportement par défaut si aucune catégorie d'archive n'est configurée.
    if (supportSettings?.delete_after_close) {
        const delayMs = (supportSettings?.delete_after_minutes || 60) * 60 * 1000;
        await interaction.editReply({ content: `🔒 ${closeMessage}\n\nSuppression du salon dans ${supportSettings?.delete_after_minutes || 60} min.` });
        setTimeout(() => { interaction.channel.delete('Ticket support fermé').catch(() => null); }, delayMs);
    } else {
        await interaction.editReply({ content: `🔒 ${closeMessage}\n\nSuppression du salon dans 5 secondes...` });
        setTimeout(() => { interaction.channel.delete('Ticket support fermé').catch(() => null); }, 5000);
    }
}

// Génère une transcription texte simple du ticket et la poste dans le
// salon d'archive configuré. Reste volontairement basique (pas de mise en
// forme HTML) — suffisant pour garder une trace consultable des échanges.
async function sendTicketTranscript(interaction, ticket, archiveChannelId) {
    const archiveChannel = await interaction.guild.channels.fetch(archiveChannelId).catch(() => null);
    if (!archiveChannel) return;

    const messages = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) return;

    const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const lines = sorted.map(m => `[${m.createdAt.toLocaleString('fr-FR')}] ${m.author.tag}: ${m.content || '*(contenu non textuel)*'}`);
    const transcriptText = lines.join('\n') || 'Aucun message dans ce ticket.';

    const buffer = Buffer.from(transcriptText, 'utf-8');
    await archiveChannel.send({
        content: `📜 **Transcription du ticket** — <@${ticket.user_id}> — fermé par ${interaction.user}`,
        files: [{ attachment: buffer, name: `transcript-${interaction.channel.name}.txt` }],
    }).catch(() => null);
}

async function claimSupportTicket(interaction) {
    await interaction.deferReply({ flags: 64 });

    if (!await hasStaffPower(interaction.member)) {
        await interaction.editReply({ content: "❌ Seul un membre du staff peut prendre en charge un ticket." });
        return;
    }

    const ticket = await db.getSupportTicketByChannel(interaction.channel.id);
    if (!ticket) { await interaction.editReply({ content: "❌ Ce salon n'est pas un ticket ouvert." }); return; }

    if (ticket.claimed_by) {
        const claimerTag = ticket.claimed_by === interaction.user.id ? 'toi' : `<@${ticket.claimed_by}>`;
        await interaction.editReply({ content: `❌ Ce ticket est déjà pris en charge par ${claimerTag}.` });
        return;
    }

    const claimed = await db.claimSupportTicket(interaction.channel.id, interaction.user.id);
    if (!claimed) {
        await interaction.editReply({ content: '❌ Impossible de prendre en charge ce ticket (déjà pris ?).' });
        return;
    }

    const supportSettings = await db.getModuleSettings(interaction.guild.id, 'support').catch(() => null);

    if (supportSettings?.rename_on_claim) {
        const baseName = interaction.channel.name.replace(/^ticket-/, '').replace(/^pris-/, '');
        await interaction.channel.setName(`pris-${baseName}`.slice(0, 100)).catch(() => null);
    }

    await interaction.channel.send(`🙋 Ticket pris en charge par ${interaction.user}.`).catch(() => null);
    await interaction.editReply({ content: '✅ Tu as pris en charge ce ticket.' });
}

module.exports = { handleSupportTicketButton, handleSupportCategorySelect };