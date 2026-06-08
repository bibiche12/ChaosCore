const config = require('../../config');

async function handleRoleButton(interaction) {
    const { customId, user, guild } = interaction;

    const autoroleMap = {
        autorole_ping_live: config.ROLE_PING_LIVE_ID,
        autorole_ping_game: config.ROLE_PING_GAME_ID,
        autorole_ping_programme: config.ROLE_PING_PROGRAMME_ID,

        autorole_game_horreur: config.ROLE_GAME_HORREUR_ID,
        autorole_game_rpg: config.ROLE_GAME_RPG_ID,
        autorole_game_tir: config.ROLE_GAME_TIR_ID,
        autorole_game_sport: config.ROLE_GAME_SPORT_ID,

        autorole_platform_xbox: config.ROLE_XBOX_ID,
        autorole_platform_ps5: config.ROLE_PS5_ID,
        autorole_platform_pc: config.ROLE_PC_ID,
        autorole_platform_switch: config.ROLE_SWITCH_ID,
    };

    if (!autoroleMap[customId]) return false;

    const roleId = autoroleMap[customId];
    const member = await guild.members.fetch(user.id).catch(() => null);

    if (!member) {
        await interaction.reply({
            content: '❌ Membre introuvable.',
            flags: 64,
        });
        return true;
    }

    const role = guild.roles.cache.get(roleId);

    if (!role) {
        await interaction.reply({
            content: '❌ Rôle introuvable. Vérifie la configuration.',
            flags: 64,
        });
        return true;
    }

    if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);

        await interaction.reply({
            content: `➖ Rôle retiré : **${role.name}**`,
            flags: 64,
        });

        return true;
    }

    await member.roles.add(roleId);

    await interaction.reply({
        content: `✅ Rôle ajouté : **${role.name}**`,
        flags: 64,
    });

    return true;
}

module.exports = {
    handleRoleButton,
};