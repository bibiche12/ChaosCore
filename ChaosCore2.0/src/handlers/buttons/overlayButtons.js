const db = require('../../db/queries');

async function handleOverlayButton(interaction) {
    const { customId, user } = interaction;

    if (customId.startsWith('complete_overlay_')) {
        const eventId = customId.replace('complete_overlay_', '');

        const event = await db.completeChannelPointEvent(eventId, user.id);

        if (!event) {
            await interaction.reply({
                content: '❌ Gage introuvable.',
                flags: 64,
            });
            return true;
        }

        await interaction.message.edit({
            content:
                `✅ **Gage effectué**\n\n` +
                `📺 Viewer : **${event.twitch_name}**\n` +
                `🎁 Récompense : **${event.reward_name}**\n` +
                `📝 Texte : ${event.user_input || 'Aucun texte'}\n\n` +
                `✅ Validé par : ${user}`,
            components: [],
        });

        await interaction.reply({
            content: '✅ Gage marqué comme effectué.\nIl disparaîtra de la bannière.',
            flags: 64,
        });

        return true;
    }

    if (customId.startsWith('complete_shop_gage_')) {
        const eventId = customId.replace('complete_shop_gage_', '');

        const event = await db.getShopRequest(eventId);

        if (!event) {
            await interaction.reply({
                content: '❌ Gage boutique introuvable.',
                flags: 64,
            });
            return true;
        }

        await db.completeShopRequest(eventId);

        await interaction.message.edit({
            content:
                interaction.message.content +
                `\n\n✅ Gage boutique effectué par ${user}`,
            components: [],
        }).catch(() => null);

        await interaction.reply({
            content: '✅ Gage boutique marqué comme effectué.\nIl disparaîtra de la bannière.',
            flags: 64,
        });

        return true;
    }

    return false;
}

module.exports = { handleOverlayButton };