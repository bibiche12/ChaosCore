const axios = require('axios');
const config = require('../../config');
const db = require('../../db/queries');

const pendingEmojiRequests = new Map();

function isValidEmojiName(name) {
    return /^[a-z0-9_]{2,32}$/.test(name);
}

async function deferEphemeral(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: 64 });
    }
}

async function replyEphemeral(interaction, content) {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content });
        return;
    }
    await interaction.reply({ content, flags: 64 });
}

async function handleEmojiButton(interaction) {
    const { customId, guild } = interaction;
    if (customId.startsWith('approve_emoji_')) { await handleApproveEmoji(interaction, guild); return true; }
    if (customId.startsWith('reject_emoji_')) { await handleRejectEmoji(interaction); return true; }
    return false;
}

async function handleApproveEmoji(interaction, guild) {
    await deferEphemeral(interaction);
    const requestId = interaction.customId.replace('approve_emoji_', '');
    const request = await db.getEmojiRequest(requestId);

    if (!request) { await replyEphemeral(interaction, "❌ Demande d'emoji introuvable."); return; }
    if (request.status !== 'pending') { await replyEphemeral(interaction, '❌ Cette demande a déjà été traitée.'); return; }

    // Lire le solde avec guild_id
    const guildId = interaction.guildId;
    const userData = await db.getUserPoints(guildId, request.user_id);

    if (userData.balance < config.SHOP_PRICES.emoji) {
        await db.updateEmojiRequestStatus(requestId, 'rejected');
        await replyEphemeral(interaction, '❌ Solde insuffisant. Demande refusée automatiquement.');
        return;
    }

    await db.addPoints(guildId, request.user_id, -config.SHOP_PRICES.emoji);

    const imageResponse = await axios.get(request.image_url, { responseType: 'arraybuffer' });
    const emoji = await guild.emojis.create({
        attachment: Buffer.from(imageResponse.data),
        name: request.emoji_name,
        reason: `Emoji personnalisé acheté par ${request.user_id}`,
    });

    await db.updateEmojiRequestStatus(requestId, 'approved');
    await interaction.message.edit({ components: [] }).catch(() => null);

    await replyEphemeral(interaction,
        `✅ Emoji créé avec succès !\n\n` +
        `👤 Membre : <@${request.user_id}>\n` +
        `🎨 Emoji : ${emoji}\n` +
        `💰 Débité : **${config.SHOP_PRICES.emoji} ${config.MONEY_NAME}s**`
    );
}

async function handleRejectEmoji(interaction) {
    const requestId = interaction.customId.replace('reject_emoji_', '');
    const request = await db.getEmojiRequest(requestId);
    if (!request) { await replyEphemeral(interaction, "❌ Demande d'emoji introuvable."); return; }
    await db.updateEmojiRequestStatus(requestId, 'rejected');
    await interaction.message.edit({ components: [] }).catch(() => null);
    await replyEphemeral(interaction, "❌ Demande d'emoji refusée.");
}

async function handleEmojiModal(interaction) {
    const { customId, user } = interaction;
    if (customId !== 'emoji_name_modal') return false;

    const emojiName = interaction.fields.getTextInputValue('emoji_name').toLowerCase().trim();
    if (!isValidEmojiName(emojiName)) {
        await replyEphemeral(interaction, "❌ Nom d'emoji invalide. Utilise uniquement lettres minuscules, chiffres et underscores.");
        return true;
    }

    pendingEmojiRequests.set(user.id, { emojiName, price: config.SHOP_PRICES.emoji });

    await replyEphemeral(interaction,
        `🎨 Emoji demandé : **:${emojiName}:**\n\n` +
        `Maintenant, envoie l'image de ton emoji dans ce salon.\n` +
        `⚠️ La Team validera la demande avant création.`
    );

    return true;
}

module.exports = { handleEmojiButton, handleEmojiModal, pendingEmojiRequests };