const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
    console.error('❌ Erreur PostgreSQL :', err);
});

async function initDatabase() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS moderation_warnings (
        id SERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        moderator_id TEXT NOT NULL,
        reason TEXT,
        resolved BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`);
await pool.query(`
    CREATE TABLE IF NOT EXISTS monthly_bonus_log (
        month_key TEXT PRIMARY KEY,
        given_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        users_count INTEGER DEFAULT 0
    );
`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS economy (
            user_id TEXT PRIMARY KEY,
            balance INTEGER NOT NULL DEFAULT 0
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS tickets (
            user_id TEXT PRIMARY KEY,
            tickets INTEGER NOT NULL DEFAULT 0,
            twitch_messages INTEGER NOT NULL DEFAULT 0,
            presences INTEGER NOT NULL DEFAULT 0,
            manual INTEGER NOT NULL DEFAULT 0
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS twitch_links (
            twitch_name TEXT PRIMARY KEY,
            user_id TEXT NOT NULL
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS channel_point_events (
            id SERIAL PRIMARY KEY,
            twitch_name TEXT NOT NULL,
            discord_id TEXT,
            reward_name TEXT NOT NULL,
            user_input TEXT,
            tickets_awarded INTEGER NOT NULL DEFAULT 0,
            show_on_overlay BOOLEAN NOT NULL DEFAULT false,
            completed BOOLEAN DEFAULT false,
            completed_by TEXT,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS shop_requests (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            price INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            active_message_id TEXT,
            lives_remaining INTEGER DEFAULT 0,
            completed BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS emoji_requests (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            emoji_name TEXT NOT NULL,
            image_url TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS temporary_roles (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            role_name TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        ALTER TABLE channel_point_events
        ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS completed_by TEXT,
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
    `);

    await pool.query(`
        ALTER TABLE shop_requests
        ADD COLUMN IF NOT EXISTS active_message_id TEXT,
        ADD COLUMN IF NOT EXISTS lives_remaining INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false;
    `);

    await pool.query(`
    CREATE TABLE IF NOT EXISTS bump_timer (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        next_bump_at BIGINT NOT NULL
    );
`);

    console.log('✅ Connexion PostgreSQL prête');
}

// ÉCONOMIE

async function getUserPoints(userId) {
    const result = await pool.query(
        `SELECT * FROM economy WHERE user_id = $1`,
        [userId]
    );

    if (result.rows.length > 0) return result.rows[0];

    await pool.query(
        `INSERT INTO economy (user_id, balance) VALUES ($1, 0)`,
        [userId]
    );

    return { user_id: userId, balance: 0 };
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

// TICKETS

async function getTicketUser(userId) {
    const result = await pool.query(
        `SELECT * FROM tickets WHERE user_id = $1`,
        [userId]
    );

    if (result.rows.length > 0) return result.rows[0];

    await pool.query(
        `INSERT INTO tickets (user_id, tickets, twitch_messages, presences, manual)
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

async function addTickets(userId, amount, type = 'manual') {
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

async function addPresenceTicket(userId, amount) {
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

async function addTwitchMessageTickets(userId, amount) {
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
        `SELECT * FROM tickets ORDER BY tickets DESC LIMIT $1`,
        [limit]
    );

    return result.rows;
}

// TWITCH

async function setTwitchLink(twitchName, userId) {
    await pool.query(
        `INSERT INTO twitch_links (twitch_name, user_id)
         VALUES ($1, $2)
         ON CONFLICT (twitch_name)
         DO UPDATE SET user_id = EXCLUDED.user_id`,
        [twitchName.toLowerCase(), userId]
    );
}

async function getDiscordIdFromTwitch(twitchName) {
    const result = await pool.query(
        `SELECT user_id FROM twitch_links WHERE twitch_name = $1`,
        [twitchName.toLowerCase()]
    );

    return result.rows[0]?.user_id || null;
}

async function listTwitchLinks() {
    const result = await pool.query(
        `SELECT * FROM twitch_links ORDER BY twitch_name ASC`
    );

    return result.rows;
}

// POINTS DE CHAÎNE / OVERLAY TWITCH

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

// BOUTIQUE

async function insertShopRequest(userId, type, content, price) {
    let livesRemaining = 0;

    if (type === 'phrase') {
        try {
            const data = JSON.parse(content);
            livesRemaining = Number(data.lives || 0);
        } catch {
            livesRemaining = 0;
        }
    }

    const result = await pool.query(
        `INSERT INTO shop_requests (user_id, type, content, price, lives_remaining)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [userId, type, content, price, livesRemaining]
    );

    return result.rows[0].id;
}

async function getShopRequest(id) {
    const result = await pool.query(
        `SELECT * FROM shop_requests WHERE id = $1`,
        [id]
    );

    return result.rows[0] || null;
}

async function updateShopRequestStatus(id, status) {
    await pool.query(
        `UPDATE shop_requests SET status = $2 WHERE id = $1`,
        [id, status]
    );
}

async function setShopRequestActiveMessage(id, messageId) {
    await pool.query(
        `UPDATE shop_requests
         SET active_message_id = $2
         WHERE id = $1`,
        [id, messageId]
    );
}

async function getApprovedShopRequests() {
    const result = await pool.query(
        `SELECT *
         FROM shop_requests
         WHERE status = 'approved'
         AND completed = false
         AND type IN ('gage', 'phrase')
         ORDER BY created_at DESC`
    );

    return result.rows;
}

async function completeShopRequest(id) {
    await pool.query(
        `UPDATE shop_requests
         SET completed = true
         WHERE id = $1`,
        [id]
    );
}

async function decrementLivePhrases() {
    const result = await pool.query(
        `UPDATE shop_requests
         SET lives_remaining = GREATEST(lives_remaining - 1, 0),
             completed = CASE
                WHEN GREATEST(lives_remaining - 1, 0) <= 0 THEN true
                ELSE completed
             END
         WHERE type = 'phrase'
         AND status = 'approved'
         AND completed = false
         RETURNING *`
    );

    return result.rows;
}

// EMOJIS

async function insertEmojiRequest(userId, emojiName, imageUrl) {
    const result = await pool.query(
        `INSERT INTO emoji_requests (user_id, emoji_name, image_url)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, emojiName, imageUrl]
    );

    return result.rows[0].id;
}

async function getEmojiRequest(id) {
    const result = await pool.query(
        `SELECT * FROM emoji_requests WHERE id = $1`,
        [id]
    );

    return result.rows[0] || null;
}

async function updateEmojiRequestStatus(id, status) {
    await pool.query(
        `UPDATE emoji_requests SET status = $2 WHERE id = $1`,
        [id, status]
    );
}

// RÔLES TEMPORAIRES

async function insertTemporaryRole(userId, roleId, guildId, roleName, expiresAt) {
    await pool.query(
        `INSERT INTO temporary_roles (user_id, role_id, guild_id, role_name, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, roleId, guildId, roleName, expiresAt]
    );
}

async function getExpiredTemporaryRoles() {
    const result = await pool.query(
        `SELECT * FROM temporary_roles WHERE expires_at <= NOW()`
    );

    return result.rows;
}

async function deleteTemporaryRole(id) {
    await pool.query(
        `DELETE FROM temporary_roles WHERE id = $1`,
        [id]
    );
}

// OVERLAY GLOBAL

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
            content AS text,
            user_id AS author,
            created_at
         FROM shop_requests
         WHERE status = 'approved'
         AND completed = false
         AND type IN ('gage', 'phrase')`
    );

    const allEvents = [...twitchEvents.rows, ...shopEvents.rows]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, limit);

    return allEvents;
}
async function hasMonthlyBonusBeenGiven(monthKey) {
    const result = await pool.query(
        `SELECT * FROM monthly_bonus_log WHERE month_key = $1`,
        [monthKey]
    );

    return result.rows.length > 0;
}

async function markMonthlyBonusGiven(monthKey, usersCount) {
    await pool.query(
        `INSERT INTO monthly_bonus_log (month_key, users_count)
         VALUES ($1, $2)
         ON CONFLICT (month_key) DO NOTHING`,
        [monthKey, usersCount]
    );

}
async function saveNextBump(guildId, channelId, nextBumpAt) {
    await pool.query(
        `INSERT INTO bump_timer (guild_id, channel_id, next_bump_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id)
         DO UPDATE SET
            channel_id = EXCLUDED.channel_id,
            next_bump_at = EXCLUDED.next_bump_at`,
        [guildId, channelId, nextBumpAt]
    );
}

async function getNextBump(guildId) {
    const result = await pool.query(
        `SELECT * FROM bump_timer WHERE guild_id = $1`,
        [guildId]
    );

    return result.rows[0] || null;
}
async function addModerationWarning(guildId, userId, moderatorId, reason) {
    const result = await pool.query(
        `INSERT INTO moderation_warnings (guild_id, user_id, moderator_id, reason)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [guildId, userId, moderatorId, reason || 'Aucune raison précisée']
    );

    return result.rows[0];
}

async function countRecentWarnings(guildId, userId, windowMs) {
    const result = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM moderation_warnings
         WHERE guild_id = $1
         AND user_id = $2
         AND resolved = false
         AND created_at >= NOW() - ($3::text || ' milliseconds')::interval`,
        [guildId, userId, windowMs]
    );

    return result.rows[0]?.count || 0;
}

async function resolveWarnings(guildId, userId) {
    await pool.query(
        `UPDATE moderation_warnings
         SET resolved = true
         WHERE guild_id = $1
         AND user_id = $2
         AND resolved = false`,
        [guildId, userId]
    );
}
module.exports = {
    addModerationWarning,
countRecentWarnings,
resolveWarnings,
    hasMonthlyBonusBeenGiven,
markMonthlyBonusGiven,
    pool,
    initDatabase,

    getUserPoints,
    addPoints,
    giveMonthlyBonus,

    getTicketUser,
    addTickets,
    addPresenceTicket,
    addTwitchMessage,
    addTwitchMessageTickets,
    getTopTickets,

    setTwitchLink,
    getDiscordIdFromTwitch,
    listTwitchLinks,

    insertChannelPointEvent,
    completeChannelPointEvent,
    clearOverlayEvents,
    getLatestOverlayEvents,

    insertShopRequest,
    getShopRequest,
    updateShopRequestStatus,
    setShopRequestActiveMessage,
    getApprovedShopRequests,
    completeShopRequest,
    decrementLivePhrases,

    insertEmojiRequest,
    getEmojiRequest,
    updateEmojiRequestStatus,

    insertTemporaryRole,
    getExpiredTemporaryRoles,
    deleteTemporaryRole,

    saveNextBump,
getNextBump,
};