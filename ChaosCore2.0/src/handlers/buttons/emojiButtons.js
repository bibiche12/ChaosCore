const axios = require('axios');
const config = require('../../config');
const db = require('../../db/queries');

const pendingEmojiRequests = new Map();

async function handleEmojiButton(interaction) {
    const { customId, guild } = interaction;

    if (customId.startsWith('approve_emoji_')) {
        const requestId = customId.replace('approve_emoji_', '');
        const request = await db.getEmojiRequest(requestId);

        if (!request) {
            await interaction.reply({
                content: '❌ Demande d’emoji introuvable.',
                flags: 64,
            });
            return true;
        }

        if (request.status !== 'pending') {
            await interaction.reply({
                content: '❌ Cette demande a déjà été traitée.',
                flags: 64,
            });
            return true;
        }

        const userData = await db.getUserPoints(request.user_id);

if (userData.balance < config.SHOP_PRICES.emoji) {
    await db.updateEmojiRequestStatus(requestId, 'rejected');

    await interaction.reply({
        content: '❌ Solde insuffisant. Demande refusée automatiquement.',
        flags: 64,
    });

    return true;
}

const newBalance = await db.addPoints(
    request.user_id,
    -config.SHOP_PRICES.emoji
);

        const imageResponse = await axios.get(request.image_url, {
            responseType: 'arraybuffer',
        });

        const emoji = await guild.emojis.create({
            attachment: Buffer.from(imageResponse.data),
            name: request.emoji_name,
            reason: `Emoji personnalisé acheté par ${request.user_id}`,
        });

        await db.updateEmojiRequestStatus(requestId, 'approved');

        await interaction.message.edit({
            components: [],
        }).catch(() => null);

        await interaction.reply({
            content:
                `✅ Emoji créé avec succès !\n\n` +
                `👤 Membre : <@${request.user_id}>\n` +
                `🎨 Emoji : ${emoji}\n` +
                `💰 Débité : **${config.SHOP_PRICES.emoji} Bichcoins**`,
            flags: 64,
        });

        return true;
    }

    if (customId.startsWith('reject_emoji_')) {
        const requestId = customId.replace('reject_emoji_', '');
        const request = await db.getEmojiRequest(requestId);

        if (!request) {
            await interaction.reply({
                content: '❌ Demande d’emoji introuvable.',
                flags: 64,
            });
            return true;
        }

        await db.updateEmojiRequestStatus(requestId, 'rejected');

        await interaction.message.edit({
            components: [],
        }).catch(() => null);

        await interaction.reply({
            content: '❌ Demande d’emoji refusée.',
            flags: 64,
        });

        return true;
    }

    return false;
}

async function handleEmojiModal(interaction) {
    const { customId, user } = interaction;

    if (customId !== 'emoji_name_modal') return false;

    const emojiName = interaction.fields
        .getTextInputValue('emoji_name')
        .toLowerCase()
        .trim();

    if (!/^[a-z0-9_]{2,32}$/.test(emojiName)) {
        await interaction.reply({
            content:
                '❌ Nom d’emoji invalide. Utilise uniquement lettres minuscules, chiffres et underscores.',
            flags: 64,
        });

        return true;
    }

    pendingEmojiRequests.set(user.id, {
        emojiName,
        price: config.SHOP_PRICES.emoji,
    });

    await interaction.reply({
        content:
            `🎨 Emoji demandé : **:${emojiName}:**\n\n` +
            `Maintenant, envoie l’image de ton emoji dans ce salon.\n` +
            `⚠️ La Team validera la demande avant création.`,
        flags: 64,
    });

    return true;
}

module.exports = {
    handleEmojiButton,
    handleEmojiModal,
    pendingEmojiRequests,
};