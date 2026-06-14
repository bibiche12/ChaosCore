module.exports = (pool) => {
    async function setTwitchLink(guildId, twitchName, userId) {
        await pool.query(`INSERT INTO twitch_links (guild_id, twitch_name, user_id) VALUES ($1, $2, $3) ON CONFLICT (guild_id, twitch_name) DO UPDATE SET user_id = EXCLUDED.user_id`, [guildId, twitchName.toLowerCase(), userId]);
    }
    async function getDiscordIdFromTwitch(guildId, twitchName) {
        const result = await pool.query(`SELECT user_id FROM twitch_links WHERE guild_id = $1 AND twitch_name = $2`, [guildId, twitchName.toLowerCase()]);
        return result.rows[0]?.user_id || null;
    }
    async function listTwitchLinks(guildId) {
        const result = await pool.query(`SELECT * FROM twitch_links WHERE guild_id = $1 ORDER BY twitch_name ASC`, [guildId]);
        return result.rows;
    }
    return { setTwitchLink, getDiscordIdFromTwitch, listTwitchLinks };
};
