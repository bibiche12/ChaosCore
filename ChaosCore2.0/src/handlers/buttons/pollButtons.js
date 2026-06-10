const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} = require('discord.js');

const db = require('../../db/queries');

async function handlePollButton(interaction) {
    const { customId, user } = interaction;
   if (customId.startsWith('poll_close_')) {
    await interaction.deferReply({ flags: 64 });

    const pollId = customId.replace('poll_close_', '');
    const poll = await db.getPoll(pollId);

    if (!poll) {
        await interaction.editReply({ content: '❌ Sondage introuvable.' });
        return true;
    }

    if (poll.closed) {
        await interaction.editReply({ content: '❌ Ce sondage est déjà clôturé.' });
        return true;
    }

    await db.closePoll(pollId);

    const results = await db.getPollResults(pollId);
    const totalVotes = results.reduce((sum, r) => sum + Number(r.votes), 0);

    const resultText = results.map((r, i) => {
        const percent = totalVotes > 0 ? Math.round((Number(r.votes) / totalVotes) * 100) : 0;
        const medal = ['🥇', '🥈', '🥉'][i] || '▫️';
        return `${medal} **${r.option_text}** — ${r.votes} vote(s) (${percent}%)`;
    }).join('\n');

    const resultChannel = await interaction.client.channels
        .fetch(require('../../config').POLL_RESULTS_CHANNEL_ID)
        .catch(() => null);

    if (resultChannel) {
        await resultChannel.send(
            `📊 **RÉSULTATS DU SONDAGE**\n\n` +
            `**${poll.title}**\n` +
            `${poll.question}\n\n` +
            `${resultText || 'Aucun vote.'}\n\n` +
            `👥 Total votes : **${totalVotes}**`
        );
    }

    await interaction.message.edit({
        components: [],
    }).catch(() => null);

    await interaction.editReply({
        content: '🔒 Sondage clôturé et résultats envoyés.',
    });

    return true;
}
if (customId.startsWith('poll_free_')) {
    const pollId = customId.replace('poll_free_', '');

    const modal = new ModalBuilder()
        .setCustomId(`poll_free_modal_${pollId}`)
        .setTitle('Réponse libre');

    const input = new TextInputBuilder()
        .setCustomId('free_answer')
        .setLabel('Ta réponse')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);

    modal.addComponents(
        new ActionRowBuilder().addComponents(input)
    );

    await interaction.showModal(modal);
    return true;
}

    if (!customId.startsWith('poll_vote_')) {
        return false;
    }

    await interaction.deferReply({ flags: 64 });

    const parts = customId.split('_');
    const pollId = parts[2];
    const optionId = parts[3];

    const poll = await db.getPoll(pollId);

    if (!poll || poll.closed) {
        await interaction.editReply({
            content: '❌ Ce sondage est terminé ou introuvable.',
        });
        return true;
    }

    if (!poll.allow_multiple) {
        await db.clearUserPollVotes(pollId, user.id);
    }

    const alreadyVoted = await db.hasUserVotedOption(pollId, user.id, optionId);

    if (alreadyVoted) {
        await db.removePollVote(pollId, user.id, optionId);

        await interaction.editReply({
            content: '↩️ Ton vote a été retiré.',
        });

        return true;
    }

    await db.addPollVote(pollId, user.id, optionId);

    await interaction.editReply({
        content: poll.allow_multiple
            ? '✅ Vote ajouté.'
            : '✅ Vote enregistré. Ton ancien vote a été remplacé.',
    });

    return true;
}

async function handlePollModal(interaction) {
    if (!interaction.customId.startsWith('poll_free_modal_')) {
        return false;
    }

    await interaction.deferReply({ flags: 64 });

    const pollId = interaction.customId.replace('poll_free_modal_', '');
    const answer = interaction.fields.getTextInputValue('free_answer');

    const poll = await db.getPoll(pollId);

    if (!poll || poll.closed) {
        await interaction.editReply({
            content: '❌ Ce sondage est terminé ou introuvable.',
        });
        return true;
    }

    await db.addPollFreeAnswer(pollId, interaction.user.id, answer);

    await interaction.editReply({
        content: '✅ Ta réponse libre a été enregistrée.',
    });

    return true;
}

module.exports = {
    handlePollButton,
    handlePollModal,
};