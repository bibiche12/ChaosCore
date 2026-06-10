// ============================================================
// IMPORTS
// ============================================================

const config = require('../../config');
const db = require('../../db/queries');

const {
    buildPollEmbed,
    buildResultsMessage,
    disableComponents,
} = require('./pollResults');

// ============================================================
// HELPERS
// ============================================================

async function fetchChannel(client, channelId) {
    return client.channels.fetch(channelId).catch(() => null);
}

async function fetchMessage(channel, messageId) {
    if (!channel || !messageId) {
        return null;
    }

    return channel.messages.fetch(messageId).catch(() => null);
}

async function getFullPollData(pollId) {
    const poll = await db.getPoll(pollId);

    if (!poll || poll.closed) {
        return null;
    }

    const options = await db.getPollOptions(pollId);
    const results = await db.getPollResults(pollId);
    const freeAnswers = await db.getPollFreeAnswers(pollId);
    const detailedVotes = await db.getDetailedPollVotes(pollId);

    return {
        poll,
        options,
        results,
        freeAnswers,
        detailedVotes,
    };
}

// ============================================================
// CLÔTURE SONDAGE
// ============================================================

async function closePollAndPublishResults(
    client,
    pollId,
    closedBy = 'Automatique'
) {
    const data = await getFullPollData(pollId);

    if (!data) {
        return false;
    }

    const {
        poll,
        options,
        results,
        freeAnswers,
        detailedVotes,
    } = data;

    await db.closePoll(pollId);

    await updateOriginalPollMessage(
        client,
        poll,
        options,
        results
    );

    await publishPollResults(
        client,
        poll,
        results,
        freeAnswers,
        detailedVotes,
        closedBy
    );

    return true;
}

// ============================================================
// MESSAGE ORIGINAL DU SONDAGE
// ============================================================

async function updateOriginalPollMessage(
    client,
    poll,
    options,
    results
) {
    const pollChannel = await fetchChannel(
        client,
        poll.channel_id
    );

    const message = await fetchMessage(
        pollChannel,
        poll.message_id
    );

    if (!message) {
        return;
    }

    await message.edit({
        embeds: [
            buildPollEmbed(
                { ...poll, closed: true },
                options,
                results
            ),
        ],
        components: disableComponents(message.components),
    }).catch(() => null);
}

// ============================================================
// PUBLICATION DES RÉSULTATS
// ============================================================

async function publishPollResults(
    client,
    poll,
    results,
    freeAnswers,
    detailedVotes,
    closedBy
) {
    const resultChannel = await fetchChannel(
        client,
        config.POLL_RESULTS_CHANNEL_ID
    );

    if (!resultChannel) {
        return;
    }

    await resultChannel.send(
        buildResultsMessage(
            poll,
            results,
            freeAnswers,
            detailedVotes
        ) +
        `\n\n🔒 Clôturé par : **${closedBy}**`
    ).catch(() => null);
}

// ============================================================
// CLÔTURE AUTOMATIQUE
// ============================================================

async function closeExpiredPolls(client) {
    const expiredPolls = await db.getExpiredOpenPolls();

    for (const poll of expiredPolls) {
        await closePollAndPublishResults(
            client,
            poll.id,
            'Fin automatique'
        );
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    closePollAndPublishResults,
    closeExpiredPolls,
};