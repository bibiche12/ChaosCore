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

// Fusionne les prix configurés en DB (dashboard) avec les valeurs par défaut.
// Auparavant config.SHOP_PRICES était utilisé tel quel partout, donc toute
// modification de prix dans le dashboard n'avait aucun effet sur le bot.
function resolveShopPrices(moduleSettings) {
    const dbPrices = moduleSettings?.shop_prices || {};
    return {
        emoji: dbPrices.emoji ?? config.SHOP_PRICES.emoji,
        gage: dbPrices.gage ?? config.SHOP_PRICES.gage,
        phrase: {
            1: dbPrices.phrase?.[1] ?? config.SHOP_PRICES.phrase[1],
            2: dbPrices.phrase?.[2] ?? config.SHOP_PRICES.phrase[2],
        },
        role: {
            7: dbPrices.role?.[7] ?? config.SHOP_PRICES.role[7],
            14: dbPrices.role?.[14] ?? config.SHOP_PRICES.role[14],
            30: dbPrices.role?.[30] ?? config.SHOP_PRICES.role[30],
        },
    };
}

async function setupShop(shopChannel, guildId) {
    const { moduleSettings, serverSettings } = await getShopSettings(guildId);

    const economySettings = await db.getModuleSettings(guildId, 'economy').catch(() => null);
    const moneyName = economySettings?.currency_singular || config.MONEY_NAME;
    const prices = resolveShopPrices(moduleSettings);

    await shopChannel.send({
        content:
            `🏦 **${moduleSettings?.module_name || 'Magasin'}**\n\n` +
            `Bienvenue dans la boutique officielle des **${moneyName}s**.\n` +
            `Clique sur les boutons pour faire une demande d'achat.`,
    });

    await shopChannel.send({
        content:
            `🎨 **Emoji personnalisé**\n\n` +
            `💰 Prix : **${prices.emoji} ${moneyName}s**\n` +
            `📌 Validation : manuelle\n` +
            `📎 Image à fournir après la demande`,
        components: [buildBuyButton('shop_buy_emoji', 'Acheter', '🛒')],
    });

    await shopChannel.send({
        content:
            `👑 **Rôle temporaire personnalisé**\n\n` +
            `💰 1 semaine : **${prices.role[7]} ${moneyName}s**\n` +
            `💰 2 semaines : **${prices.role[14]} ${moneyName}s**\n` +
            `💰 1 mois : **${prices.role[30]} ${moneyName}s**\n\n` +
            `🎨 Couleurs disponibles : Rouge, Orange, Jaune, Vert, Bleu, Violet, Rose, Noir, Blanc, Marron`,
        components: [buildBuyButton('shop_buy_role', 'Acheter', '🛒')],
    });

    await shopChannel.send({
        content:
            `😈 **Gage imposé**\n\n` +
            `💰 Prix : **${prices.gage} ${moneyName}s**\n` +
            `📌 Validation : manuelle`,
        components: [buildBuyButton('shop_buy_gage', 'Acheter', '🛒')],
    });

    await shopChannel.send({
        content:
            `📢 **Phrase épinglée sur le live**\n\n` +
            `💰 1 live : **${prices.phrase[1]} ${moneyName}s**\n` +
            `💰 2 lives : **${prices.phrase[2]} ${moneyName}s**\n` +
            `📌 Validation : manuelle`,
        components: [buildBuyButton('shop_buy_phrase', 'Acheter', '🛒')],
    });

    // Articles personnalisés ajoutés depuis le dashboard (Magasin → Items).
    // Ces articles n'ont pas de bouton d'achat dédié (le système de demandes
    // est propre aux 4 types ci-dessus) — ils sont affichés à titre indicatif
    // pour que les membres connaissent les offres spécifiques du serveur,
    // à acheter via /demande comme une demande générique.
    const customItems = await db.getActiveShopItems(guildId).catch(() => []);
    if (customItems.length > 0) {
        const lines = customItems.map(item =>
            `**${item.name}** (${item.type}) — 💰 ${item.price} ${moneyName}s${item.description ? `\n${item.description}` : ''}`
        );
        await shopChannel.send({
            content:
                `📦 **Articles supplémentaires du serveur**\n\n` +
                lines.join('\n\n') +
                `\n\n📌 Utilise \`/demande\` pour faire une demande sur l'un de ces articles.`,
        });
    }
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

module.exports = { setupShop, processLivePhrases, resolveShopPrices };