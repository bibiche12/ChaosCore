module.exports = (pool) => {
    async function getUserPoints(guildId, userId) {
        const result = await pool.query(`SELECT * FROM economy WHERE guild_id = $1 AND user_id = $2`, [guildId, userId]);
        if (result.rows.length > 0) return result.rows[0];
        await pool.query(`INSERT INTO economy (guild_id, user_id, balance) VALUES ($1, $2, 0) ON CONFLICT (guild_id, user_id) DO NOTHING`, [guildId, userId]);
        return { guild_id: guildId, user_id: userId, balance: 0 };
    }
    async function addPoints(guildId, userId, amount) {
        await getUserPoints(guildId, userId);
        const result = await pool.query(`UPDATE economy SET balance = GREATEST(balance + $3, 0) WHERE guild_id = $1 AND user_id = $2 RETURNING balance`, [guildId, userId, amount]);
        return result.rows[0].balance;
    }
    async function giveMonthlyBonus(guildId, amount) {
        const result = await pool.query(`UPDATE economy SET balance = balance + $2 WHERE guild_id = $1 RETURNING user_id`, [guildId, amount]);
        return result.rowCount;
    }
    async function hasMonthlyBonusBeenGiven(guildId, monthKey) {
        const result = await pool.query(`SELECT * FROM monthly_bonus_log WHERE guild_id = $1 AND month_key = $2`, [guildId, monthKey]);
        return result.rows.length > 0;
    }
    async function markMonthlyBonusGiven(guildId, monthKey, usersCount) {
        await pool.query(`INSERT INTO monthly_bonus_log (guild_id, month_key, users_count) VALUES ($1, $2, $3) ON CONFLICT (guild_id, month_key) DO NOTHING`, [guildId, monthKey, usersCount]);
    }
    return { getUserPoints, addPoints, giveMonthlyBonus, hasMonthlyBonusBeenGiven, markMonthlyBonusGiven };
};
