// ============================================================
// src/utils/guildSettings.js
// Lit les settings par guild depuis la DB avec fallback config
// ============================================================

const db = require('../db/queries');
const config = require('../../config');

// Cache en mémoire pour éviter trop de requêtes DB (TTL 60s)
const cache = new Map();
const CACHE_TTL = 60 * 1000;

async function getSettings(guildId) {
    const now = Date.now();
    const cached = cache.get(guildId);
    if (cached && now - cached.ts < CACHE_TTL) return cached.data;

    const [server, autoroles, security, welcome, economy, shop, support, twitch] = await Promise.all([
        db.getModuleSettings(guildId, 'server').catch(() => null),
        db.getModuleSettings(guildId, 'autoroles').catch(() => null),
        db.getModuleSettings(guildId, 'security').catch(() => null),
        db.getModuleSettings(guildId, 'welcome').catch(() => null),
        db.getModuleSettings(guildId, 'economy').catch(() => null),
        db.getModuleSettings(guildId, 'shop').catch(() => null),
        db.getModuleSettings(guildId, 'support').catch(() => null),
        db.getModuleSettings(guildId, 'twitch').catch(() => null),
    ]);

    const data = { server, autoroles, security, welcome, economy, shop, support, twitch };
    cache.set(guildId, { ts: now, data });
    return data;
}

// Invalide le cache pour un guild (après une mise à jour)
function invalidateCache(guildId) {
    cache.delete(guildId);
}

// ============================================================
// GETTERS — chaque fonction retourne la valeur DB ou le fallback config
// ============================================================

async function getRolesChannelId(guildId) {
    const s = await getSettings(guildId);
    return s.autoroles?.main_channel_id || config.SALON_ROLES_ID;
}

async function getLogChannelId(guildId) {
    const s = await getSettings(guildId);
    return s.server?.log_channel_id || config.LOG_CHANNEL_ID;
}

async function getWelcomeChannelId(guildId) {
    const s = await getSettings(guildId);
    return s.welcome?.welcome_channel_id || config.WELCOME_CHANNEL_ID;
}

async function getGoodbyeChannelId(guildId) {
    const s = await getSettings(guildId);
    return s.welcome?.goodbye_channel_id || config.GOODBYE_CHANNEL_ID;
}

async function getLiveChannelId(guildId) {
    const s = await getSettings(guildId);
    return s.twitch?.live_channel_id || config.LIVE_CHANNEL_ID;
}

async function getLiveAutoChannelId(guildId) {
    const s = await getSettings(guildId);
    return s.twitch?.live_auto_channel_id || config.LIVE_AUTO_CHANNEL_ID;
}

async function getContestLogChannelId(guildId) {
    const s = await getSettings(guildId);
    return s.twitch?.contest_log_channel_id || config.CONTEST_LOG_CHANNEL_ID;
}

async function getShopChannelId(guildId) {
    const s = await getSettings(guildId);
    return s.shop?.channel_id || config.SHOP_CHANNEL_ID;
}

async function getDisboardChannelId(guildId) {
    const s = await getSettings(guildId);
    return s.server?.disboard_channel_id || config.DISBOARD_CHANNEL_ID;
}

async function getSupportPanelChannelId(guildId) {
    const s = await getSettings(guildId);
    return s.support?.panel_channel_id || config.SUPPORT_TICKET_PANEL_CHANNEL_ID;
}

async function getSupportCategoryId(guildId) {
    const s = await getSettings(guildId);
    return s.support?.category_id || config.SUPPORT_TICKET_CATEGORY_ID;
}

async function getModerationChannelId(guildId) {
    const s = await getSettings(guildId);
    return s.security?.moderation_channel_id || config.MODERATION_CHANNEL_ID;
}

async function getWarningRoleId(guildId) {
    const s = await getSettings(guildId);
    return s.security?.warning_role_id || config.WARNING_ROLE_ID;
}

async function getWarningExplanationChannelId(guildId) {
    const s = await getSettings(guildId);
    return s.security?.warning_channel_id || config.WARNING_EXPLANATION_CHANNEL_ID;
}

async function getModeratorRoleId(guildId) {
    const s = await getSettings(guildId);
    return s.security?.moderator_role_id || config.MODERATOR_ROLE_ID;
}

async function getTeamRoleName(guildId) {
    const s = await getSettings(guildId);
    return s.server?.team_role_name || config.TEAM_ROLE_NAME;
}

async function getTeamRoleId(guildId) {
    const s = await getSettings(guildId);
    return s.server?.team_role_id || null;
}

async function getMemberRoleId(guildId) {
    const s = await getSettings(guildId);
    return s.server?.member_role_id || config.ROLE_MEMBRE_ID;
}

async function getPollSendChannelId(guildId) {
    const s = await getSettings(guildId);
    return s.server?.poll_send_channel_id || config.POLL_SEND_CHANNEL_ID;
}

async function getAllowedMoneyChannels(guildId) {
    const s = await getSettings(guildId);
    if (s.economy?.allowed_channels?.length > 0) return s.economy.allowed_channels;
    return config.ALLOWED_MONEY_CHANNELS;
}

// Récupère les panneaux autorôles depuis la DB pour un guild
async function getAutorolePanels(guildId) {
    const { pool } = require('../db/queries');
    const result = await pool.query(
        `SELECT p.*, 
            json_agg(json_build_object(
                'id', r.id,
                'role_id', r.role_id,
                'role_name', r.role_name,
                'emoji', r.emoji,
                'active', r.active
            ) ORDER BY r.id) FILTER (WHERE r.id IS NOT NULL) AS roles
        FROM autorole_panels p
        LEFT JOIN autorole_roles r ON r.panel_id = p.id AND r.active = true
        WHERE p.guild_id = $1 AND p.active = true
        GROUP BY p.id
        ORDER BY p.id ASC`,
        [guildId]
    );
    return result.rows;
}

module.exports = {
    getSettings,
    invalidateCache,
    getRolesChannelId,
    getLogChannelId,
    getWelcomeChannelId,
    getGoodbyeChannelId,
    getLiveChannelId,
    getLiveAutoChannelId,
    getContestLogChannelId,
    getShopChannelId,
    getDisboardChannelId,
    getSupportPanelChannelId,
    getSupportCategoryId,
    getModerationChannelId,
    getWarningRoleId,
    getWarningExplanationChannelId,
    getModeratorRoleId,
    getTeamRoleName,
    getTeamRoleId,
    getMemberRoleId,
    getPollSendChannelId,
    getAllowedMoneyChannels,
    getAutorolePanels,
};