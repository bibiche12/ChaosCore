const config = require('../../config');
const db = require('../../db/queries');
const { hasModeratorPower } = require('../../utils/guildSettings');

async function getTargetMember(guild, userId) {
    return guild.members.fetch(userId).catch(() => null);
}

async function disableModerationMessage(interaction, content) {
    await interaction.message.edit({ content, components: [] }).catch(() => null);
}

async function handleModerationButton(interaction) {
    const { customId, guild } = interaction;

    if (!customId.startsWith('warning_resolve_') && !customId.startsWith('warning_kick_')) {
        return false;
    }

    await interaction.deferReply({ flags: 64 });

    if (!await hasModeratorPower(interaction.member)) {
        await interaction.editReply({ content: "❌ Tu n'as pas l'autorisation d'utiliser ce bouton." });
        return true;
    }

    if (customId.startsWith('warning_resolve_')) { await handleWarningResolve(interaction, guild); return true; }
    if (customId.startsWith('warning_kick_')) { await handleWarningKick(interaction, guild); return true; }

    return false;
}

async function handleWarningResolve(interaction, guild) {
    const userId = interaction.customId.replace('warning_resolve_', '');
    const member = await getTargetMember(guild, userId);

    if (!member) { await interaction.editReply({ content: '❌ Membre introuvable.' }); return; }

    // Lire depuis guild_module_settings security d'abord, sinon server_settings, sinon config
    const securitySettings = await db.getModuleSettings(guild.id, 'security').catch(() => null);
    const serverSettings = await db.getServerSettings(guild.id).catch(() => null);

    const warningRoleId = securitySettings?.warning_role_id
        || serverSettings?.warning_role_id
        || config.WARNING_ROLE_ID;

    const memberRoleId = serverSettings?.member_role_id || config.ROLE_MEMBRE_ID;

    await member.roles.remove(warningRoleId).catch(() => null);
    await member.roles.add(memberRoleId).catch(() => null);
    await db.resolveWarnings(guild.id, userId);

    await disableModerationMessage(
        interaction,
        interaction.message.content +
            `\n\n✅ **Dossier résolu par ${interaction.user}.**\n` +
            `Le rôle Warning a été retiré.`
    );

    await interaction.editReply({ content: `✅ ${member} a retrouvé l'accès au serveur.` });
}

async function handleWarningKick(interaction, guild) {
    const userId = interaction.customId.replace('warning_kick_', '');
    const member = await getTargetMember(guild, userId);

    if (!member) { await interaction.editReply({ content: '❌ Membre introuvable.' }); return; }

    await db.resolveWarnings(guild.id, userId);

    const kickedTag = member.user.tag;

    const kicked = await member
        .kick(`Warnings non résolus - décision modération par ${interaction.user.tag}`)
        .then(() => true)
        .catch(() => false);

    if (!kicked) {
        await interaction.editReply({
            content: "❌ Impossible d'exclure ce membre. Vérifie que le rôle ChaosCore est au-dessus de son rôle.",
        });
        return;
    }

    await disableModerationMessage(
        interaction,
        interaction.message.content + `\n\n❌ **Membre exclu par ${interaction.user}.**`
    );

    await interaction.editReply({ content: `❌ ${kickedTag} a été exclu du serveur.` });
}

module.exports = { handleModerationButton };