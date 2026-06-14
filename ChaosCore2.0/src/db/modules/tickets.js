module.exports = (pool) => {
    async function getTicketUser(guildId, userId) {
        const result = await pool.query(`SELECT * FROM tickets WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
        if (result.rows.length > 0) return result.rows[0];
        await pool.query(`INSERT INTO tickets (guild_id, user_id, tickets, twitch_messages, presences, manual) VALUES ($1, $2, 0, 0, 0, 0) ON CONFLICT (guild_id, user_id) DO NOTHING`, [guildId, userId]);
        return { guild_id: guildId, user_id: userId, tickets: 0, twitch_messages: 0, presences: 0, manual: 0 };
    }
    async function addTickets(guildId, userId, amount, type = 'manual') {
        await getTicketUser(guildId, userId);
        if (type === 'manual') {
            await pool.query(`UPDATE tickets SET tickets = GREATEST(tickets + $3, 0), manual = GREATEST(manual + $3, 0) WHERE guild_id = $1 AND user_id = $2`, [guildId, userId, amount]);
            return;
        }
        await pool.query(`UPDATE tickets SET tickets = GREATEST(tickets + $3, 0) WHERE guild_id = $1 AND user_id = $2`, [guildId, userId, amount]);
    }
    async function addPresenceTicket(guildId, userId, amount) {
        await getTicketUser(guildId, userId);
        await pool.query(`UPDATE tickets SET tickets = tickets + $3, presences = presences + 1 WHERE guild_id = $1 AND user_id = $2`, [guildId, userId, amount]);
    }
    async function addTwitchMessage(guildId, userId) {
        await getTicketUser(guildId, userId);
        await pool.query(`UPDATE tickets SET twitch_messages = twitch_messages + 1 WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
    }
    async function addTwitchMessageTickets(guildId, userId, amount) {
        await getTicketUser(guildId, userId);
        await pool.query(`UPDATE tickets SET tickets = tickets + $3 WHERE guild_id = $1 AND user_id = $2`, [guildId, userId, amount]);
    }
    async function getTopTickets(guildId, limit = 20) {
        const result = await pool.query(`SELECT * FROM tickets WHERE guild_id = $1 ORDER BY tickets DESC LIMIT $2`, [guildId, limit]);
        return result.rows;
    }
    return { getTicketUser, addTickets, addPresenceTicket, addTwitchMessage, addTwitchMessageTickets, getTopTickets };
};
