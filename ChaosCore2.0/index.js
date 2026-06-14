require('dotenv').config();
const { fetchConfiguredChannel } = require('./src/utils/serverSettings');

const path = require('path');
const express = require('express');

const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const security = require('./src/services/security');
const config = require('./src/config');
const db = require('./src/db/queries');
const twitchService = require('./src/services/twitch');

const { setupShop, processLivePhrases } = require('./src/services/shop');
const { handleCommand, commandDefinitions } = require('./src/handlers/commands');
const { handleButton, handleModal, handleSelectMenu, pendingEmojiRequests } = require('./src/handlers/buttons');
const { handleMessage, restoreDisboardReminder } = require('./src/handlers/messages');
const { startBirthdayJob } = require('./src/services/birthdayService');

// ============================================================
// CLIENT DISCORD
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const recentJoinsByGuild = new Map();
function getRecentJoins(guildId) {
    if (!recentJoinsByGuild.has(guildId)) recentJoinsByGuild.set(guildId, []);
    return recentJoinsByGuild.get(guildId);
}

const activeTwitchChats = new Map();

// ============================================================
// LOGS
// ============================================================

async function sendOnboardingLog(message) {
    const channel = await client.channels.fetch(config.ONBOARDING_LOG_CHANNEL_ID).catch(() => null);
    if (channel) await channel.send(message).catch(console.error);
}

async function sendModLog(message) {
    const channel = await client.channels.fetch(config.MOD_LOG_CHANNEL_ID).catch(() => null);
    if (channel) await channel.send(message).catch(console.error);
}

async function sendLog(message, guildId) {
    const channel = await fetchConfiguredChannel(client, guildId || process.env.GUILD_ID, 'log_channel_id', config.LOG_CHANNEL_ID);
    if (channel) await channel.send(message).catch(console.error);
}

async function sendContestLog(message, guildId) {
    const channel = await fetchConfiguredChannel(client, guildId || process.env.GUILD_ID, 'contest_log_channel_id', config.CONTEST_LOG_CHANNEL_ID);
    if (channel) await channel.send(message).catch(console.error);
}

// ============================================================
// MAINTENANCE — RÔLES TEMPORAIRES
// ============================================================

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

// ============================================================
// MAINTENANCE — BONUS MENSUEL
// ============================================================

async function handleMonthlyBonus() {
    const now = new Date();
    if (now.getDate() !== 1) return;

    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    for (const [guildId] of client.guilds.cache) {
        try {
            const alreadyGiven = await db.hasMonthlyBonusBeenGiven(guildId, monthKey);
            if (alreadyGiven) continue;

            const usersCount = await db.giveMonthlyBonus(guildId, config.MONTHLY_BONUS);
            await db.markMonthlyBonusGiven(guildId, monthKey, usersCount);

            await sendLog(
                `🎁 **Bonus mensuel distribué**\n\n` +
                `💰 Montant : **${config.MONTHLY_BONUS} ${config.MONEY_NAME}s**\n` +
                `👥 Membres crédités : **${usersCount}**\n` +
                `📅 Mois : **${monthKey}**`,
                guildId
            ).catch(() => null);

            console.log(`🎁 [${guildId}] Bonus mensuel ${monthKey} → ${usersCount} membres`);
        } catch (err) {
            console.error(`❌ handleMonthlyBonus [${guildId}]:`, err.message);
        }
    }
}

// ============================================================
// COMMANDES SLASH
// ============================================================

async function registerCommands() {
    console.log('📋 Commandes à enregistrer :', commandDefinitions.map(c => c.name));
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandDefinitions });
    console.log('✅ Commandes slash enregistrées');
}

// ============================================================
// TWITCH — SCAN AUTO
// ============================================================

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

async function handleLiveEndAuto(guildId) {
    const liveState = twitchService.getLiveState(guildId);
    const participants = Object.keys(liveState.currentLive.users || {}).length;
    const summary = twitchService.generateLiveStatsSummary(guildId, participants);
    twitchService.stopCurrentLive(guildId);
    await sendContestLog(`⚫ **Live terminé automatiquement**\n\n` + summary, guildId).catch(() => null);
    console.log(`⚫ [${guildId}] Fin de live détectée automatiquement`);
}

function startTwitchAutoScan(guildId, twitchUsername) {
    setInterval(async () => {
        if (!config.TWITCH_AUTO_SCAN_ENABLED) return;
        if (!isInAutoScanWindow()) return;
        const liveState = twitchService.getLiveState(guildId);
        if (liveState.liveContestActive) return;
        await twitchService.checkTwitchLive(
            client, guildId, twitchUsername,
            async () => { await processLivePhrases(client, guildId).catch(console.error); }
        ).catch(console.error);
    }, config.TWITCH_AUTO_SCAN_INTERVAL_MS);
}

function startTwitchLiveEndScan(guildId, twitchUsername) {
    setInterval(async () => {
        const liveState = twitchService.getLiveState(guildId);
        if (!liveState.liveContestActive) return;
        await twitchService.checkTwitchLive(
            client, guildId, twitchUsername,
            async () => { await processLivePhrases(client, guildId).catch(console.error); },
            async () => { await handleLiveEndAuto(guildId); }
        ).catch(console.error);
    }, config.TWITCH_LIVE_END_SCAN_INTERVAL_MS);
}

async function startTwitchForGuild(guildId) {
    const settings = await db.getServerSettings(guildId).catch(() => null);
    const twitchUsername = settings?.twitch_username;

    // Ne démarre Twitch que si le serveur a son propre username OU si c'est le guild principal
    if (!twitchUsername && guildId !== process.env.GUILD_ID) return;

    const usernameToUse = twitchUsername || config.TWITCH_USERNAME;
    if (!usernameToUse) return;

    // Déconnecter l'ancien chat si existant
    const existing = activeTwitchChats.get(guildId);
    if (existing) existing.disconnect().catch(() => null);

    const twitchChat = twitchService.createTwitchChat(client, guildId, usernameToUse, sendContestLog);
    twitchChat.connect().catch(error => {
        console.error(`❌ [${guildId}] Erreur connexion Twitch chat:`, error.message);
    });

    activeTwitchChats.set(guildId, twitchChat);
    startTwitchAutoScan(guildId, usernameToUse);
    startTwitchLiveEndScan(guildId, usernameToUse);
}

// ============================================================
// CLIENT READY
// ============================================================

client.once('clientReady', async () => {
    console.log(`✅ ChaosCore connecté en tant que ${client.user.tag}`);

    await db.initDatabase();
    await registerCommands();
    await restoreDisboardReminder(client);

    for (const [guildId] of client.guilds.cache) {
        await startTwitchForGuild(guildId);
    }

    setInterval(cleanExpiredRoles, 10 * 60 * 1000);
    cleanExpiredRoles();

    setInterval(() => { handleMonthlyBonus().catch(console.error); }, 60 * 60 * 1000);
    handleMonthlyBonus().catch(console.error);
});

// ============================================================
// INTERACTIONS
// ============================================================

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
        if (interaction.isButton()) return handleButton(interaction, client, sendLog);
        if (interaction.isModalSubmit()) return handleModal(interaction, client, sendLog);
        if (interaction.isStringSelectMenu()) return handleSelectMenu(interaction);
    } catch (error) {
        console.error('❌ Erreur interaction:', error);
        const reply = { content: '❌ Une erreur est survenue, réessaie.', flags: 64 };
        try {
            if (interaction.deferred || interaction.replied) await interaction.editReply(reply);
            else await interaction.reply(reply);
        } catch (_) {}
    }
});

// ============================================================
// MESSAGES
// ============================================================

client.on('messageCreate', (message) => {
    handleMessage(message, client, sendLog, pendingEmojiRequests).catch(console.error);
});

client.on('messageDelete', async (message) => {
    try {
        if (!message.guild || message.author?.bot) return;
        await sendModLog(
            `🗑️ **Message supprimé**\n\n` +
            `👤 Auteur : ${message.author || 'Inconnu'}\n` +
            `📍 Salon : ${message.channel}\n` +
            `📝 Contenu :\n${message.content || '*Contenu indisponible*'}`
        );
    } catch (error) { console.error('❌ Erreur log messageDelete:', error); }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    try {
        if (!oldMessage.guild || oldMessage.author?.bot) return;
        if (oldMessage.content === newMessage.content) return;
        await sendModLog(
            `✏️ **Message modifié**\n\n` +
            `👤 Auteur : ${oldMessage.author}\n` +
            `📍 Salon : ${oldMessage.channel}\n\n` +
            `**Avant :**\n${oldMessage.content || '*Indisponible*'}\n\n` +
            `**Après :**\n${newMessage.content || '*Indisponible*'}`
        );
    } catch (error) { console.error('❌ Erreur log messageUpdate:', error); }
});

// ============================================================
// ANTI-RAID
// ============================================================

async function triggerRaidAlert(guildId, members) {
    if (security.isRaidMode(guildId)) return;
    security.enableRaidMode(guildId);
    const channel = await fetchConfiguredChannel(client, guildId, 'security_log_channel_id', config.SECURITY_LOG_CHANNEL_ID).catch(() => null);
    if (!channel) return;
    await channel.send(
        `🚨 **RAID POTENTIEL DÉTECTÉ**\n\n` +
        `👥 Arrivées : **${members.length} membres**\n` +
        `⏱️ Fenêtre : **2 minutes**\n\n` +
        `🛡️ Mode Raid activé automatiquement.\n\n` +
        members.map(member => `• ${member.user.tag}`).join('\n')
    ).catch(() => null);
    console.log(`🚨 [${guildId}] MODE RAID ACTIVÉ`);
}

// ============================================================
// ONBOARDING
// ============================================================

client.on('guildMemberAdd', async (member) => {
    try {
        await member.roles.add(config.ROLE_ETAPE_1_ID);
        const guildId = member.guild.id;
        const recentJoins = getRecentJoins(guildId);
        const now = Date.now();
        recentJoins.push({ member, timestamp: now });
        while (recentJoins.length && now - recentJoins[0].timestamp > config.ANTI_RAID_WINDOW_MS) {
            recentJoins.shift();
        }
        if (recentJoins.length >= config.ANTI_RAID_THRESHOLD) {
            await triggerRaidAlert(guildId, recentJoins.map(entry => entry.member));
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
        if (security.isRaidMode(reaction.message?.guild?.id)) return;
        if (reaction.partial) await reaction.fetch().catch(() => null);
        if (!reaction.message || reaction.message.id !== config.REGLEMENT_MESSAGE_ID) return;
        if (reaction.emoji.name !== config.REGLEMENT_EMOJI_NAME) return;
        const guild = reaction.message.guild;
        if (!guild) return;
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;
        if (!member.roles.cache.has(config.ROLE_ETAPE_1_ID)) return;
        await member.roles.remove(config.ROLE_ETAPE_1_ID).catch(() => null);
        await member.roles.add(config.ROLE_ETAPE_2_ID);
        await sendAgeChoiceMessage(member);
        await sendOnboardingLog(
            `✅ **Règlement accepté**\n\n` +
            `👤 Membre : ${member}\n` +
            `➖ Retiré : <@&${config.ROLE_ETAPE_1_ID}>\n` +
            `➕ Ajouté : <@&${config.ROLE_ETAPE_2_ID}>`
        ).catch(() => null);
    } catch (error) {
        console.error('❌ Erreur messageReactionAdd onboarding:', error.message);
    }
});

async function sendAgeChoiceMessage(member) {
    const rolesChannel = await client.channels.fetch(config.SALON_ROLES_ID).catch(() => null);
    if (!rolesChannel) return;
    const ageButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('onboarding_age_minor').setLabel('Mineur').setEmoji('🔞').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('onboarding_age_adult').setLabel('Majeur').setEmoji('✅').setStyle(ButtonStyle.Success)
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

client.on('guildMemberRemove', async (member) => {
    try {
        console.log(`👋 Départ détecté : ${member.user.tag}`);
        const goodbyeChannel = await client.channels.fetch(config.GOODBYE_CHANNEL_ID).catch(() => null);
        if (!goodbyeChannel) return;
        await goodbyeChannel.send(`👋 ${member.user.tag} a quitté Black&Co'`).catch(() => null);
    } catch (error) {
        console.error('❌ Erreur départ membre:', error);
    }
});

// ============================================================
// SERVEUR WEB — OVERLAY + API INTERNE
// ============================================================

const app = express();
app.use(express.json());

function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) {
        return res.status(401).json({ error: 'Non autorisé' });
    }
    next();
}

app.get('/overlay-view', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

app.get('/overlay', (req, res) => res.redirect('/overlay-view'));

app.get('/overlay/latest', async (req, res) => {
    try {
        const events = await db.getLatestOverlayEvents(20);
        if (!events || events.length === 0) return res.json({ active: false, items: [] });
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

app.get('/test', (req, res) => res.send('TEST OK ✅'));

app.post('/api/settings/reload/:guildId', requireApiKey, async (req, res) => {
    const { guildId } = req.params;
    console.log(`🔄 [${guildId}] Rechargement des settings depuis le dashboard`);
    res.json({ ok: true, message: 'Settings rechargés' });
});

app.post('/api/twitch/restart/:guildId', requireApiKey, async (req, res) => {
    const { guildId } = req.params;
    console.log(`🔄 [${guildId}] Redémarrage Twitch depuis le dashboard`);
    try {
        await startTwitchForGuild(guildId);
        res.json({ ok: true, message: 'Twitch redémarré' });
    } catch (err) {
        console.error(`❌ Erreur restart Twitch [${guildId}]:`, err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/message/:guildId', requireApiKey, async (req, res) => {
    const { guildId } = req.params;
    const { channelId, content } = req.body;
    if (!channelId || !content) return res.status(400).json({ error: 'channelId et content requis' });
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return res.status(404).json({ error: 'Salon introuvable' });
        await channel.send(content);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Overlay Web démarré sur le port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);