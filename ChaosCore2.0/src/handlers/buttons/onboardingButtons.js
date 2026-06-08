const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');

const db = require('../../db/queries');
const config = require('../../config');

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

async function finishOnboarding(member, interaction, twitchName = null) {
    await member.roles.remove(config.ROLE_ETAPE_2_ID).catch(() => null);
    await member.roles.add(config.ROLE_MEMBRE_ID);

    const welcomeChannel = await interaction.client.channels
        .fetch(config.WELCOME_CHANNEL_ID)
        .catch(() => null);

    if (welcomeChannel) {
        await welcomeChannel.send(
            `${member}

👋 Bienvenue chez Black&Co' !

Ravi de t’accueillir ici 🔥

👉 N’hésite pas à rejoindre le club des bibiches si ce n’est pas déjà fait 😏

👉 Prends un moment pour découvrir les salons et t’installer tranquillement

🎮 Ici c’est chill, gaming et bonne ambiance avant tout !

Amuse-toi bien parmi nous 🚀`
        ).catch(() => null);
    }

    const recapChannel = await interaction.client.channels
        .fetch(config.ONBOARDING_RECAP_CHANNEL_ID)
        .catch(() => null);

    if (recapChannel) {
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
}

async function handleOnboardingButton(interaction) {
    const { customId, user, guild } = interaction;

    if (customId === 'onboarding_age_minor' || customId === 'onboarding_age_adult') {
        const member = await guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            await interaction.reply({
                content: '❌ Membre introuvable.',
                flags: 64,
            });
            return true;
        }

        if (!member.roles.cache.has(config.ROLE_ETAPE_2_ID)) {
            await interaction.reply({
                content: '❌ Tu n’es pas dans l’étape de validation.',
                flags: 64,
            });
            return true;
        }

        const roleToAdd = customId === 'onboarding_age_minor'
            ? config.ROLE_MINEUR_ID
            : config.ROLE_MAJEUR_ID;

        const roleToRemove = customId === 'onboarding_age_minor'
            ? config.ROLE_MAJEUR_ID
            : config.ROLE_MINEUR_ID;

        await member.roles.remove(roleToRemove).catch(() => null);
        await member.roles.add(roleToAdd);
        await interaction.message.delete().catch(() => null);

        await interaction.reply({
            content:
                `✅ Âge enregistré.\n\n` +
                `Dernière étape : lie ton compte Twitch ou clique sur Skip.`,
            components: [buildOnboardingTwitchButtons()],
            flags: 64,
        });

        return true;
    }

    if (customId === 'onboarding_twitch_link') {
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
        return true;
    }

    if (customId === 'onboarding_twitch_skip') {
        const member = await guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            await interaction.reply({
                content: '❌ Membre introuvable.',
                flags: 64,
            });
            return true;
        }

        if (!member.roles.cache.has(config.ROLE_ETAPE_2_ID)) {
            await interaction.reply({
                content: '❌ Tu n’es pas dans l’étape de validation.',
                flags: 64,
            });
            return true;
        }

        if (
            !member.roles.cache.has(config.ROLE_MINEUR_ID) &&
            !member.roles.cache.has(config.ROLE_MAJEUR_ID)
        ) {
            await interaction.reply({
                content: '❌ Tu dois d’abord choisir Mineur ou Majeur.',
                flags: 64,
            });
            return true;
        }

        await finishOnboarding(member, interaction, null);

        await interaction.reply({
            content: '✅ Validation terminée ! Tu as maintenant accès au serveur.',
            flags: 64,
        });

        return true;
    }

    if (customId.startsWith('onboarding_trust_')) {
        const targetId = customId.replace('onboarding_trust_', '');
        const member = await guild.members.fetch(targetId).catch(() => null);

        if (!member) {
            await interaction.reply({
                content: '❌ Membre introuvable.',
                flags: 64,
            });
            return true;
        }

        const isTeam = interaction.member.roles.cache.some(role => role.name === config.TEAM_ROLE_NAME);

        if (!isTeam) {
            await interaction.reply({
                content: '❌ Seule la Team peut valider un membre Bibiche.',
                flags: 64,
            });
            return true;
        }

        await member.roles.add(config.ROLE_BIBICHE_ID);

        await interaction.message.edit({
            content:
                interaction.message.content +
                `\n\n✅ Fiabilité validée par ${user}\n🦌 Rôle Bibiche ajouté.`,
            components: [],
        }).catch(() => null);

        await interaction.reply({
            content: `✅ ${member} a été validé en Bibiche.`,
            flags: 64,
        });

        return true;
    }

    return false;
}

async function handleOnboardingModal(interaction) {
    const { customId, user } = interaction;

    if (customId !== 'onboarding_twitch_modal') return false;

    const twitchName = interaction.fields
        .getTextInputValue('twitch_pseudo')
        .toLowerCase()
        .replace('@', '')
        .trim();

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
        await interaction.reply({
            content: '❌ Membre introuvable.',
            flags: 64,
        });
        return true;
    }

    if (!member.roles.cache.has(config.ROLE_ETAPE_2_ID)) {
        await interaction.reply({
            content: '❌ Tu n’es pas dans l’étape de validation.',
            flags: 64,
        });
        return true;
    }

    if (
        !member.roles.cache.has(config.ROLE_MINEUR_ID) &&
        !member.roles.cache.has(config.ROLE_MAJEUR_ID)
    ) {
        await interaction.reply({
            content: '❌ Tu dois d’abord choisir Mineur ou Majeur.',
            flags: 64,
        });
        return true;
    }

    await db.setTwitchLink(twitchName, user.id);

    await finishOnboarding(member, interaction, twitchName);

    await interaction.reply({
        content:
            `✅ Ton Twitch **${twitchName}** est lié.\n\n` +
            `Bienvenue officiellement sur le serveur 🖤`,
        flags: 64,
    });

    return true;
}

module.exports = {
    handleOnboardingButton,
    handleOnboardingModal,
};