module.exports = (pool) => {
    async function getShopItems(guildId) {
        const result = await pool.query(
            `SELECT * FROM shop_items WHERE guild_id = $1 ORDER BY id ASC`,
            [guildId]
        );
        return result.rows;
    }

    async function getActiveShopItems(guildId) {
        const result = await pool.query(
            `SELECT * FROM shop_items WHERE guild_id = $1 AND active = true ORDER BY id ASC`,
            [guildId]
        );
        return result.rows;
    }

    async function addShopItem(guildId, { name, type, description, price, active }) {
        const result = await pool.query(
            `INSERT INTO shop_items (guild_id, name, type, description, price, active)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [guildId, name, type, description || null, price, active]
        );
        return result.rows[0];
    }

    async function updateShopItem(guildId, id, { name, type, description, price, active }) {
        const result = await pool.query(
            `UPDATE shop_items
             SET name = $1, type = $2, description = $3, price = $4, active = $5, updated_at = NOW()
             WHERE id = $6 AND guild_id = $7
             RETURNING *`,
            [name, type, description || null, price, active, id, guildId]
        );
        return result.rows[0] || null;
    }

    async function deleteShopItem(guildId, id) {
        await pool.query(
            `DELETE FROM shop_items WHERE id = $1 AND guild_id = $2`,
            [id, guildId]
        );
    }

    return {
        getShopItems,
        getActiveShopItems,
        addShopItem,
        updateShopItem,
        deleteShopItem,
    };
};