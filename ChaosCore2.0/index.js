require('dotenv').config();
const { fetchConfiguredChannel } = require('./src/utils/serverSettings');

const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');

const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} = require('discord.js');

const security = require('./src/services/security');
const config = require('./src/config');
const db = require('./src/db/queries');
const twitchService = require('./src/services/twitch');
const youtubeService = require('./src/services/youtube');

const { setupShop, processLivePhrases } = require('./src/services/shop');
const { handleCommand, commandDefinitions } = require('./src/handlers/commands');
const { handleButton, handleModal, handleSelectMenu, pendingEmojiRequests } = require('./src/handlers/buttons');
const { handleMessage, restoreDisboardReminder } = require('./src/handlers/messages');
const { startBirthdayJob } = require('./src/services/birthdayService');

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

async function sendOnboardingLog(guildId, message) {
    const channel = await fetchConfiguredChannel(client, guildId, 'onboarding_log_channel_id', config.ONBOARDING_LOG_CHANNEL_ID);
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
// WELCOME / GOODBYE
// ============================================================

async function sendWelcomeMessage(member) {
    const guildId = member.guild.id;
    const welcomeSettings = await db.getModuleSettings(guildId, 'welcome').catch(() => null);
    const moduleEnabled = welcomeSettings?.module_enabled !== false;
    const welcomeEnabled = welcomeSettings?.welcome_enabled !== false;
    if (!moduleEnabled || !welcomeEnabled) return;
    const channelId = welcomeSettings?.welcome_channel_id || (await db.getServerSettings(guildId))?.welcome_channel_id || config.WELCOME_CHANNEL_ID;
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;
    const title = (welcomeSettings?.welcome_title || 'Bienvenue {username} !').replace('{username}', member.user.username).replace('{mention}', `${member}`).replace('{server}', member.guild.name).replace('{membercount}', member.guild.memberCount);
    const msg = (welcomeSettings?.welcome_message || 'Bienvenue {mention} sur {server} !').replace('{username}', member.user.username).replace('{mention}', `${member}`).replace('{server}', member.guild.name).replace('{membercount}', member.guild.memberCount);
    await channel.send(`**${title}**\n\n${msg}`).catch(() => null);
}

async function sendGoodbyeMessage(member) {
    const guildId = member.guild.id;
    const welcomeSettings = await db.getModuleSettings(guildId, 'welcome').catch(() => null);
    const moduleEnabled = welcomeSettings?.module_enabled !== false;
    const goodbyeEnabled = welcomeSettings?.goodbye_enabled !== false;
    if (!moduleEnabled || !goodbyeEnabled) return;
    const channelId = welcomeSettings?.goodbye_channel_id || (await db.getServerSettings(guildId))?.goodbye_channel_id || config.GOODBYE_CHANNEL_ID;
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;
    const msg = (welcomeSettings?.goodbye_message || '{username} a quitté {server}.').replace('{username}', member.user.username).replace('{server}', member.guild.name);
    await channel.send(msg).catch(() => null);
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
        } catch (error) { console.error(`❌ Erreur suppression rôle temporaire #${row.id}:`, error); }
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
            const economySettings = await db.getModuleSettings(guildId, 'economy').catch(() => null);
            const bonusAmount = economySettings?.monthly_bonus_amount || config.MONTHLY_BONUS;
            const bonusEnabled = economySettings?.monthly_bonus_enabled !== false;
            if (!bonusEnabled) continue;
            const usersCount = await db.giveMonthlyBonus(guildId, bonusAmount);
            await db.markMonthlyBonusGiven(guildId, monthKey, usersCount);
            await sendLog(`🎁 **Bonus mensuel distribué**\n\n💰 Montant : **${bonusAmount} ${config.MONEY_NAME}s**\n👥 Membres crédités : **${usersCount}**\n📅 Mois : **${monthKey}**`, guildId).catch(() => null);
            console.log(`🎁 [${guildId}] Bonus mensuel ${monthKey} → ${usersCount} membres`);
        } catch (err) { console.error(`❌ handleMonthlyBonus [${guildId}]:`, err.message); }
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
// TWITCH
// ============================================================

function isInAutoScanWindow() {
    const formatter = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
    const now = formatter.format(new Date());
    return now >= config.TWITCH_AUTO_SCAN_START && now <= config.TWITCH_AUTO_SCAN_END;
}

async function handleLiveEndAuto(guildId) {
    const liveState = twitchService.getLiveState(guildId);
    const participants = Object.keys(liveState.currentLive.users || {}).length;
    const { summary, recapEnabled, liveChannelId } = await twitchService.generateLiveStatsSummary(guildId, participants);
    twitchService.stopCurrentLive(guildId);
    await sendContestLog(`⚫ **Live terminé automatiquement**\n\n` + summary, guildId).catch(() => null);
    if (recapEnabled && liveChannelId) {
        const channel = await client.channels.fetch(liveChannelId).catch(() => null);
        if (channel) await channel.send(summary).catch(() => null);
    }
    console.log(`⚫ [${guildId}] Fin de live détectée automatiquement`);
}

function startTwitchAutoScan(guildId, twitchUsername) {
    setInterval(async () => {
        if (!config.TWITCH_AUTO_SCAN_ENABLED) return;
        if (!isInAutoScanWindow()) return;
        const liveState = twitchService.getLiveState(guildId);
        if (liveState.liveContestActive) return;
        await twitchService.checkTwitchLive(client, guildId, twitchUsername, async () => { await processLivePhrases(client, guildId).catch(console.error); }).catch(console.error);
    }, config.TWITCH_AUTO_SCAN_INTERVAL_MS);
}

function startTwitchLiveEndScan(guildId, twitchUsername) {
    setInterval(async () => {
        const liveState = twitchService.getLiveState(guildId);
        if (!liveState.liveContestActive) return;
        await twitchService.checkTwitchLive(client, guildId, twitchUsername, async () => { await processLivePhrases(client, guildId).catch(console.error); }, async () => { await handleLiveEndAuto(guildId); }).catch(console.error);
    }, config.TWITCH_LIVE_END_SCAN_INTERVAL_MS);
}

async function startTwitchForGuild(guildId) {
    const settings = await db.getServerSettings(guildId).catch(() => null);
    const twitchUsername = settings?.twitch_username;
    if (!twitchUsername && guildId !== process.env.GUILD_ID) return;
    const usernameToUse = twitchUsername || config.TWITCH_USERNAME;
    if (!usernameToUse) return;
    const existing = activeTwitchChats.get(guildId);
    if (existing) existing.disconnect().catch(() => null);
    const twitchChat = twitchService.createTwitchChat(client, guildId, usernameToUse, sendContestLog);
    twitchChat.connect().catch(error => { console.error(`❌ [${guildId}] Erreur connexion Twitch chat:`, error.message); });
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
    for (const [guildId] of client.guilds.cache) { await startTwitchForGuild(guildId); }
    for (const [guildId] of client.guilds.cache) { youtubeService.startYoutubeForGuild(client, guildId); }
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
            return handleCommand(interaction, { discordClient: client, twitchService, setupShop, sendLog, sendContestLog, processLivePhrases });
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

client.on('messageCreate', (message) => { handleMessage(message, client, sendLog, pendingEmojiRequests).catch(console.error); });

client.on('messageDelete', async (message) => {
    try {
        if (!message.guild || message.author?.bot) return;
        await sendModLog(`🗑️ **Message supprimé**\n\n👤 Auteur : ${message.author || 'Inconnu'}\n📍 Salon : ${message.channel}\n📝 Contenu :\n${message.content || '*Contenu indisponible*'}`);
    } catch (error) { console.error('❌ Erreur log messageDelete:', error); }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    try {
        if (!oldMessage.guild || oldMessage.author?.bot) return;
        if (oldMessage.content === newMessage.content) return;
        await sendModLog(`✏️ **Message modifié**\n\n👤 Auteur : ${oldMessage.author}\n📍 Salon : ${oldMessage.channel}\n\n**Avant :**\n${oldMessage.content || '*Indisponible*'}\n\n**Après :**\n${newMessage.content || '*Indisponible*'}`);
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
    await channel.send(`🚨 **RAID POTENTIEL DÉTECTÉ**\n\n👥 Arrivées : **${members.length} membres**\n⏱️ Fenêtre : **2 minutes**\n\n🛡️ Mode Raid activé automatiquement.\n\n${members.map(m => `• ${m.user.tag}`).join('\n')}`).catch(() => null);
    console.log(`🚨 [${guildId}] MODE RAID ACTIVÉ`);
}

// ============================================================
// ONBOARDING + WELCOME
// ============================================================

client.on('guildMemberAdd', async (member) => {
    try {
        await member.roles.add(config.ROLE_ETAPE_1_ID);
        const guildId = member.guild.id;
        const recentJoins = getRecentJoins(guildId);
        const now = Date.now();
        recentJoins.push({ member, timestamp: now });
        while (recentJoins.length && now - recentJoins[0].timestamp > config.ANTI_RAID_WINDOW_MS) recentJoins.shift();
        if (recentJoins.length >= config.ANTI_RAID_THRESHOLD) await triggerRaidAlert(guildId, recentJoins.map(entry => entry.member));
        await sendWelcomeMessage(member);
        await sendOnboardingLog(guildId, `👋 **Nouveau membre arrivé**\n\n👤 Membre : ${member}\n🧩 Rôle ajouté : <@&${config.ROLE_ETAPE_1_ID}>`).catch(() => null);
        console.log(`👋 Nouveau membre : ${member.user.tag} → Étape 1`);
    } catch (error) { console.error('❌ Erreur guildMemberAdd onboarding:', error.message); }
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
        await sendOnboardingLog(member.guild.id, `✅ **Règlement accepté**\n\n👤 Membre : ${member}\n➖ Retiré : <@&${config.ROLE_ETAPE_1_ID}>\n➕ Ajouté : <@&${config.ROLE_ETAPE_2_ID}>`).catch(() => null);
    } catch (error) { console.error('❌ Erreur messageReactionAdd onboarding:', error.message); }
});

async function sendAgeChoiceMessage(member) {
    const rolesChannel = await client.channels.fetch(config.SALON_ROLES_ID).catch(() => null);
    if (!rolesChannel) return;
    await rolesChannel.send({
        content: `🦌 Bienvenue ${member} !\n\nPour continuer, choisis ton statut :\n\n🔞 **Mineur**\n✅ **Majeur**\n\nCette étape est obligatoire pour débloquer le serveur.`,
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('onboarding_age_minor').setLabel('Mineur').setEmoji('🔞').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('onboarding_age_adult').setLabel('Majeur').setEmoji('✅').setStyle(ButtonStyle.Success)
        )],
    }).catch(() => null);
}

client.on('guildMemberRemove', async (member) => {
    try {
        console.log(`👋 Départ détecté : ${member.user.tag}`);
        await sendGoodbyeMessage(member);
    } catch (error) { console.error('❌ Erreur départ membre:', error); }
});

// ============================================================
// SERVEUR WEB — OVERLAY + API INTERNE
// ============================================================

const app = express();
app.use(express.json());

// CORS — accepte uniquement les requetes du dashboard
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://chaoscore-dashboard-production.up.railway.app';
app.use('/api/', (req, res, next) => {
    const origin = req.headers.origin || req.headers.referer || '';
    if (origin && !origin.startsWith(DASHBOARD_URL) && !origin.startsWith('http://localhost')) {
        console.warn(`⚠️ Requete API origine suspecte: ${origin} sur ${req.path}`);
        return res.status(403).json({ error: 'Origine non autorisee' });
    }
    next();
});

// Log de chaque appel API
app.use('/api/', (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.ip;
    console.log(`📡 API ${req.method} ${req.path} depuis ${ip}`);
    next();
});

// Validation guildId — doit etre une chaine numerique
function validateGuildId(req, res, next) {
    const { guildId } = req.params;
    if (guildId && !/^\d{17,20}$/.test(guildId)) {
        console.warn(`⚠️ guildId invalide recu: ${guildId}`);
        return res.status(400).json({ error: 'guildId invalide' });
    }
    next();
}

function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!key || key !== process.env.INTERNAL_API_KEY) return res.status(401).json({ error: 'Non autorisé' });
    next();
}

// Rate limiter — max 30 requetes par minute par IP sur les routes API
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.warn(`⚠️ Rate limit atteint : ${req.ip} sur ${req.path}`);
        res.status(429).json({ error: "Trop de requetes, ralentis." });
    }
});
app.use("/api/", apiLimiter);

// Verifie que le bot est bien dans le guild demande
async function requireInGuild(req, res, next) {
    const guildId = req.params.guildId;
    if (!guildId) return res.status(400).json({ error: "guildId manquant" });
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
        console.warn(`⚠️ Tentative API sur guild inconnu : ${guildId} depuis ${req.ip}`);
        return res.status(403).json({ error: "Guild inconnu ou bot absent" });
    }
    req.guild = guild;
    next();
}

app.get('/overlay-view', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'overlay.html')); });
app.get('/overlay', (req, res) => res.redirect('/overlay-view'));

app.get('/overlay/latest', async (req, res) => {
    try {
        const guildId = req.query.guild || process.env.GUILD_ID;
        const twitchSettings = await db.getModuleSettings(guildId, 'twitch').catch(() => null);
        const showChannelPoints = twitchSettings?.overlay_show_channelpoints !== false;
        const showShop          = twitchSettings?.overlay_show_shop          !== false;
        const shopGage          = twitchSettings?.overlay_shop_gage          !== false;
        const shopPhrase        = twitchSettings?.overlay_shop_phrase        !== false;
        const shopRole          = twitchSettings?.overlay_shop_role          || false;
        const events = await db.getLatestOverlayEvents(20);
        if (!events || events.length === 0) return res.json({ active: false, items: [], settings: getOverlaySettings(twitchSettings) });
        const filtered = events.filter(event => {
            if (event.source === 'twitch') return showChannelPoints;
            if (event.source === 'gage')   return showShop && shopGage;
            if (event.source === 'phrase') return showShop && shopPhrase;
            if (event.source === 'role')   return showShop && shopRole;
            return showShop;
        });
        if (filtered.length === 0) return res.json({ active: false, items: [], settings: getOverlaySettings(twitchSettings) });
        return res.json({
            active: true,
            settings: getOverlaySettings(twitchSettings),
            items: filtered.map(event => ({
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

function getOverlaySettings(twitchSettings) {
    return {
        border_color:  twitchSettings?.overlay_border_color || '#9b5cff',
        font_size:     twitchSettings?.overlay_font_size     || 24,
        scroll_speed:  twitchSettings?.overlay_scroll_speed  || 35,
    };
}

app.get('/test', (req, res) => res.send('TEST OK ✅'));

app.post('/api/settings/reload/:guildId', requireApiKey, validateGuildId, requireInGuild, async (req, res) => {
    const { guildId } = req.params;
    console.log(`🔄 [${guildId}] Rechargement des settings depuis le dashboard`);
    res.json({ ok: true, message: 'Settings rechargés' });
});

app.post('/api/twitch/restart/:guildId', requireApiKey, validateGuildId, requireInGuild, async (req, res) => {
    const { guildId } = req.params;
    try {
        await startTwitchForGuild(guildId);
        res.json({ ok: true, message: 'Twitch redémarré' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/message/:guildId', requireApiKey, validateGuildId, requireInGuild, async (req, res) => {
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

app.post('/api/support/panel/:guildId', requireApiKey, validateGuildId, requireInGuild, async (req, res) => {
    const { guildId } = req.params;
    try {
        const supportSettings = await db.getModuleSettings(guildId, 'support').catch(() => null);
        const serverSettings = await db.getServerSettings(guildId).catch(() => null);
        const panelChannelId = supportSettings?.panel_channel_id || serverSettings?.support_ticket_panel_channel_id || config.SUPPORT_TICKET_PANEL_CHANNEL_ID;
        if (!panelChannelId) return res.status(400).json({ ok: false, error: 'Salon panneau non configuré' });
        const channel = await client.channels.fetch(panelChannelId).catch(() => null);
        if (!channel) return res.status(404).json({ ok: false, error: 'Salon introuvable' });
        const embed = new EmbedBuilder()
            .setColor(supportSettings?.panel_color || '#7c3aed')
            .setTitle(supportSettings?.panel_title || '🎫 Besoin d\'aide ?')
            .setDescription(supportSettings?.panel_description || 'Clique sur le bouton ci-dessous pour ouvrir un ticket privé.')
            .setFooter({ text: 'ChaosCore • Support' });
        await channel.send({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('support_ticket_open').setLabel(supportSettings?.panel_button_label || 'Ouvrir un ticket').setEmoji(supportSettings?.panel_button_emoji || '🎫').setStyle(ButtonStyle.Primary)
            )],
        });
        if (supportSettings) {
            await db.pool.query(`INSERT INTO guild_module_settings (guild_id, module_name, settings, updated_at) VALUES ($1, 'support', $2, NOW()) ON CONFLICT (guild_id, module_name) DO UPDATE SET settings = $2, updated_at = NOW()`, [guildId, { ...supportSettings, panel_refresh_requested: false }]).catch(() => null);
        }
        console.log(`🎫 [${guildId}] Panneau support publié`);
        res.json({ ok: true, message: 'Panneau publié' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/shop/setup/:guildId', requireApiKey, validateGuildId, requireInGuild, async (req, res) => {
    const { guildId } = req.params;
    try {
        const shopSettings = await db.getModuleSettings(guildId, 'shop').catch(() => null);
        const serverSettings = await db.getServerSettings(guildId).catch(() => null);
        const shopChannelId = shopSettings?.shop_channel_id || serverSettings?.shop_channel_id || config.SHOP_CHANNEL_ID;
        if (!shopChannelId) return res.status(400).json({ ok: false, error: 'Salon boutique non configuré' });
        const shopChannel = await client.channels.fetch(shopChannelId).catch(() => null);
        if (!shopChannel) return res.status(404).json({ ok: false, error: 'Salon boutique introuvable' });
        await setupShop(shopChannel, guildId);
        console.log(`🛒 [${guildId}] Boutique setup depuis le dashboard`);
        res.json({ ok: true, message: 'Boutique publiée' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/autoroles/setup/:guildId', requireApiKey, validateGuildId, requireInGuild, async (req, res) => {
    const { guildId } = req.params;
    try {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return res.status(404).json({ ok: false, error: 'Serveur introuvable' });
        const roleChannel = await client.channels.fetch(config.SALON_ROLES_ID).catch(() => null);
        if (!roleChannel) return res.status(404).json({ ok: false, error: 'Salon rôles introuvable' });
        await roleChannel.send({ embeds: [new EmbedBuilder().setColor(0x2f3136).setTitle('🔔 PINGS').setDescription('Choisis les notifications que tu souhaites recevoir.\n\n📹 Ping - Live\n🎮 Ping - Game\n📰 Ping - Programme')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('autorole_ping_live').setLabel('Ping - Live').setEmoji('📹').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('autorole_ping_game').setLabel('Ping - Game').setEmoji('🎮').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('autorole_ping_programme').setLabel('Ping - Programme').setEmoji('📰').setStyle(ButtonStyle.Secondary))] });
        await roleChannel.send({ embeds: [new EmbedBuilder().setColor(0x2f3136).setTitle('🎮 JEUX').setDescription('Choisis les catégories de jeux.\n\n1️⃣ Horreur\n2️⃣ RPG\n3️⃣ Tir\n4️⃣ Sport')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('autorole_game_horreur').setLabel('Horreur').setEmoji('1️⃣').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('autorole_game_rpg').setLabel('RPG').setEmoji('2️⃣').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('autorole_game_tir').setLabel('Tir').setEmoji('3️⃣').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('autorole_game_sport').setLabel('Sport').setEmoji('4️⃣').setStyle(ButtonStyle.Secondary))] });
        await roleChannel.send({ embeds: [new EmbedBuilder().setColor(0x2f3136).setTitle('🕹️ PLATEFORMES').setDescription('Choisis tes plateformes.\n\n🟩 Xbox\n🟦 PS5\n🟨 PC\n🟥 Switch')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('autorole_platform_xbox').setLabel('Xbox').setEmoji('🟩').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('autorole_platform_ps5').setLabel('PS5').setEmoji('🟦').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('autorole_platform_pc').setLabel('PC').setEmoji('🟨').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('autorole_platform_switch').setLabel('Switch').setEmoji('🟥').setStyle(ButtonStyle.Secondary))] });
        console.log(`🎭 [${guildId}] Autorôles setup depuis le dashboard`);
        res.json({ ok: true, message: 'Autorôles publiés' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
// Ajouter dans index.js du bot, avant le app.listen :

app.post('/api/embed/send/:guildId', requireApiKey, validateGuildId, requireInGuild, async (req, res) => {
    const { guildId } = req.params;
    const { channelId, embed } = req.body;
    if (!channelId || !embed) return res.status(400).json({ ok: false, error: 'channelId et embed requis' });
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return res.status(404).json({ ok: false, error: 'Salon introuvable' });

        const { EmbedBuilder } = require('discord.js');
        const discordEmbed = new EmbedBuilder()
            .setColor(embed.color || '#9146ff');

        if (embed.title)       discordEmbed.setTitle(embed.title);
        if (embed.description) discordEmbed.setDescription(embed.description);
        if (embed.image_url)   discordEmbed.setImage(embed.image_url);
        if (embed.author_name) discordEmbed.setAuthor({ name: embed.author_name, iconURL: embed.author_icon || undefined });
        if (embed.footer_text) discordEmbed.setFooter({ text: embed.footer_text });

        await channel.send({ embeds: [discordEmbed] });
        console.log(`📝 [${guildId}] Embed envoyé dans ${channelId}`);
        res.json({ ok: true, message: 'Embed envoyé' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
// Ajouter dans index.js du bot avant app.listen :

app.post('/api/gaming-news/send/:guildId', requireApiKey, validateGuildId, requireInGuild, async (req, res) => {
    const { guildId } = req.params;
    const { channelId, article } = req.body;
    if (!channelId || !article) return res.status(400).json({ ok: false, error: 'channelId et article requis' });
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return res.status(404).json({ ok: false, error: 'Salon introuvable' });

        const embed = new EmbedBuilder()
            .setColor('#9146ff')
            .setTitle(`${article.sourceEmoji || '📰'} ${article.title}`)
            .setURL(article.url)
            .setFooter({ text: `${article.source} • ChaosCore Actu Gaming` })
            .setTimestamp(article.published_at ? new Date(article.published_at) : new Date());

        if (article.summary) embed.setDescription(article.summary.substring(0, 400) + (article.summary.length > 400 ? '...' : ''));
        if (article.image_url) embed.setImage(article.image_url);

        await channel.send({ embeds: [embed] });
        console.log(`📰 [${guildId}] Article envoyé : ${article.title}`);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`🌐 Overlay Web démarré sur le port ${PORT}`); });

client.login(process.env.DISCORD_TOKEN);