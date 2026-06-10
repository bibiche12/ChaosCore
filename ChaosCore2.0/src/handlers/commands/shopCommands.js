// ============================================================
// IMPORTS
// ============================================================

const config = require('../../config');

// ============================================================
// PERMISSIONS
// ============================================================

function hasTeamRole(member) {
    return member.roles.cache.some(
        role => role.name === config.TEAM_ROLE_NAME
    );
}

function requireTeam(interaction) {
    if (!hasTeamRole(interaction.member)) {
        interaction.reply({
            content: '❌ Tu n’as pas l’autorisation d’utiliser cette commande.',
            flags: 64,
        });

        return false;
    }

    return true;
}

// ============================================================
// HELPERS
// ============================================================

async function fetchShopChannel(discordClient) {
    return discordClient.channels
        .fetch(config.SHOP_CHANNEL_ID)
        .catch(() => null);
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

async function handleShopCommand(
    interaction,
    {
        discordClient,
        setupShop,
    }
) {
    if (interaction.commandName === 'setupboutique') {
        await handleSetupShopCommand(
            interaction,
            discordClient,
            setupShop
        );

        return true;
    }

    return false;
}

// ============================================================
// /SETUPBOUTIQUE
// ============================================================

async function handleSetupShopCommand(
    interaction,
    discordClient,
    setupShop
) {
    if (!requireTeam(interaction)) {
        return;
    }

    await interaction.deferReply({ flags: 64 });

    const shopChannel = await fetchShopChannel(discordClient);

    if (!shopChannel) {
        await interaction.editReply(
            '❌ Salon boutique introuvable.'
        );

        return;
    }

    await setupShop(shopChannel);

    await interaction.editReply(
        '✅ Boutique Oncle’Bich installée / mise à jour.'
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleShopCommand,
};