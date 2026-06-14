module.exports = (pool) => {

    // ============================================================
    // RÔLES TEMPORAIRES
    // ============================================================

    async function insertTemporaryRole(
        userId,
        roleId,
        guildId,
        roleName,
        expiresAt
    ) {
        await pool.query(
            `INSERT INTO temporary_roles (
                user_id,
                role_id,
                guild_id,
                role_name,
                expires_at
            )
            VALUES ($1, $2, $3, $4, $5)`,
            [
                userId,
                roleId,
                guildId,
                roleName,
                expiresAt,
            ]
        );
    }

    async function getExpiredTemporaryRoles() {
        const result = await pool.query(
            `SELECT *
             FROM temporary_roles
             WHERE expires_at <= NOW()`
        );

        return result.rows;
    }

    async function deleteTemporaryRole(id) {
        await pool.query(
            `DELETE FROM temporary_roles
             WHERE id = $1`,
            [id]
        );
    }

    // ============================================================
    // EXPORTS
    // ============================================================

    return {
        insertTemporaryRole,
        getExpiredTemporaryRoles,
        deleteTemporaryRole,
    };
};