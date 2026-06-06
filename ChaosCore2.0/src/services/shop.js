const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const config = require('../config');
const db = require('../db/queries');

function buildBuyButton(customId, label, emoji) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(customId)
            .setLabel(label)
            .setEmoji(emoji)
            .setStyle(ButtonStyle.Primary)
    );
}

async function setupShop(shopChannel) {
    await shopChannel.send({
        content:
            `🏦 **Boutique Oncle'Bich**\n\n` +
            `Bienvenue dans la boutique officielle des **${config.MONEY_NAME}s**.\n` +
            `Clique sur les boutons pour faire une demande d’achat.`,
    });

    await shopChannel.send({
        content:
            `🎨 **Emoji personnalisé**\n\n` +
            `💰 Prix : **${config.SHOP_PRICES.emoji} ${config.MONEY_NAME}s**\n` +
            `📌 Validation : manuelle\n` +
            `📎 Image à fournir après la demande`,
        components: [buildBuyButton('shop_buy_emoji', 'Acheter', '🛒')],
    });

    await shopChannel.send({
        content:
            `👑 **Rôle temporaire personnalisé**\n\n` +
            `💰 1 semaine : **${config.SHOP_PRICES.role[7]} ${config.MONEY_NAME}s**\n` +
            `💰 2 semaines : **${config.SHOP_PRICES.role[14]} ${config.MONEY_NAME}s**\n` +
            `💰 1 mois : **${config.SHOP_PRICES.role[30]} ${config.MONEY_NAME}s**\n\n` +
            `🎨 Couleurs disponibles : Rouge, Orange, Jaune, Vert, Bleu, Violet, Rose, Noir, Blanc, Marron`,
        components: [buildBuyButton('shop_buy_role', 'Acheter', '🛒')],
    });

    await shopChannel.send({
        content:
            `😈 **Gage imposé**\n\n` +
            `💰 Prix : **${config.SHOP_PRICES.gage} ${config.MONEY_NAME}s**\n` +
            `📌 Validation : manuelle`,
        components: [buildBuyButton('shop_buy_gage', 'Acheter', '🛒')],
    });

    await shopChannel.send({
        content:
            `📢 **Phrase épinglée sur le live**\n\n` +
            `💰 1 live : **${config.SHOP_PRICES.phrase[1]} ${config.MONEY_NAME}s**\n` +
            `💰 2 lives : **${config.SHOP_PRICES.phrase[2]} ${config.MONEY_NAME}s**\n` +
            `📌 Validation : manuelle`,
        components: [buildBuyButton('shop_buy_phrase', 'Acheter', '🛒')],
    });
}

async function processLivePhrases(discordClient) {
    const updatedPhrases = await db.decrementLivePhrases();

    if (!updatedPhrases || updatedPhrases.length === 0) return;

    const logChannel = await discordClient.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);

    for (const phrase of updatedPhrases) {
        let phraseText = phrase.content;

        try {
            const data = JSON.parse(phrase.content);
            phraseText = data.text || phrase.content;
        } catch {}

        if (logChannel) {
            if (phrase.completed) {
                await logChannel.send(
                    `📢 **Phrase live terminée**\n\n` +
                    `👤 Membre : <@${phrase.user_id}>\n` +
                    `📝 Phrase : ${phraseText}`
                ).catch(() => null);
            } else {
                await logChannel.send(
                    `📢 **Phrase live décrémentée**\n\n` +
                    `👤 Membre : <@${phrase.user_id}>\n` +
                    `📝 Phrase : ${phraseText}\n` +
                    `📺 Lives restants : **${phrase.lives_remaining}**`
                ).catch(() => null);
            }
        }
    }
}

module.exports = {
    setupShop,
    processLivePhrases,
};