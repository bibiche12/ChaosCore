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

const pendingRolePurchases = new Map();
const pendingPhraseRequests = new Map();

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

async function handleShopButton(interaction, discordClient, sendLog) {
    const { customId, user, guild } = interaction;

    if (customId === 'shop_buy_emoji') {
        const modal = new ModalBuilder()
            .setCustomId('emoji_name_modal')
            .setTitle('Emoji personnalisé');

        const emojiNameInput = new TextInputBuilder()
            .setCustomId('emoji_name')
            .setLabel('Nom de l’emoji')
            .setPlaceholder('Exemple : bibichelove')
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(32)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(emojiNameInput));
        await interaction.showModal(modal);
        return true;
    }

    if (customId === 'shop_buy_role') {
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

        modal.addComponents(new ActionRowBuilder().addComponents(roleNameInput));
        await interaction.showModal(modal);
        return true;
    }

    if (customId.startsWith('confirm_role_purchase_')) {
        const purchase = pendingRolePurchases.get(user.id);

        if (!purchase) {
            await interaction.reply({ content: '❌ Aucune création de rôle en cours.', flags: 64 });
            return true;
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

        const logChannel = await discordClient.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);

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

        await interaction.reply({
            content: '✅ Ta demande de rôle a été envoyée à la Team pour validation.',
            flags: 64,
        });
        return true;
    }

    if (customId.startsWith('cancel_role_purchase_')) {
        pendingRolePurchases.delete(user.id);
        await interaction.reply({ content: '❌ Achat annulé.', flags: 64 });
        return true;
    }

    if (customId === 'shop_buy_gage') {
        const modal = new ModalBuilder()
            .setCustomId('gage_modal')
            .setTitle('Gage imposé');

        const input = new TextInputBuilder()
            .setCustomId('gage_text')
            .setLabel('Décris le gage souhaité')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(500)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
        return true;
    }

    if (customId === 'shop_buy_phrase') {
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

        await interaction.reply({
            content: '📢 Choisis combien de lives la phrase doit rester affichée.',
            components: [new ActionRowBuilder().addComponents(durationMenu)],
            flags: 64,
        });
        return true;
    }

    if (customId.startsWith('approve_shop_')) {
        const requestId = customId.replace('approve_shop_', '');
        const request = await db.getShopRequest(requestId);

        if (!request) {
            await interaction.reply({ content: '❌ Demande introuvable.', flags: 64 });
            return true;
        }

        if (request.status !== 'pending') {
            await interaction.reply({ content: '❌ Cette demande a déjà été traitée.', flags: 64 });
            return true;
        }

        const newBalance = await db.addPoints(request.user_id, -request.price);

        if (newBalance === null) {
            await db.updateShopRequestStatus(requestId, 'rejected');

            await interaction.reply({
                content:
                    `❌ Solde insuffisant.\n\n` +
                    `👤 Membre : <@${request.user_id}>\n` +
                    `💰 Prix : **${request.price} Bichcoins**`,
                flags: 64,
            });
            return true;
        }

        await db.updateShopRequestStatus(requestId, 'approved');

        if (request.type === 'gage') {
            const liveChannel = await discordClient.channels.fetch(config.LIVE_AUTO_CHANNEL_ID).catch(() => null);

            if (liveChannel) {
                const button = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`complete_shop_gage_${requestId}`)
                        .setLabel('Gage effectué')
                        .setEmoji('✅')
                        .setStyle(ButtonStyle.Success)
                );

                await liveChannel.send({
                    content:
                        `😈 **GAGE ACTIF**\n\n` +
                        `👤 <@${request.user_id}>\n\n` +
                        `${request.content}`,
                    components: [button],
                });
            }
        }

        if (request.type === 'phrase') {
            const phraseData = JSON.parse(request.content);
            const liveChannel = await discordClient.channels.fetch(config.LIVE_AUTO_CHANNEL_ID).catch(() => null);

            if (liveChannel) {
                const activeMessage = await liveChannel.send({
                    content:
                        `📢 **PHRASE LIVE ACTIVE**\n\n` +
                        `👤 <@${request.user_id}>\n` +
                        `📺 Lives restants : **${phraseData.lives}**\n\n` +
                        `${phraseData.text}`,
                });

                await db.setShopRequestActiveMessage(requestId, activeMessage.id);
            }
        }

        if (request.type === 'role') {
            const roleData = JSON.parse(request.content);
            const member = await guild.members.fetch(request.user_id).catch(() => null);
            const colorHex = config.ROLE_COLORS[roleData.color] || '#9933FF';

            if (member) {
                const newRole = await guild.roles.create({
                    name: roleData.roleName,
                    color: colorHex,
                    reason: `Achat boutique Oncle'Bich par ${request.user_id}`,
                });

                await member.roles.add(newRole);

                const expiresAt = new Date(Date.now() + roleData.duration * 24 * 60 * 60 * 1000);

                await db.insertTemporaryRole(
                    request.user_id,
                    newRole.id,
                    guild.id,
                    roleData.roleName,
                    expiresAt
                );
            }
        }

        await sendLog(
            `✅ **Demande boutique acceptée**\n\n` +
            `👤 Membre : <@${request.user_id}>\n` +
            `📌 Type : **${request.type}**\n` +
            `💰 Débité : **${request.price} Bichcoins**\n` +
            `👑 Validé par : ${user}`
        ).catch(() => null);

        await interaction.message.edit({ components: [] }).catch(() => null);

        await interaction.reply({
            content: `✅ Demande **#${requestId}** acceptée.`,
            flags: 64,
        });
        return true;
    }

    if (customId.startsWith('reject_shop_')) {
        const requestId = customId.replace('reject_shop_', '');
        const request = await db.getShopRequest(requestId);

        if (!request) {
            await interaction.reply({ content: '❌ Demande introuvable.', flags: 64 });
            return true;
        }

        if (request.status !== 'pending') {
            await interaction.reply({ content: '❌ Cette demande a déjà été traitée.', flags: 64 });
            return true;
        }

        await db.updateShopRequestStatus(requestId, 'rejected');

        await sendLog(
            `❌ **Demande boutique refusée**\n\n` +
            `👤 Membre : <@${request.user_id}>\n` +
            `📌 Type : **${request.type}**\n` +
            `👑 Refusé par : ${user}`
        ).catch(() => null);

        await interaction.message.edit({ components: [] }).catch(() => null);

        await interaction.reply({
            content: `❌ Demande **#${requestId}** refusée.`,
            flags: 64,
        });
        return true;
    }

    return false;
}

async function handleShopModal(interaction, discordClient) {
    const { customId, user } = interaction;

    if (customId === 'role_name_modal') {
        const roleName = interaction.fields.getTextInputValue('role_name').trim();

        pendingRolePurchases.set(user.id, {
            roleName,
            duration: null,
            color: null,
            price: null,
        });

        const durationMenu = new StringSelectMenuBuilder()
            .setCustomId('role_duration')
            .setPlaceholder('Choisis la durée')
            .addOptions(
                { label: '1 semaine', description: '50 Bichcoins', value: '7_50' },
                { label: '2 semaines', description: '75 Bichcoins', value: '14_75' },
                { label: '1 mois', description: '150 Bichcoins', value: '30_150' }
            );

        const colorMenu = new StringSelectMenuBuilder()
            .setCustomId('role_color')
            .setPlaceholder('Choisis la couleur')
            .addOptions(
                Object.entries(config.ROLE_COLOR_NAMES).map(([value, label]) => ({
                    label,
                    value,
                }))
            );

        await interaction.reply({
            content:
                `👑 Nom du rôle choisi : **${roleName}**\n\n` +
                `Choisis maintenant la durée et la couleur.`,
            components: [
                new ActionRowBuilder().addComponents(durationMenu),
                new ActionRowBuilder().addComponents(colorMenu),
            ],
            flags: 64,
        });
        return true;
    }

    if (customId === 'gage_modal') {
        const gageText = interaction.fields
            .getTextInputValue('gage_text')
            .replace(/@(everyone|here)/gi, '@ $1');

        const requestId = await db.insertShopRequest(
            user.id,
            'gage',
            gageText,
            config.SHOP_PRICES.gage
        );

        const logChannel = await discordClient.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);

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

        await interaction.reply({
            content: '✅ Ta demande de gage a été envoyée à la Team pour validation.',
            flags: 64,
        });
        return true;
    }

    if (customId === 'phrase_modal') {
        const phraseText = interaction.fields
            .getTextInputValue('phrase_text')
            .replace(/@(everyone|here)/gi, '@ $1');

        const phraseData = pendingPhraseRequests.get(user.id);

        if (!phraseData) {
            await interaction.reply({
                content: '❌ Durée introuvable. Recommence depuis la boutique.',
                flags: 64,
            });
            return true;
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

        const logChannel = await discordClient.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);

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

        await interaction.reply({
            content: '✅ Ta demande de phrase a été envoyée à la Team pour validation.',
            flags: 64,
        });
        return true;
    }

    return false;
}

async function handleShopSelectMenu(interaction) {
    const { customId, user } = interaction;

    if (customId === 'phrase_duration') {
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

        modal.addComponents(new ActionRowBuilder().addComponents(input));

        await interaction.showModal(modal);
        return true;
    }

    if (customId === 'role_duration') {
        const purchase = pendingRolePurchases.get(user.id);

        if (!purchase) {
            await interaction.reply({ content: '❌ Aucune création de rôle en cours.', flags: 64 });
            return true;
        }

        const [days, price] = interaction.values[0].split('_');

        purchase.duration = Number(days);
        purchase.price = Number(price);

        pendingRolePurchases.set(user.id, purchase);

        if (!purchase.color) {
            await interaction.reply({
                content: '✅ Durée enregistrée. Choisis maintenant la couleur.',
                flags: 64,
            });
            return true;
        }
    }

    if (customId === 'role_color') {
        const purchase = pendingRolePurchases.get(user.id);

        if (!purchase) {
            await interaction.reply({ content: '❌ Aucune création de rôle en cours.', flags: 64 });
            return true;
        }

        purchase.color = interaction.values[0];

        pendingRolePurchases.set(user.id, purchase);

        if (!purchase.duration) {
            await interaction.reply({
                content: '✅ Couleur enregistrée. Choisis maintenant la durée.',
                flags: 64,
            });
            return true;
        }
    }

    const purchase = pendingRolePurchases.get(user.id);

    if (purchase && purchase.duration && purchase.color && purchase.price) {
        const confirmButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_role_purchase_${user.id}`)
                .setLabel('Confirmer')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(`cancel_role_purchase_${user.id}`)
                .setLabel('Annuler')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({
            content:
                `👑 **Récapitulatif de l’achat**\n\n` +
                `🏷️ Nom : **${purchase.roleName}**\n` +
                `🎨 Couleur : **${config.ROLE_COLOR_NAMES[purchase.color] || purchase.color}**\n` +
                `⏳ Durée : **${purchase.duration} jours**\n` +
                `💰 Prix : **${purchase.price} Bichcoins**`,
            components: [confirmButtons],
            flags: 64,
        });
        return true;
    }

    return false;
}

module.exports = {
    handleShopButton,
    handleShopModal,
    handleShopSelectMenu,
    pendingRolePurchases,
    pendingPhraseRequests,
    buildApproveRejectButtons,
};