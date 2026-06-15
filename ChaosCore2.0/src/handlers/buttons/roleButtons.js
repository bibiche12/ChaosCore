const config = require('../../config');
const db = require('../../db/queries');

// Rôles statiques en fallback si pas configurés dans le dashboard
const STATIC_AUTOROLE_MAP = {
    autorole_ping_live:      config.ROLE_PING_LIVE_ID,
    autorole_ping_game:      config.ROLE_PING_GAME_ID,
    autorole_ping_programme: config.ROLE_PING_PROGRAMME_ID,
    autorole_game_horreur:   config.ROLE_GAME_HORREUR_ID,
    autorole_game_rpg:       config.ROLE_GAME_RPG_ID,
    autorole_game_tir:       config.ROLE_GAME_TIR_ID,
    autorole_game_sport:     config.ROLE_GAME_SPORT_ID,
    autorole_platform_xbox:  config.ROLE_XBOX_ID,
    autorole_platform_ps5:   config.ROLE_PS5_ID,
    autorole_platform_pc:    config.ROLE_PC_ID,
    autorole_platform_switch: config.ROLE_SWITCH_ID,
};

async function handleRoleButton(interaction) {
    const { customId, user, guild } = interaction;

    // Vérifier d'abord les autorôles configurés via le dashboard (autorole_roles table)
    // Le customId pour les autorôles du dashboard est de la forme : autorole_db_ROLE_ID
    if (customId.startsWith('autorole_db_')) {
        await interaction.deferReply({ flags: 64 });
        const roleId = customId.replace('autorole_db_', '');
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) { await interaction.editReply({ content: '❌ Membre introuvable.' }); return true; }
        const role = guild.roles.cache.get(roleId);
        if (!role) { await interaction.editReply({ content: '❌ Rôle introuvable.' }); return true; }
        if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId).catch(() => null);
            await interaction.editReply({ content: `➖ Rôle retiré : **${role.name}**` });
        } else {
            await member.roles.add(roleId).catch(() => null);
            await interaction.editReply({ content: `✅ Rôle ajouté : **${role.name}**` });
        }
        return true;
    }

    // Fallback sur les autorôles statiques
    const roleId = STATIC_AUTOROLE_MAP[customId];
    if (!roleId) return false;

    await interaction.deferReply({ flags: 64 });
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) { await interaction.editReply({ content: '❌ Membre introuvable.' }); return true; }
    const role = guild.roles.cache.get(roleId);
    if (!role) { await interaction.editReply({ content: '❌ Rôle introuvable. Vérifie la configuration.' }); return true; }

    if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId).catch(() => null);
        await interaction.editReply({ content: `➖ Rôle retiré : **${role.name}**` });
    } else {
        await member.roles.add(roleId).catch(() => null);
        await interaction.editReply({ content: `✅ Rôle ajouté : **${role.name}**` });
    }

    return true;
}

module.exports = { handleRoleButton };