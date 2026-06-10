module.exports = (pool) => {

    // ============================================================
    // CRÉATION
    // ============================================================

    async function createPoll(data) {
        const result = await pool.query(
            `INSERT INTO polls (
                guild_id,
                channel_id,
                creator_id,
                title,
                question,
                color,
                allow_multiple,
                allow_free_answer,
                duration_type,
                ends_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING *`,
            [
                data.guildId,
                data.channelId,
                data.creatorId,
                data.title,
                data.question,
                data.color,
                data.allowMultiple,
                data.allowFreeAnswer,
                data.durationType,
                data.endsAt,
            ]
        );

        return result.rows[0];
    }

    async function addPollOption(pollId, optionText) {
        await pool.query(
            `INSERT INTO poll_options (poll_id, option_text)
             VALUES ($1, $2)`,
            [pollId, optionText]
        );
    }

    async function setPollMessageId(pollId, messageId) {
        await pool.query(
            `UPDATE polls
             SET message_id = $2
             WHERE id = $1`,
            [pollId, messageId]
        );
    }

    // ============================================================
    // RÉCUPÉRATION
    // ============================================================

    async function getPoll(pollId) {
        const result = await pool.query(
            `SELECT * FROM polls WHERE id = $1`,
            [pollId]
        );

        return result.rows[0] || null;
    }

    async function getPollOptions(pollId) {
        const result = await pool.query(
            `SELECT *
             FROM poll_options
             WHERE poll_id = $1
             ORDER BY id`,
            [pollId]
        );

        return result.rows;
    }

    async function getPollResults(pollId) {
        const result = await pool.query(
            `SELECT
                po.id,
                po.option_text,
                COUNT(pv.id)::int AS votes
             FROM poll_options po
             LEFT JOIN poll_votes pv
                ON pv.option_id = po.id
             WHERE po.poll_id = $1
             GROUP BY po.id, po.option_text
             ORDER BY votes DESC, po.id ASC`,
            [pollId]
        );

        return result.rows;
    }

    async function getPollFreeAnswers(pollId) {
        const result = await pool.query(
            `SELECT *
             FROM poll_free_answers
             WHERE poll_id = $1
             ORDER BY created_at ASC`,
            [pollId]
        );

        return result.rows;
    }

    async function getDetailedPollVotes(pollId) {
        const result = await pool.query(
            `SELECT
                pv.user_id,
                po.option_text,
                pv.created_at
             FROM poll_votes pv
             JOIN poll_options po
                ON po.id = pv.option_id
             WHERE pv.poll_id = $1
             ORDER BY pv.created_at ASC`,
            [pollId]
        );

        return result.rows;
    }

    async function getExpiredOpenPolls() {
        const result = await pool.query(
            `SELECT *
             FROM polls
             WHERE closed = false
             AND ends_at <= NOW()`
        );

        return result.rows;
    }

    // ============================================================
    // VOTES
    // ============================================================

    async function addPollVote(pollId, userId, optionId) {
        await pool.query(
            `INSERT INTO poll_votes (poll_id, user_id, option_id)
             VALUES ($1, $2, $3)`,
            [pollId, userId, optionId]
        );
    }

    async function hasUserVotedOption(pollId, userId, optionId) {
        const result = await pool.query(
            `SELECT id
             FROM poll_votes
             WHERE poll_id = $1
             AND user_id = $2
             AND option_id = $3`,
            [pollId, userId, optionId]
        );

        return result.rows.length > 0;
    }

    async function removePollVote(pollId, userId, optionId) {
        await pool.query(
            `DELETE FROM poll_votes
             WHERE poll_id = $1
             AND user_id = $2
             AND option_id = $3`,
            [pollId, userId, optionId]
        );
    }

    async function clearUserPollVotes(pollId, userId) {
        await pool.query(
            `DELETE FROM poll_votes
             WHERE poll_id = $1
             AND user_id = $2`,
            [pollId, userId]
        );
    }

    async function addPollFreeAnswer(pollId, userId, answer) {
        await pool.query(
            `INSERT INTO poll_free_answers (
                poll_id,
                user_id,
                answer
            )
            VALUES ($1, $2, $3)`,
            [pollId, userId, answer]
        );
    }

    // ============================================================
    // CLÔTURE
    // ============================================================

    async function closePoll(pollId) {
        await pool.query(
            `UPDATE polls
             SET closed = true
             WHERE id = $1`,
            [pollId]
        );
    }

    // ============================================================
    // EXPORTS
    // ============================================================

    return {
        createPoll,
        addPollOption,
        getPollOptions,
        setPollMessageId,

        getPoll,
        getPollResults,
        getPollFreeAnswers,
        getDetailedPollVotes,
        getExpiredOpenPolls,

        addPollVote,
        hasUserVotedOption,
        removePollVote,
        clearUserPollVotes,
        addPollFreeAnswer,

        closePoll,
    };
};