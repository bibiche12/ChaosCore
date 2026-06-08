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

let socket = null;
let liveContestActive = false;
let twitchWasLive = false;
let appAccessToken = null;
let appAccessTokenExpiresAt = 0;

let currentLive = {
    startedAt: null,
    users: {},
};

let liveStats = {
    vies: 0,
    morts: 0,
    fails: 0,
    peurs: 0,
    karma: 0,
};

const twitchCooldowns = new Map();

function getLiveState() {
    return {
        liveContestActive,
        currentLive,
        liveStats,
    };
}

function getLiveStats() {
    return liveStats;
}

function generateLiveStatsSummary(participants = 0) {
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

function setLiveActive(value) {
    liveContestActive = value;
}

function resetLiveStats() {
    liveStats = {
        vies: 0,
        morts: 0,
        fails: 0,
        peurs: 0,
        karma: 0,
    };
}

function resetCurrentLive() {
    currentLive = {
        startedAt: new Date().toISOString(),
        users: {},
    };

    resetLiveStats();
    twitchCooldowns.clear();
}

function stopCurrentLive() {
    liveContestActive = false;
}

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
    appAccessTokenExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000;

    return appAccessToken;
}

async function createEventSubSubscription(sessionId) {
    const token = process.env.TWITCH_USER_ACCESS_TOKEN;
    const broadcasterId = process.env.TWITCH_BROADCASTER_ID;

    if (!token || !broadcasterId) {
        console.log('⏸️ EventSub ignoré : token utilisateur ou broadcaster ID manquant');
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

async function handleChannelPointRedemption(event, sendContestLog) {
    const twitchName = String(event.user_login || event.user_name || '').toLowerCase();
    const rewardName = String(event.reward?.title || '').trim();
    const userInput = event.user_input || '';

    const rewardConfig = REWARDS[rewardName];

    if (!rewardConfig) {
        console.log(`ℹ️ Récompense ignorée : ${rewardName}`);
        return;
    }

    const discordId = await db.getDiscordIdFromTwitch(twitchName);

    if (discordId && rewardConfig.tickets > 0) {
        await db.addTickets(discordId, rewardConfig.tickets, 'channel_points');
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
        try {
            const payload = JSON.parse(raw.toString());
            const messageType = payload.metadata?.message_type;

            if (messageType === 'session_welcome') {
                const sessionId = payload.payload.session.id;
                await createEventSubSubscription(sessionId);
                return;
            }

            if (messageType === 'notification') {
                const subscriptionType = payload.metadata?.subscription_type;

                if (subscriptionType === 'channel.channel_points_custom_reward_redemption.add') {
                    await handleChannelPointRedemption(
                        payload.payload.event,
                        sendContestLog
                    );
                }
            }

            if (messageType === 'session_reconnect') {
                const reconnectUrl = payload.payload.session.reconnect_url;
                console.log('🔁 Twitch demande une reconnexion EventSub');

                if (reconnectUrl) {
                    socket.close();
                    socket = new WebSocket(reconnectUrl);
                }
            }
        } catch (error) {
            console.error(
    '❌ Erreur EventSub message:',
    JSON.stringify(error.response?.data || error.message)
);
        }
    });

    socket.on('close', () => {
        console.log('⚠️ EventSub WebSocket fermé');
    });

    socket.on('error', (error) => {
        console.error('❌ Erreur EventSub WebSocket:', error.message);
    });
}

function createTwitchChat(discordClient, sendContestLog) {
    const twitchChat = new tmi.Client({
        options: { debug: false },
        identity: {
            username: process.env.TWITCH_CHAT_USERNAME,
            password: process.env.TWITCH_CHAT_OAUTH,
        },
        channels: [config.TWITCH_USERNAME.toLowerCase()],
    });

    twitchChat.on('message', async (channel, tags, message, self) => {
        try {
            if (self) return;
            if (!liveContestActive) return;

            const twitchName = tags.username?.toLowerCase();
            if (!twitchName) return;

            const cmd = message.toLowerCase().trim();

            if (cmd === '!vie') {
                liveStats.vies += 1;
                console.log(`❤️ !vie par ${twitchName} → ${liveStats.vies}`);
                return;
            }

            if (cmd === '!mort') {
                liveStats.morts += 1;
                console.log(`💀 !mort par ${twitchName} → ${liveStats.morts}`);
                return;
            }

            if (cmd === '!fail') {
                liveStats.fails += 1;
                console.log(`🤦 !fail par ${twitchName} → ${liveStats.fails}`);
                return;
            }

            if (cmd === '!peur' || cmd === '!cri') {
    liveStats.peurs += 1;
    console.log(`😱 ${cmd} par ${twitchName} → ${liveStats.peurs}`);
    return;
}

            if (cmd === '!karma') {
                liveStats.karma += 1;
                console.log(`👻 !karma par ${twitchName} → ${liveStats.karma}`);
                return;
            }
            if (cmd === '!resetstat') {
                const discordId = await db.getDiscordIdFromTwitch(twitchName);
                if (!discordId) return;

                const guild = discordClient.guilds.cache.get(process.env.GUILD_ID);
                if (!guild) return;

                const member = await guild.members.fetch(discordId).catch(() => null);
                if (!member) return;

                const isTeam = member.roles.cache.some(role => role.name === config.TEAM_ROLE_NAME);
                if (!isTeam) return;

                resetLiveStats();

                await twitchChat.say(channel, '🧹 Stats du live réinitialisées par la Team.');
                console.log(`🧹 !resetstat par ${twitchName}`);

                return;
            }
            
            if (cmd === '!stat' || cmd === '!stats') {
                const participants = Object.keys(currentLive.users || {}).length;
                await twitchChat.say(channel, generateLiveStatsSummary(participants).replace(/\*\*/g, ''));
                return;
            }

            const now = Date.now();
            const last = twitchCooldowns.get(twitchName) || 0;

            if (now - last < config.TWITCH_MESSAGE_COOLDOWN_MS) return;
            twitchCooldowns.set(twitchName, now);

            const discordId = await db.getDiscordIdFromTwitch(twitchName);
            if (!discordId) return;

            const guild = discordClient.guilds.cache.get(process.env.GUILD_ID);
            if (!guild) return;

            const member = await guild.members.fetch(discordId).catch(() => null);
            if (!member) return;

            if (!member.roles.cache.has(config.CHAOS_CHILD_ROLE_ID)) return;

            if (!currentLive.users[discordId]) {
                currentLive.users[discordId] = {
                    twitchName,
                    messages: 0,
                    presenceGiven: false,
                    messageMilestones: 0,
                };
            }

            const liveUser = currentLive.users[discordId];

            if (!liveUser.presenceGiven) {
                liveUser.presenceGiven = true;

                await db.addPresenceTicket(discordId, config.TICKET_PRESENCE);

                await sendContestLog(
                    `🎟️ **Présence live validée**\n\n` +
                    `👤 ${member}\n` +
                    `📺 Twitch : **${twitchName}**\n` +
                    `➕ **${config.TICKET_PRESENCE} Tickets du Chaos**`
                ).catch(() => null);
            }

            liveUser.messages += 1;
            await db.addTwitchMessage(discordId);

            const milestones = Math.floor(liveUser.messages / 10);

            if (milestones > liveUser.messageMilestones) {
                const gained = milestones - liveUser.messageMilestones;
                const gainedTickets = gained * config.TICKET_EVERY_10_MESSAGES;

                liveUser.messageMilestones = milestones;

                await db.addTwitchMessageTickets(discordId, gainedTickets);

                await sendContestLog(
                    `💬 **Palier messages Twitch atteint**\n\n` +
                    `👤 ${member}\n` +
                    `📺 Twitch : **${twitchName}**\n` +
                    `💬 Messages live : **${liveUser.messages}**\n` +
                    `➕ **${gainedTickets} Tickets du Chaos**`
                ).catch(() => null);
            }
        } catch (error) {
            console.error('❌ Erreur handler Twitch chat:', error);
        }
    });

    return {
        async connect() {
            await twitchChat.connect();
            console.log('✅ Chat Twitch connecté');

            connectEventSub(sendContestLog);
        },
    };
}

async function checkTwitchLive(discordClient, onLiveStart, onLiveEnd) {
    try {
        const token = await getAppAccessToken();

        const response = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                Authorization: `Bearer ${token}`,
            },
            params: {
                user_login: config.TWITCH_USERNAME,
            },
        });

        const stream = response.data.data[0];

        if (!stream) {
            if (twitchWasLive || liveContestActive) {
                console.log('⚫ Twitch est passé hors ligne');

                twitchWasLive = false;

                if (typeof onLiveEnd === 'function') {
                    await onLiveEnd();
                } else {
                    liveContestActive = false;
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

        if (twitchWasLive || liveContestActive) {
            return {
                isLive: true,
                started: false,
                ended: false,
            };
        }

        twitchWasLive = true;
        liveContestActive = true;
        resetCurrentLive();

        const channel = await discordClient.channels.fetch(config.LIVE_CHANNEL_ID).catch(() => null);

        if (channel) {
            await channel.send({
                content:
                    `🔴 **BLACK&CO' EST EN LIVE** 🔴\n\n` +
                    `<@&${config.LIVE_ROLE_ID}>\n\n` +
                    `Le chaos commence maintenant 😈\n\n` +
                    `🎮 Jeu : ${stream.game_name || 'Non renseigné'}\n` +
                    `📢 Titre : ${stream.title || 'Live en cours'}\n` +
                    `📺 https://www.twitch.tv/${config.TWITCH_USERNAME}\n\n` +
                    `La bibiche a sonné l’alarme 🦌🔥`,
                allowedMentions: {
                    parse: ['roles'],
                },
            }).catch(console.error);
        }

        console.log('🔴 Live Twitch détecté automatiquement');

        if (typeof onLiveStart === 'function') {
            await onLiveStart();
        }

        return {
            isLive: true,
            started: true,
            ended: false,
        };
    } catch (error) {
        console.error('❌ Erreur checkTwitchLive:', error.response?.data || error.message);

        return {
            isLive: false,
            started: false,
            ended: false,
            error: true,
        };
    }
}

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