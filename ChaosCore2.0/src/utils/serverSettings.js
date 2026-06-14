const db = require('../db/queries');

async function getServerSettings(guildId) {
    return await db.getServerSettings(guildId);
}

async function getSetting(guildId, key, fallback = null) {
    const settings = await getServerSettings(guildId);
    return settings?.[key] || fallback;
}

async function fetchConfiguredChannel(client, guildId, key, fallback = null) {
    const channelId = await getSetting(guildId, key, fallback);
    if (!channelId) return null;
    return await client.channels.fetch(channelId).catch(() => null);
}

module.exports = { getServerSettings, getSetting, fetchConfiguredChannel };