const config = require('../../config');
const db = require('../../db/queries');
const { requireTeam, checkCommandEnabled } = require('../../utils/guildSettings');

async function handleShopCommand(interaction, { discordClient, setupShop }) {
    if (interaction.commandName === 'setupboutique') {
        await handleSetupShopCommand(interaction, discordClient, setupShop);
        return true;
    }
    return false;
}

async function handleSetupShopCommand(interaction, discordClient, setupShop) {
    if (!await checkCommandEnabled(interaction, 'shop', 'setupboutique')) return;
    if (!await requireTeam(interaction)) return;

    await interaction.deferReply({ flags: 64 });

    const guildId = interaction.guildId;

    // Lire le salon boutique depuis server_settings ou config
    const serverSettings = await db.getServerSettings(guildId).catch(() => null);
    const shopChannelId = serverSettings?.shop_channel_id || config.SHOP_CHANNEL_ID;

    const shopChannel = await discordClient.channels.fetch(shopChannelId).catch(() => null);

    if (!shopChannel) {
        await interaction.editReply('❌ Salon boutique introuvable. Configure-le dans le dashboard.');
        return;
    }

    await setupShop(shopChannel, guildId);
    await interaction.editReply("✅ Boutique installée / mise à jour.");
}

module.exports = { handleShopCommand };