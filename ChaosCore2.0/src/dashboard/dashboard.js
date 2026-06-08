const express = require('express');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const session = require('express-session');

module.exports = function setupDashboard(app, client) {

    app.set('view engine', 'ejs');
    app.set('views', './src/dashboard/views');

    app.use('/dashboard-assets', express.static('./src/dashboard/public'));

   app.use(session({
    secret: process.env.SESSION_SECRET || process.env.DISCORD_CLIENT_SECRET || 'chaoscore_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
    },
}));

    app.use(passport.initialize());
    app.use(passport.session());

    passport.serializeUser((user, done) => {
        done(null, user);
    });

    passport.deserializeUser((obj, done) => {
        done(null, obj);
    });

    passport.use(
        new DiscordStrategy(
            {
                clientID: process.env.CLIENT_ID,
                clientSecret: process.env.DISCORD_CLIENT_SECRET,
                callbackURL: process.env.DISCORD_CALLBACK_URL,
                scope: ['identify', 'guilds'],
            },
            (accessToken, refreshToken, profile, done) => {
                process.nextTick(() => done(null, profile));
            }
        )
    );

    function ensureAuth(req, res, next) {
        if (req.isAuthenticated()) return next();
        return res.redirect('/login');
    }

    app.get('/', (req, res) => {
        res.redirect('/login');
    });

    app.get('/login', (req, res) => {
        res.render('login');
    });

    app.get('/auth/discord', passport.authenticate('discord'));

    app.get(
        '/auth/discord/callback',
        passport.authenticate('discord', {
            failureRedirect: '/login',
        }),
        (req, res) => {
            res.redirect('/servers');
        }
    );

    app.get('/logout', (req, res) => {
        req.logout(() => {
            res.redirect('/login');
        });
    });

    app.get('/servers', ensureAuth, (req, res) => {
        const guilds = req.user.guilds.filter(
            guild => (guild.permissions & 0x8) === 0x8
        );

        res.render('servers', {
            user: req.user,
            guilds,
        });
    });

    app.get('/dashboard/:guildId', ensureAuth, async (req, res) => {
        const guild = client.guilds.cache.get(req.params.guildId);

        res.render('home', {
            user: req.user,
            guildId: req.params.guildId,
            guildName: guild?.name || 'Serveur inconnu',
            memberCount: guild?.memberCount || 0,
            channelsCount: guild?.channels.cache.size || 0,
            rolesCount: guild?.roles.cache.size || 0,
        });
    });

    console.log('🌐 Dashboard chargé');
};