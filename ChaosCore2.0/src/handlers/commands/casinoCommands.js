const { EmbedBuilder } = require('discord.js');
const db = require('../../db/queries');
const config = require('../../config');

const DEFAULT_MIN_BET = 50;
const DEFAULT_MAX_BET = 150;
const DEFAULT_SCRATCH_COST = 10;
const SCRATCH_PRIZES = [0, 0, 0, 2, 5, 10, 15, 20, 25, 50, 100];

async function getCasinoContext(guildId) {
    const economySettings = await db.getModuleSettings(guildId, 'economy').catch(() => null);
    return {
        moneyName: economySettings?.currency_singular || config.MONEY_NAME,
        minBet: economySettings?.casino_min_bet || DEFAULT_MIN_BET,
        maxBet: economySettings?.casino_max_bet || DEFAULT_MAX_BET,
        scratchCost: economySettings?.casino_scratch_cost || DEFAULT_SCRATCH_COST,
    };
}

async function logCasino(guildId, userId, game, mise, gain) {
    try {
        await db.pool.query(
            `INSERT INTO casino_logs (guild_id, user_id, game, mise, gain) VALUES ($1, $2, $3, $4, $5)`,
            [guildId, userId, game, mise, gain]
        );
    } catch (e) {}
}

async function handleCasinoCommand(interaction) {
    const cmd = interaction.commandName;
    if (!['pileouface', 'de', 'gratter'].includes(cmd)) return false;

    // Vérifier si le casino est activé
    const economySettings = await db.getModuleSettings(interaction.guildId, 'economy').catch(() => null);
    if (economySettings?.casino_enabled === false) {
        await interaction.reply({ content: '❌ Le casino est désactivé sur ce serveur.', flags: 64 });
        return true;
    }

    if (cmd === 'pileouface') await handleCoinFlip(interaction);
    if (cmd === 'de') await handleDice(interaction);
    if (cmd === 'gratter') await handleScratch(interaction);

    return true;
}

async function handleCoinFlip(interaction) {
    await interaction.deferReply({ flags: 64 });
    const mise = interaction.options.getInteger('mise');
    const choix = interaction.options.getString('choix');
    const { moneyName, minBet, maxBet } = await getCasinoContext(interaction.guildId);
    if (mise < minBet || mise > maxBet) return interaction.editReply(`❌ La mise doit être entre **${minBet}** et **${maxBet}** ${moneyName}s.`);
    const data = await db.getUserPoints(interaction.guildId, interaction.user.id);
    if (data.balance < mise) return interaction.editReply(`❌ Solde insuffisant. Tu as **${data.balance}** ${moneyName}s.`);
    const resultat = Math.random() < 0.5 ? 'pile' : 'face';
    const gagne = resultat === choix;
    const newBalance = await db.addPoints(interaction.guildId, interaction.user.id, gagne ? mise : -mise);
    await logCasino(interaction.guildId, interaction.user.id, 'pileouface', mise, gagne ? mise : -mise);
    const embed = new EmbedBuilder()
        .setColor(gagne ? '#22c55e' : '#ef4444')
        .setTitle(gagne ? '🎉 Tu as gagné !' : '💸 Tu as perdu !')
        .addFields(
            { name: 'Ton choix', value: choix === 'pile' ? '🪙 Pile' : '🎭 Face', inline: true },
            { name: 'Résultat', value: resultat === 'pile' ? '🪙 Pile' : '🎭 Face', inline: true },
            { name: gagne ? 'Gain' : 'Perte', value: `${gagne ? '+' : '-'}${mise} ${moneyName}s`, inline: true },
            { name: 'Nouveau solde', value: `💰 ${newBalance} ${moneyName}s`, inline: false },
        )
        .setFooter({ text: 'ChaosCore • Casino' });
    await interaction.editReply({ embeds: [embed] });
}

async function handleDice(interaction) {
    await interaction.deferReply({ flags: 64 });
    const mise = interaction.options.getInteger('mise');
    const { moneyName, minBet, maxBet } = await getCasinoContext(interaction.guildId);
    if (mise < minBet || mise > maxBet) return interaction.editReply(`❌ La mise doit être entre **${minBet}** et **${maxBet}** ${moneyName}s.`);
    const data = await db.getUserPoints(interaction.guildId, interaction.user.id);
    if (data.balance < mise) return interaction.editReply(`❌ Solde insuffisant. Tu as **${data.balance}** ${moneyName}s.`);
    let deJoueur, deBot;
    do {
        deJoueur = Math.floor(Math.random() * 6) + 1;
        deBot = Math.floor(Math.random() * 6) + 1;
    } while (deJoueur === deBot);
    const gagne = deJoueur > deBot;
    const newBalance = await db.addPoints(interaction.guildId, interaction.user.id, gagne ? mise : -mise);
    await logCasino(interaction.guildId, interaction.user.id, 'de', mise, gagne ? mise : -mise);
    const embed = new EmbedBuilder()
        .setColor(gagne ? '#22c55e' : '#ef4444')
        .setTitle(gagne ? '🎉 Tu as gagné !' : '💸 Tu as perdu !')
        .addFields(
            { name: 'Ton dé', value: `🎲 ${deJoueur}`, inline: true },
            { name: 'Dé du bot', value: `🎲 ${deBot}`, inline: true },
            { name: gagne ? 'Gain' : 'Perte', value: `${gagne ? '+' : '-'}${mise} ${moneyName}s`, inline: true },
            { name: 'Nouveau solde', value: `💰 ${newBalance} ${moneyName}s`, inline: false },
        )
        .setFooter({ text: 'ChaosCore • Casino' });
    await interaction.editReply({ embeds: [embed] });
}

async function handleScratch(interaction) {
    await interaction.deferReply({ flags: 64 });
    const { moneyName, scratchCost } = await getCasinoContext(interaction.guildId);
    const data = await db.getUserPoints(interaction.guildId, interaction.user.id);
    if (data.balance < scratchCost) return interaction.editReply(`❌ Solde insuffisant. Un ticket coûte **${scratchCost}** ${moneyName}s. Tu as **${data.balance}**.`);
    await db.addPoints(interaction.guildId, interaction.user.id, -scratchCost);
    const gain = SCRATCH_PRIZES[Math.floor(Math.random() * SCRATCH_PRIZES.length)];
    let newBalance;
    if (gain > 0) {
        newBalance = await db.addPoints(interaction.guildId, interaction.user.id, gain);
    } else {
        const updated = await db.getUserPoints(interaction.guildId, interaction.user.id);
        newBalance = updated.balance;
    }
    await logCasino(interaction.guildId, interaction.user.id, 'gratter', scratchCost, gain - scratchCost);
    const fakePool = SCRATCH_PRIZES.filter(p => p !== gain);
    const case1 = fakePool[Math.floor(Math.random() * fakePool.length)];
    const case2 = fakePool[Math.floor(Math.random() * fakePool.length)];
    const cases = [case1, case2];
    cases.splice(Math.floor(Math.random() * 3), 0, gain);
    const gagne = gain > 0;
    const embed = new EmbedBuilder()
        .setColor(gagne ? '#f59e0b' : '#6b7280')
        .setTitle('🎟️ Ticket à gratter')
        .setDescription(
            `┌──────────────────────────┐\n` +
            `│  **${String(cases[0]).padStart(3)} 💰**  │  **${String(cases[1]).padStart(3)} 💰**  │  **${String(cases[2]).padStart(3)} 💰**  │\n` +
            `└──────────────────────────┘`
        )
        .addFields(
            { name: 'Mise', value: `-${scratchCost} ${moneyName}s`, inline: true },
            { name: gagne ? '🎉 Gain' : '😔 Résultat', value: gagne ? `+${gain} ${moneyName}s` : 'Rien cette fois !', inline: true },
            { name: 'Nouveau solde', value: `💰 ${newBalance} ${moneyName}s`, inline: true },
        )
        .setFooter({ text: 'ChaosCore • Casino' });
    await interaction.editReply({ embeds: [embed] });
}

module.exports = { handleCasinoCommand };