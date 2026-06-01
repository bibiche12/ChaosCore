require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    Events,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');

const axios = require('axios');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ==========================
// CONFIG DISBOARD
// ==========================

const DISBOARD_CHANNEL_ID = '1505837489934438440';

const DISBOARD_MESSAGE = `🚨 PROTOCOLE BUMP ACTIVÉ 🚨

Opérateurs du serveur, le système détecte une fenêtre de soutien DISBOARD 📡

Commande requise : /bump

Objectif : renforcer la survie du serveur et maintenir le niveau d’activité en ligne 👾

BlackAlpha39 vous surveille… la bibiche approuve ce message 🧪

Fin du message.`;

const DISBOARD_INTERVAL = 2 * 60 * 60 * 1000;

// ==========================
// CONFIG TWITCH LIVE
// ==========================

const TWITCH_USERNAME = 'BlackAlpha39';
const LIVE_CHANNEL_ID = '1503697483975626762';
const LIVE_ROLE_NAME = 'Ping - Live';

let twitchAccessToken = null;
let alreadyAnnouncedLive = false;

// ==========================
// COMMANDES SLASH
// ==========================

const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Vérifie que ChaosCore fonctionne')
].map(command => command.toJSON());

// ==========================
// TWITCH
// ==========================

async function getTwitchAccessToken() {
    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
            client_id: process.env.TWITCH_CLIENT_ID,
            client_secret: process.env.TWITCH_CLIENT_SECRET,
            grant_type: 'client_credentials'
        }
    });

    twitchAccessToken = response.data.access_token;
    console.log('✅ Token Twitch récupéré');
}

async function checkTwitchLive() {
    try {
        if (!twitchAccessToken) {
            await getTwitchAccessToken();
        }

        const response = await axios.get('https://api.twitch.tv/helix/streams', {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${twitchAccessToken}`
            },
            params: {
                user_login: TWITCH_USERNAME.toLowerCase()
            }
        });

        const stream = response.data.data[0];

        if (stream && !alreadyAnnouncedLive) {
            alreadyAnnouncedLive = true;

            const channel = await client.channels.fetch(LIVE_CHANNEL_ID).catch(() => null);

            if (!channel) {
                console.log('❌ Salon annonce live introuvable');
                return;
            }

            await channel.guild.roles.fetch();

            const role = channel.guild.roles.cache.find(r => r.name === LIVE_ROLE_NAME);
            const roleMention = role ? `<@&${role.id}>` : '@everyone';

            const liveMessage = `🔴 **BLACK&CO' EST EN LIVE** 🔴

${roleMention}

Le chaos commence maintenant 😈

🎮 **Jeu :** ${stream.game_name || 'Non renseigné'}
📢 **Titre :** ${stream.title}
📺 https://www.twitch.tv/${TWITCH_USERNAME}

La bibiche a sonné l’alarme 🦌🔥`;

            await channel.send(liveMessage);

            console.log('🔴 Annonce live envoyée');
        }

        if (!stream && alreadyAnnouncedLive) {
            alreadyAnnouncedLive = false;
            console.log('⚫ Live terminé, annonce réinitialisée');
        }

    } catch (error) {
        console.error('❌ Erreur vérification Twitch :', error.response?.data || error.message);

        if (error.response?.status === 401) {
            twitchAccessToken = null;
        }
    }
}

// ==========================
// BOT PRÊT
// ==========================

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ ${readyClient.user.tag} est connecté !`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(readyClient.user.id),
            { body: commands }
        );

        console.log('✅ Commandes slash enregistrées');
    } catch (error) {
        console.error(error);
    }

    const disboardChannel = await client.channels.fetch(DISBOARD_CHANNEL_ID).catch(() => null);

    if (disboardChannel) {
        console.log('✅ Rappel Disboard activé toutes les 2 heures');

        setInterval(() => {
            console.log('📢 Rappel Disboard envoyé');
            disboardChannel.send(DISBOARD_MESSAGE).catch(console.error);
        }, DISBOARD_INTERVAL);
    } else {
        console.log('❌ Salon Disboard introuvable');
    }

    await getTwitchAccessToken();
    await checkTwitchLive();

    setInterval(checkTwitchLive, 60 * 1000);

    console.log('✅ Surveillance Twitch activée');
});

// ==========================
// COMMANDES
// ==========================

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ping') {
        await interaction.reply('🏓 ChaosCore est vivant !');
    }
});

// ==========================
// CONNEXION
// ==========================

client.login(process.env.DISCORD_TOKEN);