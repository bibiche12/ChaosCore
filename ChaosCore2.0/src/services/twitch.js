// ============================================================
// IMPORTS
// ============================================================

const axios = require('axios');
const WebSocket = require('ws');
const tmi = require('tmi.js');

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const db = require('../db/queries');
const config = require('../config');
const { decrypt } = require('../utils/crypto');

// ============================================================
// ÉTAT PAR GUILD
// ============================================================

let socket = null;
let appAccessToken = null;
let appAccessTokenExpiresAt = 0;

const guildStates = new Map();

function getGuildState(guildId) {
    if (!guildStates.has(guildId)) {
        guildStates.set(guildId, {
            liveContestActive: false,
            twitchWasLive: false,
            currentLive: { startedAt: null, users: {} },
            liveStats: {},
            liveStartTime: null,
            cooldowns: new Map(),
        });
    }
    return guildStates.get(guildId);
}

function getLiveState(guildId) {
    const s = getGuildState(guildId);
    return { liveContestActive: s.liveContestActive, currentLive: s.currentLive, liveStats: s.liveStats };
}

function getLiveStats(guildId) {
    return getGuildState(guildId).liveStats;
}

function setLiveActive(guildId, value) {
    getGuildState(guildId).liveContestActive = value;
}

function resetLiveStats(guildId, commands = []) {
    const stats = {};
    for (const cmd of commands) { stats[cmd.stat_key] = 0; }
    if (commands.length === 0) {
        stats.vies = 0; stats.morts = 0; stats.fails = 0; stats.peurs = 0; stats.karma = 0;
    }
    getGuildState(guildId).liveStats = stats;
}

function resetCurrentLive(guildId) {
    const s = getGuildState(guildId);
    s.currentLive = { startedAt: new Date().toISOString(), users: {} };
    s.liveStartTime = Date.now();
    s.cooldowns.clear();
}

function stopCurrentLive(guildId) {
    getGuildState(guildId).liveContestActive = false;
}

async function generateLiveStatsSummary(guildId, participants = 0) {
    const liveStats = getGuildState(guildId).liveStats;
    const s = getGuildState(guildId);

    let duree = '';
    if (s.liveStartTime) {
        const ms = Date.now() - s.liveStartTime;
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        duree = `${h}h${String(m).padStart(2, '0')}`;
    }

    let twitchSettings = null;
    try { twitchSettings = await db.getModuleSettings(guildId, 'twitch'); } catch {}

    const commands = twitchSettings?.streamelements_commands || [];
    const recapEnabled = twitchSettings?.recap_on_live_end !== false;
    const liveChannelId = twitchSettings?.live_channel_id || '';
    const recapFooter = twitchSettings?.recap_footer || 'Merci les Bibiches 🖤';
    const includeDuration = twitchSettings?.recap_include_duration !== false;
    const includeParticipants = twitchSettings?.recap_include_participants !== false;

    let statsLines = '';
    if (commands.length > 0) {
        statsLines = commands.map(cmd => `${cmd.emoji || '📊'} ${cmd.label} : **${liveStats[cmd.stat_key] || 0}**`).join('\n');
    } else {
        statsLines =
            `❤️ Vies : **${liveStats.vies || 0}**\n` +
            `💀 Morts : **${liveStats.morts || 0}**\n` +
            `🤦 Fails : **${liveStats.fails || 0}**\n` +
            `😱 Peurs / Cris : **${liveStats.peurs || 0}**\n` +
            `👻 Karma : **${liveStats.karma || 0}**`;
    }

    const summary =
        `📊 **Résumé du live**\n\n` +
        (includeDuration && duree ? `⏱️ Durée : **${duree}**\n` : '') +
        (includeParticipants ? `👥 Participants actifs : **${participants}**\n\n` : '\n') +
        statsLines + '\n\n' + recapFooter;

    return { summary, recapEnabled, liveChannelId };
}

// ============================================================
// TOKEN APP TWITCH
// ============================================================

async function getAppAccessToken() {
    if (appAccessToken && Date.now() < appAccessTokenExpiresAt) return appAccessToken;
    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: { client_id: process.env.TWITCH_CLIENT_ID, client_secret: process.env.TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' },
    });
    appAccessToken = response.data.access_token;
    appAccessTokenExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000;
    return appAccessToken;
}

// ============================================================
// EVENTSUB — SOUSCRIPTIONS
// ============================================================

async function createSubscription(sessionId, token, broadcasterId, type, version = '1', condition = null) {
    try {
        await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
            type,
            version,
            condition: condition || { broadcaster_user_id: broadcasterId },
            transport: { method: 'websocket', session_id: sessionId },
        }, {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        console.log(`✅ EventSub souscrit : ${type}`);
    } catch (err) {
        console.warn(`⚠️ EventSub ${type} ignoré : ${err.response?.data?.message || err.message}`);
    }
}

async function createAllSubscriptions(sessionId, token, broadcasterId, twitchSettings) {
    // Channel Points — toujours activé
    await createSubscription(sessionId, token, broadcasterId, 'channel.channel_points_custom_reward_redemption.add');

    // Événements optionnels selon config dashboard
    if (twitchSettings?.eventsub_subs) {
        await createSubscription(sessionId, token, broadcasterId, 'channel.subscribe');
        await createSubscription(sessionId, token, broadcasterId, 'channel.subscription.gift');
    }
    if (twitchSettings?.eventsub_raids) {
        await createSubscription(sessionId, token, broadcasterId, 'channel.raid', '1', { to_broadcaster_user_id: broadcasterId });
    }
    if (twitchSettings?.eventsub_hype_train) {
        await createSubscription(sessionId, token, broadcasterId, 'channel.hype_train.begin');
        await createSubscription(sessionId, token, broadcasterId, 'channel.hype_train.end');
    }
    if (twitchSettings?.eventsub_followers) {
        await createSubscription(sessionId, token, broadcasterId, 'channel.follow', '2', { broadcaster_user_id: broadcasterId, moderator_user_id: broadcasterId });
    }
}

// ============================================================
// EVENTSUB — HANDLERS
// ============================================================

async function handleChannelPointRedemption(event, guildId, sendContestLog) {
    const twitchName = String(event.user_login || event.user_name || '').toLowerCase();
    const rewardName = String(event.reward?.title || '').trim();
    const userInput = event.user_input || '';

    const twitchSettings = await db.getModuleSettings(guildId, 'twitch').catch(() => null);
    const dbRewards = twitchSettings?.channel_point_rewards || [];
    let rewardConfig = dbRewards.find(r => r.name === rewardName);

    if (!rewardConfig) {
        const { REWARDS } = require('./twitch/rewards');
        const original = REWARDS[rewardName];
        if (original) rewardConfig = { name: rewardName, tickets: original.tickets, show_on_overlay: original.showOnOverlay };
    }

    if (!rewardConfig) { console.log(`ℹ️ Récompense ignorée : ${rewardName}`); return; }

    const discordId = await db.getDiscordIdFromTwitch(guildId, twitchName);
    if (discordId && rewardConfig.tickets > 0) {
        await db.addTickets(guildId, discordId, rewardConfig.tickets, 'channel_points');
    }

    const savedEvent = await db.insertChannelPointEvent({
        twitchName, discordId, rewardName, userInput,
        ticketsAwarded: rewardConfig.tickets,
        showOnOverlay: rewardConfig.show_on_overlay,
    });

    if (rewardConfig.show_on_overlay) {
        const button = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`complete_overlay_${savedEvent.id}`).setLabel('Gage effectué').setEmoji('✅').setStyle(ButtonStyle.Success)
        );
        await sendContestLog({
            content:
                `🎮 **Nouveau gage Twitch**\n\n` +
                `📺 Viewer : **${twitchName}**\n` +
                `👤 Discord : ${discordId ? `<@${discordId}>` : 'Non lié'}\n` +
                `🎁 Récompense : **${rewardName}**\n` +
                `🎟️ Tickets : **+${rewardConfig.tickets}**\n` +
                `📝 Texte : ${userInput || 'Aucun texte'}`,
            components: [button],
        }).catch(() => null);
    } else {
        await sendContestLog(
            `🎟️ **Récompense points de chaîne**\n\n` +
            `📺 Viewer : **${twitchName}**\n` +
            `👤 Discord : ${discordId ? `<@${discordId}>` : 'Non lié'}\n` +
            `🎁 Récompense : **${rewardName}**\n` +
            `🎟️ Tickets : **+${rewardConfig.tickets}**`
        ).catch(() => null);
    }

    console.log(`🎁 ${rewardName} par ${twitchName} → +${rewardConfig.tickets} ticket(s)`);
}

// Événements overlay uniquement
async function handleOverlayEvent(type, event, guildId) {
    let rewardName = '';
    let userInput = '';
    let twitchName = String(event.user_login || event.user_name || event.from_broadcaster_user_login || '').toLowerCase();

    if (type === 'channel.subscribe') {
        rewardName = `💜 Nouveau sub`;
        userInput = `${twitchName} vient de s'abonner !`;
    } else if (type === 'channel.subscription.gift') {
        const count = event.total || 1;
        rewardName = `🎁 ${count} sub(s) offert(s)`;
        userInput = `${twitchName} offre ${count} abonnement(s) !`;
    } else if (type === 'channel.raid') {
        const viewers = event.viewers || 0;
        rewardName = `🚀 Raid de ${twitchName}`;
        userInput = `${twitchName} raid avec ${viewers} viewers !`;
    } else if (type === 'channel.hype_train.begin') {
        rewardName = `🚂 Hype Train lancé !`;
        userInput = `Le Hype Train démarre sur la chaîne !`;
    } else if (type === 'channel.hype_train.end') {
        const level = event.level || 1;
        rewardName = `🚂 Hype Train terminé`;
        userInput = `Hype Train niveau ${level} terminé !`;
    } else if (type === 'channel.follow') {
        rewardName = `❤️ Nouveau follow`;
        userInput = `${twitchName} vient de follow !`;
    } else {
        return;
    }

    await db.insertChannelPointEvent({
        twitchName,
        discordId: null,
        rewardName,
        userInput,
        ticketsAwarded: 0,
        showOnOverlay: true,
    }).catch(() => null);

    console.log(`📺 Overlay : ${rewardName} — ${userInput}`);
}

function connectEventSub(guildId, sendContestLog) {
    db.getModuleSettings(guildId, 'twitch').then(async (twitchSettings) => {
        let token = process.env.TWITCH_USER_ACCESS_TOKEN;
        let broadcasterId = process.env.TWITCH_BROADCASTER_ID;

        if (twitchSettings?.twitch_user_token_encrypted) {
            const decrypted = decrypt(twitchSettings.twitch_user_token_encrypted);
            if (decrypted) token = decrypted;
        }
        if (twitchSettings?.twitch_broadcaster_id) {
            broadcasterId = twitchSettings.twitch_broadcaster_id;
        }

        if (!token || !broadcasterId) {
            console.log(`⏸️ [${guildId}] EventSub désactivé : token ou broadcaster ID manquant`);
            return;
        }

        socket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
        socket.on('open', () => { console.log(`🔌 [${guildId}] EventSub WebSocket ouvert`); });
        socket.on('message', async (raw) => {
            try {
                const payload = JSON.parse(raw.toString());
                const messageType = payload.metadata?.message_type;
                const subscriptionType = payload.metadata?.subscription_type;

                if (messageType === 'session_welcome') {
                    await createAllSubscriptions(payload.payload.session.id, token, broadcasterId, twitchSettings);
                    return;
                }

                if (messageType === 'notification') {
                    if (subscriptionType === 'channel.channel_points_custom_reward_redemption.add') {
                        await handleChannelPointRedemption(payload.payload.event, guildId, sendContestLog);
                    } else if ([
                        'channel.subscribe',
                        'channel.subscription.gift',
                        'channel.raid',
                        'channel.hype_train.begin',
                        'channel.hype_train.end',
                        'channel.follow',
                    ].includes(subscriptionType)) {
                        await handleOverlayEvent(subscriptionType, payload.payload.event, guildId);
                    }
                }

                if (messageType === 'session_reconnect') {
                    const reconnectUrl = payload.payload.session.reconnect_url;
                    if (reconnectUrl) { socket.close(); socket = new WebSocket(reconnectUrl); }
                }
            } catch (error) { console.error('❌ Erreur EventSub message:', error.message); }
        });
        socket.on('close', () => { console.log(`⚠️ [${guildId}] EventSub WebSocket fermé`); });
        socket.on('error', (error) => { console.error(`❌ [${guildId}] Erreur EventSub:`, error.message); });
    }).catch(err => {
        console.error(`❌ Erreur chargement settings EventSub [${guildId}]:`, err.message);
    });
}

// ============================================================
// CHAT TWITCH
// ============================================================

function createTwitchChat(discordClient, guildId, twitchUsername, sendContestLog) {
    const twitchChat = new tmi.Client({
        options: { debug: false },
        identity: { username: process.env.TWITCH_CHAT_USERNAME, password: process.env.TWITCH_CHAT_OAUTH },
        channels: [twitchUsername.toLowerCase()],
    });

    twitchChat.on('message', async (channel, tags, message, self) => {
        try {
            if (self) return;
            const s = getGuildState(guildId);
            if (!s.liveContestActive) return;
            const twitchName = tags.username?.toLowerCase();
            if (!twitchName) return;
            const cmd = message.toLowerCase().trim();

            const twitchSettings = await db.getModuleSettings(guildId, 'twitch').catch(() => null);
            const customCommands = twitchSettings?.streamelements_commands || [];

            if (customCommands.length > 0) {
                const matched = customCommands.find(c => {
                    const aliases = (c.command || '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
                    return aliases.includes(cmd);
                });
                if (matched) {
                    s.liveStats[matched.stat_key] = (s.liveStats[matched.stat_key] || 0) + 1;
                    console.log(`📊 ${cmd} par ${twitchName} → ${matched.label}: ${s.liveStats[matched.stat_key]}`);
                    return;
                }
            } else {
                if (handleDefaultStatCommand(cmd, twitchName, guildId)) return;
            }

            if (cmd === '!resetstat') { await handleResetStatsCommand(twitchChat, discordClient, channel, twitchName, guildId); return; }
            if (cmd === '!stat' || cmd === '!stats') {
                const participants = Object.keys(s.currentLive.users || {}).length;
                const { summary } = await generateLiveStatsSummary(guildId, participants);
                await twitchChat.say(channel, summary.replace(/\*\*/g, ''));
                return;
            }

            await handleTwitchTicketMessage(discordClient, sendContestLog, twitchName, guildId);
        } catch (error) { console.error('❌ Erreur handler Twitch chat:', error); }
    });

    return {
        async connect() {
            await twitchChat.connect();
            console.log(`✅ Chat Twitch connecté : #${twitchUsername}`);
            connectEventSub(guildId, sendContestLog);
        },
        async disconnect() { await twitchChat.disconnect().catch(() => null); },
    };
}

function handleDefaultStatCommand(cmd, twitchName, guildId) {
    const s = getGuildState(guildId);
    const stats = s.liveStats;
    if (cmd === '!vie' || cmd === '!+vie') { stats.vies = (stats.vies || 0) + 1; return true; }
    if (cmd === '!mort' || cmd === '!+mort') { stats.morts = (stats.morts || 0) + 1; return true; }
    if (cmd === '!fail' || cmd === '!+fail') { stats.fails = (stats.fails || 0) + 1; return true; }
    if (cmd === '!peur' || cmd === '!+peur' || cmd === '!cri' || cmd === '!+cri') { stats.peurs = (stats.peurs || 0) + 1; return true; }
    if (cmd === '!karma' || cmd === '!+karma') { stats.karma = (stats.karma || 0) + 1; return true; }
    return false;
}

async function handleResetStatsCommand(twitchChat, discordClient, channel, twitchName, guildId) {
    const discordId = await db.getDiscordIdFromTwitch(guildId, twitchName);
    if (!discordId) return;
    const guild = discordClient.guilds.cache.get(guildId);
    if (!guild) return;
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return;
    const isTeam = member.roles.cache.some(role => role.name === config.TEAM_ROLE_NAME);
    if (!isTeam) return;
    const twitchSettings = await db.getModuleSettings(guildId, 'twitch').catch(() => null);
    const commands = twitchSettings?.streamelements_commands || [];
    resetLiveStats(guildId, commands);
    await twitchChat.say(channel, '🧹 Stats du live réinitialisées par la Team.');
}

async function handleTwitchTicketMessage(discordClient, sendContestLog, twitchName, guildId) {
    const s = getGuildState(guildId);
    const now = Date.now();
    const last = s.cooldowns.get(twitchName) || 0;
    if (now - last < config.TWITCH_MESSAGE_COOLDOWN_MS) return;
    s.cooldowns.set(twitchName, now);

    const discordId = await db.getDiscordIdFromTwitch(guildId, twitchName);
    if (!discordId) return;
    const guild = discordClient.guilds.cache.get(guildId);
    if (!guild) return;
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return;
    if (!member.roles.cache.has(config.CHAOS_CHILD_ROLE_ID)) return;

    if (!s.currentLive.users[discordId]) {
        s.currentLive.users[discordId] = { twitchName, messages: 0, presenceGiven: false, messageMilestones: 0 };
    }
    const liveUser = s.currentLive.users[discordId];

    if (!liveUser.presenceGiven) {
        liveUser.presenceGiven = true;
        await db.addPresenceTicket(guildId, discordId, config.TICKET_PRESENCE);
        await sendContestLog(`🎟️ **Présence live validée**\n\n👤 ${member}\n📺 Twitch : **${twitchName}**\n➕ **${config.TICKET_PRESENCE} Tickets Events**`).catch(() => null);
    }

    liveUser.messages += 1;
    await db.addTwitchMessage(guildId, discordId);

    const milestones = Math.floor(liveUser.messages / 10);
    if (milestones > liveUser.messageMilestones) {
        const gained = milestones - liveUser.messageMilestones;
        const gainedTickets = gained * config.TICKET_EVERY_10_MESSAGES;
        liveUser.messageMilestones = milestones;
        await db.addTwitchMessageTickets(guildId, discordId, gainedTickets);
        await sendContestLog(`💬 **Palier messages Twitch atteint**\n\n👤 ${member}\n📺 Twitch : **${twitchName}**\n💬 Messages live : **${liveUser.messages}**\n➕ **${gainedTickets} Tickets Events**`).catch(() => null);
    }
}

// ============================================================
// DÉTECTION LIVE
// ============================================================

async function checkTwitchLive(discordClient, guildId, twitchUsername, onLiveStart, onLiveEnd) {
    try {
        const token = await getAppAccessToken();
        const response = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
            params: { user_login: twitchUsername },
        });

        const stream = response.data.data[0];
        const s = getGuildState(guildId);

        if (!stream) {
            if (s.twitchWasLive || s.liveContestActive) {
                console.log(`⚫ [${guildId}] Twitch hors ligne`);
                s.twitchWasLive = false;
                if (typeof onLiveEnd === 'function') await onLiveEnd();
                else s.liveContestActive = false;
                return { isLive: false, started: false, ended: true };
            }
            return { isLive: false, started: false, ended: false };
        }

        if (s.twitchWasLive) return { isLive: true, started: false, ended: false };

        s.twitchWasLive = true;
        s.liveContestActive = true;
        resetCurrentLive(guildId);

        const twitchSettings = await db.getModuleSettings(guildId, 'twitch').catch(() => null);
        const commands = twitchSettings?.streamelements_commands || [];
        resetLiveStats(guildId, commands);

        await sendLiveAnnouncement(discordClient, guildId, stream, twitchUsername);
        console.log(`🔴 [${guildId}] Live Twitch détecté`);
        if (typeof onLiveStart === 'function') await onLiveStart();
        return { isLive: true, started: true, ended: false };

    } catch (error) {
        console.error('❌ Erreur checkTwitchLive:', error.response?.data || error.message);
        return { isLive: false, started: false, ended: false, error: true };
    }
}

async function sendLiveAnnouncement(discordClient, guildId, stream, twitchUsername) {
    const settings = await db.getServerSettings(guildId).catch(() => null);
    const twitchSettings = await db.getModuleSettings(guildId, 'twitch').catch(() => null);

    const liveChannelId = twitchSettings?.live_channel_id || settings?.live_channel_id || config.LIVE_CHANNEL_ID;
    const liveRoleId = settings?.live_role_id || config.LIVE_ROLE_ID;
    const username = twitchSettings?.twitch_username || settings?.twitch_username || twitchUsername || config.TWITCH_USERNAME;
    const serverName = settings?.server_name || 'Le serveur';

    const channel = await discordClient.channels.fetch(liveChannelId).catch(() => null);
    if (!channel) return;

    // Message personnalisable depuis le dashboard, avec fallback générique
    // (plus de texte Black&Co' codé en dur — chaque serveur peut le personnaliser)
    const customMessage = twitchSettings?.live_announce_message;

    let content;
    if (customMessage) {
        content = customMessage
            .replace('{role}', `<@&${liveRoleId}>`)
            .replace('{game}', stream.game_name || 'Non renseigné')
            .replace('{title}', stream.title || 'Live en cours')
            .replace('{username}', username)
            .replace('{url}', `https://www.twitch.tv/${username}`)
            .replace('{server}', serverName);
    } else {
        content =
            `🔴 **${serverName} EST EN LIVE** 🔴\n\n` +
            (liveRoleId ? `<@&${liveRoleId}>\n\n` : '') +
            `🎮 Jeu : ${stream.game_name || 'Non renseigné'}\n` +
            `📢 Titre : ${stream.title || 'Live en cours'}\n` +
            `📺 https://www.twitch.tv/${username}`;
    }

    await channel.send({
        content,
        allowedMentions: { parse: ['roles'] },
    }).catch(console.error);
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    createTwitchChat,
    checkTwitchLive,
    getLiveState,
    getLiveStats,
    generateLiveStatsSummary,
    setLiveActive,
    resetLiveStats,
    resetCurrentLive,
    stopCurrentLive,
};