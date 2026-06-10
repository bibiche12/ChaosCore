const config = require('../../config');
const db = require('../../db/queries');

async function handleModerationButton(interaction) {
    const { customId, guild } = interaction;

    if (!customId.startsWith('warning_resolve_') && !customId.startsWith('warning_kick_')) {
        return false;
    }

    await interaction.deferReply({ flags: 64 });

    const isModerator = interaction.member.roles.cache.has(config.MODERATOR_ROLE_ID);
    const isTeam = interaction.member.roles.cache.some(role => role.name === config.TEAM_ROLE_NAME);

    if (!isModerator && !isTeam) {
        await interaction.editReply({
            content: '❌ Tu n’as pas l’autorisation d’utiliser ce bouton.',
        });
        return true;
    }

    if (customId.startsWith('warning_resolve_')) {
        const userId = customId.replace('warning_resolve_', '');
        const member = await guild.members.fetch(userId).catch(() => null);

        if (!member) {
            await interaction.editReply({
                content: '❌ Membre introuvable.',
            });
            return true;
        }

        await member.roles.remove(config.WARNING_ROLE_ID).catch(() => null);
await member.roles.add(config.ROLE_MEMBRE_ID).catch(() => null);
await db.resolveWarnings(guild.id, userId);

        await interaction.message.edit({
            content:
                interaction.message.content +
                `\n\n✅ **Dossier résolu par ${interaction.user}.**\n` +
                `Le rôle Warning a été retiré.`,
            components: [],
        }).catch(() => null);

        await interaction.editReply({
            content: `✅ ${member} a retrouvé l’accès au serveur.`,
        });

        return true;
    }

    if (customId.startsWith('warning_kick_')) {
        const userId = customId.replace('warning_kick_', '');
        const member = await guild.members.fetch(userId).catch(() => null);

        if (!member) {
            await interaction.editReply({
                content: '❌ Membre introuvable.',
            });
            return true;
        }

        await db.resolveWarnings(guild.id, userId);

        const kickedTag = member.user.tag;

        const kicked = await member
            .kick(`Warnings non résolus - décision modération par ${interaction.user.tag}`)
            .then(() => true)
            .catch(() => false);

        if (!kicked) {
            await interaction.editReply({
                content: '❌ Impossible d’exclure ce membre. Vérifie que le rôle ChaosCore est au-dessus de son rôle.',
            });
            return true;
        }

        await interaction.message.edit({
            content:
                interaction.message.content +
                `\n\n❌ **Membre exclu par ${interaction.user}.**`,
            components: [],
        }).catch(() => null);

        await interaction.editReply({
            content: `❌ ${kickedTag} a été exclu du serveur.`,
        });

        return true;
    }

    return false;
}

module.exports = {
    handleModerationButton,
};