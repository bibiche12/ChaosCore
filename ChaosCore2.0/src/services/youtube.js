// ============================================================
// SERVICE YOUTUBE — Scan RSS nouvelles vidéos
// ============================================================

const https = require('https');
const db = require('../db/queries');

// Stocke le dernier video ID vu par guild
const lastVideoIdByGuild = new Map();

// ============================================================
// FETCH RSS
// ============================================================

function fetchRSS(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function parseLatestVideo(xml) {
    // Extraire la première entrée du flux RSS YouTube
    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) return null;

    const entry = entryMatch[1];

    const videoIdMatch = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
    const titleMatch   = entry.match(/<title>(.*?)<\/title>/);
    const linkMatch    = entry.match(/<link rel="alternate" href="(.*?)"/);
    const channelMatch = xml.match(/<title>(.*?)<\/title>/); // première balise title = nom chaîne

    if (!videoIdMatch || !titleMatch || !linkMatch) return null;

    return {
        videoId:     videoIdMatch[1].trim(),
        title:       titleMatch[1].trim(),
        url:         linkMatch[1].trim(),
        channelName: channelMatch ? channelMatch[1].trim() : 'YouTube',
    };
}

function buildRssUrl(youtubeChannelId) {
    // Accepte : UCxxxxxxx (ID), @NomChaine, ou URL complète
    let channelId = youtubeChannelId.trim();

    if (channelId.includes('youtube.com')) {
        // Extraire l'ID depuis l'URL
        const match = channelId.match(/\/channel\/(UC[\w-]+)/);
        if (match) channelId = match[1];
        else {
            // Format @NomChaine — pas supporté directement par RSS, on essaie quand même
            const atMatch = channelId.match(/\/@([\w-]+)/);
            if (atMatch) channelId = atMatch[1];
        }
    }

    if (channelId.startsWith('UC')) {
        return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    } else {
        // Format @NomChaine → utiliser le flux par username (ancien format)
        return `https://www.youtube.com/feeds/videos.xml?user=${channelId}`;
    }
}

// ============================================================
// SCAN PRINCIPAL
// ============================================================

async function checkYoutubeNewVideo(discordClient, guildId) {
    try {
        const twitchSettings = await db.getModuleSettings(guildId, 'twitch').catch(() => null);
        if (!twitchSettings) return;

        const youtubeChannelId = twitchSettings.youtube_channel_id;
        if (!youtubeChannelId) return;

        const scanEnabled = twitchSettings.youtube_scan_enabled !== false;
        if (!scanEnabled) return;

        // Vérifier la plage horaire
        const formatter = new Intl.DateTimeFormat('fr-FR', {
            timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false
        });
        const now = formatter.format(new Date());
        const scanStart = twitchSettings.youtube_scan_start || '08:00';
        const scanEnd   = twitchSettings.youtube_scan_end   || '23:00';
        if (now < scanStart || now > scanEnd) return;

        const rssUrl = buildRssUrl(youtubeChannelId);
        const xml = await fetchRSS(rssUrl);
        const video = parseLatestVideo(xml);
        if (!video) return;

        // Vérifier si c'est une nouvelle vidéo
        const lastVideoId = lastVideoIdByGuild.get(guildId);
        if (lastVideoId === video.videoId) return; // déjà annoncé

        // Première exécution — mémoriser sans annoncer
        if (!lastVideoId) {
            lastVideoIdByGuild.set(guildId, video.videoId);
            console.log(`📺 [${guildId}] YouTube initialisé — dernière vidéo : ${video.title}`);
            return;
        }

        // Nouvelle vidéo détectée !
        lastVideoIdByGuild.set(guildId, video.videoId);
        console.log(`🎥 [${guildId}] Nouvelle vidéo YouTube : ${video.title}`);

        await sendYoutubeAnnouncement(discordClient, guildId, video, twitchSettings);

    } catch (error) {
        console.error(`❌ Erreur scan YouTube [${guildId}]:`, error.message);
    }
}

async function sendYoutubeAnnouncement(discordClient, guildId, video, twitchSettings) {
    const channelId = twitchSettings.youtube_channel_discord_id;
    if (!channelId) return;

    const channel = await discordClient.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    // Message personnalisable
    let message = twitchSettings.youtube_announce_message
        || '🎥 **Nouvelle vidéo de {channel} !**\n\n{title}\n{url}';

    message = message
        .replace('{title}',   video.title)
        .replace('{url}',     video.url)
        .replace('{channel}', video.channelName);

    // Ping optionnel
    const pingRoleId = twitchSettings.youtube_ping_role_id;
    if (pingRoleId) {
        message = `<@&${pingRoleId}>\n\n` + message;
    }

    await channel.send(message).catch(console.error);
    console.log(`📢 [${guildId}] Annonce YouTube envoyée : ${video.title}`);
}

// ============================================================
// DÉMARRAGE DU SCAN PAR GUILD
// ============================================================

function startYoutubeForGuild(discordClient, guildId) {
    db.getModuleSettings(guildId, 'twitch').then(settings => {
        if (!settings?.youtube_channel_id) return;
        if (settings?.youtube_scan_enabled === false) return;

        const intervalMinutes = settings.youtube_scan_interval || 15;
        const intervalMs = intervalMinutes * 60 * 1000;

        console.log(`📺 [${guildId}] Scan YouTube démarré — intervalle : ${intervalMinutes} min`);

        // Premier scan immédiat pour initialiser
        checkYoutubeNewVideo(discordClient, guildId).catch(console.error);

        // Scan périodique
        setInterval(() => {
            checkYoutubeNewVideo(discordClient, guildId).catch(console.error);
        }, intervalMs);
    }).catch(() => null);
}

module.exports = { startYoutubeForGuild, checkYoutubeNewVideo };