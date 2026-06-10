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
} = require('discord.js');

const config = require('../../config');
const db = require('../../db/queries');

// ============================================================
// HELPERS
// ============================================================

function buildOnboardingTwitchButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('onboarding_twitch_link')
            .setLabel('Lier mon Twitch')
            .setEmoji('🔗')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('onboarding_twitch_skip')
            .setLabel('Skip')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary)
    );
}

function isTeamMember(member) {
    return member.roles.cache.some(
        role => role.name === config.TEAM_ROLE_NAME
    );
}

async function replyEphemeral(interaction, content, components = []) {
    await interaction.reply({
        content,
        components,
        flags: 64,
    });
}

async function fetchMember(guild, userId) {
    return guild.members.fetch(userId).catch(() => null);
}

async function fetchChannel(client, channelId) {
    return client.channels.fetch(channelId).catch(() => null);
}

async function hasChosenAgeRole(member) {
    return (
        member.roles.cache.has(config.ROLE_MINEUR_ID) ||
        member.roles.cache.has(config.ROLE_MAJEUR_ID)
    );
}

async function ensureMemberIsInStepTwo(interaction, member) {
    if (!member.roles.cache.has(config.ROLE_ETAPE_2_ID)) {
        await replyEphemeral(
            interaction,
            '❌ Tu n’es pas dans l’étape de validation.'
        );

        return false;
    }

    return true;
}

async function ensureAgeRoleChosen(interaction, member) {
    if (!(await hasChosenAgeRole(member))) {
        await replyEphemeral(
            interaction,
            '❌ Tu dois d’abord choisir Mineur ou Majeur.'
        );

        return false;
    }

    return true;
}

// ============================================================
// FIN ONBOARDING
// ============================================================

async function finishOnboarding(member, interaction, twitchName = null) {
    await member.roles.remove(config.ROLE_ETAPE_2_ID).catch(() => null);
    await member.roles.add(config.ROLE_MEMBRE_ID);

    await sendWelcomeMessage(member, interaction);
    await sendOnboardingRecap(member, interaction, twitchName);
}

async function sendWelcomeMessage(member, interaction) {
    const welcomeChannel = await fetchChannel(
        interaction.client,
        config.WELCOME_CHANNEL_ID
    );

    if (!welcomeChannel) return;

    await welcomeChannel.send(
        `${member}\n\n` +
        `👋 Bienvenue chez Black&Co' !\n\n` +
        `Ravi de t’accueillir ici 🔥\n\n` +
        `👉 N’hésite pas à rejoindre le club des bibiches si ce n’est pas déjà fait 😏\n\n` +
        `👉 Prends un moment pour découvrir les salons et t’installer tranquillement\n\n` +
        `🎮 Ici c’est chill, gaming et bonne ambiance avant tout !\n\n` +
        `Amuse-toi bien parmi nous 🚀`
    ).catch(() => null);
}

async function sendOnboardingRecap(member, interaction, twitchName) {
    const recapChannel = await fetchChannel(
        interaction.client,
        config.ONBOARDING_RECAP_CHANNEL_ID
    );

    if (!recapChannel) return;

    const trustButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`onboarding_trust_${member.id}`)
            .setLabel('Valider Bibiche')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
    );

    await recapChannel.send({
        content:
            `🦌 **Nouveau membre onboarding terminé**\n\n` +
            `👤 Membre : ${member}\n` +
            `📺 Twitch : **${twitchName || 'Non lié / Skip'}**\n` +
            `🧩 Statut : **Membre ajouté**\n\n` +
            `Tu peux valider la fiabilité plus tard avec le bouton ci-dessous.`,
        components: [trustButtons],
    }).catch(() => null);
}

// ============================================================
// HANDLER BOUTONS
// ============================================================

async function handleOnboardingButton(interaction) {
    const { customId, user, guild } = interaction;

    if (
        customId === 'onboarding_age_minor' ||
        customId === 'onboarding_age_adult'
    ) {
        await handleAgeChoice(interaction, guild, user);
        return true;
    }

    if (customId === 'onboarding_twitch_link') {
        await showTwitchLinkModal(interaction);
        return true;
    }

    if (customId === 'onboarding_twitch_skip') {
        await handleTwitchSkip(interaction, guild, user);
        return true;
    }

    if (customId.startsWith('onboarding_trust_')) {
        await handleTrustValidation(interaction, guild, user);
        return true;
    }

    return false;
}

// ============================================================
// ÂGE
// ============================================================

async function handleAgeChoice(interaction, guild, user) {
    const member = await fetchMember(guild, user.id);

    if (!member) {
        await replyEphemeral(interaction, '❌ Membre introuvable.');
        return;
    }

    if (!(await ensureMemberIsInStepTwo(interaction, member))) {
        return;
    }

    const isMinor = interaction.customId === 'onboarding_age_minor';

    const roleToAdd = isMinor
        ? config.ROLE_MINEUR_ID
        : config.ROLE_MAJEUR_ID;

    const roleToRemove = isMinor
        ? config.ROLE_MAJEUR_ID
        : config.ROLE_MINEUR_ID;

    await member.roles.remove(roleToRemove).catch(() => null);
    await member.roles.add(roleToAdd);

    await interaction.message.delete().catch(() => null);

    await replyEphemeral(
        interaction,
        `✅ Âge enregistré.\n\n` +
        `Dernière étape : lie ton compte Twitch ou clique sur Skip.`,
        [buildOnboardingTwitchButtons()]
    );
}

// ============================================================
// TWITCH : MODAL
// ============================================================

async function showTwitchLinkModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('onboarding_twitch_modal')
        .setTitle('Lier ton compte Twitch');

    const twitchInput = new TextInputBuilder()
        .setCustomId('twitch_pseudo')
        .setLabel('Ton pseudo Twitch')
        .setPlaceholder('Exemple : BlackAlpha39')
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(32)
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(twitchInput)
    );

    await interaction.showModal(modal);
}

// ============================================================
// TWITCH : SKIP
// ============================================================

async function handleTwitchSkip(interaction, guild, user) {
    const member = await fetchMember(guild, user.id);

    if (!member) {
        await replyEphemeral(interaction, '❌ Membre introuvable.');
        return;
    }

    if (!(await ensureMemberIsInStepTwo(interaction, member))) {
        return;
    }

    if (!(await ensureAgeRoleChosen(interaction, member))) {
        return;
    }

    await finishOnboarding(member, interaction, null);

    await replyEphemeral(
        interaction,
        '✅ Validation terminée ! Tu as maintenant accès au serveur.'
    );
}

// ============================================================
// VALIDATION BIBICHE
// ============================================================

async function handleTrustValidation(interaction, guild, user) {
    const targetId = interaction.customId.replace('onboarding_trust_', '');
    const member = await fetchMember(guild, targetId);

    if (!member) {
        await replyEphemeral(interaction, '❌ Membre introuvable.');
        return;
    }

    if (!isTeamMember(interaction.member)) {
        await replyEphemeral(
            interaction,
            '❌ Seule la Team peut valider un membre Bibiche.'
        );

        return;
    }

    await member.roles.add(config.ROLE_BIBICHE_ID);

    await interaction.message.edit({
        content:
            interaction.message.content +
            `\n\n✅ Fiabilité validée par ${user}\n` +
            `🦌 Rôle Bibiche ajouté.`,
        components: [],
    }).catch(() => null);

    await replyEphemeral(
        interaction,
        `✅ ${member} a été validé en Bibiche.`
    );
}

// ============================================================
// HANDLER MODAL
// ============================================================

async function handleOnboardingModal(interaction) {
    const { customId, user, guild } = interaction;

    if (customId !== 'onboarding_twitch_modal') {
        return false;
    }

    const twitchName = interaction.fields
        .getTextInputValue('twitch_pseudo')
        .toLowerCase()
        .replace('@', '')
        .trim();

    const member = await fetchMember(guild, user.id);

    if (!member) {
        await replyEphemeral(interaction, '❌ Membre introuvable.');
        return true;
    }

    if (!(await ensureMemberIsInStepTwo(interaction, member))) {
        return true;
    }

    if (!(await ensureAgeRoleChosen(interaction, member))) {
        return true;
    }

    await db.setTwitchLink(twitchName, user.id);
    await finishOnboarding(member, interaction, twitchName);

    await replyEphemeral(
        interaction,
        `✅ Ton Twitch **${twitchName}** est lié.\n\n` +
        `Bienvenue officiellement sur le serveur 🖤`
    );

    return true;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleOnboardingButton,
    handleOnboardingModal,
};