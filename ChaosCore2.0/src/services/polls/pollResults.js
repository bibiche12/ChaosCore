// ============================================================
// IMPORTS
// ============================================================

const {
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
} = require('discord.js');

// ============================================================
// CONSTANTES
// ============================================================

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

const POLL_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

const MEDALS = ['🥇', '🥈', '🥉'];

// ============================================================
// HELPERS
// ============================================================

function getTotalVotes(results) {
    return results.reduce(
        (sum, result) => sum + Number(result.votes),
        0
    );
}

function getVotePercent(votes, totalVotes) {
    if (totalVotes === 0) {
        return 0;
    }

    return Math.round((Number(votes) / totalVotes) * 100);
}

function buildResultLine(result, index, totalVotes) {
    const percent = getVotePercent(result.votes, totalVotes);
    const medal = MEDALS[index] || '▫️';

    return `${medal} **${result.option_text}** — ${result.votes} vote(s) (${percent}%)`;
}

function buildFreeAnswersText(freeAnswers) {
    if (!freeAnswers.length) {
        return 'Aucune réponse libre.';
    }

    return freeAnswers
        .map(answer => `• <@${answer.user_id}> : ${answer.answer}`)
        .join('\n');
}

function buildDetailedVotesText(detailedVotes) {
    if (!detailedVotes.length) {
        return 'Aucun vote détaillé.';
    }

    return detailedVotes
        .map(vote => `• <@${vote.user_id}> → ${vote.option_text}`)
        .join('\n');
}

function buildResultMap(results) {
    return new Map(
        results.map(result => [
            String(result.id),
            Number(result.votes),
        ])
    );
}

function getPollEndTimestamp(poll) {
    return Math.floor(
        new Date(poll.ends_at).getTime() / 1000
    );
}

// ============================================================
// TEXTE RÉSULTATS
// ============================================================

function buildResultsText(results) {
    const totalVotes = getTotalVotes(results);

    if (totalVotes === 0) {
        return 'Aucun vote.';
    }

    return results
        .map((result, index) =>
            buildResultLine(result, index, totalVotes)
        )
        .join('\n');
}

// ============================================================
// EMBED SONDAGE
// ============================================================

function buildPollEmbed(poll, options, results = []) {
    const resultMap = buildResultMap(results);

    const optionLines = options.map((option, index) => {
        const votes = resultMap.get(String(option.id)) || 0;
        const emoji = POLL_EMOJIS[index] || '▫️';

        return `${emoji} **${option.option_text}** — ${votes} vote(s)`;
    });

    return new EmbedBuilder()
        .setColor(COLORS[poll.color] || COLORS.violet)
        .setTitle(poll.title)
        .setDescription(
            `📊 **${poll.question}**\n\n` +
            `${optionLines.join('\n')}\n\n` +
            `🗳️ Vote : **${poll.allow_multiple ? 'Réponses multiples' : 'Réponse unique'}**\n` +
            `✍️ Réponse libre : **${poll.allow_free_answer ? 'Oui' : 'Non'}**\n` +
            `⏳ Fin : <t:${getPollEndTimestamp(poll)}:R>`
        )
        .setFooter({
            text: `Sondage #${poll.id}${poll.closed ? ' — clôturé' : ''}`,
        })
        .setTimestamp();
}

// ============================================================
// MESSAGE DE RÉSULTATS
// ============================================================

function buildResultsMessage(
    poll,
    results,
    freeAnswers,
    detailedVotes
) {
    const totalVotes = getTotalVotes(results);
    const uniqueVoters = new Set(
        detailedVotes.map(vote => vote.user_id)
    ).size;

    return (
        `📊 **RÉSULTATS DU SONDAGE**\n\n` +
        `**${poll.title}**\n` +
        `${poll.question}\n\n` +
        `${buildResultsText(results)}\n\n` +
        `👥 Participants : **${uniqueVoters}**\n` +
        `🗳️ Total votes : **${totalVotes}**\n\n` +
        `✍️ **Réponses libres :**\n${buildFreeAnswersText(freeAnswers)}\n\n` +
        `📋 **Détail des votes :**\n${buildDetailedVotesText(detailedVotes)}`
    );
}

// ============================================================
// DÉSACTIVER LES COMPOSANTS
// ============================================================

function disableComponents(components) {
    return components.map(row => {
        const newRow = ActionRowBuilder.from(row);

        newRow.components = row.components.map(component =>
            ButtonBuilder.from(component).setDisabled(true)
        );

        return newRow;
    });
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    buildPollEmbed,
    buildResultsMessage,
    disableComponents,
};