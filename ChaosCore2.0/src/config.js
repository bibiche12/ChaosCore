// ============================================================
// config.js — Toutes les constantes du bot ChaosCore
// ============================================================

module.exports = {
    // --- Économie ---
    MONEY_NAME: 'Bichcoin',
    POINTS_PER_MESSAGE: 1,
    MESSAGE_COOLDOWN_MS: 60 * 1000,
    MONTHLY_BONUS: 250,

    // --- Boutique ---
    SHOP_CHANNEL_ID: '1510994478394245162',
    SHOP_PRICES: {
        emoji: 100,
        gage: 200,
        phrase: { 1: 300, 2: 550 },
        role: { 7: 50, 14: 75, 30: 150 },
    },

    // --- Canaux ---
    DISBOARD_CHANNEL_ID: '1505837489934438440',
    LIVE_CHANNEL_ID: '1503697483975626762',
    LOG_CHANNEL_ID: '1510994452972310708',
    LIVE_AUTO_CHANNEL_ID: '1503664842400206978',
    CONTEST_LOG_CHANNEL_ID: '1508897752824811631',
    WELCOME_CHANNEL_ID: '1503695133261041684',
    GOODBYE_CHANNEL_ID: '1513129181989437460',

    // --- Onboarding / Sécurité ---
    ONBOARDING_RECAP_CHANNEL_ID: '1513128609529991169',
    ONBOARDING_LOG_CHANNEL_ID: '1513128609529991169',
    SECURITY_LOG_CHANNEL_ID: '1513128609529991169',

    ALLOWED_MONEY_CHANNELS: [
        '1503703021832507452',
        '1503703739943358554',
        '1509302039161737299',
    ],

    // --- Rôles ---
    TEAM_ROLE_NAME: '👑 Team',
    LIVE_ROLE_ID: 'ID_DU_ROLE_PING_LIVE',
    CHAOS_CHILD_ROLE_ID: '1508899875310538873',

    ROLE_ETAPE_1_ID: '1513130658266873978',
    ROLE_ETAPE_2_ID: '1513130935242195064',
    ROLE_MEMBRE_ID: '1503661328911302737',
    ROLE_BIBICHE_ID: '1513136293943705691',
    ROLE_MINEUR_ID: '1503663257909596181',
    ROLE_MAJEUR_ID: '1503663390483157002',

    // --- Onboarding ---
    REGLEMENT_MESSAGE_ID: '1511147167358779494',
    REGLEMENT_EMOJI_NAME: '😈',
    SALON_ROLES_ID: '1503678177606893669',

    // --- Twitch ---
    TWITCH_USERNAME: 'BlackAlpha39',
    TWITCH_MESSAGE_COOLDOWN_MS: 5000,
    TWITCH_AUTO_SCAN_ENABLED: true,
    TWITCH_AUTO_SCAN_START: '20:45',
    TWITCH_AUTO_SCAN_END: '21:45',
    TWITCH_AUTO_SCAN_INTERVAL_MS: 2 * 60 * 1000,
    TWITCH_LIVE_END_SCAN_INTERVAL_MS: 5 * 60 * 1000,

    // --- Tickets du Chaos ---
    TICKET_PRESENCE: 2,
    TICKET_EVERY_10_MESSAGES: 2,

    // --- Disboard ---
    DISBOARD_INTERVAL_MS: 2 * 60 * 60 * 1000,

    // --- Sécurité ---
    ANTI_SPAM_MESSAGE_LIMIT: 10,
    ANTI_SPAM_MESSAGE_WINDOW_MS: 10 * 1000,
    ANTI_SPAM_LINK_LIMIT: 3,
    ANTI_SPAM_FILE_LIMIT: 3,
    ANTI_SPAM_MEDIA_WINDOW_MS: 30 * 1000,
    ANTI_SPAM_TIMEOUT_MS: 10 * 60 * 1000,
    ANTI_RAID_THRESHOLD: 5,
    ANTI_RAID_WINDOW_MS: 2 * 60 * 1000,

    // --- Couleurs rôles ---
    ROLE_COLORS: {
        red: '#FF0000',
        orange: '#FF8000',
        yellow: '#FFD700',
        green: '#00CC66',
        blue: '#0099FF',
        purple: '#9933FF',
        pink: '#FF69B4',
        black: '#2F3136',
        white: '#FFFFFF',
        brown: '#8B4513',
    },

    ROLE_COLOR_NAMES: {
        red: 'Rouge',
        orange: 'Orange',
        yellow: 'Jaune',
        green: 'Vert',
        blue: 'Bleu',
        purple: 'Violet',
        pink: 'Rose',
        black: 'Noir',
        white: 'Blanc',
        brown: 'Marron',

    },
};