// ============================================================
// services/crypto.js — Chiffrement AES-256-GCM
// Placer dans : services/crypto.js (dashboard)
// ============================================================

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

// Vérifie la présence et le format de la clé avant tout plantage au chargement
// du module. Buffer.from(undefined, 'hex') plantait immédiatement au démarrage
// si ENCRYPTION_KEY était absente sur Railway.
let KEY = null;
if (!process.env.ENCRYPTION_KEY) {
    console.error('❌ ENCRYPTION_KEY manquante — chiffrement/déchiffrement des tokens Twitch désactivé');
} else {
    try {
        KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
        if (KEY.length !== 32) {
            console.error(`❌ ENCRYPTION_KEY invalide — longueur attendue 32 bytes (64 caractères hex), reçu ${KEY.length}`);
            KEY = null;
        }
    } catch (err) {
        console.error('❌ ENCRYPTION_KEY invalide — format hex attendu:', err.message);
        KEY = null;
    }
}

function encrypt(text) {
    if (!text || !KEY) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format : iv:authTag:encrypted (tout en hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encryptedText) {
    if (!encryptedText || !KEY) return null;
    try {
        const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const encrypted = Buffer.from(encryptedHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
}

module.exports = { encrypt, decrypt };