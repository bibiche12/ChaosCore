const config = require('../../config');
const db = require('../../db/queries');

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

    if (customId.startsWith('autorole_db_')) {
        await interaction.deferReply({ flags: 64 });
        const roleId = customId.replace('autorole_db_', '');
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) { await interaction.editReply({ content: '❌ Membre introuvable.' }); return true; }
        const role = guild.roles.cache.get(roleId);
        if (!role) { await interaction.editReply({ content: '❌ Rôle introuvable.' }); return true; }

        // allow_role_remove (autoroles_general.ejs) et le flag required du
        // panneau (ex: règlement obligatoire) étaient configurables mais
        // jamais lus — un membre pouvait toujours re-cliquer pour retirer
        // un rôle, même issu d'un panneau marqué "obligatoire".
        const { pool } = require('../../db/queries');
        const autoroleSettings = await db.getModuleSettings(guild.id, 'autoroles').catch(() => null);
        const allowRemoveGlobal = autoroleSettings?.allow_role_remove !== false;

        if (member.roles.cache.has(roleId) && allowRemoveGlobal) {
            const panelResult = await pool.query(
                `SELECT p.required FROM autorole_roles r
                 JOIN autorole_panels p ON p.id = r.panel_id
                 WHERE r.guild_id = $1 AND r.role_id = $2`,
                [guild.id, roleId]
            ).catch(() => null);
            const panelRequired = panelResult?.rows?.[0]?.required === true;

            if (panelRequired) {
                await interaction.editReply({ content: `❌ Ce rôle fait partie d'un panneau obligatoire et ne peut pas être retiré.` });
                return true;
            }

            await member.roles.remove(roleId).catch(() => null);
            await logAutoroleEvent(guild.id, autoroleSettings, 'remove', member, role);
            if (autoroleSettings?.confirmation_enabled !== false) {
                await interaction.editReply({ content: `➖ Rôle retiré : **${role.name}**` });
            } else {
                await interaction.deleteReply().catch(() => null);
            }
        } else if (member.roles.cache.has(roleId) && !allowRemoveGlobal) {
            await interaction.editReply({ content: `❌ Le retrait de rôle est désactivé sur ce serveur.` });
            return true;
        } else {
            await member.roles.add(roleId).catch(() => null);

            // Vérifier si un rôle doit être retiré automatiquement
            const result = await pool.query(
                `SELECT remove_role_id FROM autorole_roles WHERE guild_id = $1 AND role_id = $2 AND active = true`,
                [guild.id, roleId]
            ).catch(() => null);

            const removeRoleId = result?.rows?.[0]?.remove_role_id;
            if (removeRoleId && member.roles.cache.has(removeRoleId)) {
                await member.roles.remove(removeRoleId).catch(() => null);
            }

            await logAutoroleEvent(guild.id, autoroleSettings, 'add', member, role);

            // confirmation_enabled était configurable mais jamais lu — le
            // message de confirmation était toujours envoyé.
            if (autoroleSettings?.confirmation_enabled !== false) {
                await interaction.editReply({ content: `✅ Rôle ajouté : **${role.name}**` });
            } else {
                await interaction.deleteReply().catch(() => null);
            }
        }
        return true;
    }

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

// logs_enabled / log_role_add / log_role_remove (autoroles_logs.ejs)
// étaient configurables mais jamais utilisés — aucun événement autorôle
// n'était jamais loggé nulle part.
async function logAutoroleEvent(guildId, autoroleSettings, action, member, role) {
    if (!autoroleSettings?.logs_enabled) return;
    if (action === 'add' && autoroleSettings?.log_role_add === false) return;
    if (action === 'remove' && autoroleSettings?.log_role_remove === false) return;
    if (!autoroleSettings?.logs_channel_id) return;

    const logChannel = await member.guild.channels.fetch(autoroleSettings.logs_channel_id).catch(() => null);
    if (!logChannel) return;

    const emoji = action === 'add' ? '✅' : '➖';
    const label = action === 'add' ? 'Rôle attribué' : 'Rôle retiré';
    await logChannel.send(`${emoji} **${label}**\n\n👤 Membre : ${member}\n🎭 Rôle : ${role.name}`).catch(() => null);
}

module.exports = { handleRoleButton };