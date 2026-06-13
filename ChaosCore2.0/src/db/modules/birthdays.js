module.exports = (pool) => {
    async function setBirthday(guildId, userId, day, month) {
        const result = await pool.query(
            `INSERT INTO birthdays (guild_id, user_id, day, month)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (guild_id, user_id)
             DO UPDATE SET
                day = EXCLUDED.day,
                month = EXCLUDED.month,
                updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [guildId, userId, day, month]
        );

        return result.rows[0];
    }

    async function setBirthdayChannel(guildId, channelId) {
        const result = await pool.query(
            `INSERT INTO birthday_settings (guild_id, channel_id)
             VALUES ($1, $2)
             ON CONFLICT (guild_id)
             DO UPDATE SET
                channel_id = EXCLUDED.channel_id,
                updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [guildId, channelId]
        );

        return result.rows[0];
    }

    async function getBirthdayChannel(guildId) {
        const result = await pool.query(
            `SELECT *
             FROM birthday_settings
             WHERE guild_id = $1
             LIMIT 1`,
            [guildId]
        );

        return result.rows[0];
    }

    async function getBirthdaysForDate(day, month) {
        const result = await pool.query(
            `SELECT *
             FROM birthdays
             WHERE day = $1
             AND month = $2`,
            [day, month]
        );

        return result.rows;
    }

    async function hasBirthdayAnnouncement(guildId, userId, announceDate) {
        const result = await pool.query(
            `SELECT *
             FROM birthday_announcements
             WHERE guild_id = $1
             AND user_id = $2
             AND announce_date = $3
             LIMIT 1`,
            [guildId, userId, announceDate]
        );

        return !!result.rows[0];
    }

    async function markBirthdayAnnounced(guildId, userId, announceDate) {
        await pool.query(
            `INSERT INTO birthday_announcements (guild_id, user_id, announce_date)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [guildId, userId, announceDate]
        );
    }

    return {
        setBirthday,
        setBirthdayChannel,
        getBirthdayChannel,
        getBirthdaysForDate,
        hasBirthdayAnnouncement,
        markBirthdayAnnounced,
    };
};