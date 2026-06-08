const config = require('../../config');

function hasTeamRole(member) {
    return member.roles.cache.some(role => role.name === config.TEAM_ROLE_NAME);
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

async function handleShopCommand(
    interaction,
    {
        discordClient,
        setupShop,
    }
) {
    if (interaction.commandName === 'setupboutique') {
        if (!requireTeam(interaction)) return true;

        await interaction.deferReply({ flags: 64 });

        const shopChannel = await discordClient.channels
            .fetch(config.SHOP_CHANNEL_ID)
            .catch(() => null);

        if (!shopChannel) {
            await interaction.editReply(
                '❌ Salon boutique introuvable.'
            );

            return true;
        }

        await setupShop(shopChannel);

        await interaction.editReply(
            '✅ Boutique Oncle’Bich installée / mise à jour.'
        );

        return true;
    }

    return false;
}

module.exports = {
    handleShopCommand,
};