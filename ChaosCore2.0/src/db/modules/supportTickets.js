module.exports = (pool) => {
    async function createSupportTicket(guildId, userId, channelId) {
        const result = await pool.query(
            `INSERT INTO support_tickets (guild_id, user_id, channel_id)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [guildId, userId, channelId]
        );

        return result.rows[0];
    }

    async function getOpenSupportTicket(guildId, userId) {
        const result = await pool.query(
            `SELECT *
             FROM support_tickets
             WHERE guild_id = $1
             AND user_id = $2
             AND status = 'open'
             LIMIT 1`,
            [guildId, userId]
        );

        return result.rows[0];
    }

    async function getSupportTicketByChannel(channelId) {
        const result = await pool.query(
            `SELECT *
             FROM support_tickets
             WHERE channel_id = $1
             AND status = 'open'
             LIMIT 1`,
            [channelId]
        );

        return result.rows[0];
    }

    async function closeSupportTicket(channelId) {
        const result = await pool.query(
            `UPDATE support_tickets
             SET status = 'closed',
                 closed_at = CURRENT_TIMESTAMP
             WHERE channel_id = $1
             AND status = 'open'
             RETURNING *`,
            [channelId]
        );

        return result.rows[0];
    }

    return {
        createSupportTicket,
        getOpenSupportTicket,
        getSupportTicketByChannel,
        closeSupportTicket,
    };
};