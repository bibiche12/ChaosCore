// ============================================================
// IMPORTS
// ============================================================

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const config = require('../config');
const db = require('../db/queries');
const { hasTeamRole } = require('../utils/guildSettings');

const messageCooldowns = new Map();
const spamTracker = new Map();
const spamWarnings = new Map();

// Map par guild — un seul timeout partagé causait l'annulation du rappel
// d'un serveur dès qu'un autre serveur en programmait un nouveau.
const disboardReminderTimeouts = new Map();

setInterval(() => {
    const limit = Date.now() - config.MESSAGE_COOLDOWN_MS;
    for (const [userId, timestamp] of messageCooldowns) {
        if (timestamp < limit) messageCooldowns.delete(userId);
    }
}, 10 * 60 * 1000);

// ============================================================
// DISBOARD
// ============================================================

async function isDisboardBumpDone(message) {
    if (message.author.id !== '302050872383242240') return false;

    // Vérifier le bon salon depuis settings dashboard ou config
    const bumpSettings = await db.getModuleSettings(message.guild?.id, 'bump').catch(() => null);
    const expectedChannelId = bumpSettings?.channel_id || config.DISBOARD_CHANNEL_ID;
    if (message.channel.id !== expectedChannelId) return false;

    const fullText = [
        message.content || '',
        ...message.embeds.map(e => `${e.title || ''} ${e.description || ''} ${e.footer?.text || ''}`),
    ].join(' ');
    return fullText.includes('Bump effectué');
}

async function sendDisboardReminder(discordClient, fallbackChannelId, guildId) {
    const bumpSettings = await db.getModuleSettings(guildId, 'bump').catch(() => null);

    const enabled = bumpSettings?.bump_enabled !== false;
    if (!enabled) return;

    // Salon : settings dashboard > fallback paramètre > config.js
    const targetChannelId = bumpSettings?.channel_id || fallbackChannelId || config.DISBOARD_CHANNEL_ID;
    const channel = await discordClient.channels.fetch(targetChannelId).catch(() => null);
    if (!channel) return;

    // Message configurable avec variable {ping}
    let message = bumpSettings?.reminder_message
        || '⏰ **Rappel Disboard**\n\nLe dernier bump a été effectué il y a 2h.\nVous pouvez refaire `/bump` maintenant. 🦌';

    // Ping optionnel
    const pingEnabled = bumpSettings?.ping_enabled;
    const pingRoleId  = bumpSettings?.ping_role_id;
    if (pingEnabled && pingRoleId) {
        message = message.replace('{ping}', `<@&${pingRoleId}>`);
    } else {
        message = message.replace('{ping}', '');
    }

    await channel.send(message).catch(console.error);
}

async function scheduleDisboardReminder(discordClient, delay, fallbackChannelId, guildId) {
    const existing = disboardReminderTimeouts.get(guildId);
    if (existing) clearTimeout(existing);
    const timeout = setTimeout(async () => {
        await sendDisboardReminder(discordClient, fallbackChannelId, guildId);
    }, delay);
    disboardReminderTimeouts.set(guildId, timeout);
}

async function handleDisboardReminder(message, discordClient) {
    const guildId = message.guild.id;
    const nextBumpAt = Date.now() + config.DISBOARD_INTERVAL_MS;
    await db.saveNextBump(guildId, message.channel.id, nextBumpAt);
    console.log(`📌 [${guildId}] Bump Disboard détecté. Rappel enregistré en base et programmé dans 2h.`);
    await scheduleDisboardReminder(discordClient, config.DISBOARD_INTERVAL_MS, message.channel.id, guildId);
}

async function restoreDisboardReminder(discordClient) {
    // Boucle sur tous les guilds où le bot est présent — auparavant ne restaurait
    // que le rappel de Black&Co' (process.env.GUILD_ID), perdant le timer de
    // tous les autres serveurs à chaque redémarrage/déploiement du bot.
    for (const [guildId] of discordClient.guilds.cache) {
        const saved = await db.getNextBump(guildId).catch(() => null);
        if (!saved) continue;

        const delay = Number(saved.next_bump_at) - Date.now();
        if (delay <= 0) {
            await sendDisboardReminder(discordClient, saved.channel_id, guildId);
            continue;
        }
        await scheduleDisboardReminder(discordClient, delay, saved.channel_id, guildId);
        console.log(`🔁 [${guildId}] Rappel Disboard restauré. Prochain rappel dans ${Math.round(delay / 60000)} min.`);
    }
}

// ============================================================
// EMOJIS
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

    const guildId = message.guild.id;
    const requestId = await db.insertEmojiRequest(guildId, message.author.id, pending.emojiName, attachment.url);
    pendingEmojiRequests.delete(message.author.id);

    // Salon et nom de monnaie lus depuis la config du serveur — auparavant
    // toujours envoyé sur le salon de logs de Black&Co' quel que soit le serveur.
    const shopSettings = await db.getModuleSettings(guildId, 'shop').catch(() => null);
    const serverSettings = await db.getServerSettings(guildId).catch(() => null);
    const economySettings = await db.getModuleSettings(guildId, 'economy').catch(() => null);

    const logChannelId = shopSettings?.validation_channel_id
        || shopSettings?.log_channel_id
        || serverSettings?.log_channel_id
        || config.LOG_CHANNEL_ID;
    const moneyName = economySettings?.currency_singular || config.MONEY_NAME;
    const emojiPrice = shopSettings?.emoji_price || config.SHOP_PRICES.emoji;

    const logChannel = await discordClient.channels.fetch(logChannelId).catch(() => null);
    if (logChannel) {
        await logChannel.send({
            content:
                `🎨 **Nouvelle demande d'emoji**\n\n` +
                `👤 Membre : ${message.author}\n` +
                `🏷️ Nom : **:${pending.emojiName}:**\n` +
                `💰 Prix : **${emojiPrice} ${moneyName}s**\n` +
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
// ÉCONOMIE — GAIN PAR MESSAGE (depuis dashboard)
// ============================================================

async function handleMoneyGain(message) {
    const guildId = message.guild.id;
    const economySettings = await db.getModuleSettings(guildId, 'economy').catch(() => null);

    const gainEnabled = economySettings?.gain_per_message_enabled !== false;
    if (!gainEnabled) return;

    const cooldownMs = (economySettings?.gain_cooldown || config.MESSAGE_COOLDOWN_MS / 1000) * 1000;

    const channelsMode = economySettings?.allowed_channels_mode || 'all';
    const allowedChannels = economySettings?.allowed_channels
        ? economySettings.allowed_channels.split('\n').map(s => s.trim()).filter(Boolean) : [];
    const excludedChannels = economySettings?.excluded_channels
        ? economySettings.excluded_channels.split('\n').map(s => s.trim()).filter(Boolean) : [];

    // Le mode 'all' signifie "gain partout" — il ne doit pas être restreint
    // par les salons fixes de Black&Co'. Ce fallback faisait que tout serveur
    // resté en mode par défaut voyait son économie limitée aux salons d'un
    // autre serveur, à l'opposé du comportement attendu.
    if (channelsMode === 'whitelist' && allowedChannels.length > 0) {
        if (!allowedChannels.includes(message.channel.id)) return;
    } else if (channelsMode === 'blacklist' && excludedChannels.length > 0) {
        if (excludedChannels.includes(message.channel.id)) return;
    }

    const userId = message.author.id;
    const now = Date.now();
    const lastGain = messageCooldowns.get(`${guildId}:${userId}`) || 0;
    if (now - lastGain < cooldownMs) return;

    messageCooldowns.set(`${guildId}:${userId}`, now);

    const amount = economySettings?.gain_per_message || config.POINTS_PER_MESSAGE;
    await db.addPoints(guildId, userId, amount);
    console.log(`💰 +${amount} ${config.MONEY_NAME} pour ${message.author.tag} [${guildId}]`);
}

// ============================================================
// SÉCURITÉ — ANTI-SPAM (depuis dashboard)
// ============================================================

function hasLink(content) {
    return /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i.test(content || '');
}

async function isTrustedMember(member) {
    if (!member) return false;
    const isTeam = await hasTeamRole(member);
    if (isTeam) return true;
    // Rôle "de confiance" optionnel — configurable par serveur, fallback Black&Co'
    const serverSettings = await db.getServerSettings(member.guild.id).catch(() => null);
    const trustedRoleId = serverSettings?.trusted_role_id || config.ROLE_BIBICHE_ID;
    return trustedRoleId ? member.roles.cache.has(trustedRoleId) : false;
}

async function handleAntiSpam(message, discordClient) {
    const member = message.member;
    if (!member) return false;
    if (await isTrustedMember(member)) return false;

    const guildId = message.guild.id;

    const securitySettings = await db.getModuleSettings(guildId, 'security').catch(() => null);

    const securityEnabled = securitySettings?.security_enabled !== false;
    const antiSpamEnabled = securitySettings?.anti_spam_enabled !== false;
    if (!securityEnabled || !antiSpamEnabled) return false;

    const messageLimit = securitySettings?.spam_message_limit || config.ANTI_SPAM_MESSAGE_LIMIT;
    const messageWindow = (securitySettings?.spam_time_window || 10) * 1000;
    const linkLimit = securitySettings?.link_limit || config.ANTI_SPAM_LINK_LIMIT;
    const linkWindow = (securitySettings?.link_time_window || 30) * 1000;
    const fileLimit = securitySettings?.file_limit || config.ANTI_SPAM_FILE_LIMIT;
    // file_time_window est bien configurable dans le dashboard (security_files.ejs)
    // mais n'était jamais lu ici — le tracking fichiers réutilisait par erreur
    // linkWindow, rendant ce réglage invisible et sans effet.
    const fileWindow = (securitySettings?.file_time_window || 30) * 1000;
    const timeoutMs = (securitySettings?.spam_mute_duration || 10) * 60 * 1000;

    const linkWhitelist = securitySettings?.link_whitelist
        ? securitySettings.link_whitelist.split('\n').map(s => s.trim()).filter(Boolean)
        : ['discord.gg', 'twitch.tv', 'youtube.com'];

    const now = Date.now();
    const userId = message.author.id;

    if (!spamTracker.has(userId)) spamTracker.set(userId, { messages: [], links: [], files: [] });
    const data = spamTracker.get(userId);

    data.messages.push(now);

    const content = message.content || '';
    if (hasLink(content)) {
        const isWhitelisted = linkWhitelist.some(domain => content.includes(domain));
        if (!isWhitelisted) data.links.push(now);
    }

    if (message.attachments.size > 0) data.files.push(now);

    data.messages = data.messages.filter(t => now - t <= messageWindow);
    data.links    = data.links.filter(t => now - t <= linkWindow);
    data.files    = data.files.filter(t => now - t <= fileWindow);

    spamTracker.set(userId, data);

    let reason = null;
    if (data.messages.length >= messageLimit) reason = 'spam de messages';
    else if (data.links.length >= linkLimit)   reason = 'spam de liens';
    else if (data.files.length >= fileLimit)   reason = 'spam de fichiers';

    if (!reason) return false;

    spamWarnings.set(userId, now);

    await message.channel.send(
        `⚠️ ${message.author}, comportement détecté comme **${reason}**.\n` +
        `Par sécurité, tu es temporairement mute. La Team vérifiera si besoin.`
    ).catch(() => null);

    const logsChannelId = securitySettings?.logs_channel_id || config.SECURITY_LOG_CHANNEL_ID;
    const securityChannel = await discordClient.channels.fetch(logsChannelId).catch(() => null);
    if (securityChannel) {
        await securityChannel.send(
            `🔇 **Auto-mute sécurité**\n\n` +
            `👤 Membre : ${message.author}\n` +
            `📌 Raison : **${reason}**\n` +
            `🦌 Statut : non Bibiche\n` +
            `⏱️ Durée : **${securitySettings?.spam_mute_duration || 10} minutes**\n` +
            `📍 Salon : ${message.channel}\n\n` +
            `La gestion manuelle pourra être faite en MP.`
        ).catch(() => null);
    }

    await member.timeout(timeoutMs, `ChaosCore anti-spam : ${reason}`).catch(error => {
        console.error('❌ Impossible de timeout le membre:', error.message);
    });

    return true;
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

async function handleMessage(message, discordClient, sendLog, pendingEmojiRequests) {
    if (!message.guild) return;

    // isDisboardBumpDone est maintenant async
    if (await isDisboardBumpDone(message)) {
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

module.exports = { handleMessage, restoreDisboardReminder };