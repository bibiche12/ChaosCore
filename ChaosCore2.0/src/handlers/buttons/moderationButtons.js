// ============================================================
// IMPORTS
// ============================================================

const config = require('../../config');
const db = require('../../db/queries');

// ============================================================
// HELPERS
// ============================================================

function hasModeratorPermission(member) {
    const isModerator = member.roles.cache.has(config.MODERATOR_ROLE_ID);
    const isTeam = member.roles.cache.some(
        role => role.name === config.TEAM_ROLE_NAME
    );

    return isModerator || isTeam;
}

async function getTargetMember(guild, userId) {
    return guild.members.fetch(userId).catch(() => null);
}

async function disableModerationMessage(interaction, content) {
    await interaction.message.edit({
        content,
        components: [],
    }).catch(() => null);
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

async function handleModerationButton(interaction) {
    const { customId, guild } = interaction;

    if (
        !customId.startsWith('warning_resolve_') &&
        !customId.startsWith('warning_kick_')
    ) {
        return false;
    }

    await interaction.deferReply({ flags: 64 });

    if (!hasModeratorPermission(interaction.member)) {
        await interaction.editReply({
            content: "❌ Tu n'as pas l'autorisation d'utiliser ce bouton.",
        });

        return true;
    }

    if (customId.startsWith('warning_resolve_')) {
        await handleWarningResolve(interaction, guild);
        return true;
    }

    if (customId.startsWith('warning_kick_')) {
        await handleWarningKick(interaction, guild);
        return true;
    }

    return false;
}

// ============================================================
// BOUTON : RÉSOLU
// ============================================================

async function handleWarningResolve(interaction, guild) {
    const userId = interaction.customId.replace('warning_resolve_', '');
    const member = await getTargetMember(guild, userId);

    if (!member) {
        await interaction.editReply({
            content: '❌ Membre introuvable.',
        });

        return;
    }

    await member.roles.remove(config.WARNING_ROLE_ID).catch(() => null);
    await member.roles.add(config.ROLE_MEMBRE_ID).catch(() => null);
    await db.resolveWarnings(guild.id, userId);

    await disableModerationMessage(
        interaction,
        interaction.message.content +
            `\n\n✅ **Dossier résolu par ${interaction.user}.**\n` +
            `Le rôle Warning a été retiré.`
    );

    await interaction.editReply({
        content: `✅ ${member} a retrouvé l'accès au serveur.`,
    });
}

// ============================================================
// BOUTON : EXCLURE
// ============================================================

async function handleWarningKick(interaction, guild) {
    const userId = interaction.customId.replace('warning_kick_', '');
    const member = await getTargetMember(guild, userId);

    if (!member) {
        await interaction.editReply({
            content: '❌ Membre introuvable.',
        });

        return;
    }

    await db.resolveWarnings(guild.id, userId);

    const kickedTag = member.user.tag;

    const kicked = await member
        .kick(`Warnings non résolus - décision modération par ${interaction.user.tag}`)
        .then(() => true)
        .catch(() => false);

    if (!kicked) {
        await interaction.editReply({
            content:
                "❌ Impossible d'exclure ce membre. " +
                'Vérifie que le rôle ChaosCore est au-dessus de son rôle.',
        });

        return;
    }

    await disableModerationMessage(
        interaction,
        interaction.message.content +
            `\n\n❌ **Membre exclu par ${interaction.user}.**`
    );

    await interaction.editReply({
        content: `❌ ${kickedTag} a été exclu du serveur.`,
    });
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleModerationButton,
};