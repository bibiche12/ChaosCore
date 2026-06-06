const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const config = require('../config');
const db = require('../db/queries');

const messageCooldowns = new Map();
let disboardReminderTimeout = null;

setInterval(() => {
    const limit = Date.now() - config.MESSAGE_COOLDOWN_MS;

    for (const [userId, timestamp] of messageCooldowns) {
        if (timestamp < limit) {
            messageCooldowns.delete(userId);
        }
    }
}, 10 * 60 * 1000);

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

async function handleDisboardReminder(message, discordClient) {
    if (disboardReminderTimeout) {
        clearTimeout(disboardReminderTimeout);
    }

    console.log('📌 Bump Disboard détecté. Rappel programmé dans 2h.');

    disboardReminderTimeout = setTimeout(async () => {
        const channel = await discordClient.channels.fetch(config.DISBOARD_CHANNEL_ID).catch(() => null);

        if (!channel) return;

        await channel.send(
            `⏰ **Rappel Disboard**\n\n` +
            `Le dernier bump a été effectué il y a 2h.\n` +
            `Vous pouvez refaire \`/bump\` maintenant. 🦌`
        ).catch(console.error);
    }, config.DISBOARD_INTERVAL_MS);
}

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
        message.author.id,
        pending.emojiName,
        attachment.url
    );

    pendingEmojiRequests.delete(message.author.id);

    const logChannel = await discordClient.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);

    if (logChannel) {
        await logChannel.send({
            content:
                `🎨 **Nouvelle demande d’emoji**\n\n` +
                `👤 Membre : ${message.author}\n` +
                `🏷️ Nom : **:${pending.emojiName}:**\n` +
                `💰 Prix : **${config.SHOP_PRICES.emoji} ${config.MONEY_NAME}s**\n` +
                `🖼️ Image : ${attachment.url}`,
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_emoji_${requestId}`)
                        .setLabel('Accepter')
                        .setEmoji('✅')
                        .setStyle(ButtonStyle.Success),

                    new ButtonBuilder()
                        .setCustomId(`reject_emoji_${requestId}`)
                        .setLabel('Refuser')
                        .setEmoji('❌')
                        .setStyle(ButtonStyle.Danger)
                ),
            ],
        });
    }

    await message.reply('✅ Ton image a été envoyée à la Team pour validation.');
    return true;
}

async function handleMoneyGain(message) {
    if (!config.ALLOWED_MONEY_CHANNELS.includes(message.channel.id)) return;

    const userId = message.author.id;
    const now = Date.now();
    const lastGain = messageCooldowns.get(userId) || 0;

    if (now - lastGain < config.MESSAGE_COOLDOWN_MS) return;

    messageCooldowns.set(userId, now);

    await db.addPoints(userId, config.POINTS_PER_MESSAGE);

    console.log(`💰 +${config.POINTS_PER_MESSAGE} ${config.MONEY_NAME} pour ${message.author.tag}`);
}

async function handleMessage(message, discordClient, sendLog, pendingEmojiRequests) {
    if (!message.guild) return;

    if (isDisboardBumpDone(message)) {
        await handleDisboardReminder(message, discordClient);
        return;
    }

    if (message.author.bot) return;

    const handledEmoji = await handleEmojiUpload(message, discordClient, pendingEmojiRequests);
    if (handledEmoji) return;

    await handleMoneyGain(message);
}

module.exports = {
    handleMessage,
};