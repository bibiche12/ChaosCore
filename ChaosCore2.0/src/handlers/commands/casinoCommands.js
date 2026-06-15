const { EmbedBuilder } = require('discord.js');
const db = require('../../db/queries');
const config = require('../../config');

const MIN_BET = 50;
const MAX_BET = 150;
const SCRATCH_COST = 10;
const SCRATCH_PRIZES = [0, 0, 0, 2, 5, 10, 15, 20, 25, 50, 100];

async function handleCasinoCommand(interaction) {
    const cmd = interaction.commandName;
    if (!['pileouface', 'de', 'gratter'].includes(cmd)) return false;

    if (cmd === 'pileouface') await handleCoinFlip(interaction);
    if (cmd === 'de') await handleDice(interaction);
    if (cmd === 'gratter') await handleScratch(interaction);

    return true;
}

// ============================================================
// PILE OU FACE
// ============================================================

async function handleCoinFlip(interaction) {
    await interaction.deferReply({ flags: 64 });

    const mise = interaction.options.getInteger('mise');
    const choix = interaction.options.getString('choix');

    if (mise < MIN_BET || mise > MAX_BET) {
        return interaction.editReply(`❌ La mise doit être entre **${MIN_BET}** et **${MAX_BET}** ${config.MONEY_NAME}s.`);
    }

    const data = await db.getUserPoints(interaction.guildId, interaction.user.id);
    if (data.balance < mise) {
        return interaction.editReply(`❌ Solde insuffisant. Tu as **${data.balance}** ${config.MONEY_NAME}s.`);
    }

    const resultat = Math.random() < 0.5 ? 'pile' : 'face';
    const gagne = resultat === choix;

    let newBalance;
    if (gagne) {
        newBalance = await db.addPoints(interaction.guildId, interaction.user.id, mise);
    } else {
        newBalance = await db.addPoints(interaction.guildId, interaction.user.id, -mise);
    }

    const embed = new EmbedBuilder()
        .setColor(gagne ? '#22c55e' : '#ef4444')
        .setTitle(gagne ? '🎉 Tu as gagné !' : '💸 Tu as perdu !')
        .addFields(
            { name: 'Ton choix', value: choix === 'pile' ? '🪙 Pile' : '🎭 Face', inline: true },
            { name: 'Résultat', value: resultat === 'pile' ? '🪙 Pile' : '🎭 Face', inline: true },
            { name: gagne ? 'Gain' : 'Perte', value: `${gagne ? '+' : '-'}${mise} ${config.MONEY_NAME}s`, inline: true },
            { name: 'Nouveau solde', value: `💰 ${newBalance} ${config.MONEY_NAME}s`, inline: false },
        )
        .setFooter({ text: 'ChaosCore • Casino' });

    await interaction.editReply({ embeds: [embed] });
}

// ============================================================
// DÉ
// ============================================================

async function handleDice(interaction) {
    await interaction.deferReply({ flags: 64 });

    const mise = interaction.options.getInteger('mise');

    if (mise < MIN_BET || mise > MAX_BET) {
        return interaction.editReply(`❌ La mise doit être entre **${MIN_BET}** et **${MAX_BET}** ${config.MONEY_NAME}s.`);
    }

    const data = await db.getUserPoints(interaction.guildId, interaction.user.id);
    if (data.balance < mise) {
        return interaction.editReply(`❌ Solde insuffisant. Tu as **${data.balance}** ${config.MONEY_NAME}s.`);
    }

    let deJoueur, deBot;
    // Rejouer tant qu'égalité
    do {
        deJoueur = Math.floor(Math.random() * 6) + 1;
        deBot = Math.floor(Math.random() * 6) + 1;
    } while (deJoueur === deBot);

    const gagne = deJoueur > deBot;
    let newBalance;
    if (gagne) {
        newBalance = await db.addPoints(interaction.guildId, interaction.user.id, mise);
    } else {
        newBalance = await db.addPoints(interaction.guildId, interaction.user.id, -mise);
    }

    const embed = new EmbedBuilder()
        .setColor(gagne ? '#22c55e' : '#ef4444')
        .setTitle(gagne ? '🎉 Tu as gagné !' : '💸 Tu as perdu !')
        .addFields(
            { name: 'Ton dé', value: `🎲 ${deJoueur}`, inline: true },
            { name: 'Dé du bot', value: `🎲 ${deBot}`, inline: true },
            { name: gagne ? 'Gain' : 'Perte', value: `${gagne ? '+' : '-'}${mise} ${config.MONEY_NAME}s`, inline: true },
            { name: 'Nouveau solde', value: `💰 ${newBalance} ${config.MONEY_NAME}s`, inline: false },
        )
        .setFooter({ text: 'ChaosCore • Casino' });

    await interaction.editReply({ embeds: [embed] });
}

// ============================================================
// TICKET À GRATTER
// ============================================================

async function handleScratch(interaction) {
    await interaction.deferReply({ flags: 64 });

    const data = await db.getUserPoints(interaction.guildId, interaction.user.id);
    if (data.balance < SCRATCH_COST) {
        return interaction.editReply(`❌ Solde insuffisant. Un ticket coûte **${SCRATCH_COST}** ${config.MONEY_NAME}s. Tu as **${data.balance}**.`);
    }

    // Débiter la mise
    await db.addPoints(interaction.guildId, interaction.user.id, -SCRATCH_COST);

    // Tirage du gain
    const gain = SCRATCH_PRIZES[Math.floor(Math.random() * SCRATCH_PRIZES.length)];

    let newBalance;
    if (gain > 0) {
        newBalance = await db.addPoints(interaction.guildId, interaction.user.id, gain);
    } else {
        const updated = await db.getUserPoints(interaction.guildId, interaction.user.id);
        newBalance = updated.balance;
    }

    const gagne = gain > 0;

    // Générer 3 cases aléatoires dont une est le vrai gain
    const fakeValues = SCRATCH_PRIZES.filter(p => p !== gain);
    const case1 = fakeValues[Math.floor(Math.random() * fakeValues.length)];
    const case2 = fakeValues[Math.floor(Math.random() * fakeValues.length)];
    const position = Math.floor(Math.random() * 3);
    const cases = [case1, case2, gain];
    cases.splice(position, 0, cases.pop());

    const embed = new EmbedBuilder()
        .setColor(gagne ? '#f59e0b' : '#6b7280')
        .setTitle('🎟️ Ticket à gratter')
        .setDescription(
            `┌─────────────────────┐\n` +
            `│  ${cases[0].toString().padStart(3)} 💰  │  ${cases[1].toString().padStart(3)} 💰  │  ${cases[2].toString().padStart(3)} 💰  │\n` +
            `└─────────────────────┘`
        )
        .addFields(
            { name: 'Mise', value: `-${SCRATCH_COST} ${config.MONEY_NAME}s`, inline: true },
            { name: gagne ? '🎉 Gain' : '😔 Résultat', value: gagne ? `+${gain} ${config.MONEY_NAME}s` : 'Rien cette fois !', inline: true },
            { name: 'Nouveau solde', value: `💰 ${newBalance} ${config.MONEY_NAME}s`, inline: true },
        )
        .setFooter({ text: 'ChaosCore • Casino' });

    await interaction.editReply({ embeds: [embed] });
}

module.exports = { handleCasinoCommand };