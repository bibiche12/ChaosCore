// ============================================================
// IMPORTS
// ============================================================

const axios = require('axios');
const WebSocket = require('ws');
const tmi = require('tmi.js');

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const db = require('../db/queries');
const config = require('../config');

const { REWARDS } = require('./twitch/rewards');

// ============================================================
// ÉTAT GLOBAL TWITCH / LIVE
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
            liveStats: { vies: 0, morts: 0, fails: 0, peurs: 0, karma: 0 },
            cooldowns: new Map(),
        });
    }
    return guildStates.get(guildId);
}

// ============================================================
// GETTERS / SETTERS LIVE
// ============================================================

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

function resetLiveStats(guildId) {
    getGuildState(guildId).liveStats = { vies: 0, morts: 0, fails: 0, peurs: 0, karma: 0 };
}

function resetCurrentLive(guildId) {
    const s = getGuildState(guildId);
    s.currentLive = { startedAt: new Date().toISOString(), users: {} };
    s.liveStats = { vies: 0, morts: 0, fails: 0, peurs: 0, karma: 0 };
    s.cooldowns.clear();
}

function stopCurrentLive(guildId) {
    getGuildState(guildId).liveContestActive = false;
}

// ============================================================
// RÉSUMÉ LIVE
// ============================================================

function generateLiveStatsSummary(guildId, participants = 0) {
    const liveStats = getGuildState(guildId).liveStats;
    return (
        `📊 **Résumé du live**\n\n` +
        `❤️ Vies : **${liveStats.vies}**\n` +
        `💀 Morts : **${liveStats.morts}**\n` +
        `🤦 Fails : **${liveStats.fails}**\n` +
        `😱 Peurs / Cris : **${liveStats.peurs}**\n` +
        `👻 Karma : **${liveStats.karma}**\n\n` +
        `👥 Participants actifs : **${participants}**\n\n` +
        `Merci les Bibiches 🖤`
    );
}

// ============================================================
// AUTHENTIFICATION TWITCH API
// ============================================================

async function getAppAccessToken() {
    if (appAccessToken && Date.now() < appAccessTokenExpiresAt) {
        return appAccessToken;
    }

    const response = await axios.post(
        'https://id.twitch.tv/oauth2/token',
        null,
        {
            params: {
                client_id: process.env.TWITCH_CLIENT_ID,
                client_secret: process.env.TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials',
            },
        }
    );

    appAccessToken = response.data.access_token;
    appAccessTokenExpiresAt =
        Date.now() + (response.data.expires_in - 300) * 1000;

    return appAccessToken;
}

// ============================================================
// EVENTSUB — ABONNEMENT POINTS DE CHAÎNE
// ============================================================

async function createEventSubSubscription(sessionId) {
    const token = process.env.TWITCH_USER_ACCESS_TOKEN;
    const broadcasterId = process.env.TWITCH_BROADCASTER_ID;

    if (!token || !broadcasterId) {
        console.log(
            '⏸️ EventSub ignoré : token utilisateur ou broadcaster ID manquant'
        );

        return;
    }

    await axios.post(
        'https://api.twitch.tv/helix/eventsub/subscriptions',
        {
            type: 'channel.channel_points_custom_reward_redemption.add',
            version: '1',
            condition: {
                broadcaster_user_id: broadcasterId,
            },
            transport: {
                method: 'websocket',
                session_id: sessionId,
            },
        },
        {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        }
    );

    console.log('✅ EventSub récompenses Twitch connecté');
}

// ============================================================
// EVENTSUB — RÉCOMPENSE POINTS DE CHAÎNE
// ============================================================

async function handleChannelPointRedemption(event, sendContestLog) {
    const twitchName = String(
        event.user_login || event.user_name || ''
    ).toLowerCase();

    const rewardName = String(event.reward?.title || '').trim();
    const userInput = event.user_input || '';

    const rewardConfig = REWARDS[rewardName];

    if (!rewardConfig) {
        console.log(`ℹ️ Récompense ignorée : ${rewardName}`);
        return;
    }

    const discordId = await db.getDiscordIdFromTwitch(twitchName);

    if (discordId && rewardConfig.tickets > 0) {
        await db.addTickets(
            discordId,
            rewardConfig.tickets,
            'channel_points'
        );
    }

    const savedEvent = await db.insertChannelPointEvent({
        twitchName,
        discordId,
        rewardName,
        userInput,
        ticketsAwarded: rewardConfig.tickets,
        showOnOverlay: rewardConfig.showOnOverlay,
    });

    if (rewardConfig.showOnOverlay) {
        await sendOverlayRewardLog(
            sendContestLog,
            savedEvent,
            twitchName,
            discordId,
            rewardName,
            rewardConfig,
            userInput
        );

        return;
    }

    await sendSimpleRewardLog(
        sendContestLog,
        twitchName,
        discordId,
        rewardName,
        rewardConfig
    );

    console.log(
        `🎁 ${rewardName} par ${twitchName} → +${rewardConfig.tickets} ticket(s)`
    );
}

async function sendOverlayRewardLog(
    sendContestLog,
    savedEvent,
    twitchName,
    discordId,
    rewardName,
    rewardConfig,
    userInput
) {
    const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`complete_overlay_${savedEvent.id}`)
            .setLabel('Gage effectué')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
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

    console.log(
        `🎁 ${rewardName} par ${twitchName} → +${rewardConfig.tickets} ticket(s)`
    );
}

async function sendSimpleRewardLog(
    sendContestLog,
    twitchName,
    discordId,
    rewardName,
    rewardConfig
) {
    await sendContestLog(
        `🎟️ **Récompense points de chaîne**\n\n` +
        `📺 Viewer : **${twitchName}**\n` +
        `👤 Discord : ${discordId ? `<@${discordId}>` : 'Non lié'}\n` +
        `🎁 Récompense : **${rewardName}**\n` +
        `🎟️ Tickets : **+${rewardConfig.tickets}**`
    ).catch(() => null);
}

// ============================================================
// EVENTSUB — CONNEXION WEBSOCKET
// ============================================================

function connectEventSub(sendContestLog) {
    const token = process.env.TWITCH_USER_ACCESS_TOKEN;
    const broadcasterId = process.env.TWITCH_BROADCASTER_ID;

    if (!token || !broadcasterId) {
        console.log('⏸️ Twitch EventSub désactivé : variables manquantes');
        return;
    }

    socket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

    socket.on('open', () => {
        console.log('🔌 Connexion EventSub WebSocket ouverte');
    });

    socket.on('message', async (raw) => {
        await handleEventSubMessage(raw, sendContestLog);
    });

    socket.on('close', () => {
        console.log('⚠️ EventSub WebSocket fermé');
    });

    socket.on('error', (error) => {
        console.error('❌ Erreur EventSub WebSocket:', error.message);
    });
}

async function handleEventSubMessage(raw, sendContestLog) {
    try {
        const payload = JSON.parse(raw.toString());
        const messageType = payload.metadata?.message_type;

        if (messageType === 'session_welcome') {
            const sessionId = payload.payload.session.id;

            await createEventSubSubscription(sessionId);
            return;
        }

        if (messageType === 'notification') {
            await handleEventSubNotification(payload, sendContestLog);
            return;
        }

        if (messageType === 'session_reconnect') {
            handleEventSubReconnect(payload);
        }
    } catch (error) {
        console.error(
            '❌ Erreur EventSub message:',
            JSON.stringify(error.response?.data || error.message)
        );
    }
}

async function handleEventSubNotification(payload, sendContestLog) {
    const subscriptionType = payload.metadata?.subscription_type;

    if (
        subscriptionType ===
        'channel.channel_points_custom_reward_redemption.add'
    ) {
        await handleChannelPointRedemption(
            payload.payload.event,
            sendContestLog
        );
    }
}

function handleEventSubReconnect(payload) {
    const reconnectUrl = payload.payload.session.reconnect_url;

    console.log('🔁 Twitch demande une reconnexion EventSub');

    if (reconnectUrl) {
        socket.close();
        socket = new WebSocket(reconnectUrl);
    }
}

// ============================================================
// CHAT TWITCH — CRÉATION CLIENT
// ============================================================

function createTwitchChat(discordClient, sendContestLog) {
    const twitchChat = new tmi.Client({
        options: {
            debug: false,
        },
        identity: {
            username: process.env.TWITCH_CHAT_USERNAME,
            password: process.env.TWITCH_CHAT_OAUTH,
        },
        channels: [
            config.TWITCH_USERNAME.toLowerCase(),
        ],
    });

    twitchChat.on('message', async (channel, tags, message, self) => {
        await handleTwitchChatMessage(
            twitchChat,
            discordClient,
            sendContestLog,
            channel,
            tags,
            message,
            self
        );
    });

    return {
        async connect() {
            await twitchChat.connect();

            console.log('✅ Chat Twitch connecté');

            connectEventSub(sendContestLog);
        },
    };
}

// ============================================================
// CHAT TWITCH — HANDLER MESSAGE
// ============================================================

async function handleTwitchChatMessage(
    twitchChat,
    discordClient,
    sendContestLog,
    channel,
    tags,
    message,
    self
) {
    try {
        if (self) return;
        if (!liveContestActive) return;

        const twitchName = tags.username?.toLowerCase();

        if (!twitchName) {
            return;
        }

        const cmd = message.toLowerCase().trim();

        if (handleLiveStatCommand(cmd, twitchName)) {
            return;
        }

        if (cmd === '!resetstat') {
            await handleResetStatsCommand(
                twitchChat,
                discordClient,
                channel,
                twitchName
            );

            return;
        }

        if (cmd === '!stat' || cmd === '!stats') {
            await handleStatsCommand(twitchChat, channel);
            return;
        }

        await handleTwitchTicketMessage(
            discordClient,
            sendContestLog,
            twitchName
        );
    } catch (error) {
        console.error('❌ Erreur handler Twitch chat:', error);
    }
}

// ============================================================
// CHAT TWITCH — COMMANDES STATS
// ============================================================

function handleLiveStatCommand(cmd, twitchName) {
    if (cmd === '!vie' || cmd === '!+vie') {
        liveStats.vies += 1;
        console.log(`❤️ !vie par ${twitchName} → ${liveStats.vies}`);
        return true;
    }

    if (cmd === '!mort' || cmd === '!+mort') {
        liveStats.morts += 1;
        console.log(`💀 !mort par ${twitchName} → ${liveStats.morts}`);
        return true;
    }

    if (cmd === '!fail' || cmd === '!+fail') {
        liveStats.fails += 1;
        console.log(`🤦 !fail par ${twitchName} → ${liveStats.fails}`);
        return true;
    }

    if (
        cmd === '!peur' ||
        cmd === '!+peur' ||
        cmd === '!cri' ||
        cmd === '!+cri'
    ) {
        liveStats.peurs += 1;
        console.log(`😱 ${cmd} par ${twitchName} → ${liveStats.peurs}`);
        return true;
    }

    if (cmd === '!karma' || cmd === '!+karma') {
        liveStats.karma += 1;
        console.log(`👻 !karma par ${twitchName} → ${liveStats.karma}`);
        return true;
    }

    return false;
}

async function handleResetStatsCommand(
    twitchChat,
    discordClient,
    channel,
    twitchName
) {
    const discordId = await db.getDiscordIdFromTwitch(twitchName);

    if (!discordId) return;

    const guild = discordClient.guilds.cache.get(process.env.GUILD_ID);

    if (!guild) return;

    const member = await guild.members
        .fetch(discordId)
        .catch(() => null);

    if (!member) return;

    const isTeam = member.roles.cache.some(
        role => role.name === config.TEAM_ROLE_NAME
    );

    if (!isTeam) return;

    resetLiveStats();

    await twitchChat.say(
        channel,
        '🧹 Stats du live réinitialisées par la Team.'
    );

    console.log(`🧹 !resetstat par ${twitchName}`);
}

async function handleStatsCommand(twitchChat, channel) {
    const participants = Object.keys(
        currentLive.users || {}
    ).length;

    await twitchChat.say(
        channel,
        generateLiveStatsSummary(participants).replace(/\*\*/g, '')
    );
}

// ============================================================
// CHAT TWITCH — TICKETS DU CHAOS
// ============================================================

async function handleTwitchTicketMessage(
    discordClient,
    sendContestLog,
    twitchName
) {
    const now = Date.now();
    const last = getGuildState(guildId).cooldowns.get(twitchName) || 0;

    if (now - last < config.TWITCH_MESSAGE_COOLDOWN_MS) {
        return;
    }

    getGuildState(guildId).cooldowns.set(twitchName, now);

    const discordId = await db.getDiscordIdFromTwitch(twitchName);

    if (!discordId) {
        return;
    }

    const guild = discordClient.guilds.cache.get(process.env.GUILD_ID);

    if (!guild) {
        return;
    }

    const member = await guild.members
        .fetch(discordId)
        .catch(() => null);

    if (!member) {
        return;
    }

    if (!member.roles.cache.has(config.CHAOS_CHILD_ROLE_ID)) {
        return;
    }

    ensureCurrentLiveUser(discordId, twitchName);

    const liveUser = currentLive.users[discordId];

    await handlePresenceTicket(
        sendContestLog,
        member,
        discordId,
        twitchName,
        liveUser
    );

    await handleMessageTicketMilestone(
        sendContestLog,
        member,
        discordId,
        twitchName,
        liveUser
    );
}

function ensureCurrentLiveUser(discordId, twitchName) {
    if (!currentLive.users[discordId]) {
        currentLive.users[discordId] = {
            twitchName,
            messages: 0,
            presenceGiven: false,
            messageMilestones: 0,
        };
    }
}

async function handlePresenceTicket(
    sendContestLog,
    member,
    discordId,
    twitchName,
    liveUser
) {
    if (liveUser.presenceGiven) {
        return;
    }

    liveUser.presenceGiven = true;

    await db.addPresenceTicket(
        discordId,
        config.TICKET_PRESENCE
    );

    await sendContestLog(
        `🎟️ **Présence live validée**\n\n` +
        `👤 ${member}\n` +
        `📺 Twitch : **${twitchName}**\n` +
        `➕ **${config.TICKET_PRESENCE} Tickets du Chaos**`
    ).catch(() => null);
}

async function handleMessageTicketMilestone(
    sendContestLog,
    member,
    discordId,
    twitchName,
    liveUser
) {
    liveUser.messages += 1;

    await db.addTwitchMessage(discordId);

    const milestones = Math.floor(liveUser.messages / 10);

    if (milestones <= liveUser.messageMilestones) {
        return;
    }

    const gained = milestones - liveUser.messageMilestones;
    const gainedTickets = gained * config.TICKET_EVERY_10_MESSAGES;

    liveUser.messageMilestones = milestones;

    await db.addTwitchMessageTickets(
        discordId,
        gainedTickets
    );

    await sendContestLog(
        `💬 **Palier messages Twitch atteint**\n\n` +
        `👤 ${member}\n` +
        `📺 Twitch : **${twitchName}**\n` +
        `💬 Messages live : **${liveUser.messages}**\n` +
        `➕ **${gainedTickets} Tickets du Chaos**`
    ).catch(() => null);
}

// ============================================================
// DÉTECTION LIVE TWITCH
// ============================================================

async function checkTwitchLive(discordClient, onLiveStart, onLiveEnd) {
    try {
        const stream = await fetchCurrentTwitchStream();

        if (!stream) {
            return handleTwitchOffline(onLiveEnd);
        }

        if (twitchWasLive || liveContestActive) {
            return {
                isLive: true,
                started: false,
                ended: false,
            };
        }

        return handleTwitchLiveStart(
            discordClient,
            guildId,
            stream,
            onLiveStart
        );
    } catch (error) {
        console.error(
            '❌ Erreur checkTwitchLive:',
            error.response?.data || error.message
        );

        return {
            isLive: false,
            started: false,
            ended: false,
            error: true,
        };
    }
}

async function fetchCurrentTwitchStream() {
    const token = await getAppAccessToken();

    const response = await axios.get(
        'https://api.twitch.tv/helix/streams',
        {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                Authorization: `Bearer ${token}`,
            },
            params: {
                user_login: config.TWITCH_USERNAME,
            },
        }
    );

    return response.data.data[0];
}

async function handleTwitchOffline(guildId, onLiveEnd) {
    const s = getGuildState(guildId);
    if (s.twitchWasLive || s.liveContestActive) {
        console.log('⚫ Twitch est passé hors ligne');

        s.twitchWasLive = false;

        if (typeof onLiveEnd === 'function') {
            await onLiveEnd();
        } else {
            s.liveContestActive = false;
        }

        return {
            isLive: false,
            started: false,
            ended: true,
        };
    }

    return {
        isLive: false,
        started: false,
        ended: false,
    };
}

async function handleTwitchLiveStart(
    discordClient,
    guildId,
    stream,
    onLiveStart
) {
    const s = getGuildState(guildId);
    s.twitchWasLive = true;
    s.liveContestActive = true;

    resetCurrentLive(guildId);

    await sendLiveAnnouncement(discordClient, guildId, stream);

    console.log('🔴 Live Twitch détecté automatiquement');

    if (typeof onLiveStart === 'function') {
        await onLiveStart();
    }

    return {
        isLive: true,
        started: true,
        ended: false,
    };
}

async function sendLiveAnnouncement(discordClient, guildId, stream) {
    const db = require('../db/queries');
    const settings = await db.getServerSettings(guildId).catch(() => null);
    const liveChannelId  = settings?.live_channel_id || config.LIVE_CHANNEL_ID;
    const liveRoleId     = settings?.live_role_id    || config.LIVE_ROLE_ID;
    const twitchUsername = settings?.twitch_username || config.TWITCH_USERNAME;

    const channel = await discordClient.channels.fetch(liveChannelId).catch(() => null);
    if (!channel) return;

    await channel.send({
        content:
            `🔴 **BLACK&CO' EST EN LIVE** 🔴\n\n` +
            `<@&${liveRoleId}>\n\n` +
            `Le chaos commence maintenant 😈\n\n` +
            `🎮 Jeu : ${stream.game_name || 'Non renseigné'}\n` +
            `📢 Titre : ${stream.title || 'Live en cours'}\n` +
            `📺 https://www.twitch.tv/${twitchUsername}\n\n` +
            `La bibiche a sonné l'alarme 🦌🔥`,
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