module.exports = (pool) => {

    // ============================================================
    // POINTS DE CHAÎNE / OVERLAY TWITCH
    // ============================================================

    async function insertChannelPointEvent({
        guildId,
        twitchName,
        discordId,
        rewardName,
        userInput,
        ticketsAwarded,
        showOnOverlay,
    }) {
        const result = await pool.query(
            `INSERT INTO channel_point_events
             (guild_id, twitch_name, discord_id, reward_name, user_input, tickets_awarded, show_on_overlay)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                guildId || null,
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

    async function clearOverlayEvents(guildId) {
        // guildId requis — sans filtre, ceci effaçait les événements overlay
        // de TOUS les serveurs d'un seul coup. La commande /clearoverlay
        // d'un serveur ne doit affecter que ce serveur.
        await pool.query(`
            UPDATE channel_point_events
            SET completed = true,
                completed_at = CURRENT_TIMESTAMP
            WHERE completed = false
            AND guild_id = $1
        `, [guildId]);

        await pool.query(`
            UPDATE shop_requests
            SET completed = true
            WHERE type IN ('gage', 'phrase')
            AND status = 'approved'
            AND completed = false
            AND guild_id = $1
        `, [guildId]);
    }

    async function getLatestOverlayEvents(guildId, limit = 10) {
        // guildId requis — auparavant cette requête ignorait totalement le
        // serveur d'origine : l'overlay OBS de chaque serveur affichait en
        // direct sur le stream les récompenses Channel Points et achats
        // boutique de TOUS les serveurs ChaosCore confondus.
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
             AND completed = false
             AND guild_id = $1`,
            [guildId]
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
             AND type IN ('gage', 'phrase')
             AND guild_id = $1`,
            [guildId]
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