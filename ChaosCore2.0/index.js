require('dotenv').config();

const { Client, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
const express = require('express');
const path = require('path');
const security = require('./src/services/security');
const config = require('./src/config');
const db = require('./src/db/queries');
const twitchService = require('./src/services/twitch');
const { setupShop, processLivePhrases } = require('./src/services/shop');
const { handleCommand, commandDefinitions } = require('./src/handlers/commands');
const { handleButton, handleModal, handleSelectMenu, pendingEmojiRequests } = require('./src/handlers/buttons');
const { handleMessage, restoreDisboardReminder } = require('./src/handlers/messages');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
    ],
});
const recentJoins = [];

async function sendOnboardingLog(message) {
    const channel = await client.channels.fetch(config.ONBOARDING_LOG_CHANNEL_ID).catch(() => null);
    if (channel) await channel.send(message).catch(console.error);
}

async function sendLog(message) {
    const channel = await client.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
    if (channel) await channel.send(message).catch(console.error);
}

async function sendContestLog(message) {
    const channel = await client.channels.fetch(config.CONTEST_LOG_CHANNEL_ID).catch(() => null);
    if (channel) await channel.send(message).catch(console.error);
}

async function cleanExpiredRoles() {
    const expiredRoles = await db.getExpiredTemporaryRoles();

    for (const row of expiredRoles) {
        try {
            const guild = await client.guilds.fetch(row.guild_id);
            const role = await guild.roles.fetch(row.role_id).catch(() => null);
            const member = await guild.members.fetch(row.user_id).catch(() => null);

            if (role && member) await member.roles.remove(role).catch(() => null);
            if (role) await role.delete('Rôle temporaire expiré').catch(() => null);

            await db.deleteTemporaryRole(row.id);
            console.log(`🗑️ Rôle temporaire supprimé : ${row.role_name}`);
        } catch (error) {
            console.error(`❌ Erreur suppression rôle temporaire #${row.id}:`, error);
        }
    }
}

async function handleMonthlyBonus() {
    const now = new Date();

    if (now.getDate() !== 1) return;

    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const alreadyGiven = await db.hasMonthlyBonusBeenGiven(monthKey);
    if (alreadyGiven) return;

    const usersCount = await db.giveMonthlyBonus(config.MONTHLY_BONUS);
    await db.markMonthlyBonusGiven(monthKey, usersCount);

    await sendLog(
        `🎁 **Bonus mensuel distribué**\n\n` +
        `💰 Montant : **${config.MONTHLY_BONUS} Bichcoins**\n` +
        `👥 Membres crédités : **${usersCount}**\n` +
        `📅 Mois : **${monthKey}**`
    ).catch(() => null);

    console.log(`🎁 Bonus mensuel ${monthKey} distribué à ${usersCount} membres`);
}

async function registerCommands() {
    console.log('📋 Commandes à enregistrer :', commandDefinitions.map(c => c.name));

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commandDefinitions }
    );

    console.log('✅ Commandes slash enregistrées');
}

client.once('clientReady', async () => {
    console.log(`✅ ChaosCore connecté en tant que ${client.user.tag}`);

    await db.initDatabase();
    await registerCommands();

    await restoreDisboardReminder(client);

    const twitchChat = twitchService.createTwitchChat(client, sendContestLog);
    twitchChat.connect().catch(error => {
        console.error('❌ Erreur connexion Twitch chat:', error.message);
    });

    function isInAutoScanWindow() {
        const formatter = new Intl.DateTimeFormat('fr-FR', {
            timeZone: 'Europe/Paris',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });

        const now = formatter.format(new Date());

        return now >= config.TWITCH_AUTO_SCAN_START && now <= config.TWITCH_AUTO_SCAN_END;
    }

    async function handleLiveEndAuto() {
        const liveState = twitchService.getLiveState();
        const participants = Object.keys(liveState.currentLive.users || {}).length;
        const summary = twitchService.generateLiveStatsSummary(participants);

        twitchService.stopCurrentLive();

        await sendContestLog(
            `⚫ **Live terminé automatiquement**\n\n` +
            summary
        ).catch(() => null);

        console.log('⚫ Fin de live détectée automatiquement');
    }

    setInterval(() => {
        if (!config.TWITCH_AUTO_SCAN_ENABLED) return;
        if (!isInAutoScanWindow()) return;

        const liveState = twitchService.getLiveState();
        if (liveState.liveContestActive) return;

        twitchService.checkTwitchLive(client, async () => {
            await processLivePhrases(client).catch(console.error);
        }).catch(console.error);
    }, config.TWITCH_AUTO_SCAN_INTERVAL_MS);

    setInterval(() => {
        const liveState = twitchService.getLiveState();
        if (!liveState.liveContestActive) return;

        twitchService.checkTwitchLive(
            client,
            async () => {
                await processLivePhrases(client).catch(console.error);
            },
            handleLiveEndAuto
        ).catch(console.error);
    }, config.TWITCH_LIVE_END_SCAN_INTERVAL_MS);

    setInterval(cleanExpiredRoles, 10 * 60 * 1000);
    cleanExpiredRoles();

    setInterval(() => {
        handleMonthlyBonus().catch(console.error);
    }, 60 * 60 * 1000);

    handleMonthlyBonus().catch(console.error);
});

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            return handleCommand(interaction, {
                discordClient: client,
                twitchService,
                setupShop,
                sendLog,
                sendContestLog,
                processLivePhrases,
            });
        }

        if (interaction.isButton()) {
            return handleButton(interaction, client, sendLog);
        }

        if (interaction.isModalSubmit()) {
            return handleModal(interaction, client, sendLog);
        }

        if (interaction.isStringSelectMenu()) {
            return handleSelectMenu(interaction);
        }
    } catch (error) {
        console.error('❌ Erreur interaction:', error);

        const reply = {
            content: '❌ Une erreur est survenue, réessaie.',
            flags: 64,
        };

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(reply);
            } else {
                await interaction.reply(reply);
            }
        } catch (_) {}
    }
});

client.on('messageCreate', (message) => {
    handleMessage(message, client, sendLog, pendingEmojiRequests).catch(console.error);
});

const app = express();
const setupDashboard = require('./src/dashboard/dashboard');

setupDashboard(app, client);

const PORT = process.env.PORT || 3000;

app.get('/overlay-view', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

app.get('/overlay/latest', async (req, res) => {
    try {
        const events = await db.getLatestOverlayEvents(20);

        if (!events || events.length === 0) {
            return res.json({ active: false, items: [] });
        }

        return res.json({
            active: true,
            items: events.map(event => ({
                id: event.id,
                source: event.source,
                rewardName: event.title,
                userInput: event.text || '',
                author: event.author || '',
                createdAt: event.created_at,
            })),
        });
    } catch (error) {
        console.error('❌ Erreur route /overlay/latest:', error);
        return res.status(500).json({ active: false, items: [] });
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Overlay Web démarré sur le port ${PORT}`);
});
async function triggerRaidAlert(members) {
    if (security.isRaidMode()) return;

    security.enableRaidMode();

    const channel = await client.channels
        .fetch(config.SECURITY_LOG_CHANNEL_ID)
        .catch(() => null);

    if (!channel) return;

    await channel.send(
        `🚨 **RAID POTENTIEL DÉTECTÉ**\n\n` +
        `👥 Arrivées : **${members.length} membres**\n` +
        `⏱️ Fenêtre : **2 minutes**\n\n` +
        `🛡️ Mode Raid activé automatiquement.\n\n` +
        members.map(m => `• ${m.user.tag}`).join('\n')
    ).catch(() => null);

    console.log('🚨 MODE RAID ACTIVÉ');
}

client.on('guildMemberAdd', async (member) => {
    try {
        await member.roles.add(config.ROLE_ETAPE_1_ID);

        const now = Date.now();

        recentJoins.push({
            member,
            timestamp: now,
        });

        while (
            recentJoins.length &&
            now - recentJoins[0].timestamp > config.ANTI_RAID_WINDOW_MS
        ) {
            recentJoins.shift();
        }

        if (recentJoins.length >= config.ANTI_RAID_THRESHOLD) {
            await triggerRaidAlert(
                recentJoins.map(entry => entry.member)
            );
        }

        await sendOnboardingLog(
            `👋 **Nouveau membre arrivé**\n\n` +
            `👤 Membre : ${member}\n` +
            `🧩 Rôle ajouté : <@&${config.ROLE_ETAPE_1_ID}>`
        ).catch(() => null);

        console.log(`👋 Nouveau membre : ${member.user.tag} → Étape 1`);
    } catch (error) {
        console.error('❌ Erreur guildMemberAdd onboarding:', error.message);
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (user.bot) return;

        if (security.isRaidMode()) {
            return;
        }

        if (reaction.partial) {
            await reaction.fetch().catch(() => null);
        }

        if (!reaction.message || reaction.message.id !== config.REGLEMENT_MESSAGE_ID) return;

        const emojiName = reaction.emoji.name;
        if (emojiName !== config.REGLEMENT_EMOJI_NAME) return;

        const guild = reaction.message.guild;
        if (!guild) return;

        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        if (!member.roles.cache.has(config.ROLE_ETAPE_1_ID)) return;

        await member.roles.remove(config.ROLE_ETAPE_1_ID).catch(() => null);
        await member.roles.add(config.ROLE_ETAPE_2_ID);

        const rolesChannel = await client.channels.fetch(config.SALON_ROLES_ID).catch(() => null);

        if (rolesChannel) {
            const {
                ActionRowBuilder,
                ButtonBuilder,
                ButtonStyle,
            } = require('discord.js');

            const ageButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('onboarding_age_minor')
                    .setLabel('Mineur')
                    .setEmoji('🔞')
                    .setStyle(ButtonStyle.Secondary),

                new ButtonBuilder()
                    .setCustomId('onboarding_age_adult')
                    .setLabel('Majeur')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success)
            );

            await rolesChannel.send({
                content:
                    `🦌 Bienvenue ${member} !\n\n` +
                    `Pour continuer, choisis ton statut :\n\n` +
                    `🔞 **Mineur**\n` +
                    `✅ **Majeur**\n\n` +
                    `Cette étape est obligatoire pour débloquer le serveur.`,
                components: [ageButtons],
            }).catch(() => null);
        }

        await sendOnboardingLog(
            `✅ **Règlement accepté**\n\n` +
            `👤 Membre : ${member}\n` +
            `➖ Retiré : <@&${config.ROLE_ETAPE_1_ID}>\n` +
            `➕ Ajouté : <@&${config.ROLE_ETAPE_2_ID}>`
        ).catch(() => null);

        console.log(`✅ ${member.user.tag} a accepté le règlement → Étape 2`);
    } catch (error) {
        console.error('❌ Erreur messageReactionAdd onboarding:', error.message);
    }
});

client.on('guildMemberRemove', async (member) => {
    try {
        const goodbyeChannel = await client.channels
            .fetch(config.GOODBYE_CHANNEL_ID)
            .catch(() => null);

        if (!goodbyeChannel) return;

        await goodbyeChannel.send(
            `👋 ${member.user.tag} a quitté Black&Co'`
        ).catch(() => null);

    } catch (error) {
        console.error('❌ Erreur départ membre:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);