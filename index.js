require('dotenv').config();

const fs = require('fs');
const path = require('path');

const {
    Client,
    GatewayIntentBits,
    Events,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits
} = require('discord.js');

const axios = require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
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
// CONFIG BICHCOIN
// ==========================

const MONEY_NAME = 'Bichcoin';
const TEAM_ROLE_NAME = '👑 Team';

const LOG_CHANNEL_ID = '1510994452972310708';
const GUICHET_CHANNEL_ID = '1510994550343336067';

const ALLOWED_MONEY_CHANNELS = [
    '1503703021832507452',
    '1503703739943358554',
    '1509302039161737299'
];

const POINTS_PER_MESSAGE = 1;
const MESSAGE_COOLDOWN = 60 * 1000;
const MONTHLY_BONUS = 250;

const DATA_DIR = path.join(__dirname, 'data');
const POINTS_FILE = path.join(DATA_DIR, 'points.json');

let pointsData = {};
let messageCooldowns = new Map();

// ==========================
// SAUVEGARDE BICHCOIN
// ==========================

function ensureDataFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR);
    }

    if (!fs.existsSync(POINTS_FILE)) {
        fs.writeFileSync(POINTS_FILE, JSON.stringify({}, null, 4));
    }
}

function loadPoints() {
    ensureDataFile();

    const rawData = fs.readFileSync(POINTS_FILE, 'utf8');
    pointsData = JSON.parse(rawData || '{}');
}

function savePoints() {
    fs.writeFileSync(POINTS_FILE, JSON.stringify(pointsData, null, 4));
}

function getUserPoints(userId) {
    if (!pointsData[userId]) {
        pointsData[userId] = {
            balance: 0,
            lastMonthlyBonus: null
        };
    }

    return pointsData[userId];
}

function addPoints(userId, amount) {
    const userData = getUserPoints(userId);
    userData.balance += amount;

    if (userData.balance < 0) {
        userData.balance = 0;
    }

    savePoints();
    return userData.balance;
}

async function sendLog(message) {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

    if (logChannel) {
        await logChannel.send(message).catch(console.error);
    }
}

// ==========================
// COMMANDES SLASH
// ==========================

const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Vérifie que ChaosCore fonctionne'),

    new SlashCommandBuilder()
        .setName('solde')
        .setDescription('Voir ton solde de Bichcoins'),

    new SlashCommandBuilder()
        .setName('adpoint')
        .setDescription('Ajouter des Bichcoins à un membre')
        .addUserOption(option =>
            option
                .setName('membre')
                .setDescription('Membre à créditer')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('montant')
                .setDescription('Montant à ajouter')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option
                .setName('raison')
                .setDescription('Raison de l’ajout')
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('retpoint')
        .setDescription('Retirer des Bichcoins à un membre')
        .addUserOption(option =>
            option
                .setName('membre')
                .setDescription('Membre à débiter')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('montant')
                .setDescription('Montant à retirer')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option
                .setName('raison')
                .setDescription('Raison du retrait')
                .setRequired(false)
        )
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
// BONUS MENSUEL
// ==========================

async function checkMonthlyBonus() {
    const now = new Date();
    const day = now.getDate();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (day !== 1) return;

    let count = 0;

    for (const userId of Object.keys(pointsData)) {
        const userData = getUserPoints(userId);

        if (userData.lastMonthlyBonus !== monthKey) {
            userData.balance += MONTHLY_BONUS;
            userData.lastMonthlyBonus = monthKey;
            count++;
        }
    }

    if (count > 0) {
        savePoints();

        await sendLog(`🏦 **Bonus mensuel Oncle'Bich**

${count} membre(s) ont reçu **${MONTHLY_BONUS} ${MONEY_NAME}s**.`);
    }
}

// ==========================
// BOT PRÊT
// ==========================

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ ${readyClient.user.tag} est connecté !`);

    loadPoints();
    console.log('✅ Données Bichcoin chargées');

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

    await checkMonthlyBonus();
    setInterval(checkMonthlyBonus, 6 * 60 * 60 * 1000);

    console.log('✅ Bonus mensuel activé');
});

// ==========================
// GAIN MESSAGE BICHCOIN
// ==========================

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!message.guild) return;

    if (!ALLOWED_MONEY_CHANNELS.includes(message.channel.id)) return;

    const userId = message.author.id;
    const now = Date.now();
    const lastGain = messageCooldowns.get(userId) || 0;

    if (now - lastGain < MESSAGE_COOLDOWN) return;

    messageCooldowns.set(userId, now);

    addPoints(userId, POINTS_PER_MESSAGE);
});

// ==========================
// COMMANDES
// ==========================

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ping') {
        await interaction.reply('🏓 ChaosCore est vivant !');
    }

    if (interaction.commandName === 'solde') {
        const userData = getUserPoints(interaction.user.id);

        await interaction.reply({
            content: `🏦 **Oncle'Bich consulte votre compte...**

💰 Solde actuel : **${userData.balance} ${MONEY_NAME}s**`,
            ephemeral: true
        });
    }

    if (interaction.commandName === 'adpoint') {
        const member = interaction.member;
        const hasTeamRole = member.roles.cache.some(role => role.name === TEAM_ROLE_NAME);

        if (!hasTeamRole) {
            await interaction.reply({
                content: '❌ Vous n’avez pas l’autorisation d’utiliser cette commande.',
                ephemeral: true
            });
            return;
        }

        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');
        const reason = interaction.options.getString('raison') || 'Aucune raison indiquée';

        addPoints(target.id, amount);

        await interaction.reply({
            content: `✅ **${amount} ${MONEY_NAME}s** ajoutés à ${target}.`,
            ephemeral: true
        });

        await sendLog(`🏦 **Ajout manuel de ${MONEY_NAME}s**

👤 Membre : ${target}
➕ Montant : **${amount} ${MONEY_NAME}s**
📝 Raison : ${reason}
👑 Par : ${interaction.user}`);
    }

    if (interaction.commandName === 'retpoint') {
        const member = interaction.member;
        const hasTeamRole = member.roles.cache.some(role => role.name === TEAM_ROLE_NAME);

        if (!hasTeamRole) {
            await interaction.reply({
                content: '❌ Vous n’avez pas l’autorisation d’utiliser cette commande.',
                ephemeral: true
            });
            return;
        }

        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');
        const reason = interaction.options.getString('raison') || 'Aucune raison indiquée';

        addPoints(target.id, -amount);

        await interaction.reply({
            content: `✅ **${amount} ${MONEY_NAME}s** retirés à ${target}.`,
            ephemeral: true
        });

        await sendLog(`🏦 **Retrait manuel de ${MONEY_NAME}s**

👤 Membre : ${target}
➖ Montant : **${amount} ${MONEY_NAME}s**
📝 Raison : ${reason}
👑 Par : ${interaction.user}`);
    }
});

// ==========================
// CONNEXION
// ==========================

client.login(process.env.DISCORD_TOKEN);