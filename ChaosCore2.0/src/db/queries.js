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
            guild_id TEXT,
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

    // Migration — ajoute guild_id si la table existait déjà sans cette colonne.
    // Sans ça, l'overlay OBS d'un serveur affichait les récompenses Channel
    // Points de TOUS les serveurs ChaosCore, visibles en direct sur le stream.
    await pool.query(`
        ALTER TABLE channel_point_events
        ADD COLUMN IF NOT EXISTS guild_id TEXT;
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
            claimed_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMP
        );
    `);

    // Le dashboard (Support → Messages) propose déjà claim_enabled et
    // rename_on_claim, mais aucune colonne ni bouton n'existait côté bot
    // pour stocker/utiliser la prise en charge d'un ticket.
    await pool.query(`
        ALTER TABLE support_tickets
        ADD COLUMN IF NOT EXISTS claimed_by TEXT;
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

    await pool.query(`
    CREATE TABLE IF NOT EXISTS casino_logs (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        game TEXT NOT NULL,
        mise INTEGER NOT NULL,
        gain INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
    )
`);
// Ajouter dans initDatabase() avant le console.log('✅ Base de données initialisée') :

    await pool.query(`
        CREATE TABLE IF NOT EXISTS embed_templates (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            title TEXT,
            description TEXT,
            color TEXT DEFAULT '#9146ff',
            image_url TEXT,
            thumbnail_url TEXT,
            author_name TEXT,
            author_icon TEXT,
            footer_text TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `);

    // Articles boutique configurables par serveur — la vue dashboard
    // shop_items.ejs avait déjà les formulaires add/update/delete mais
    // aucune table ni route n'existait derrière, rendant la page inopérante.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS shop_items (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            price INTEGER NOT NULL DEFAULT 0,
            active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `);
// Ajouter dans initDatabase() dans src/db/queries.js avant le console.log :

    await pool.query(`
        CREATE TABLE IF NOT EXISTS roues (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            segments JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `);
// Ajouter dans initDatabase() dans src/db/queries.js avant le console.log :

    await pool.query(`
        CREATE TABLE IF NOT EXISTS gaming_news_settings (
            guild_id TEXT PRIMARY KEY,
            channel_id TEXT,
            sources JSONB NOT NULL DEFAULT '["ign","eurogamer","jeuxvideo","gamespot","steam"]'::jsonb,
            custom_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
            scans_this_week INTEGER NOT NULL DEFAULT 0,
            last_scan_reset TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS gaming_news_scans (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            filters JSONB NOT NULL DEFAULT '{}'::jsonb,
            article_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS gaming_news_articles (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            scan_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            source TEXT NOT NULL,
            summary TEXT,
            image_url TEXT,
            published_at TIMESTAMP,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    // Récompenses Events configurables par serveur — cette table n'existait
    // jusqu'ici que dans routes/setup.routes.js côté dashboard (un outil
    // ponctuel non exécuté automatiquement). Sur une base de données neuve,
    // le bot démarrait sans jamais la créer, cassant /tickets/rewards.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ticket_rewards (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            value INTEGER NOT NULL DEFAULT 0,
            active BOOLEAN NOT NULL DEFAULT true,
            premium BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    // Panneaux et rôles autorôles — même situation que ticket_rewards,
    // jamais créés automatiquement par le bot sur une base neuve.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS autorole_panels (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            selection_type TEXT NOT NULL DEFAULT 'multiple',
            display_type TEXT NOT NULL DEFAULT 'buttons',
            required BOOLEAN NOT NULL DEFAULT false,
            active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS autorole_roles (
            id SERIAL PRIMARY KEY,
            guild_id TEXT NOT NULL,
            panel_id INTEGER REFERENCES autorole_panels(id) ON DELETE CASCADE,
            role_id TEXT NOT NULL,
            role_name TEXT NOT NULL,
            emoji TEXT,
            remove_role_id TEXT,
            active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
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
const shopItems = require('./modules/shopItems')(pool);
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

async function getServerSettings(guildId) {
    const result = await pool.query(
        `SELECT settings FROM guild_module_settings WHERE guild_id = $1 AND module_name = 'server'`,
        [guildId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].settings;
}

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
    getServerSettings, // Override — lit depuis guild_module_settings (dashboard)
    ...economy,
    ...tickets,
    ...twitch,
    ...overlay,
    ...shop,
    ...shopItems,
    ...emojis,
    ...temporaryRoles,
    ...moderation,
    ...polls,
    ...bump,
    ...supportTickets,
    ...birthdays,
};