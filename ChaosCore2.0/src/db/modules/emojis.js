module.exports = (pool) => {
    async function insertEmojiRequest(guildId, userId, emojiName, imageUrl) {
        const result = await pool.query(`INSERT INTO emoji_requests (guild_id, user_id, emoji_name, image_url) VALUES ($1, $2, $3, $4) RETURNING id`, [guildId, userId, emojiName, imageUrl]);
        return result.rows[0].id;
    }
    async function getEmojiRequest(id) {
        const result = await pool.query(`SELECT * FROM emoji_requests WHERE id = $1`, [id]);
        return result.rows[0] || null;
    }
    async function updateEmojiRequestStatus(id, status) {
        await pool.query(`UPDATE emoji_requests SET status = $2 WHERE id = $1`, [id, status]);
    }
    return { insertEmojiRequest, getEmojiRequest, updateEmojiRequestStatus };
};
