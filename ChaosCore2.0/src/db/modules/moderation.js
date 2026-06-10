module.exports = (pool) => {

    // ============================================================
    // WARNINGS
    // ============================================================

    async function addModerationWarning(
        guildId,
        userId,
        moderatorId,
        reason
    ) {
        const result = await pool.query(
            `INSERT INTO moderation_warnings (
                guild_id,
                user_id,
                moderator_id,
                reason
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [
                guildId,
                userId,
                moderatorId,
                reason || 'Aucune raison précisée',
            ]
        );

        return result.rows[0];
    }

    async function countRecentWarnings(
        guildId,
        userId,
        windowMs
    ) {
        const result = await pool.query(
            `SELECT COUNT(*)::int AS count
             FROM moderation_warnings
             WHERE guild_id = $1
             AND user_id = $2
             AND resolved = false
             AND created_at >= NOW() -
                ($3::text || ' milliseconds')::interval`,
            [
                guildId,
                userId,
                windowMs,
            ]
        );

        return result.rows[0]?.count || 0;
    }

    async function resolveWarnings(
        guildId,
        userId
    ) {
        await pool.query(
            `UPDATE moderation_warnings
             SET resolved = true
             WHERE guild_id = $1
             AND user_id = $2
             AND resolved = false`,
            [
                guildId,
                userId,
            ]
        );
    }

    // ============================================================
    // EXPORTS
    // ============================================================

    return {
        addModerationWarning,
        countRecentWarnings,
        resolveWarnings,
    };
};