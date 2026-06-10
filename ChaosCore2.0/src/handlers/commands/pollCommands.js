const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const config = require('../../config');
const db = require('../../db/queries');

const COLORS = {
    rouge: 0xFF0000,
    orange: 0xFF8000,
    jaune: 0xFFD700,
    vert: 0x00CC66,
    bleu: 0x0099FF,
    violet: 0x9933FF,
    rose: 0xFF69B4,
    noir: 0x2F3136,
};

const DURATIONS = {
    '1h': 60 * 60 * 1000,
    '1j': 24 * 60 * 60 * 1000,
    '1semaine': 7 * 24 * 60 * 60 * 1000,
};

async function handlePollCommand(interaction, { discordClient }) {
    if (interaction.commandName !== 'sondage') return false;

    await interaction.deferReply({ flags: 64 });

    const title = interaction.options.getString('titre');
    const question = interaction.options.getString('question');
    const duration = interaction.options.getString('duree') || '1h';
    const color = interaction.options.getString('couleur');
    const multiple = interaction.options.getBoolean('multiple') || false;
    const freeAnswer = interaction.options.getBoolean('reponse_libre') || false;

    const choices = [
        interaction.options.getString('choix1'),
        interaction.options.getString('choix2'),
        interaction.options.getString('choix3'),
        interaction.options.getString('choix4'),
        interaction.options.getString('choix5'),
        interaction.options.getString('choix6'),
    ].filter(Boolean);

    const endsAt = new Date(Date.now() + DURATIONS[duration]);

    const poll = await db.createPoll({
        guildId: interaction.guild.id,
        channelId: config.POLL_SEND_CHANNEL_ID,
        creatorId: interaction.user.id,
        title,
        question,
        color,
        allowMultiple: multiple,
        allowFreeAnswer: freeAnswer,
        durationType: duration,
        endsAt,
    });

    for (const choice of choices) {
        await db.addPollOption(poll.id, choice);
    }

    const options = await db.getPollOptions(poll.id);
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

    const embed = new EmbedBuilder()
        .setColor(COLORS[color] || COLORS.violet)
        .setTitle(title)
        .setDescription(
            `📊 **${question}**\n\n` +
            options.map((o, i) => `${emojis[i]} **${o.option_text}**`).join('\n') +
            `\n\n🗳️ Vote : **${multiple ? 'Réponses multiples' : 'Réponse unique'}**\n` +
            `✍️ Réponse libre : **${freeAnswer ? 'Oui' : 'Non'}**\n` +
            `⏳ Durée : **${duration}**`
        )
        .setFooter({ text: `Sondage #${poll.id}` })
        .setTimestamp();

    const rows = [];
    let currentRow = new ActionRowBuilder();

    options.forEach((option, index) => {
        if (currentRow.components.length === 5) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }

        currentRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`poll_vote_${poll.id}_${option.id}`)
                .setLabel(`${index + 1}`)
                .setEmoji(emojis[index])
                .setStyle(ButtonStyle.Secondary)
        );
    });

    if (freeAnswer) {
        if (currentRow.components.length === 5) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }

        currentRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`poll_free_${poll.id}`)
                .setLabel('Réponse libre')
                .setEmoji('✍️')
                .setStyle(ButtonStyle.Primary)
        );
    }

    if (currentRow.components.length > 0) rows.push(currentRow);

    const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`poll_close_${poll.id}`)
            .setLabel('Clôturer maintenant')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
    );

    rows.push(closeRow);

    const pollChannel = await discordClient.channels.fetch(config.POLL_SEND_CHANNEL_ID).catch(() => null);

    if (!pollChannel) {
        await interaction.editReply({
            content: '❌ Salon d’envoi du sondage introuvable.',
        });
        return true;
    }

    const message = await pollChannel.send({
        embeds: [embed],
        components: rows,
    });

    await db.setPollMessageId(poll.id, message.id);

    await interaction.editReply({
        content: `✅ Sondage créé dans <#${config.POLL_SEND_CHANNEL_ID}>.`,
    });

    return true;
    if (!DURATIONS[duration]) {
    await interaction.editReply({
        content: '❌ Durée invalide. Choisis : 1h, 1j ou 1semaine.',
    });
    return true;
}
}

module.exports = {
    handlePollCommand,
};