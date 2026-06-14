module.exports = (pool) => {
    async function insertShopRequest(guildId, userId, type, content, price) {
        let livesRemaining = 0;
        if (type === 'phrase') { try { livesRemaining = Number(JSON.parse(content).lives || 0); } catch { livesRemaining = 0; } }
        const result = await pool.query(`INSERT INTO shop_requests (guild_id, user_id, type, content, price, lives_remaining) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [guildId, userId, type, content, price, livesRemaining]);
        return result.rows[0].id;
    }
    async function getShopRequest(id) {
        const result = await pool.query(`SELECT * FROM shop_requests WHERE id = $1`, [id]);
        return result.rows[0] || null;
    }
    async function updateShopRequestStatus(id, status) {
        await pool.query(`UPDATE shop_requests SET status = $2 WHERE id = $1`, [id, status]);
    }
    async function setShopRequestActiveMessage(id, messageId) {
        await pool.query(`UPDATE shop_requests SET active_message_id = $2 WHERE id = $1`, [id, messageId]);
    }
    async function getApprovedShopRequests(guildId) {
        const result = await pool.query(`SELECT * FROM shop_requests WHERE guild_id = $1 AND status = 'approved' AND completed = false AND type IN ('gage', 'phrase') ORDER BY created_at DESC`, [guildId]);
        return result.rows;
    }
    async function completeShopRequest(id) {
        await pool.query(`UPDATE shop_requests SET completed = true WHERE id = $1`, [id]);
    }
    async function decrementLivePhrases(guildId) {
        const result = await pool.query(`UPDATE shop_requests SET lives_remaining = GREATEST(lives_remaining - 1, 0), completed = CASE WHEN GREATEST(lives_remaining - 1, 0) <= 0 THEN true ELSE completed END WHERE guild_id = $1 AND type = 'phrase' AND status = 'approved' AND completed = false RETURNING *`, [guildId]);
        return result.rows;
    }
    return { insertShopRequest, getShopRequest, updateShopRequestStatus, setShopRequestActiveMessage, getApprovedShopRequests, completeShopRequest, decrementLivePhrases };
};
