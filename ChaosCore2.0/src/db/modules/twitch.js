module.exports = (pool) => {

    // ============================================================
    // LIAISONS TWITCH / DISCORD
    // ============================================================

    async function setTwitchLink(twitchName, userId) {
        await pool.query(
            `INSERT INTO twitch_links (twitch_name, user_id)
             VALUES ($1, $2)
             ON CONFLICT (twitch_name)
             DO UPDATE SET user_id = EXCLUDED.user_id`,
            [
                twitchName.toLowerCase(),
                userId,
            ]
        );
    }

    async function getDiscordIdFromTwitch(twitchName) {
        const result = await pool.query(
            `SELECT user_id
             FROM twitch_links
             WHERE twitch_name = $1`,
            [twitchName.toLowerCase()]
        );

        return result.rows[0]?.user_id || null;
    }

    async function listTwitchLinks() {
        const result = await pool.query(
            `SELECT *
             FROM twitch_links
             ORDER BY twitch_name ASC`
        );

        return result.rows;
    }

    // ============================================================
    // EXPORTS
    // ============================================================

    return {
        setTwitchLink,
        getDiscordIdFromTwitch,
        listTwitchLinks,
    };
};