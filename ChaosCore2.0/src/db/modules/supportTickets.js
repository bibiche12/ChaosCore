module.exports = (pool) => {

    async function createSupportTicket(guildId, userId, channelId) {
        const result = await pool.query(
            `INSERT INTO support_tickets (guild_id, user_id, channel_id, status)
             VALUES ($1, $2, $3, 'open')
             RETURNING *`,
            [guildId, userId, channelId]
        );
        return result.rows[0];
    }

    async function getOpenSupportTicket(guildId, userId) {
        const result = await pool.query(
            `SELECT * FROM support_tickets
             WHERE guild_id = $1 AND user_id = $2 AND status = 'open'
             LIMIT 1`,
            [guildId, userId]
        );
        return result.rows[0] || null;
    }

    async function getSupportTicketByChannel(channelId) {
        const result = await pool.query(
            `SELECT * FROM support_tickets
             WHERE channel_id = $1 AND status = 'open'
             LIMIT 1`,
            [channelId]
        );
        return result.rows[0] || null;
    }

    async function closeSupportTicket(channelId) {
        await pool.query(
            `UPDATE support_tickets
             SET status = 'closed', closed_at = NOW()
             WHERE channel_id = $1`,
            [channelId]
        );
    }

    async function getOpenTicketsCount(guildId) {
        const result = await pool.query(
            `SELECT COUNT(*)::int AS count FROM support_tickets
             WHERE guild_id = $1 AND status = 'open'`,
            [guildId]
        );
        return result.rows[0].count;
    }

    async function getClosedTicketsCount(guildId) {
        const result = await pool.query(
            `SELECT COUNT(*)::int AS count FROM support_tickets
             WHERE guild_id = $1 AND status = 'closed'`,
            [guildId]
        );
        return result.rows[0].count;
    }

    return {
        createSupportTicket,
        getOpenSupportTicket,
        getSupportTicketByChannel,
        closeSupportTicket,
        getOpenTicketsCount,
        getClosedTicketsCount,
    };
};