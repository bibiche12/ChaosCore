module.exports = (pool) => {

    // ============================================================
    // POINTS DE CHAÎNE / OVERLAY TWITCH
    // ============================================================

    async function insertChannelPointEvent({
        twitchName,
        discordId,
        rewardName,
        userInput,
        ticketsAwarded,
        showOnOverlay,
    }) {
        const result = await pool.query(
            `INSERT INTO channel_point_events
             (twitch_name, discord_id, reward_name, user_input, tickets_awarded, show_on_overlay)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                twitchName.toLowerCase(),
                discordId || null,
                rewardName,
                userInput || '',
                ticketsAwarded || 0,
                showOnOverlay || false,
            ]
        );

        return result.rows[0];
    }

    async function completeChannelPointEvent(id, completedBy) {
        const result = await pool.query(
            `UPDATE channel_point_events
             SET completed = true,
                 completed_by = $2,
                 completed_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id, completedBy]
        );

        return result.rows[0] || null;
    }

    async function clearOverlayEvents() {
        await pool.query(`
            UPDATE channel_point_events
            SET completed = true,
                completed_at = CURRENT_TIMESTAMP
            WHERE completed = false
        `);

        await pool.query(`
            UPDATE shop_requests
            SET completed = true
            WHERE type IN ('gage', 'phrase')
            AND status = 'approved'
            AND completed = false
        `);
    }

    async function getLatestOverlayEvents(limit = 10) {
        const twitchEvents = await pool.query(
            `SELECT
                id,
                'twitch' AS source,
                reward_name AS title,
                user_input AS text,
                twitch_name AS author,
                created_at
             FROM channel_point_events
             WHERE show_on_overlay = true
             AND completed = false`
        );

        const shopEvents = await pool.query(
    `SELECT
        id,
        type AS source,
        CASE
            WHEN type = 'gage' THEN '😈 Gage boutique'
            WHEN type = 'phrase' THEN '📢 Phrase live'
            ELSE type
        END AS title,
        CASE
            WHEN type = 'phrase' THEN content::json->>'text'
            ELSE content
        END AS text,
        user_id AS author,
        created_at
     FROM shop_requests
     WHERE status = 'approved'
     AND completed = false
     AND type IN ('gage', 'phrase')`
);

        const allEvents = [
            ...twitchEvents.rows,
            ...shopEvents.rows,
        ]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, limit);

        return allEvents;
    }

    // ============================================================
    // EXPORTS
    // ============================================================

    return {
        insertChannelPointEvent,
        completeChannelPointEvent,
        clearOverlayEvents,
        getLatestOverlayEvents,
    };
};