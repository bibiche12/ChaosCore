module.exports = (pool) => {

    // ============================================================
    // BUMP DISBOARD
    // ============================================================

    async function saveNextBump(
        guildId,
        channelId,
        nextBumpAt
    ) {
        await pool.query(
            `INSERT INTO bump_timer (
                guild_id,
                channel_id,
                next_bump_at
            )
            VALUES ($1, $2, $3)
            ON CONFLICT (guild_id)
            DO UPDATE SET
                channel_id = EXCLUDED.channel_id,
                next_bump_at = EXCLUDED.next_bump_at`,
            [
                guildId,
                channelId,
                nextBumpAt,
            ]
        );
    }

    async function getNextBump(guildId) {
        const result = await pool.query(
            `SELECT *
             FROM bump_timer
             WHERE guild_id = $1`,
            [guildId]
        );

        return result.rows[0] || null;
    }

    // ============================================================
    // EXPORTS
    // ============================================================

    return {
        saveNextBump,
        getNextBump,
    };
};