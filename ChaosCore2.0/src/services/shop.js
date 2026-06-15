const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const config = require('../config');
const db = require('../db/queries');

function buildBuyButton(customId, label, emoji) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(customId).setLabel(label).setEmoji(emoji).setStyle(ButtonStyle.Primary)
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

async function getShopSettings(guildId) {
    const moduleSettings = await db.getModuleSettings(guildId, 'shop').catch(() => null);
    const serverSettings = await db.getServerSettings(guildId).catch(() => null);
    return { moduleSettings, serverSettings };
}

async function setupShop(shopChannel, guildId) {
    const { moduleSettings } = await getShopSettings(guildId);

    const moneyName = config.MONEY_NAME;

    await shopChannel.send({
        content:
            `🏦 **${moduleSettings?.module_name || 'Magasin'}**\n\n` +
            `Bienvenue dans la boutique officielle des **${moneyName}s**.\n` +
            `Clique sur les boutons pour faire une demande d'achat.`,
    });

    await shopChannel.send({
        content:
            `🎨 **Emoji personnalisé**\n\n` +
            `💰 Prix : **${config.SHOP_PRICES.emoji} ${moneyName}s**\n` +
            `📌 Validation : manuelle\n` +
            `📎 Image à fournir après la demande`,
        components: [buildBuyButton('shop_buy_emoji', 'Acheter', '🛒')],
    });

    await shopChannel.send({
        content:
            `👑 **Rôle temporaire personnalisé**\n\n` +
            `💰 1 semaine : **${config.SHOP_PRICES.role[7]} ${moneyName}s**\n` +
            `💰 2 semaines : **${config.SHOP_PRICES.role[14]} ${moneyName}s**\n` +
            `💰 1 mois : **${config.SHOP_PRICES.role[30]} ${moneyName}s**\n\n` +
            `🎨 Couleurs disponibles : Rouge, Orange, Jaune, Vert, Bleu, Violet, Rose, Noir, Blanc, Marron`,
        components: [buildBuyButton('shop_buy_role', 'Acheter', '🛒')],
    });

    await shopChannel.send({
        content:
            `😈 **Gage imposé**\n\n` +
            `💰 Prix : **${config.SHOP_PRICES.gage} ${moneyName}s**\n` +
            `📌 Validation : manuelle`,
        components: [buildBuyButton('shop_buy_gage', 'Acheter', '🛒')],
    });

    await shopChannel.send({
        content:
            `📢 **Phrase épinglée sur le live**\n\n` +
            `💰 1 live : **${config.SHOP_PRICES.phrase[1]} ${moneyName}s**\n` +
            `💰 2 lives : **${config.SHOP_PRICES.phrase[2]} ${moneyName}s**\n` +
            `📌 Validation : manuelle`,
        components: [buildBuyButton('shop_buy_phrase', 'Acheter', '🛒')],
    });
}

async function processLivePhrases(discordClient, guildId) {
    const updatedPhrases = await db.decrementLivePhrases(guildId);
    if (!updatedPhrases || updatedPhrases.length === 0) return;

    // Lire le salon de log depuis server_settings
    const serverSettings = await db.getServerSettings(guildId).catch(() => null);
    const logChannelId = serverSettings?.log_channel_id || config.LOG_CHANNEL_ID;
    const logChannel = await discordClient.channels.fetch(logChannelId).catch(() => null);

    for (const phrase of updatedPhrases) {
        if (!logChannel) continue;
        const phraseText = parsePhraseContent(phrase.content);

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

module.exports = { setupShop, processLivePhrases };