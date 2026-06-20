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
const { resolveShopPrices } = require('../../services/shop');
const { requireModerator } = require('../../utils/guildSettings');

async function getShopContext(guildId) {
    const shopSettings = await db.getModuleSettings(guildId, 'shop').catch(() => null);
    const economySettings = await db.getModuleSettings(guildId, 'economy').catch(() => null);
    return {
        moneyName: economySettings?.currency_singular || config.MONEY_NAME,
        prices: resolveShopPrices(shopSettings),
    };
}

const pendingRolePurchases = new Map();
const pendingPhraseRequests = new Map();

function buildApproveRejectButtons(requestId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_shop_${requestId}`).setLabel('Accepter').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject_shop_${requestId}`).setLabel('Refuser').setEmoji('❌').setStyle(ButtonStyle.Danger)
    );
}

function buildConfirmRoleButtons(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`confirm_role_purchase_${userId}`).setLabel('Confirmer').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cancel_role_purchase_${userId}`).setLabel('Annuler').setEmoji('❌').setStyle(ButtonStyle.Danger)
    );
}

function buildCompleteShopGageButton(requestId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`complete_shop_gage_${requestId}`).setLabel('Gage effectué').setEmoji('✅').setStyle(ButtonStyle.Success)
    );
}

function sanitizeMentions(text) {
    return text.replace(/@(everyone|here)/gi, '@ $1');
}

// Lit le salon de validation depuis guild_module_settings shop (dashboard) en priorité
async function getValidationChannel(discordClient, guildId) {
    const shopSettings = await db.getModuleSettings(guildId, 'shop').catch(() => null);
    const serverSettings = await db.getServerSettings(guildId).catch(() => null);

    // validation_channel_id du dashboard shop, sinon log_channel_id du shop, sinon log général
    const channelId = shopSettings?.validation_channel_id
        || shopSettings?.log_channel_id
        || serverSettings?.log_channel_id
        || config.LOG_CHANNEL_ID;

    return discordClient.channels.fetch(channelId).catch(() => null);
}

async function getLiveChannel(discordClient, guildId) {
    const serverSettings = await db.getServerSettings(guildId).catch(() => null);
    const channelId = serverSettings?.live_channel_id || config.LIVE_AUTO_CHANNEL_ID;
    return discordClient.channels.fetch(channelId).catch(() => null);
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

async function handleShopButton(interaction, discordClient, sendLog) {
    const { customId } = interaction;

    if (customId === 'shop_buy_emoji') { await handleBuyEmojiButton(interaction); return true; }
    if (customId === 'shop_buy_role') { await handleBuyRoleButton(interaction); return true; }
    if (customId.startsWith('confirm_role_purchase_')) { await handleConfirmRolePurchase(interaction, discordClient); return true; }
    if (customId.startsWith('cancel_role_purchase_')) { await handleCancelRolePurchase(interaction); return true; }
    if (customId === 'shop_buy_gage') { await handleBuyGageButton(interaction); return true; }
    if (customId === 'shop_buy_phrase') { await handleBuyPhraseButton(interaction); return true; }
    if (customId.startsWith('approve_shop_')) { await handleApproveShopRequest(interaction, discordClient, sendLog); return true; }
    if (customId.startsWith('reject_shop_')) { await handleRejectShopRequest(interaction, sendLog); return true; }

    return false;
}

async function handleBuyEmojiButton(interaction) {
    const modal = new ModalBuilder().setCustomId('emoji_name_modal').setTitle('Emoji personnalisé');
    modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('emoji_name').setLabel("Nom de l'emoji").setPlaceholder('Exemple : bibichelove').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(32).setRequired(true)
    ));
    await interaction.showModal(modal);
}

async function handleBuyRoleButton(interaction) {
    const modal = new ModalBuilder().setCustomId('role_name_modal').setTitle('Créer un rôle temporaire');
    modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('role_name').setLabel('Nom du rôle').setPlaceholder('Exemple : Bibiche Alpha').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(32).setRequired(true)
    ));
    await interaction.showModal(modal);
}

async function handleConfirmRolePurchase(interaction, discordClient) {
    await interaction.deferReply({ flags: 64 });
    const { user, guildId } = interaction;
    const purchase = pendingRolePurchases.get(`${guildId}:${user.id}`);

    if (!purchase) { await interaction.editReply({ content: '❌ Aucune création de rôle en cours.' }); return; }

    const requestId = await db.insertShopRequest(guildId, user.id, 'role', JSON.stringify({ roleName: purchase.roleName, color: purchase.color, duration: purchase.duration }), purchase.price);
    pendingRolePurchases.delete(`${guildId}:${user.id}`);

    const validationChannel = await getValidationChannel(discordClient, guildId);
    if (validationChannel) {
        const { moneyName } = await getShopContext(guildId);
        await validationChannel.send({
            content:
                `👑 **Nouvelle demande de rôle personnalisé**\n\n` +
                `👤 Membre : ${user}\n` +
                `🏷️ Nom : **${purchase.roleName}**\n` +
                `🎨 Couleur : **${config.ROLE_COLOR_NAMES[purchase.color] || purchase.color}**\n` +
                `⏳ Durée : **${purchase.duration} jours**\n` +
                `💰 Prix : **${purchase.price} ${moneyName}s**`,
            components: [buildApproveRejectButtons(requestId)],
        });
    }

    await interaction.editReply({ content: '✅ Ta demande de rôle a été envoyée à la Team pour validation.' });
}

async function handleCancelRolePurchase(interaction) {
    await interaction.deferReply({ flags: 64 });
    pendingRolePurchases.delete(`${interaction.guildId}:${interaction.user.id}`);
    await interaction.editReply({ content: '❌ Achat annulé.' });
}

async function handleBuyGageButton(interaction) {
    const modal = new ModalBuilder().setCustomId('gage_modal').setTitle('Gage imposé');
    modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('gage_text').setLabel('Décris le gage souhaité').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true)
    ));
    await interaction.showModal(modal);
}

async function handleBuyPhraseButton(interaction) {
    await interaction.deferReply({ flags: 64 });

    const { moneyName, prices } = await getShopContext(interaction.guildId);
    const price1 = prices.phrase[1];
    const price2 = prices.phrase[2];

    const durationMenu = new StringSelectMenuBuilder()
        .setCustomId('phrase_duration')
        .setPlaceholder('Choisis la durée')
        .addOptions(
            { label: '1 live', description: `${price1} ${moneyName}s`, value: `1_${price1}` },
            { label: '2 lives', description: `${price2} ${moneyName}s`, value: `2_${price2}` }
        );

    await interaction.editReply({
        content: '📢 Choisis combien de lives la phrase doit rester affichée.',
        components: [new ActionRowBuilder().addComponents(durationMenu)],
    });
}

async function handleApproveShopRequest(interaction, discordClient, sendLog) {
    await interaction.deferReply({ flags: 64 });
    // Aucune vérification de permission n'existait auparavant — n'importe
    // quel membre ayant accès au salon de validation pouvait approuver une
    // demande, débiter des points et créer un rôle pour quelqu'un d'autre.
    if (!await requireModerator(interaction)) return;
    const { customId, user, guild, guildId } = interaction;
    const requestId = customId.replace('approve_shop_', '');
    const request = await db.getShopRequest(requestId);

    if (!request) { await interaction.editReply({ content: '❌ Demande introuvable.' }); return; }
    if (request.status !== 'pending') { await interaction.editReply({ content: '❌ Cette demande a déjà été traitée.' }); return; }

    const { moneyName } = await getShopContext(guildId);

    const userData = await db.getUserPoints(guildId, request.user_id);
    if (userData.balance < request.price) {
        await db.updateShopRequestStatus(requestId, 'rejected');
        await interaction.editReply({ content: `❌ Solde insuffisant.\n\n👤 <@${request.user_id}>\n💰 Prix : **${request.price} ${moneyName}s**` });
        return;
    }

    const newBalance = await db.addPoints(guildId, request.user_id, -request.price);
    await db.updateShopRequestStatus(requestId, 'approved');

    if (request.type === 'gage') {
        const liveChannel = await getLiveChannel(discordClient, guildId);
        if (liveChannel) {
            await liveChannel.send({
                content: `😈 **GAGE ACTIF**\n\n👤 <@${request.user_id}>\n\n${request.content}`,
                components: [buildCompleteShopGageButton(requestId)],
            });
        }
    }

    if (request.type === 'phrase') {
        const phraseData = JSON.parse(request.content);
        const liveChannel = await getLiveChannel(discordClient, guildId);
        if (liveChannel) {
            const activeMessage = await liveChannel.send({
                content: `📢 **PHRASE LIVE ACTIVE**\n\n👤 <@${request.user_id}>\n📺 Lives restants : **${phraseData.lives}**\n\n${phraseData.text}`,
            });
            await db.setShopRequestActiveMessage(requestId, activeMessage.id);
        }
    }

    if (request.type === 'role') {
        const roleData = JSON.parse(request.content);
        const member = await guild.members.fetch(request.user_id).catch(() => null);
        if (member) {
            const colorHex = config.ROLE_COLORS[roleData.color] || '#9933FF';
            const newRole = await guild.roles.create({ name: roleData.roleName, color: colorHex, reason: `Achat boutique par ${request.user_id}` });
            await member.roles.add(newRole);
            const expiresAt = new Date(Date.now() + roleData.duration * 24 * 60 * 60 * 1000);
            await db.insertTemporaryRole(request.user_id, newRole.id, guild.id, roleData.roleName, expiresAt);
        }
    }

    await sendLog(
        `✅ **Demande boutique acceptée**\n\n` +
        `👤 Membre : <@${request.user_id}>\n` +
        `📌 Type : **${request.type}**\n` +
        `💰 Débité : **${request.price} ${moneyName}s**\n` +
        `💳 Nouveau solde : **${newBalance} ${moneyName}s**\n` +
        `👑 Validé par : ${user}`
    ).catch(() => null);

    // dm_on_approve (shop_logs.ejs) était configurable mais jamais lu —
    // le membre n'était jamais notifié en privé de l'acceptation.
    const shopSettingsForDm = await db.getModuleSettings(guildId, 'shop').catch(() => null);
    if (shopSettingsForDm?.dm_on_approve) {
        const requester = await discordClient.users.fetch(request.user_id).catch(() => null);
        if (requester) {
            await requester.send(`✅ Ta demande boutique (**${request.type}**) sur **${guild.name}** a été acceptée !`).catch(() => null);
        }
    }

    await interaction.message.edit({ components: [] }).catch(() => null);
    await interaction.editReply({ content: `✅ Demande **#${requestId}** acceptée.` });
}

async function handleRejectShopRequest(interaction, sendLog) {
    try {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });
    } catch { return; }

    // Même garde-fou que pour l'approbation.
    if (!await requireModerator(interaction)) return;

    const requestId = interaction.customId.replace('reject_shop_', '');
    const request = await db.getShopRequest(requestId);

    if (!request) { await interaction.editReply({ content: '❌ Demande introuvable.' }); return; }
    if (request.status !== 'pending') { await interaction.editReply({ content: '❌ Cette demande a déjà été traitée.' }); return; }

    await db.updateShopRequestStatus(requestId, 'rejected');

    await sendLog(
        `❌ **Demande boutique refusée**\n\n` +
        `👤 Membre : <@${request.user_id}>\n` +
        `📌 Type : **${request.type}**\n` +
        `👑 Refusé par : ${interaction.user}`
    ).catch(() => null);

    // dm_on_reject (shop_logs.ejs) était configurable mais jamais lu.
    // Note : auto_refund_on_reject n'a pas été implémenté — le rejet
    // intervient toujours avant tout débit de points (le débit n'a lieu
    // qu'à l'approbation), donc il n'y a rien à rembourser à ce stade.
    const shopSettingsForDm = await db.getModuleSettings(interaction.guildId, 'shop').catch(() => null);
    if (shopSettingsForDm?.dm_on_reject) {
        const requester = await interaction.client.users.fetch(request.user_id).catch(() => null);
        if (requester) {
            await requester.send(`❌ Ta demande boutique (**${request.type}**) sur **${interaction.guild.name}** a été refusée.`).catch(() => null);
        }
    }

    await interaction.message.edit({ components: [] }).catch(() => null);
    await interaction.editReply({ content: `❌ Demande **#${requestId}** refusée.` });
}

// ============================================================
// MODALS
// ============================================================

async function handleShopModal(interaction, discordClient) {
    const { customId } = interaction;
    if (customId === 'role_name_modal') { await handleRoleNameModal(interaction); return true; }
    if (customId === 'gage_modal') { await handleGageModal(interaction, discordClient); return true; }
    if (customId === 'phrase_modal') { await handlePhraseModal(interaction, discordClient); return true; }
    return false;
}

async function handleRoleNameModal(interaction) {
    const roleName = interaction.fields.getTextInputValue('role_name').trim();
    pendingRolePurchases.set(`${interaction.guildId}:${interaction.user.id}`, { roleName, duration: null, color: null, price: null });
    await interaction.deferReply({ flags: 64 });

    const { moneyName, prices } = await getShopContext(interaction.guildId);

    await interaction.editReply({
        content: `👑 Nom du rôle choisi : **${roleName}**\n\nChoisis maintenant la durée et la couleur.`,
        components: [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('role_duration').setPlaceholder('Choisis la durée').addOptions(
                    { label: '1 semaine', description: `${prices.role[7]} ${moneyName}s`, value: `7_${prices.role[7]}` },
                    { label: '2 semaines', description: `${prices.role[14]} ${moneyName}s`, value: `14_${prices.role[14]}` },
                    { label: '1 mois', description: `${prices.role[30]} ${moneyName}s`, value: `30_${prices.role[30]}` }
                )
            ),
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('role_color').setPlaceholder('Choisis la couleur').addOptions(
                    Object.entries(config.ROLE_COLOR_NAMES).map(([value, label]) => ({ label, value }))
                )
            ),
        ],
    });
}

async function handleGageModal(interaction, discordClient) {
    await interaction.deferReply({ flags: 64 });
    const { user, guildId } = interaction;
    const gageText = sanitizeMentions(interaction.fields.getTextInputValue('gage_text'));
    const { moneyName, prices } = await getShopContext(guildId);
    const requestId = await db.insertShopRequest(guildId, user.id, 'gage', gageText, prices.gage);
    const validationChannel = await getValidationChannel(discordClient, guildId);
    if (validationChannel) {
        await validationChannel.send({
            content: `😈 **Nouvelle demande de gage**\n\n👤 Membre : ${user}\n💰 Prix : **${prices.gage} ${moneyName}s**\n\n📌 Gage demandé :\n${gageText}`,
            components: [buildApproveRejectButtons(requestId)],
        });
    }
    await interaction.editReply({ content: '✅ Ta demande de gage a été envoyée à la Team pour validation.' });
}

async function handlePhraseModal(interaction, discordClient) {
    await interaction.deferReply({ flags: 64 });
    const { user, guildId } = interaction;
    const phraseText = sanitizeMentions(interaction.fields.getTextInputValue('phrase_text'));
    const phraseData = pendingPhraseRequests.get(`${guildId}:${user.id}`);
    if (!phraseData) { await interaction.editReply({ content: '❌ Durée introuvable. Recommence depuis la boutique.' }); return; }
    const requestId = await db.insertShopRequest(guildId, user.id, 'phrase', JSON.stringify({ text: phraseText, lives: phraseData.lives }), phraseData.price);
    pendingPhraseRequests.delete(`${guildId}:${user.id}`);
    const validationChannel = await getValidationChannel(discordClient, guildId);
    if (validationChannel) {
        const { moneyName } = await getShopContext(guildId);
        await validationChannel.send({
            content: `📢 **Nouvelle demande de phrase épinglée**\n\n👤 Membre : ${user}\n💰 Prix : **${phraseData.price} ${moneyName}s**\n📺 Durée : **${phraseData.lives} live(s)**\n\n📌 Phrase demandée :\n${phraseText}`,
            components: [buildApproveRejectButtons(requestId)],
        });
    }
    await interaction.editReply({ content: '✅ Ta demande de phrase a été envoyée à la Team pour validation.' });
}

// ============================================================
// MENUS DÉROULANTS
// ============================================================

async function handleShopSelectMenu(interaction) {
    const { customId } = interaction;
    if (customId === 'phrase_duration') { await handlePhraseDurationSelect(interaction); return true; }
    if (customId === 'role_duration') { await handleRoleDurationSelect(interaction); return true; }
    if (customId === 'role_color') { await handleRoleColorSelect(interaction); return true; }
    return false;
}

async function handlePhraseDurationSelect(interaction) {
    const [lives, price] = interaction.values[0].split('_');
    pendingPhraseRequests.set(`${interaction.guildId}:${interaction.user.id}`, { lives: Number(lives), price: Number(price) });
    const modal = new ModalBuilder().setCustomId('phrase_modal').setTitle('Phrase épinglée');
    modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('phrase_text').setLabel('Phrase à afficher').setStyle(TextInputStyle.Paragraph).setMaxLength(300).setRequired(true)
    ));
    await interaction.showModal(modal);
}

async function handleRoleDurationSelect(interaction) {
    await interaction.deferReply({ flags: 64 });
    const purchaseKey = `${interaction.guildId}:${interaction.user.id}`;
    const purchase = pendingRolePurchases.get(purchaseKey);
    if (!purchase) { await interaction.editReply({ content: '❌ Aucune création de rôle en cours.' }); return; }
    const [days, price] = interaction.values[0].split('_');
    purchase.duration = Number(days);
    purchase.price = Number(price);
    pendingRolePurchases.set(purchaseKey, purchase);
    if (!purchase.color) { await interaction.editReply({ content: '✅ Durée enregistrée. Choisis maintenant la couleur.' }); return; }
    await sendRolePurchaseSummary(interaction, purchase);
}

async function handleRoleColorSelect(interaction) {
    await interaction.deferReply({ flags: 64 });
    const purchaseKey = `${interaction.guildId}:${interaction.user.id}`;
    const purchase = pendingRolePurchases.get(purchaseKey);
    if (!purchase) { await interaction.editReply({ content: '❌ Aucune création de rôle en cours.' }); return; }
    purchase.color = interaction.values[0];
    pendingRolePurchases.set(purchaseKey, purchase);
    if (!purchase.duration) { await interaction.editReply({ content: '✅ Couleur enregistrée. Choisis maintenant la durée.' }); return; }
    await sendRolePurchaseSummary(interaction, purchase);
}

async function sendRolePurchaseSummary(interaction, purchase) {
    if (!purchase || !purchase.duration || !purchase.color || !purchase.price) return;
    const { moneyName } = await getShopContext(interaction.guildId);
    await interaction.editReply({
        content:
            `👑 **Récapitulatif de l'achat**\n\n` +
            `🏷️ Nom : **${purchase.roleName}**\n` +
            `🎨 Couleur : **${config.ROLE_COLOR_NAMES[purchase.color] || purchase.color}**\n` +
            `⏳ Durée : **${purchase.duration} jours**\n` +
            `💰 Prix : **${purchase.price} ${moneyName}s**`,
        components: [buildConfirmRoleButtons(interaction.user.id)],
    });
}

module.exports = { handleShopButton, handleShopModal, handleShopSelectMenu, pendingRolePurchases, pendingPhraseRequests, buildApproveRejectButtons };