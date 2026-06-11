// ============================================================
// IMPORTS
// ============================================================

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const config = require('../config');
const db = require('../db/queries');

// ============================================================
// HELPERS
// ============================================================

function buildBuyButton(customId, label, emoji) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(customId)
            .setLabel(label)
            .setEmoji(emoji)
            .setStyle(ButtonStyle.Primary)
    );
}

function parsePhraseContent(content) {
    try {
        const data = JSON.parse(content);
        return data.text || content;
    } catch {
        return content;
    }
}

async function fetchLogChannel(discordClient) {
    return discordClient.channels
        .fetch(config.LOG_CHANNEL_ID)
        .catch(() => null);
}

// ============================================================
// INSTALLATION BOUTIQUE
// ============================================================

async function setupShop(shopChannel) {
    await sendShopIntro(shopChannel);
    await sendEmojiShopItem(shopChannel);
    await sendRoleShopItem(shopChannel);
    await sendGageShopItem(shopChannel);
    await sendPhraseShopItem(shopChannel);
}

async function sendShopIntro(shopChannel) {
    await shopChannel.send({
        content:
            `🏦 **Boutique Oncle'Bich**\n\n` +
            `Bienvenue dans la boutique officielle des **${config.MONEY_NAME}s**.\n` +
            `Clique sur les boutons pour faire une demande d'achat.`,
    });
}

async function sendEmojiShopItem(shopChannel) {
    await shopChannel.send({
        content:
            `🎨 **Emoji personnalisé**\n\n` +
            `💰 Prix : **${config.SHOP_PRICES.emoji} ${config.MONEY_NAME}s**\n` +
            `📌 Validation : manuelle\n` +
            `📎 Image à fournir après la demande`,
        components: [
            buildBuyButton('shop_buy_emoji', 'Acheter', '🛒'),
        ],
    });
}

async function sendRoleShopItem(shopChannel) {
    await shopChannel.send({
        content:
            `👑 **Rôle temporaire personnalisé**\n\n` +
            `💰 1 semaine : **${config.SHOP_PRICES.role[7]} ${config.MONEY_NAME}s**\n` +
            `💰 2 semaines : **${config.SHOP_PRICES.role[14]} ${config.MONEY_NAME}s**\n` +
            `💰 1 mois : **${config.SHOP_PRICES.role[30]} ${config.MONEY_NAME}s**\n\n` +
            `🎨 Couleurs disponibles : Rouge, Orange, Jaune, Vert, Bleu, Violet, Rose, Noir, Blanc, Marron`,
        components: [
            buildBuyButton('shop_buy_role', 'Acheter', '🛒'),
        ],
    });
}

async function sendGageShopItem(shopChannel) {
    await shopChannel.send({
        content:
            `😈 **Gage imposé**\n\n` +
            `💰 Prix : **${config.SHOP_PRICES.gage} ${config.MONEY_NAME}s**\n` +
            `📌 Validation : manuelle`,
        components: [
            buildBuyButton('shop_buy_gage', 'Acheter', '🛒'),
        ],
    });
}

async function sendPhraseShopItem(shopChannel) {
    await shopChannel.send({
        content:
            `📢 **Phrase épinglée sur le live**\n\n` +
            `💰 1 live : **${config.SHOP_PRICES.phrase[1]} ${config.MONEY_NAME}s**\n` +
            `💰 2 lives : **${config.SHOP_PRICES.phrase[2]} ${config.MONEY_NAME}s**\n` +
            `📌 Validation : manuelle`,
        components: [
            buildBuyButton('shop_buy_phrase', 'Acheter', '🛒'),
        ],
    });
}

// ============================================================
// PHRASES LIVE
// ============================================================

async function processLivePhrases(discordClient) {
    const updatedPhrases = await db.decrementLivePhrases();

    if (!updatedPhrases || updatedPhrases.length === 0) {
        return;
    }

    const logChannel = await fetchLogChannel(discordClient);

    for (const phrase of updatedPhrases) {
        await sendPhraseUpdateLog(logChannel, phrase);
    }
}

async function sendPhraseUpdateLog(logChannel, phrase) {
    if (!logChannel) {
        return;
    }

    const phraseText = parsePhraseContent(phrase.content);

    if (phrase.completed) {
        await logChannel.send(
            `📢 **Phrase live terminée**\n\n` +
            `👤 Membre : <@${phrase.user_id}>\n` +
            `📝 Phrase : ${phraseText}`
        ).catch(() => null);

        return;
    }

    await logChannel.send(
        `📢 **Phrase live décrémentée**\n\n` +
        `👤 Membre : <@${phrase.user_id}>\n` +
        `📝 Phrase : ${phraseText}\n` +
        `📺 Lives restants : **${phrase.lives_remaining}**`
    ).catch(() => null);
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    setupShop,
    processLivePhrases,
};