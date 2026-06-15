// ============================================================
// IMPORTS
// ============================================================

const { Pool } = require('pg');

// ============================================================
// CONNEXION POSTGRESQL
// ============================================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
    console.error('❌ Erreur PostgreSQL :', err);
});

// ============================================================
// INITIALISATION DES TABLES
// ============================================================

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
            guild_id  TEXT NOT NULL,
            month_key TEXT NOT NULL,
            given_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            users_count INTEGER DEFAULT 0,
            PRIMARY KEY (guild_id, month_key)
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS economy (
            guild_id TEXT NOT NULL,
            user_id  TEXT NOT NULL,
            balance  INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (guild_id, user_id)
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS tickets (
            guild_id        TEXT NOT NULL,
            user_id         TEXT NOT NULL,
            tickets         INTEGER NOT NULL DEFAULT 0,
            twitch_messages INTEGER NOT NULL DEFAULT 0,
            presences       INTEGER NOT NULL DEFAULT 0,
            manual          INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (guild_id, user_id)
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS twitch_links (
            guild_id    TEXT NOT NULL,
            twitch_name TEXT NOT NULL,
            user_id     TEXT NOT NULL,
            PRIMARY KEY (guild_id, twitch_name)
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
            guild_id TEXT NOT NULL,
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
            guild_id TEXT NOT NULL,
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
        CREATE TABLE IF NOT EXISTS bump_timer (
            guild_id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            next_bump_at BIGINT NOT NULL
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS polls (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT,
            creator_id TEXT NOT NULL,
            title TEXT NOT NULL,
            question TEXT NOT NULL,
            color TEXT DEFAULT 'purple',
            allow_multiple BOOLEAN DEFAULT false,
            allow_free_answer BOOLEAN DEFAULT false,
            duration_type TEXT NOT NULL,
            ends_at TIMESTAMP NOT NULL,
            closed BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS poll_options (
            id SERIAL PRIMARY KEY,
            poll_id INTEGER NOT NULL,
            option_text TEXT NOT NULL
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS poll_votes (
            id SERIAL PRIMARY KEY,
            poll_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            option_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS poll_free_answers (
            id SERIAL PRIMARY KEY,
            poll_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            answer TEXT NOT NULL,
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
        CREATE TABLE IF NOT EXISTS support_tickets (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS birthdays (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            day INTEGER NOT NULL,
            month INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (guild_id, user_id)
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS birthday_settings (
            guild_id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS birthday_announcements (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            announce_date TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (guild_id, user_id, announce_date)
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS server_settings (
            guild_id                       TEXT PRIMARY KEY,
            log_channel_id                 TEXT,
            contest_log_channel_id         TEXT,
            security_log_channel_id        TEXT,
            moderation_channel_id          TEXT,
            mod_log_channel_id             TEXT,
            welcome_channel_id             TEXT,
            goodbye_channel_id             TEXT,
            birthday_channel_id            TEXT,
            shop_channel_id                TEXT,
            live_channel_id                TEXT,
            live_role_id                   TEXT,
            warning_role_id                TEXT,
            warning_explanation_channel_id TEXT,
            member_role_id                 TEXT,
            trusted_role_id                TEXT,
            minor_role_id                  TEXT,
            adult_role_id                  TEXT,
            step_1_role_id                 TEXT,
            step_2_role_id                 TEXT,
            chaos_child_role_id            TEXT,
            onboarding_log_channel_id      TEXT,
            disboard_channel_id            TEXT,
            twitch_username                TEXT,
            updated_at                     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS guild_module_settings (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            module_name TEXT NOT NULL,
            settings JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (guild_id, module_name)
        );
    `);

    console.log('✅ Base de données initialisée');
}

// ============================================================
// MODULES DB
// ============================================================

const serverSettings = require('./modules/serverSettings')(pool);
const economy = require('./modules/economy')(pool);
const tickets = require('./modules/tickets')(pool);
const twitch = require('./modules/twitch')(pool);
const overlay = require('./modules/overlay')(pool);
const shop = require('./modules/shop')(pool);
const emojis = require('./modules/emojis')(pool);
const temporaryRoles = require('./modules/temporaryRoles')(pool);
const moderation = require('./modules/moderation')(pool);
const polls = require('./modules/polls')(pool);
const bump = require('./modules/bump')(pool);
const supportTickets = require('./modules/supportTickets')(pool);
const birthdays = require('./modules/birthdays')(pool);

// ============================================================
// SETTINGS MODULES (dashboard → bot)
// ============================================================

async function getModuleSettings(guildId, moduleName) {
    const result = await pool.query(
        `SELECT settings FROM guild_module_settings WHERE guild_id = $1 AND module_name = $2`,
        [guildId, moduleName]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].settings;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    pool,
    initDatabase,
    getModuleSettings,

    ...serverSettings,
    ...economy,
    ...tickets,
    ...twitch,
    ...overlay,
    ...shop,
    ...emojis,
    ...temporaryRoles,
    ...moderation,
    ...polls,
    ...bump,
    ...supportTickets,
    ...birthdays,
};