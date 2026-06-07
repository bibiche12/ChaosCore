const { SlashCommandBuilder } = require('discord.js');
const db = require('../db/queries');
const config = require('../config');
const security = require('../services/security');
const commandDefinitions = [
    new SlashCommandBuilder().setName('ping').setDescription('Vérifie que ChaosCore fonctionne'),

    new SlashCommandBuilder().setName('solde').setDescription('Voir ton solde de Bichcoins'),

    new SlashCommandBuilder().setName('profil').setDescription('Voir ton profil ChaosCore'),

    new SlashCommandBuilder()
        .setName('adpoint')
        .setDescription('Ajouter des Bichcoins à un membre')
        .addUserOption(o => o.setName('membre').setDescription('Membre à créditer').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('Montant à ajouter').setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
        .setName('retpoint')
        .setDescription('Retirer des Bichcoins à un membre')
        .addUserOption(o => o.setName('membre').setDescription('Membre à débiter').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('Montant à retirer').setRequired(true).setMinValue(1)),

    new SlashCommandBuilder().setName('tickets').setDescription('Voir tes Tickets du Chaos'),

    new SlashCommandBuilder()
        .setName('adticket')
        .setDescription('Ajouter des Tickets du Chaos à un membre')
        .addUserOption(o => o.setName('membre').setDescription('Membre à créditer').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('Nombre de tickets').setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
        .setName('retticket')
        .setDescription('Retirer des Tickets du Chaos à un membre')
        .addUserOption(o => o.setName('membre').setDescription('Membre à débiter').setRequired(true))
        .addIntegerOption(o => o.setName('montant').setDescription('Nombre de tickets').setRequired(true).setMinValue(1)),

    new SlashCommandBuilder().setName('resume').setDescription('Afficher le classement Tickets du Chaos'),

    new SlashCommandBuilder().setName('live').setDescription('Démarrer le comptage live Twitch'),
new SlashCommandBuilder().setName('scan').setDescription('Scanner Twitch maintenant pour détecter un live'),
    new SlashCommandBuilder().setName('stop').setDescription('Arrêter le comptage live Twitch'),
new SlashCommandBuilder()
    .setName('raidoff')
    .setDescription('Désactiver le mode raid'),

    new SlashCommandBuilder()
        .setName('twitch')
        .setDescription('Associer un membre Discord à son pseudo Twitch')
        .addUserOption(o => o.setName('membre').setDescription('Membre Discord').setRequired(true))
        .addStringOption(o => o.setName('pseudo').setDescription('Pseudo Twitch').setRequired(true)),

    new SlashCommandBuilder().setName('twitchlinks').setDescription('Afficher les liaisons Twitch enregistrées'),

    new SlashCommandBuilder().setName('setupboutique').setDescription('Installer ou mettre à jour la boutique Oncle’Bich'),

    new SlashCommandBuilder().setName('clearoverlay').setDescription('Vider tous les gages de la bannière'),

    new SlashCommandBuilder()
        .setName('testoverlay')
        .setDescription('Tester l’affichage d’un gage sur la bannière OBS')
        .addStringOption(o =>
            o.setName('reward')
                .setDescription('Récompense')
                .setRequired(true)
                .addChoices(
                    { name: '🎲 Mini Chaos', value: '🎲 Mini Chaos' },
                    { name: '👻 Vérification Paranormale - PHASMO', value: '👻 Vérification Paranormale - PHASMO' },
                    { name: '👑 Choix du Chaos', value: '👑 Choix du Chaos' },
                    { name: '🎤 Voix de Bibiche', value: '🎤 Voix de Bibiche' },
                    { name: '☠️ Chaos Total', value: '☠️ Chaos Total' }
                )
        )
        .addStringOption(o => o.setName('texte').setDescription('Texte à afficher').setRequired(true)),
].map(c => c.toJSON());

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

async function handleCommand(interaction, { twitchService, setupShop, discordClient, sendLog, sendContestLog, processLivePhrases }) {
    if (interaction.commandName === 'ping') {
        return interaction.reply('🏓 ChaosCore est vivant !');
    }
    if (interaction.commandName === 'raidoff') {
    if (!requireTeam(interaction)) return;

    security.disableRaidMode();

   const securityChannel = await discordClient.channels
    .fetch(config.SECURITY_LOG_CHANNEL_ID)
    .catch(() => null);

if (securityChannel) {
    await securityChannel.send(
        `🛡️ **Mode Raid désactivé**\n\n` +
        `👤 Par : ${interaction.user}`
    );
}
}

    if (interaction.commandName === 'solde') {
        await interaction.deferReply({ flags: 64 });
        const userData = await db.getUserPoints(interaction.user.id);

        return interaction.editReply({
            content: `🏦 **Oncle'Bich consulte ton compte...**\n\n💰 Solde actuel : **${userData.balance} Bichcoins**`,
        });
    }

    if (interaction.commandName === 'profil') {
        await interaction.deferReply({ flags: 64 });

        const points = await db.getUserPoints(interaction.user.id);
        const tickets = await db.getTicketUser(interaction.user.id);

        return interaction.editReply({
            content:
                `👤 **Profil ChaosCore**\n\n` +
                `🏦 Bichcoins : **${points.balance}**\n` +
                `🎟️ Tickets du Chaos : **${tickets.tickets}**\n\n` +
                `💬 Messages Twitch : **${tickets.twitch_messages || 0}**\n` +
                `🔴 Présences live : **${tickets.presences || 0}**\n` +
                `✍️ Tickets manuels : **${tickets.manual || 0}**`,
        });
    }

    if (interaction.commandName === 'adpoint') {
        if (!requireTeam(interaction)) return;
        await interaction.deferReply({ flags: 64 });

        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');
        const newBalance = await db.addPoints(target.id, amount);

        await sendLog(
            `🏦 **Ajout de Bichcoins**\n\n` +
            `👤 Membre : ${target}\n` +
            `➕ Montant : **${amount}**\n` +
            `💰 Nouveau solde : **${newBalance}**\n` +
            `👑 Par : ${interaction.user}`
        ).catch(() => null);

        return interaction.editReply(`✅ **${amount} Bichcoins** ajoutés à ${target}.\n💰 Nouveau solde : **${newBalance}**`);
    }

    if (interaction.commandName === 'retpoint') {
        if (!requireTeam(interaction)) return;
        await interaction.deferReply({ flags: 64 });

        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');
        const newBalance = await db.addPoints(target.id, -amount);

        await sendLog(
            `🏦 **Retrait de Bichcoins**\n\n` +
            `👤 Membre : ${target}\n` +
            `➖ Montant : **${amount}**\n` +
            `💰 Nouveau solde : **${newBalance}**\n` +
            `👑 Par : ${interaction.user}`
        ).catch(() => null);

        return interaction.editReply(`✅ **${amount} Bichcoins** retirés à ${target}.\n💰 Nouveau solde : **${newBalance}**`);
    }

    if (interaction.commandName === 'tickets') {
        await interaction.deferReply({ flags: 64 });

        const ticketData = await db.getTicketUser(interaction.user.id);

        return interaction.editReply({
            content:
                `🎟️ **Tes Tickets du Chaos**\n\n` +
                `Total : **${ticketData.tickets}**\n` +
                `✍️ Manuels : **${ticketData.manual || 0}**\n` +
                `💬 Messages Twitch : **${ticketData.twitch_messages || 0}**\n` +
                `🔴 Présences live : **${ticketData.presences || 0}**`,
        });
    }

    if (interaction.commandName === 'adticket') {
        if (!requireTeam(interaction)) return;
        await interaction.deferReply({ flags: 64 });

        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');

        await db.addTickets(target.id, amount, 'manual');

        await sendContestLog(
            `🎟️ **Ajout manuel de Tickets**\n\n` +
            `👤 Membre : ${target}\n` +
            `➕ Montant : **${amount} Tickets**\n` +
            `👑 Par : ${interaction.user}`
        ).catch(() => null);

        return interaction.editReply(`✅ **${amount} Tickets du Chaos** ajoutés à ${target}.`);
    }

    if (interaction.commandName === 'retticket') {
        if (!requireTeam(interaction)) return;
        await interaction.deferReply({ flags: 64 });

        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');

        await db.addTickets(target.id, -amount, 'manual');

        await sendContestLog(
            `🎟️ **Retrait manuel de Tickets**\n\n` +
            `👤 Membre : ${target}\n` +
            `➖ Montant : **${amount} Tickets**\n` +
            `👑 Par : ${interaction.user}`
        ).catch(() => null);

        return interaction.editReply(`✅ **${amount} Tickets du Chaos** retirés à ${target}.`);
    }

    if (interaction.commandName === 'resume') {
        await interaction.deferReply();

        const top = await db.getTopTickets(20);

        if (top.length === 0) {
            return interaction.editReply('🎟️ Aucun ticket enregistré pour le moment.');
        }

        const lines = top.map((data, index) =>
            `**${index + 1}.** <@${data.user_id}> — **${data.tickets} Tickets**`
        );

        return interaction.editReply(`🏆 **Classement Tickets du Chaos**\n\n${lines.join('\n')}`);
    }
    if (interaction.commandName === 'scan') {
        if (!requireTeam(interaction)) return;

        await interaction.deferReply({ flags: 64 });

        const result = await twitchService.checkTwitchLive(discordClient, async () => {
            if (typeof processLivePhrases === 'function') {
                await processLivePhrases(discordClient).catch(console.error);
            }
        });

        if (result?.started) {
            return interaction.editReply('🔴 Live détecté ! Annonce envoyée et comptage activé.');
        }

        if (result?.isLive) {
            return interaction.editReply('🔴 Le live est déjà actif dans ChaosCore.');
        }

        return interaction.editReply('⚫ Aucun live Twitch détecté pour le moment.');
    }

        if (interaction.commandName === 'live') {
        if (!requireTeam(interaction)) return;

        const liveState = twitchService.getLiveState();

        if (liveState.liveContestActive) {
            return interaction.reply({
                content: '⚠️ Un live est déjà actif dans ChaosCore.',
                flags: 64,
            });
        }

        twitchService.setLiveActive(true);
        twitchService.resetCurrentLive();

        await interaction.reply('🔴 Comptage Tickets du Chaos activé pour le live.');

        return sendContestLog(
            `🔴 **Live concours démarré**\n\n` +
            `Présence : **+${config.TICKET_PRESENCE} Tickets**\n` +
            `Messages : **+${config.TICKET_EVERY_10_MESSAGES} Tickets tous les 10 messages non-spam**`
        ).catch(() => null);
    }

            if (interaction.commandName === 'stop') {
        if (!requireTeam(interaction)) return;

        const liveState = twitchService.getLiveState();

        if (!liveState.liveContestActive) {
            return interaction.reply({
                content: '⚠️ Aucun live actif à arrêter.',
                flags: 64,
            });
        }

        const participants = Object.keys(liveState.currentLive.users || {}).length;
        const summary = twitchService.generateLiveStatsSummary(participants);

        twitchService.stopCurrentLive();

        await interaction.reply(`⚫ Comptage Tickets du Chaos arrêté. Participants détectés : **${participants}**.`);

        return sendContestLog(
            `⚫ **Live concours arrêté**\n\n` +
            summary
        ).catch(() => null);
    }

    if (interaction.commandName === 'twitch') {
        if (!requireTeam(interaction)) return;
        await interaction.deferReply({ flags: 64 });

        const target = interaction.options.getUser('membre');
        const pseudo = interaction.options.getString('pseudo').toLowerCase().replace('@', '').trim();

        await db.setTwitchLink(pseudo, target.id);

        await sendContestLog(
            `🔗 **Association Twitch**\n\n` +
            `👤 Discord : ${target}\n` +
            `📺 Twitch : **${pseudo}**\n` +
            `👑 Par : ${interaction.user}`
        ).catch(() => null);

        return interaction.editReply(`✅ ${target} est maintenant associé au pseudo Twitch **${pseudo}**.`);
    }

    if (interaction.commandName === 'twitchlinks') {
        if (!requireTeam(interaction)) return;
        await interaction.deferReply({ flags: 64 });

        const links = await db.listTwitchLinks();

        if (links.length === 0) {
            return interaction.editReply('🔗 Aucune liaison Twitch enregistrée.');
        }

        const lines = links.slice(0, 30).map(link =>
            `📺 **${link.twitch_name}** → <@${link.user_id}>`
        );

        return interaction.editReply(`🔗 **Liaisons Twitch enregistrées**\n\n${lines.join('\n')}`);
    }

    if (interaction.commandName === 'setupboutique') {
        if (!requireTeam(interaction)) return;
        await interaction.deferReply({ flags: 64 });

        const shopChannel = await discordClient.channels.fetch(config.SHOP_CHANNEL_ID).catch(() => null);

        if (!shopChannel) {
            return interaction.editReply('❌ Salon boutique introuvable.');
        }

        await setupShop(shopChannel);

        return interaction.editReply('✅ Boutique Oncle’Bich installée / mise à jour.');
    }

    if (interaction.commandName === 'clearoverlay') {
    if (!requireTeam(interaction)) return;

    await interaction.deferReply({ flags: 64 });

    await db.clearOverlayEvents();

    return interaction.editReply({
        content: '✅ Tous les gages overlay ont été retirés.',
    });
}
    if (interaction.commandName === 'testoverlay') {
        if (!requireTeam(interaction)) return;
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

        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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

        return interaction.editReply(`✅ Test overlay envoyé.\n\n**${rewardName}** : ${userInput}`);
    }
}

module.exports = {
    commandDefinitions,
    handleCommand,
};