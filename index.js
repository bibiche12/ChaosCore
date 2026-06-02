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
const tmi = require('tmi.js');
const { Pool } = require('pg');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
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

const ALLOWED_MONEY_CHANNELS = [
    '1503703021832507452',
    '1503703739943358554',
    '1509302039161737299'
];

const POINTS_PER_MESSAGE = 1;
const MESSAGE_COOLDOWN = 60 * 1000;
const MONTHLY_BONUS = 250;

let messageCooldowns = new Map();

// ==========================
// CONFIG TICKETS DU CHAOS
// ==========================

const CHAOS_CHILD_ROLE_ID = '1508899875310538873';
const CONTEST_LOG_CHANNEL_ID = '1508897752824811631';

const TICKET_PRESENCE = 2;
const TICKET_EVERY_10_MESSAGES = 2;
const TWITCH_MESSAGE_COOLDOWN = 5000;

let liveContestActive = false;
let currentLive = {
    startedAt: null,
    users: {}
};

let twitchCooldowns = new Map();

// ==========================
// DATABASE
// ==========================

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS economy (
            user_id TEXT PRIMARY KEY,
            balance INTEGER NOT NULL DEFAULT 0,
            last_monthly_bonus TEXT
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

    console.log('✅ Base PostgreSQL prête');
}

async function getUserPoints(userId) {
    const result = await pool.query(
        `SELECT * FROM economy WHERE user_id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {
        await pool.query(
            `INSERT INTO economy (user_id, balance, last_monthly_bonus)
             VALUES ($1, 0, NULL)`,
            [userId]
        );

        return {
            user_id: userId,
            balance: 0,
            last_monthly_bonus: null
        };
    }

    return result.rows[0];
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

async function getTicketUser(userId) {
    const result = await pool.query(
        `SELECT * FROM tickets WHERE user_id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {
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
            manual: 0
        };
    }

    return result.rows[0];
}

async function addTickets(userId, amount, type = 'manual') {
    await getTicketUser(userId);

    if (type === 'manual') {
        await pool.query(
            `UPDATE tickets
             SET tickets = GREATEST(tickets + $2, 0),
                 manual = manual + $2
             WHERE user_id = $1`,
            [userId, amount]
        );
    } else {
        await pool.query(
            `UPDATE tickets
             SET tickets = GREATEST(tickets + $2, 0)
             WHERE user_id = $1`,
            [userId, amount]
        );
    }
}
async function removeTickets(userId, amount) {
    await getTicketUser(userId);

    await pool.query(
        `UPDATE tickets
         SET tickets = GREATEST(tickets - $2, 0),
             manual = GREATEST(manual - $2, 0)
         WHERE user_id = $1`,
        [userId, amount]
    );
}

async function addPresenceTicket(userId) {
    await getTicketUser(userId);

    await pool.query(
        `UPDATE tickets
         SET tickets = tickets + $2,
             presences = presences + 1
         WHERE user_id = $1`,
        [userId, TICKET_PRESENCE]
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

async function sendLog(message) {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (logChannel) await logChannel.send(message).catch(console.error);
}

async function sendContestLog(message) {
    const logChannel = await client.channels.fetch(CONTEST_LOG_CHANNEL_ID).catch(() => null);
    if (logChannel) await logChannel.send(message).catch(console.error);
}

function hasTeamRole(member) {
    return member.roles.cache.some(role => role.name === TEAM_ROLE_NAME);
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
            option.setName('membre').setDescription('Membre à créditer').setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('montant').setDescription('Montant à ajouter').setRequired(true).setMinValue(1)
        )
        .addStringOption(option =>
            option.setName('raison').setDescription('Raison de l’ajout').setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('retpoint')
        .setDescription('Retirer des Bichcoins à un membre')
        .addUserOption(option =>
            option.setName('membre').setDescription('Membre à débiter').setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('montant').setDescription('Montant à retirer').setRequired(true).setMinValue(1)
        )
        .addStringOption(option =>
            option.setName('raison').setDescription('Raison du retrait').setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('twitch')
        .setDescription('Associer un membre Discord à son pseudo Twitch')
        .addUserOption(option =>
            option.setName('membre').setDescription('Membre Discord').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('pseudo').setDescription('Pseudo Twitch').setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('adticket')
        .setDescription('Ajouter des Tickets du Chaos à un membre')
        .addUserOption(option =>
            option.setName('membre').setDescription('Membre à créditer').setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('montant').setDescription('Nombre de tickets').setRequired(true).setMinValue(1)
        )
        .addStringOption(option =>
            option.setName('raison').setDescription('Raison').setRequired(true)
        ),
new SlashCommandBuilder()
    .setName('retticket')
    .setDescription('Retirer des Tickets du Chaos à un membre')
    .addUserOption(option =>
        option.setName('membre').setDescription('Membre à débiter').setRequired(true)
    )
    .addIntegerOption(option =>
        option.setName('montant').setDescription('Nombre de tickets').setRequired(true).setMinValue(1)
    )
    .addStringOption(option =>
        option.setName('raison').setDescription('Raison').setRequired(true)
    ),
    
    new SlashCommandBuilder()
        .setName('live')
        .setDescription('Démarrer le comptage Tickets du Chaos'),

    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Arrêter le comptage Tickets du Chaos'),

    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Afficher le classement Tickets du Chaos')
].map(command => command.toJSON());

// ==========================
// TWITCH API LIVE
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
        if (!twitchAccessToken) await getTwitchAccessToken();

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
            if (!channel) return console.log('❌ Salon annonce live introuvable');

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
        if (error.response?.status === 401) twitchAccessToken = null;
    }
}

// ==========================
// TWITCH CHAT TICKETS
// ==========================

const twitchChat = new tmi.Client({
    options: { debug: false },
    identity: {
        username: process.env.TWITCH_CHAT_USERNAME,
        password: process.env.TWITCH_CHAT_OAUTH
    },
    channels: [TWITCH_USERNAME.toLowerCase()]
});

twitchChat.on('message', async (channel, tags, message, self) => {
    if (self) return;
    if (!liveContestActive) return;

    const twitchName = tags.username?.toLowerCase();
    if (!twitchName) return;

    const now = Date.now();
    const last = twitchCooldowns.get(twitchName) || 0;
    if (now - last < TWITCH_MESSAGE_COOLDOWN) return;
    twitchCooldowns.set(twitchName, now);

    const discordId = await getDiscordIdFromTwitch(twitchName);
    if (!discordId) return;

    const guild = client.guilds.cache.first();
    if (!guild) return;

    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return;

    if (!member.roles.cache.has(CHAOS_CHILD_ROLE_ID)) return;

    if (!currentLive.users[discordId]) {
        currentLive.users[discordId] = {
            twitchName,
            messages: 0,
            presenceGiven: false,
            messageMilestones: 0
        };
    }

    const liveUser = currentLive.users[discordId];

    if (!liveUser.presenceGiven) {
        liveUser.presenceGiven = true;

        await addPresenceTicket(discordId);

        await sendContestLog(`🎟️ **Présence live validée**

👤 ${member}
📺 Twitch : **${twitchName}**
➕ **${TICKET_PRESENCE} Tickets du Chaos**`);
    }

    liveUser.messages += 1;

    await addTwitchMessage(discordId);

    const milestones = Math.floor(liveUser.messages / 10);

    if (milestones > liveUser.messageMilestones) {
        const gainedMilestones = milestones - liveUser.messageMilestones;
        const gainedTickets = gainedMilestones * TICKET_EVERY_10_MESSAGES;

        liveUser.messageMilestones = milestones;

        await addTwitchMessageTickets(discordId, gainedTickets);

        await sendContestLog(`💬 **Palier messages Twitch atteint**

👤 ${member}
📺 Twitch : **${twitchName}**
💬 Messages live : **${liveUser.messages}**
➕ **${gainedTickets} Tickets du Chaos**`);
    }
});

// ==========================
// BONUS MENSUEL
// ==========================

async function checkMonthlyBonus() {
    const now = new Date();
    const day = now.getDate();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (day !== 1) return;

    const result = await pool.query(
        `UPDATE economy
         SET balance = balance + $1,
             last_monthly_bonus = $2
         WHERE last_monthly_bonus IS NULL OR last_monthly_bonus <> $2
         RETURNING user_id`,
        [MONTHLY_BONUS, monthKey]
    );

    if (result.rows.length > 0) {
        await sendLog(`🏦 **Bonus mensuel Oncle'Bich**

${result.rows.length} membre(s) ont reçu **${MONTHLY_BONUS} ${MONEY_NAME}s**.`);
    }
}

// ==========================
// BOT PRÊT
// ==========================

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ ${readyClient.user.tag} est connecté !`);

    await initDatabase();

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

    console.log('✅ Surveillance Twitch live activée');

    twitchChat.connect()
        .then(() => console.log('✅ Connecté au tchat Twitch'))
        .catch(error => console.error('❌ Erreur tchat Twitch :', error));

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

    await addPoints(userId, POINTS_PER_MESSAGE);
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
        const userData = await getUserPoints(interaction.user.id);

        await interaction.reply({
            content: `🏦 **Oncle'Bich consulte votre compte...**

💰 Solde actuel : **${userData.balance} ${MONEY_NAME}s**`,
            ephemeral: true
        });
    }

    if (interaction.commandName === 'adpoint') {
        if (!hasTeamRole(interaction.member)) {
            return interaction.reply({
                content: '❌ Vous n’avez pas l’autorisation d’utiliser cette commande.',
                ephemeral: true
            });
        }

        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');
        const reason = interaction.options.getString('raison') || 'Aucune raison indiquée';

        await addPoints(target.id, amount);

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
        if (!hasTeamRole(interaction.member)) {
            return interaction.reply({
                content: '❌ Vous n’avez pas l’autorisation d’utiliser cette commande.',
                ephemeral: true
            });
        }

        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');
        const reason = interaction.options.getString('raison') || 'Aucune raison indiquée';

        await addPoints(target.id, -amount);

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

    if (interaction.commandName === 'twitch') {
        if (!hasTeamRole(interaction.member)) {
            return interaction.reply({
                content: '❌ Vous n’avez pas l’autorisation d’utiliser cette commande.',
                ephemeral: true
            });
        }

        const target = interaction.options.getUser('membre');
        const pseudo = interaction.options.getString('pseudo').toLowerCase();

        await setTwitchLink(pseudo, target.id);

        await interaction.reply({
            content: `✅ ${target} est maintenant associé au pseudo Twitch **${pseudo}**.`,
            ephemeral: true
        });

        await sendContestLog(`🔗 **Association Twitch**

👤 Discord : ${target}
📺 Twitch : **${pseudo}**
👑 Par : ${interaction.user}`);
    }

    if (interaction.commandName === 'adticket') {
        if (!hasTeamRole(interaction.member)) {
            return interaction.reply({
                content: '❌ Vous n’avez pas l’autorisation d’utiliser cette commande.',
                ephemeral: true
            });
        }

        const target = interaction.options.getUser('membre');
        const amount = interaction.options.getInteger('montant');
        const reason = interaction.options.getString('raison');

        await addTickets(target.id, amount, 'manual');

        await interaction.reply({
            content: `✅ **${amount} Tickets du Chaos** ajoutés à ${target}.`,
            ephemeral: true
        });

        await sendContestLog(`🎟️ **Ajout manuel de Tickets**

👤 Membre : ${target}
➕ Montant : **${amount} Tickets**
📝 Raison : ${reason}
👑 Par : ${interaction.user}`);
    }
if (interaction.commandName === 'retticket') {

    if (!hasTeamRole(interaction.member)) {
        return interaction.reply({
            content: '❌ Vous n’avez pas l’autorisation d’utiliser cette commande.',
            ephemeral: true
        });
    }

    const target = interaction.options.getUser('membre');
    const amount = interaction.options.getInteger('montant');
    const reason = interaction.options.getString('raison');

    await removeTickets(target.id, amount);

    await interaction.reply({
        content: `✅ **${amount} Tickets du Chaos** retirés à ${target}.`,
        ephemeral: true
    });

    await sendContestLog(`🎟️ **Retrait manuel de Tickets**

👤 Membre : ${target}
➖ Montant : **${amount} Tickets**
📝 Raison : ${reason}
👑 Par : ${interaction.user}`);
}

    if (interaction.commandName === 'live') {
        if (!hasTeamRole(interaction.member)) {
            return interaction.reply({
                content: '❌ Vous n’avez pas l’autorisation d’utiliser cette commande.',
                ephemeral: true
            });
        }

        liveContestActive = true;
        twitchCooldowns.clear();

        currentLive = {
            startedAt: new Date().toISOString(),
            users: {}
        };

        await interaction.reply('🔴 Comptage Tickets du Chaos activé pour le live.');

        await sendContestLog(`🔴 **Live concours démarré**

Le comptage Twitch est activé.
Présence : **+2 Tickets**
Messages : **+2 Tickets tous les 10 messages non-spam**`);
    }

    if (interaction.commandName === 'stop') {
        if (!hasTeamRole(interaction.member)) {
            return interaction.reply({
                content: '❌ Vous n’avez pas l’autorisation d’utiliser cette commande.',
                ephemeral: true
            });
        }

        liveContestActive = false;

        const participants = Object.keys(currentLive.users).length;

        await interaction.reply(`⚫ Comptage Tickets du Chaos arrêté. Participants détectés : **${participants}**.`);

        await sendContestLog(`⚫ **Live concours arrêté**

Participants détectés : **${participants}**
Utilisez \`/resume\` pour voir le classement.`);
    }

    if (interaction.commandName === 'resume') {
        const result = await pool.query(
            `SELECT * FROM tickets
             ORDER BY tickets DESC
             LIMIT 20`
        );

        if (result.rows.length === 0) {
            return interaction.reply('🎟️ Aucun ticket enregistré pour le moment.');
        }

        let message = `🏆 **Classement Tickets du Chaos**

`;

        let rank = 1;

        for (const data of result.rows) {
            message += `**${rank}.** <@${data.user_id}> — **${data.tickets} Tickets**
💬 Messages Twitch : ${data.twitch_messages || 0} | 🔴 Présences : ${data.presences || 0} | ✍️ Manuel : ${data.manual || 0}

`;
            rank++;
        }

        await interaction.reply(message);
    }
});

// ==========================
// CONNEXION
// ==========================

client.login(process.env.DISCORD_TOKEN);