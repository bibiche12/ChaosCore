require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const express = require('express');
const path = require('path');

const config = require('./src/config');
const db = require('./src/db/queries');
const twitchService = require('./src/services/twitch');
const { setupShop, processLivePhrases } = require('./src/services/shop');
const { handleCommand, commandDefinitions } = require('./src/handlers/commands');
const { handleButton, handleModal, handleSelectMenu, pendingEmojiRequests } = require('./src/handlers/buttons');
const { handleMessage } = require('./src/handlers/messages');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

async function sendLog(message) {
    const channel = await client.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
    if (channel) await channel.send(message).catch(console.error);
}

async function sendContestLog(message) {
    const channel = await client.channels.fetch(config.CONTEST_LOG_CHANNEL_ID).catch(() => null);
    if (channel) await channel.send(message).catch(console.error);
}

async function cleanExpiredRoles() {
    const expiredRoles = await db.getExpiredTemporaryRoles();

    for (const row of expiredRoles) {
        try {
            const guild = await client.guilds.fetch(row.guild_id);
            const role = await guild.roles.fetch(row.role_id).catch(() => null);
            const member = await guild.members.fetch(row.user_id).catch(() => null);

            if (role && member) await member.roles.remove(role).catch(() => null);
            if (role) await role.delete('Rôle temporaire expiré').catch(() => null);

            await db.deleteTemporaryRole(row.id);
            console.log(`🗑️ Rôle temporaire supprimé : ${row.role_name}`);
        } catch (error) {
            console.error(`❌ Erreur suppression rôle temporaire #${row.id}:`, error);
        }
    }
}

async function handleMonthlyBonus() {
    const now = new Date();

    if (now.getDate() !== 1) return;

    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const alreadyGiven = await db.hasMonthlyBonusBeenGiven(monthKey);
    if (alreadyGiven) return;

    const usersCount = await db.giveMonthlyBonus(config.MONTHLY_BONUS);
    await db.markMonthlyBonusGiven(monthKey, usersCount);

    await sendLog(
        `🎁 **Bonus mensuel distribué**\n\n` +
        `💰 Montant : **${config.MONTHLY_BONUS} Bichcoins**\n` +
        `👥 Membres crédités : **${usersCount}**\n` +
        `📅 Mois : **${monthKey}**`
    ).catch(() => null);

    console.log(`🎁 Bonus mensuel ${monthKey} distribué à ${usersCount} membres`);
}

async function registerCommands() {
    console.log('📋 Commandes à enregistrer :', commandDefinitions.map(c => c.name));

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commandDefinitions }
    );

    console.log('✅ Commandes slash enregistrées');
}

client.once('ready', async () => {
    console.log(`✅ ChaosCore connecté en tant que ${client.user.tag}`);

    await db.initDatabase();
    await registerCommands();

    const twitchChat = twitchService.createTwitchChat(client, sendContestLog);
    twitchChat.connect().catch(error => {
        console.error('❌ Erreur connexion Twitch chat:', error.message);
    });

    function isInAutoScanWindow() {
        const formatter = new Intl.DateTimeFormat('fr-FR', {
            timeZone: 'Europe/Paris',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });

        const now = formatter.format(new Date());

        return now >= config.TWITCH_AUTO_SCAN_START && now <= config.TWITCH_AUTO_SCAN_END;
    }

    async function handleLiveEndAuto() {
        const liveState = twitchService.getLiveState();
        const participants = Object.keys(liveState.currentLive.users || {}).length;
        const summary = twitchService.generateLiveStatsSummary(participants);

        twitchService.stopCurrentLive();

        await sendContestLog(
            `⚫ **Live terminé automatiquement**\n\n` +
            summary
        ).catch(() => null);

        console.log('⚫ Fin de live détectée automatiquement');
    }

    setInterval(() => {
        if (!config.TWITCH_AUTO_SCAN_ENABLED) return;
        if (!isInAutoScanWindow()) return;

        const liveState = twitchService.getLiveState();
        if (liveState.liveContestActive) return;

        twitchService.checkTwitchLive(client, async () => {
            await processLivePhrases(client).catch(console.error);
        }).catch(console.error);
    }, config.TWITCH_AUTO_SCAN_INTERVAL_MS);

    setInterval(() => {
        const liveState = twitchService.getLiveState();
        if (!liveState.liveContestActive) return;

        twitchService.checkTwitchLive(
            client,
            async () => {
                await processLivePhrases(client).catch(console.error);
            },
            handleLiveEndAuto
        ).catch(console.error);
    }, config.TWITCH_LIVE_END_SCAN_INTERVAL_MS);

    setInterval(cleanExpiredRoles, 10 * 60 * 1000);
    cleanExpiredRoles();

    setInterval(() => {
        handleMonthlyBonus().catch(console.error);
    }, 60 * 60 * 1000);

    handleMonthlyBonus().catch(console.error);
});

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            return handleCommand(interaction, {
                discordClient: client,
                twitchService,
                setupShop,
                sendLog,
                sendContestLog,
                processLivePhrases,
            });
        }

        if (interaction.isButton()) {
            return handleButton(interaction, client, sendLog);
        }

        if (interaction.isModalSubmit()) {
            return handleModal(interaction, client, sendLog);
        }

        if (interaction.isStringSelectMenu()) {
            return handleSelectMenu(interaction);
        }
    } catch (error) {
        console.error('❌ Erreur interaction:', error);

        const reply = {
            content: '❌ Une erreur est survenue, réessaie.',
            flags: 64,
        };

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(reply);
            } else {
                await interaction.reply(reply);
            }
        } catch (_) {}
    }
});

client.on('messageCreate', (message) => {
    handleMessage(message, client, sendLog, pendingEmojiRequests).catch(console.error);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/overlay-view', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

app.get('/overlay/latest', async (req, res) => {
    try {
        const events = await db.getLatestOverlayEvents(20);

        if (!events || events.length === 0) {
            return res.json({ active: false, items: [] });
        }

        return res.json({
            active: true,
            items: events.map(event => ({
                id: event.id,
                source: event.source,
                rewardName: event.title,
                userInput: event.text || '',
                author: event.author || '',
                createdAt: event.created_at,
            })),
        });
    } catch (error) {
        console.error('❌ Erreur route /overlay/latest:', error);
        return res.status(500).json({ active: false, items: [] });
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Overlay Web démarré sur le port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);