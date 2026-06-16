// ============================================================
// src/utils/crypto.js — Déchiffrement AES-256-GCM
// Placer dans : src/utils/crypto.js (bot)
// ============================================================

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function decrypt(encryptedText) {
    if (!encryptedText) return null;
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        console.warn('⚠️ ENCRYPTION_KEY manquante — token non déchiffré');
        return null;
    }
    try {
        const KEY = Buffer.from(key, 'hex');
        const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const encrypted = Buffer.from(encryptedHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (err) {
        console.error('❌ Erreur déchiffrement token:', err.message);
        return null;
    }
}

module.exports = { decrypt };