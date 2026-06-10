// ============================================================
// IMPORTS
// ============================================================

const db = require('../../db/queries');

// ============================================================
// HELPERS
// ============================================================

async function replyEphemeral(interaction, content) {
    await interaction.reply({
        content,
        flags: 64,
    });
}

async function disableButtonMessage(interaction, content) {
    await interaction.message.edit({
        content,
        components: [],
    }).catch(() => null);
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

async function handleOverlayButton(interaction) {
    const { customId } = interaction;

    if (customId.startsWith('complete_overlay_')) {
        await handleCompleteTwitchOverlay(interaction);
        return true;
    }

    if (customId.startsWith('complete_shop_gage_')) {
        await handleCompleteShopGage(interaction);
        return true;
    }

    return false;
}

// ============================================================
// GAGE TWITCH / POINTS DE CHAÎNE
// ============================================================

async function handleCompleteTwitchOverlay(interaction) {
    const eventId = interaction.customId.replace('complete_overlay_', '');
    const event = await db.completeChannelPointEvent(
        eventId,
        interaction.user.id
    );

    if (!event) {
        await replyEphemeral(interaction, '❌ Gage introuvable.');
        return;
    }

    await disableButtonMessage(
        interaction,
        `✅ **Gage effectué**\n\n` +
        `📺 Viewer : **${event.twitch_name}**\n` +
        `🎁 Récompense : **${event.reward_name}**\n` +
        `📝 Texte : ${event.user_input || 'Aucun texte'}\n\n` +
        `✅ Validé par : ${interaction.user}`
    );

    await replyEphemeral(
        interaction,
        '✅ Gage marqué comme effectué.\nIl disparaîtra de la bannière.'
    );
}

// ============================================================
// GAGE BOUTIQUE
// ============================================================

async function handleCompleteShopGage(interaction) {
    const requestId = interaction.customId.replace('complete_shop_gage_', '');
    const request = await db.getShopRequest(requestId);

    if (!request) {
        await replyEphemeral(interaction, '❌ Gage boutique introuvable.');
        return;
    }

    await db.completeShopRequest(requestId);

    await disableButtonMessage(
        interaction,
        interaction.message.content +
            `\n\n✅ Gage boutique effectué par ${interaction.user}`
    );

    await replyEphemeral(
        interaction,
        '✅ Gage boutique marqué comme effectué.\nIl disparaîtra de la bannière.'
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleOverlayButton,
};