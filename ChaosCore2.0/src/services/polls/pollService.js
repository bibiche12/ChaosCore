const config = require('../../config');
const db = require('../../db/queries');
const { buildResultsMessage, disableComponents } = require('./pollResults');

async function closePollAndPublishResults(client, pollId, closedBy = 'système') {
    const poll = await db.getPoll(pollId);
    if (!poll || poll.closed) return false;

    await db.closePoll(pollId);

    const [options, results, freeAnswers, detailedVotes] = await Promise.all([
        db.getPollOptions(pollId),
        db.getPollResults(pollId),
        db.getPollFreeAnswers(pollId),
        db.getDetailedPollVotes(pollId),
    ]);

    // Désactiver les boutons sur le message original
    if (poll.channel_id && poll.message_id) {
        const pollChannel = await client.channels.fetch(poll.channel_id).catch(() => null);
        if (pollChannel) {
            const pollMessage = await pollChannel.messages.fetch(poll.message_id).catch(() => null);
            if (pollMessage) {
                await pollMessage.edit({
                    components: disableComponents(pollMessage.components),
                }).catch(() => null);
            }
        }
    }

    // Envoyer les résultats dans le salon configuré
    const pollSettings = await db.getModuleSettings(poll.guild_id, 'polls').catch(() => null);
    const resultsChannelId = pollSettings?.results_channel_id || config.POLL_RESULTS_CHANNEL_ID;

    if (resultsChannelId) {
        const resultsChannel = await client.channels.fetch(resultsChannelId).catch(() => null);
        if (resultsChannel) {
            await resultsChannel.send(
                buildResultsMessage(poll, results, freeAnswers, detailedVotes)
            ).catch(() => null);
        }
    }

    console.log(`🔒 Sondage #${pollId} clôturé par ${closedBy}`);
    return true;
}

module.exports = { closePollAndPublishResults };