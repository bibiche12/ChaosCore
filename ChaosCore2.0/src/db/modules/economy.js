module.exports = (pool) => {

    // ============================================================
    // ÉCONOMIE
    // ============================================================

    async function getUserPoints(userId) {
        const result = await pool.query(
            `SELECT * FROM economy WHERE user_id = $1`,
            [userId]
        );

        if (result.rows.length > 0) {
            return result.rows[0];
        }

        await pool.query(
            `INSERT INTO economy (user_id, balance)
             VALUES ($1, 0)`,
            [userId]
        );

        return {
            user_id: userId,
            balance: 0,
        };
    }

    async function addPoints(userId, amount) {
        await getUserPoints(userId);

        const result = await pool.query(
            `UPDATE economy
             SET balance = GREATEST(balance + $2, 0)
             WHERE user_id = $1
             RETURNING balance`,
            [userId, amount]
        );

        return result.rows[0].balance;
    }

    async function giveMonthlyBonus(amount) {
        const result = await pool.query(
            `UPDATE economy
             SET balance = balance + $1
             RETURNING user_id`,
            [amount]
        );

        return result.rowCount;
    }

    // ============================================================
    // BONUS MENSUEL
    // ============================================================

    async function hasMonthlyBonusBeenGiven(monthKey) {
        const result = await pool.query(
            `SELECT *
             FROM monthly_bonus_log
             WHERE month_key = $1`,
            [monthKey]
        );

        return result.rows.length > 0;
    }

    async function markMonthlyBonusGiven(
        monthKey,
        usersCount
    ) {
        await pool.query(
            `INSERT INTO monthly_bonus_log (
                month_key,
                users_count
            )
            VALUES ($1, $2)
            ON CONFLICT (month_key)
            DO NOTHING`,
            [
                monthKey,
                usersCount,
            ]
        );
    }

    // ============================================================
    // EXPORTS
    // ============================================================

    return {
        getUserPoints,
        addPoints,
        giveMonthlyBonus,
        hasMonthlyBonusBeenGiven,
        markMonthlyBonusGiven,
    };
};