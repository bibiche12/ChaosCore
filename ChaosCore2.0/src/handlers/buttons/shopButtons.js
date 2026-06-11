// ============================================================
// IMPORTS
// ============================================================

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
} = require('discord.js');

const config = require('../../config');
const db = require('../../db/queries');

// ============================================================
// VARIABLES TEMPORAIRES
// ============================================================

const pendingRolePurchases = new Map();
const pendingPhraseRequests = new Map();

// ============================================================
// HELPERS
// ============================================================

function buildApproveRejectButtons(requestId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`approve_shop_${requestId}`)
            .setLabel('Accepter')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`reject_shop_${requestId}`)
            .setLabel('Refuser')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    );
}

function buildConfirmRoleButtons(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_role_purchase_${userId}`)
            .setLabel('Confirmer')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`cancel_role_purchase_${userId}`)
            .setLabel('Annuler')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    );
}

function buildCompleteShopGageButton(requestId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`complete_shop_gage_${requestId}`)
            .setLabel('Gage effectué')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
    );
}

async function fetchLogChannel(discordClient) {
    return discordClient.channels
        .fetch(config.LOG_CHANNEL_ID)
        .catch(() => null);
}

async function fetchLiveAutoChannel(discordClient) {
    return discordClient.channels
        .fetch(config.LIVE_AUTO_CHANNEL_ID)
        .catch(() => null);
}

function sanitizeMentions(text) {
    return text.replace(/@(everyone|here)/gi, '@ $1');
}

// ============================================================
// HANDLER BOUTONS PRINCIPAL
// ============================================================

async function handleShopButton(interaction, discordClient, sendLog) {
    const { customId } = interaction;

    if (customId === 'shop_buy_emoji') {
        await handleBuyEmojiButton(interaction);
        return true;
    }

    if (customId === 'shop_buy_role') {
        await handleBuyRoleButton(interaction);
        return true;
    }

    if (customId.startsWith('confirm_role_purchase_')) {
        await handleConfirmRolePurchase(interaction, discordClient);
        return true;
    }

    if (customId.startsWith('cancel_role_purchase_')) {
        await handleCancelRolePurchase(interaction);
        return true;
    }

    if (customId === 'shop_buy_gage') {
        await handleBuyGageButton(interaction);
        return true;
    }

    if (customId === 'shop_buy_phrase') {
        await handleBuyPhraseButton(interaction);
        return true;
    }

    if (customId.startsWith('approve_shop_')) {
        await handleApproveShopRequest(interaction, discordClient, sendLog);
        return true;
    }

    if (customId.startsWith('reject_shop_')) {
        await handleRejectShopRequest(interaction, sendLog);
        return true;
    }

    return false;
}

// ============================================================
// ACHAT EMOJI
// ============================================================

async function handleBuyEmojiButton(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('emoji_name_modal')
        .setTitle('Emoji personnalisé');

    const emojiNameInput = new TextInputBuilder()
        .setCustomId('emoji_name')
        .setLabel('Nom de l\'emoji')
        .setPlaceholder('Exemple : bibichelove')
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(32)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(emojiNameInput)
    );

    await interaction.showModal(modal);
}

// ============================================================
// ACHAT RÔLE TEMPORAIRE
// ============================================================

async function handleBuyRoleButton(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('role_name_modal')
        .setTitle('Créer un rôle temporaire');

    const roleNameInput = new TextInputBuilder()
        .setCustomId('role_name')
        .setLabel('Nom du rôle')
        .setPlaceholder('Exemple : Bibiche Alpha')
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(32)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(roleNameInput)
    );

    await interaction.showModal(modal);
}

// ============================================================
// CONFIRMER ACHAT RÔLE
// ============================================================

async function handleConfirmRolePurchase(interaction, discordClient) {
    await interaction.deferReply({ flags: 64 });

    const { user } = interaction;
    const purchase = pendingRolePurchases.get(user.id);

    if (!purchase) {
        await interaction.editReply({
            content: '❌ Aucune création de rôle en cours.',
        });
        return;
    }

    const requestId = await db.insertShopRequest(
        user.id,
        'role',
        JSON.stringify({
            roleName: purchase.roleName,
            color: purchase.color,
            duration: purchase.duration,
        }),
        purchase.price
    );

    pendingRolePurchases.delete(user.id);

    const logChannel = await fetchLogChannel(discordClient);

    if (logChannel) {
        await logChannel.send({
            content:
                `👑 **Nouvelle demande de rôle personnalisé**\n\n` +
                `👤 Membre : ${user}\n` +
                `🏷️ Nom : **${purchase.roleName}**\n` +
                `🎨 Couleur : **${config.ROLE_COLOR_NAMES[purchase.color] || purchase.color}**\n` +
                `⏳ Durée : **${purchase.duration} jours**\n` +
                `💰 Prix : **${purchase.price} Bichcoins**`,
            components: [buildApproveRejectButtons(requestId)],
        });
    }

    await interaction.editReply({
        content: '✅ Ta demande de rôle a été envoyée à la Team pour validation.',
    });
}

// ============================================================
// ANNULER ACHAT RÔLE
// ============================================================

async function handleCancelRolePurchase(interaction) {
    await interaction.deferReply({ flags: 64 });

    pendingRolePurchases.delete(interaction.user.id);

    await interaction.editReply({
        content: '❌ Achat annulé.',
    });
}

// ============================================================
// ACHAT GAGE
// ============================================================

async function handleBuyGageButton(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('gage_modal')
        .setTitle('Gage imposé');

    const input = new TextInputBuilder()
        .setCustomId('gage_text')
        .setLabel('Décris le gage souhaité')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(input)
    );

    await interaction.showModal(modal);
}

// ============================================================
// ACHAT PHRASE LIVE
// ============================================================

async function handleBuyPhraseButton(interaction) {
    await interaction.deferReply({ flags: 64 });

    const durationMenu = new StringSelectMenuBuilder()
        .setCustomId('phrase_duration')
        .setPlaceholder('Choisis la durée')
        .addOptions(
            {
                label: '1 live',
                description: `${config.SHOP_PRICES.phrase[1]} Bichcoins`,
                value: `1_${config.SHOP_PRICES.phrase[1]}`,
            },
            {
                label: '2 lives',
                description: `${config.SHOP_PRICES.phrase[2]} Bichcoins`,
                value: `2_${config.SHOP_PRICES.phrase[2]}`,
            }
        );

    await interaction.editReply({
        content: '📢 Choisis combien de lives la phrase doit rester affichée.',
        components: [
            new ActionRowBuilder().addComponents(durationMenu),
        ],
    });
}

// ============================================================
// VALIDATION TEAM — ACCEPTER
// ============================================================

async function handleApproveShopRequest(interaction, discordClient, sendLog) {
    await interaction.deferReply({ flags: 64 });

    const { customId, user, guild } = interaction;
    const requestId = customId.replace('approve_shop_', '');
    const request = await db.getShopRequest(requestId);

    if (!request) {
        await interaction.editReply({ content: '❌ Demande introuvable.' });
        return;
    }

    if (request.status !== 'pending') {
        await interaction.editReply({ content: '❌ Cette demande a déjà été traitée.' });
        return;
    }

    const userData = await db.getUserPoints(request.user_id);

    if (userData.balance < request.price) {
        await db.updateShopRequestStatus(requestId, 'rejected');

        await interaction.editReply({
            content:
                `❌ Solde insuffisant.\n\n` +
                `👤 Membre : <@${request.user_id}>\n` +
                `💰 Prix : **${request.price} Bichcoins**`,
        });
        return;
    }

    const newBalance = await db.addPoints(request.user_id, -request.price);
    await db.updateShopRequestStatus(requestId, 'approved');

    if (request.type === 'gage') {
        await activateShopGage(discordClient, requestId, request);
    }

    if (request.type === 'phrase') {
        await activateShopPhrase(discordClient, requestId, request);
    }

    if (request.type === 'role') {
        await activateShopRole(guild, request);
    }

    await sendLog(
        `✅ **Demande boutique acceptée**\n\n` +
        `👤 Membre : <@${request.user_id}>\n` +
        `📌 Type : **${request.type}**\n` +
        `💰 Débité : **${request.price} Bichcoins**\n` +
        `💳 Nouveau solde : **${newBalance} Bichcoins**\n` +
        `👑 Validé par : ${user}`
    ).catch(() => null);

    await interaction.message.edit({ components: [] }).catch(() => null);

    await interaction.editReply({
        content: `✅ Demande **#${requestId}** acceptée.`,
    });
}

async function activateShopGage(discordClient, requestId, request) {
    const liveChannel = await fetchLiveAutoChannel(discordClient);
    if (!liveChannel) return;

    await liveChannel.send({
        content:
            `😈 **GAGE ACTIF**\n\n` +
            `👤 <@${request.user_id}>\n\n` +
            `${request.content}`,
        components: [buildCompleteShopGageButton(requestId)],
    });
}

async function activateShopPhrase(discordClient, requestId, request) {
    const phraseData = JSON.parse(request.content);
    const liveChannel = await fetchLiveAutoChannel(discordClient);
    if (!liveChannel) return;

    const activeMessage = await liveChannel.send({
        content:
            `📢 **PHRASE LIVE ACTIVE**\n\n` +
            `👤 <@${request.user_id}>\n` +
            `📺 Lives restants : **${phraseData.lives}**\n\n` +
            `${phraseData.text}`,
    });

    await db.setShopRequestActiveMessage(requestId, activeMessage.id);
}

async function activateShopRole(guild, request) {
    const roleData = JSON.parse(request.content);
    const member = await guild.members.fetch(request.user_id).catch(() => null);

    if (!member) return;

    const colorHex = config.ROLE_COLORS[roleData.color] || '#9933FF';

    const newRole = await guild.roles.create({
        name: roleData.roleName,
        color: colorHex,
        reason: `Achat boutique Oncle'Bich par ${request.user_id}`,
    });

    await member.roles.add(newRole);

    const expiresAt = new Date(
        Date.now() + roleData.duration * 24 * 60 * 60 * 1000
    );

    await db.insertTemporaryRole(
        request.user_id,
        newRole.id,
        guild.id,
        roleData.roleName,
        expiresAt
    );
}

// ============================================================
// VALIDATION TEAM — REFUSER
// ============================================================

async function handleRejectShopRequest(interaction, sendLog) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: 64 });
        }
    } catch (error) {
        console.error('❌ Interaction refus boutique expirée:', error.message);
        return;
    }

    const { customId, user } = interaction;
    const requestId = customId.replace('reject_shop_', '');
    const request = await db.getShopRequest(requestId);

    if (!request) {
        await interaction.editReply({ content: '❌ Demande introuvable.' });
        return;
    }

    if (request.status !== 'pending') {
        await interaction.editReply({ content: '❌ Cette demande a déjà été traitée.' });
        return;
    }

    await db.updateShopRequestStatus(requestId, 'rejected');

    await sendLog(
        `❌ **Demande boutique refusée**\n\n` +
        `👤 Membre : <@${request.user_id}>\n` +
        `📌 Type : **${request.type}**\n` +
        `👑 Refusé par : ${user}`
    ).catch(() => null);

    await interaction.message.edit({ components: [] }).catch(() => null);

    await interaction.editReply({
        content: `❌ Demande **#${requestId}** refusée.`,
    });
}

// ============================================================
// HANDLER MODALS
// ============================================================

async function handleShopModal(interaction, discordClient) {
    const { customId } = interaction;

    if (customId === 'role_name_modal') {
        await handleRoleNameModal(interaction);
        return true;
    }

    if (customId === 'gage_modal') {
        await handleGageModal(interaction, discordClient);
        return true;
    }

    if (customId === 'phrase_modal') {
        await handlePhraseModal(interaction, discordClient);
        return true;
    }

    return false;
}

// ============================================================
// MODAL RÔLE — AFFICHE MENUS DURÉE / COULEUR
// ============================================================

async function handleRoleNameModal(interaction) {
    const { user } = interaction;
    const roleName = interaction.fields.getTextInputValue('role_name').trim();

    pendingRolePurchases.set(user.id, {
        roleName,
        duration: null,
        color: null,
        price: null,
    });

    await interaction.deferReply({ flags: 64 });

    await interaction.editReply({
        content:
            `👑 Nom du rôle choisi : **${roleName}**\n\n` +
            `Choisis maintenant la durée et la couleur.`,
        components: [
            new ActionRowBuilder().addComponents(buildRoleDurationMenu()),
            new ActionRowBuilder().addComponents(buildRoleColorMenu()),
        ],
    });
}

function buildRoleDurationMenu() {
    return new StringSelectMenuBuilder()
        .setCustomId('role_duration')
        .setPlaceholder('Choisis la durée')
        .addOptions(
            { label: '1 semaine', description: '50 Bichcoins', value: '7_50' },
            { label: '2 semaines', description: '75 Bichcoins', value: '14_75' },
            { label: '1 mois', description: '150 Bichcoins', value: '30_150' }
        );
}

function buildRoleColorMenu() {
    return new StringSelectMenuBuilder()
        .setCustomId('role_color')
        .setPlaceholder('Choisis la couleur')
        .addOptions(
            Object.entries(config.ROLE_COLOR_NAMES).map(([value, label]) => ({
                label,
                value,
            }))
        );
}

// ============================================================
// MODAL GAGE
// ============================================================

async function handleGageModal(interaction, discordClient) {
    await interaction.deferReply({ flags: 64 });

    const { user } = interaction;

    const gageText = sanitizeMentions(
        interaction.fields.getTextInputValue('gage_text')
    );

    const requestId = await db.insertShopRequest(
        user.id,
        'gage',
        gageText,
        config.SHOP_PRICES.gage
    );

    const logChannel = await fetchLogChannel(discordClient);

    if (logChannel) {
        await logChannel.send({
            content:
                `😈 **Nouvelle demande de gage**\n\n` +
                `👤 Membre : ${user}\n` +
                `💰 Prix : **${config.SHOP_PRICES.gage} Bichcoins**\n\n` +
                `📌 Gage demandé :\n${gageText}`,
            components: [buildApproveRejectButtons(requestId)],
        });
    }

    await interaction.editReply({
        content: '✅ Ta demande de gage a été envoyée à la Team pour validation.',
    });
}

// ============================================================
// MODAL PHRASE
// ============================================================

async function handlePhraseModal(interaction, discordClient) {
    await interaction.deferReply({ flags: 64 });

    const { user } = interaction;

    const phraseText = sanitizeMentions(
        interaction.fields.getTextInputValue('phrase_text')
    );

    const phraseData = pendingPhraseRequests.get(user.id);

    if (!phraseData) {
        await interaction.editReply({
            content: '❌ Durée introuvable. Recommence depuis la boutique.',
        });
        return;
    }

    const requestId = await db.insertShopRequest(
        user.id,
        'phrase',
        JSON.stringify({
            text: phraseText,
            lives: phraseData.lives,
        }),
        phraseData.price
    );

    pendingPhraseRequests.delete(user.id);

    const logChannel = await fetchLogChannel(discordClient);

    if (logChannel) {
        await logChannel.send({
            content:
                `📢 **Nouvelle demande de phrase épinglée**\n\n` +
                `👤 Membre : ${user}\n` +
                `💰 Prix : **${phraseData.price} Bichcoins**\n` +
                `📺 Durée : **${phraseData.lives} live(s)**\n\n` +
                `📌 Phrase demandée :\n${phraseText}`,
            components: [buildApproveRejectButtons(requestId)],
        });
    }

    await interaction.editReply({
        content: '✅ Ta demande de phrase a été envoyée à la Team pour validation.',
    });
}

// ============================================================
// HANDLER MENUS DÉROULANTS
// ============================================================

async function handleShopSelectMenu(interaction) {
    const { customId } = interaction;

    if (customId === 'phrase_duration') {
        await handlePhraseDurationSelect(interaction);
        return true;
    }

    if (customId === 'role_duration') {
        await handleRoleDurationSelect(interaction);
        return true;
    }

    if (customId === 'role_color') {
        await handleRoleColorSelect(interaction);
        return true;
    }

    return false;
}

// ============================================================
// MENU PHRASE — DURÉE
// ============================================================

async function handlePhraseDurationSelect(interaction) {
    const { user } = interaction;
    const [lives, price] = interaction.values[0].split('_');

    pendingPhraseRequests.set(user.id, {
        lives: Number(lives),
        price: Number(price),
    });

    const modal = new ModalBuilder()
        .setCustomId('phrase_modal')
        .setTitle('Phrase épinglée');

    const input = new TextInputBuilder()
        .setCustomId('phrase_text')
        .setLabel('Phrase à afficher')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(300)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(input)
    );

    await interaction.showModal(modal);
}

// ============================================================
// MENU RÔLE — DURÉE
// ============================================================

async function handleRoleDurationSelect(interaction) {
    await interaction.deferReply({ flags: 64 });

    const { user } = interaction;
    const purchase = pendingRolePurchases.get(user.id);

    if (!purchase) {
        await interaction.editReply({
            content: '❌ Aucune création de rôle en cours.',
        });
        return;
    }

    const [days, price] = interaction.values[0].split('_');

    purchase.duration = Number(days);
    purchase.price = Number(price);

    pendingRolePurchases.set(user.id, purchase);

    if (!purchase.color) {
        await interaction.editReply({
            content: '✅ Durée enregistrée. Choisis maintenant la couleur.',
        });
        return;
    }

    await sendRolePurchaseSummary(interaction, purchase);
}

// ============================================================
// MENU RÔLE — COULEUR
// ============================================================

async function handleRoleColorSelect(interaction) {
    await interaction.deferReply({ flags: 64 });

    const { user } = interaction;
    const purchase = pendingRolePurchases.get(user.id);

    if (!purchase) {
        await interaction.editReply({
            content: '❌ Aucune création de rôle en cours.',
        });
        return;
    }

    purchase.color = interaction.values[0];

    pendingRolePurchases.set(user.id, purchase);

    if (!purchase.duration) {
        await interaction.editReply({
            content: '✅ Couleur enregistrée. Choisis maintenant la durée.',
        });
        return;
    }

    await sendRolePurchaseSummary(interaction, purchase);
}

// ============================================================
// RÉCAPITULATIF ACHAT RÔLE
// ============================================================

async function sendRolePurchaseSummary(interaction, purchase) {
    if (!purchase || !purchase.duration || !purchase.color || !purchase.price) {
        return;
    }

    await interaction.editReply({
        content:
            `👑 **Récapitulatif de l'achat**\n\n` +
            `🏷️ Nom : **${purchase.roleName}**\n` +
            `🎨 Couleur : **${config.ROLE_COLOR_NAMES[purchase.color] || purchase.color}**\n` +
            `⏳ Durée : **${purchase.duration} jours**\n` +
            `💰 Prix : **${purchase.price} Bichcoins**`,
        components: [buildConfirmRoleButtons(interaction.user.id)],
    });
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleShopButton,
    handleShopModal,
    handleShopSelectMenu,
    pendingRolePurchases,
    pendingPhraseRequests,
    buildApproveRejectButtons,
};