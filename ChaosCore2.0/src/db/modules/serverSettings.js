module.exports = (pool) => {

    const allowedKeys = [
        'log_channel_id',
        'contest_log_channel_id',
        'security_log_channel_id',
        'moderation_channel_id',
        'mod_log_channel_id',
        'welcome_channel_id',
        'goodbye_channel_id',
        'birthday_channel_id',
        'shop_channel_id',
        'live_channel_id',
        'live_role_id',
        'warning_role_id',
        'warning_explanation_channel_id',
        'member_role_id',
        'trusted_role_id',
        'minor_role_id',
        'adult_role_id',
        'step_1_role_id',
        'step_2_role_id',
        'chaos_child_role_id',
        'onboarding_log_channel_id',
        'disboard_channel_id',
        'twitch_username',  // ← chaque serveur configure son propre Twitch
    ];

    async function getServerSettings(guildId) {
        const result = await pool.query(
            `SELECT * FROM server_settings WHERE guild_id = $1`,
            [guildId]
        );
        return result.rows[0] || null;
    }

    async function updateServerSetting(guildId, key, value) {
        if (!allowedKeys.includes(key)) {
            throw new Error(`Paramètre serveur invalide : ${key}`);
        }

        const result = await pool.query(
            `INSERT INTO server_settings (guild_id, ${key}, updated_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (guild_id)
             DO UPDATE SET ${key} = EXCLUDED.${key}, updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [guildId, value]
        );

        return result.rows[0];
    }

    return { getServerSettings, updateServerSetting };
};
