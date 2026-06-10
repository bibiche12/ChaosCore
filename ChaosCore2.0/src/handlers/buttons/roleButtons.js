// ============================================================
// IMPORTS
// ============================================================

const config = require('../../config');

// ============================================================
// CONFIGURATION DES AUTORÔLES
// ============================================================

const AUTOROLE_MAP = {
    // Pings
    autorole_ping_live: config.ROLE_PING_LIVE_ID,
    autorole_ping_game: config.ROLE_PING_GAME_ID,
    autorole_ping_programme: config.ROLE_PING_PROGRAMME_ID,

    // Jeux
    autorole_game_horreur: config.ROLE_GAME_HORREUR_ID,
    autorole_game_rpg: config.ROLE_GAME_RPG_ID,
    autorole_game_tir: config.ROLE_GAME_TIR_ID,
    autorole_game_sport: config.ROLE_GAME_SPORT_ID,

    // Plateformes
    autorole_platform_xbox: config.ROLE_XBOX_ID,
    autorole_platform_ps5: config.ROLE_PS5_ID,
    autorole_platform_pc: config.ROLE_PC_ID,
    autorole_platform_switch: config.ROLE_SWITCH_ID,
};

// ============================================================
// HELPERS
// ============================================================

async function replyEphemeral(interaction, content) {
    await interaction.reply({
        content,
        flags: 64,
    });
}

async function fetchMember(guild, userId) {
    return guild.members.fetch(userId).catch(() => null);
}

function getAutoroleId(customId) {
    return AUTOROLE_MAP[customId] || null;
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

async function handleRoleButton(interaction) {
    const { customId, user, guild } = interaction;

    const roleId = getAutoroleId(customId);

    if (!roleId) {
        return false;
    }

    const member = await fetchMember(guild, user.id);

    if (!member) {
        await replyEphemeral(interaction, '❌ Membre introuvable.');
        return true;
    }

    const role = guild.roles.cache.get(roleId);

    if (!role) {
        await replyEphemeral(
            interaction,
            '❌ Rôle introuvable. Vérifie la configuration.'
        );

        return true;
    }

    if (member.roles.cache.has(roleId)) {
        await removeRole(interaction, member, roleId, role);
        return true;
    }

    await addRole(interaction, member, roleId, role);
    return true;
}

// ============================================================
// AJOUT / RETRAIT RÔLE
// ============================================================

async function addRole(interaction, member, roleId, role) {
    await member.roles.add(roleId);

    await replyEphemeral(
        interaction,
        `✅ Rôle ajouté : **${role.name}**`
    );
}

async function removeRole(interaction, member, roleId, role) {
    await member.roles.remove(roleId);

    await replyEphemeral(
        interaction,
        `➖ Rôle retiré : **${role.name}**`
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleRoleButton,
};