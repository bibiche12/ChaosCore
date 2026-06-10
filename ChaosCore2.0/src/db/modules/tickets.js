module.exports = (pool) => {

    // ============================================================
    // TICKETS DU CHAOS
    // ============================================================

    async function getTicketUser(userId) {
        const result = await pool.query(
            `SELECT *
             FROM tickets
             WHERE user_id = $1`,
            [userId]
        );

        if (result.rows.length > 0) {
            return result.rows[0];
        }

        await pool.query(
            `INSERT INTO tickets (
                user_id,
                tickets,
                twitch_messages,
                presences,
                manual
            )
            VALUES ($1, 0, 0, 0, 0)`,
            [userId]
        );

        return {
            user_id: userId,
            tickets: 0,
            twitch_messages: 0,
            presences: 0,
            manual: 0,
        };
    }

    async function addTickets(
        userId,
        amount,
        type = 'manual'
    ) {
        await getTicketUser(userId);

        if (type === 'manual') {
            await pool.query(
                `UPDATE tickets
                 SET tickets = GREATEST(tickets + $2, 0),
                     manual = GREATEST(manual + $2, 0)
                 WHERE user_id = $1`,
                [userId, amount]
            );

            return;
        }

        await pool.query(
            `UPDATE tickets
             SET tickets = GREATEST(tickets + $2, 0)
             WHERE user_id = $1`,
            [userId, amount]
        );
    }

    async function addPresenceTicket(
        userId,
        amount
    ) {
        await getTicketUser(userId);

        await pool.query(
            `UPDATE tickets
             SET tickets = tickets + $2,
                 presences = presences + 1
             WHERE user_id = $1`,
            [userId, amount]
        );
    }

    async function addTwitchMessage(userId) {
        await getTicketUser(userId);

        await pool.query(
            `UPDATE tickets
             SET twitch_messages = twitch_messages + 1
             WHERE user_id = $1`,
            [userId]
        );
    }

    async function addTwitchMessageTickets(
        userId,
        amount
    ) {
        await getTicketUser(userId);

        await pool.query(
            `UPDATE tickets
             SET tickets = tickets + $2
             WHERE user_id = $1`,
            [userId, amount]
        );
    }

    async function getTopTickets(limit = 20) {
        const result = await pool.query(
            `SELECT *
             FROM tickets
             ORDER BY tickets DESC
             LIMIT $1`,
            [limit]
        );

        return result.rows;
    }

    // ============================================================
    // EXPORTS
    // ============================================================

    return {
        getTicketUser,
        addTickets,
        addPresenceTicket,
        addTwitchMessage,
        addTwitchMessageTickets,
        getTopTickets,
    };
};