// ============================================================
// IMPORTS
// ============================================================

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const config = require('../config');
const db = require('../db/queries');
const { getSetting } = require('../utils/serverSettings');

// ============================================================
// CACHE / ÉTATS TEMPORAIRES
// ============================================================

const messageCooldowns = new Map();
const spamTracker = new Map();
const spamWarnings = new Map();

let disboardReminderTimeout = null;

// Nettoyage des cooldowns
setInterval(() => {
    const limit = Date.now() - config.MESSAGE_COOLDOWN_MS;
    for (const [userId, timestamp] of messageCooldowns) {
        if (timestamp < limit) messageCooldowns.delete(userId);
    }
}, 10 * 60 * 1000);

// ============================================================
// DISBOARD
// ============================================================

function isDisboardBumpDone(message) {
    if (message.author.id !== '302050872383242240') return false;
    if (message.channel.id !== config.DISBOARD_CHANNEL_ID) return false;

    const fullText = [
        message.content || '',
        ...message.embeds.map(embed =>
            `${embed.title || ''} ${embed.description || ''} ${embed.footer?.text || ''}`
        ),
    ].join(' ');

    return fullText.includes('Bump effectué');
}

async function sendDisboardReminder(discordClient, channelId = config.DISBOARD_CHANNEL_ID) {
    const channel = await discordClient.channels.fetch(channelId).catch(() => null);
    if (!channel) return;
    await channel.send(
        `⏰ **Rappel Disboard**\n\n` +
        `Le dernier bump a été effectué il y a 2h.\n` +
        `Vous pouvez refaire \`/bump\` maintenant. 🦌`
    ).catch(console.error);
}

async function scheduleDisboardReminder(discordClient, delay) {
    if (disboardReminderTimeout) clearTimeout(disboardReminderTimeout);
    disboardReminderTimeout = setTimeout(async () => {
        await sendDisboardReminder(discordClient);
    }, delay);
}

async function handleDisboardReminder(message, discordClient) {
    if (disboardReminderTimeout) clearTimeout(disboardReminderTimeout);
    const nextBumpAt = Date.now() + config.DISBOARD_INTERVAL_MS;
    await db.saveNextBump(message.guild.id, config.DISBOARD_CHANNEL_ID, nextBumpAt);
    console.log('📌 Bump Disboard détecté. Rappel enregistré en base et programmé dans 2h.');
    await scheduleDisboardReminder(discordClient, config.DISBOARD_INTERVAL_MS);
}

async function restoreDisboardReminder(discordClient) {
    const saved = await db.getNextBump(process.env.GUILD_ID);
    if (!saved) return;
    const delay = Number(saved.next_bump_at) - Date.now();
    if (delay <= 0) {
        await sendDisboardReminder(discordClient, saved.channel_id);
        return;
    }
    await scheduleDisboardReminder(discordClient, delay);
    console.log(`🔁 Rappel Disboard restauré. Prochain rappel dans ${Math.round(delay / 60000)} min.`);
}

// ============================================================
// EMOJIS — UPLOAD IMAGE
// ============================================================

async function handleEmojiUpload(message, discordClient, pendingEmojiRequests) {
    const pending = pendingEmojiRequests.get(message.author.id);
    if (!pending) return false;
    if (message.attachments.size === 0) return false;

    const attachment = message.attachments.first();
    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

    if (!validTypes.includes(attachment.contentType)) {
        await message.reply('❌ Format non supporté. Envoie une image PNG, JPEG, GIF ou WebP.');
        return true;
    }

    const requestId = await db.insertEmojiRequest(
        message.guild.id,
        message.author.id,
        pending.emojiName,
        attachment.url
    );

    pendingEmojiRequests.delete(message.author.id);

    const logChannel = await discordClient.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
    if (logChannel) {
        await logChannel.send({
            content:
                `🎨 **Nouvelle demande d'emoji**\n\n` +
                `👤 Membre : ${message.author}\n` +
                `🏷️ Nom : **:${pending.emojiName}:**\n` +
                `💰 Prix : **${config.SHOP_PRICES.emoji} ${config.MONEY_NAME}s**\n` +
                `🖼️ Image : ${attachment.url}`,
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`approve_emoji_${requestId}`).setLabel('Accepter').setEmoji('✅').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`reject_emoji_${requestId}`).setLabel('Refuser').setEmoji('❌').setStyle(ButtonStyle.Danger)
                ),
            ],
        });
    }

    await message.reply('✅ Ton image a été envoyée à la Team pour validation.');
    return true;
}

// ============================================================
// ÉCONOMIE — GAIN PAR MESSAGE (lit les settings du dashboard)
// ============================================================

async function handleMoneyGain(message) {
    const guildId = message.guild.id;

    // Lire les settings économie depuis la DB (dashboard)
    const economySettings = await db.getModuleSettings(guildId, 'economy').catch(() => null);

    // Gain activé ?
    const gainEnabled = economySettings?.gain_per_message_enabled !== false;
    if (!gainEnabled) return;

    // Cooldown (en secondes dans le dashboard, on convertit en ms)
    const cooldownMs = (economySettings?.gain_cooldown || config.MESSAGE_COOLDOWN_MS / 1000) * 1000;

    // Salons autorisés
    const channelsMode = economySettings?.allowed_channels_mode || 'all';
    const allowedChannels = economySettings?.allowed_channels
        ? economySettings.allowed_channels.split('\n').map(s => s.trim()).filter(Boolean)
        : [];
    const excludedChannels = economySettings?.excluded_channels
        ? economySettings.excluded_channels.split('\n').map(s => s.trim()).filter(Boolean)
        : [];

    if (channelsMode === 'whitelist' && allowedChannels.length > 0) {
        if (!allowedChannels.includes(message.channel.id)) return;
    } else if (channelsMode === 'blacklist' && excludedChannels.length > 0) {
        if (excludedChannels.includes(message.channel.id)) return;
    } else if (channelsMode === 'all') {
        // Fallback sur config.js si aucune config dashboard
        if (config.ALLOWED_MONEY_CHANNELS?.length > 0) {
            if (!config.ALLOWED_MONEY_CHANNELS.includes(message.channel.id)) return;
        }
    }

    // Cooldown
    const userId = message.author.id;
    const now = Date.now();
    const lastGain = messageCooldowns.get(`${guildId}:${userId}`) || 0;
    if (now - lastGain < cooldownMs) return;

    messageCooldowns.set(`${guildId}:${userId}`, now);

    // Montant
    const amount = economySettings?.gain_per_message || config.POINTS_PER_MESSAGE;

    await db.addPoints(guildId, userId, amount);

    console.log(`💰 +${amount} ${config.MONEY_NAME} pour ${message.author.tag} [${guildId}]`);
}

// ============================================================
// SÉCURITÉ — ANTI-SPAM
// ============================================================

function hasLink(content) {
    return /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i.test(content || '');
}

function isTrustedMember(member) {
    if (!member) return false;
    const isTeam = member.roles.cache.some(role => role.name === config.TEAM_ROLE_NAME);
    const isBibiche = member.roles.cache.has(config.ROLE_BIBICHE_ID);
    return isTeam || isBibiche;
}

async function sendSecurityLog(discordClient, content) {
    const channel = await discordClient.channels.fetch(config.SECURITY_LOG_CHANNEL_ID).catch(() => null);
    if (channel) await channel.send(content).catch(() => null);
}

async function handleAntiSpam(message, discordClient) {
    const member = message.member;
    if (!member) return false;
    if (isTrustedMember(member)) return false;

    const now = Date.now();
    const userId = message.author.id;

    if (!spamTracker.has(userId)) {
        spamTracker.set(userId, { messages: [], links: [], files: [] });
    }

    const data = spamTracker.get(userId);
    data.messages.push(now);
    if (hasLink(message.content)) data.links.push(now);
    if (message.attachments.size > 0) data.files.push(now);

    data.messages = data.messages.filter(t => now - t <= config.ANTI_SPAM_MESSAGE_WINDOW_MS);
    data.links = data.links.filter(t => now - t <= config.ANTI_SPAM_MEDIA_WINDOW_MS);
    data.files = data.files.filter(t => now - t <= config.ANTI_SPAM_MEDIA_WINDOW_MS);

    spamTracker.set(userId, data);

    let reason = null;
    if (data.messages.length >= config.ANTI_SPAM_MESSAGE_LIMIT) reason = 'spam de messages';
    else if (data.links.length >= config.ANTI_SPAM_LINK_LIMIT) reason = 'spam de liens';
    else if (data.files.length >= config.ANTI_SPAM_FILE_LIMIT) reason = 'spam de fichiers';

    if (!reason) return false;

    spamWarnings.set(userId, now);

    await message.channel.send(
        `⚠️ ${message.author}, comportement détecté comme **${reason}**.\n` +
        `Par sécurité, tu es temporairement mute. La Team vérifiera si besoin.`
    ).catch(() => null);

    await sendSecurityLog(
        discordClient,
        `🔇 **Auto-mute sécurité**\n\n` +
        `👤 Membre : ${message.author}\n` +
        `📌 Raison : **${reason}**\n` +
        `🦌 Statut : non Bibiche\n` +
        `⏱️ Durée : **10 minutes**\n` +
        `📍 Salon : ${message.channel}\n\n` +
        `La gestion manuelle pourra être faite en MP.`
    );

    await member.timeout(config.ANTI_SPAM_TIMEOUT_MS, `ChaosCore anti-spam : ${reason}`).catch(error => {
        console.error('❌ Impossible de timeout le membre:', error.message);
    });

    return true;
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

async function handleMessage(message, discordClient, sendLog, pendingEmojiRequests) {
    if (!message.guild) return;

    if (isDisboardBumpDone(message)) {
        await handleDisboardReminder(message, discordClient);
        return;
    }

    if (message.author.bot) return;

    const blockedByAntiSpam = await handleAntiSpam(message, discordClient);
    if (blockedByAntiSpam) return;

    const handledEmoji = await handleEmojiUpload(message, discordClient, pendingEmojiRequests);
    if (handledEmoji) return;

    await handleMoneyGain(message);
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = { handleMessage, restoreDisboardReminder };