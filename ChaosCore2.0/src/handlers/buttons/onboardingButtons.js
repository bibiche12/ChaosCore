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
const { hasTeamRole } = require('../../utils/guildSettings');

function buildOnboardingTwitchButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('onboarding_twitch_link').setLabel('Lier mon Twitch').setEmoji('🔗').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('onboarding_twitch_skip').setLabel('Skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary)
    );
}

async function isTeamMember(member) {
    if (member.permissions.has('Administrator')) return true;
    return await hasTeamRole(member);
}

async function replyEphemeral(interaction, content, components = []) {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content, components });
    } else {
        await interaction.reply({ content, components, flags: 64 });
    }
}

async function fetchMember(guild, userId) {
    return guild.members.fetch(userId).catch(() => null);
}

async function hasChosenAgeRole(member) {
    return member.roles.cache.has(config.ROLE_MINEUR_ID) || member.roles.cache.has(config.ROLE_MAJEUR_ID);
}

async function finishOnboarding(member, interaction, twitchName = null) {
    const guildId = member.guild.id;

    if (member.roles.cache.has(config.ROLE_ETAPE_2_ID)) {
        await member.roles.remove(config.ROLE_ETAPE_2_ID).catch(() => null);
    }

    await member.roles.add(config.ROLE_MEMBRE_ID).catch(console.error);

    // Lire le salon de bienvenue depuis les settings welcome du dashboard
    const welcomeSettings = await db.getModuleSettings(guildId, 'welcome').catch(() => null);
    const serverSettings = await db.getServerSettings(guildId).catch(() => null);

    const welcomeChannelId = welcomeSettings?.welcome_channel_id
        || serverSettings?.welcome_channel_id
        || config.WELCOME_CHANNEL_ID;

    const recapChannelId = serverSettings?.onboarding_log_channel_id
        || config.ONBOARDING_RECAP_CHANNEL_ID;

    if (welcomeChannelId) {
        const welcomeChannel = await interaction.client.channels.fetch(welcomeChannelId).catch(() => null);
        if (welcomeChannel) {
            // Message personnalisé depuis le dashboard
            const welcomeMsg = (welcomeSettings?.welcome_message || 'Bienvenue {mention} sur {server} !')
                .replace('{username}', member.user.username)
                .replace('{mention}', `${member}`)
                .replace('{server}', member.guild.name)
                .replace('{membercount}', member.guild.memberCount);

            await welcomeChannel.send(
                `${member}\n\n👋 Bienvenue chez Black&Co' !\n\n` +
                `${welcomeMsg}\n\n` +
                `🎮 Ici c'est chill, gaming et bonne ambiance avant tout ! Amuse-toi bien parmi nous 🚀`
            ).catch(() => null);
        }
    }

    if (recapChannelId) {
        const recapChannel = await interaction.client.channels.fetch(recapChannelId).catch(() => null);
        if (recapChannel) {
            const trustButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`onboarding_trust_${member.id}`).setLabel('Valider Bibiche').setEmoji('✅').setStyle(ButtonStyle.Success)
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
}

async function handleOnboardingButton(interaction) {
    const { customId, user, guild } = interaction;
    if (!customId.startsWith('onboarding_')) return false;

    // Vérifier si ce guild a l'onboarding configuré
    const serverSettings = await db.getServerSettings(guild.id).catch(() => null);
    const onboardingEnabled = serverSettings?.onboarding_enabled !== false
        ? (serverSettings?.onboarding_role_etape2_id || guild.id === process.env.GUILD_ID)
        : false;

    if (!onboardingEnabled) return false;

    if (customId === 'onboarding_age_minor' || customId === 'onboarding_age_adult') {
        await handleAgeChoice(interaction, guild, user);
        return true;
    }
    if (customId === 'onboarding_twitch_link') { await showTwitchLinkModal(interaction); return true; }
    if (customId === 'onboarding_twitch_skip') { await handleTwitchSkip(interaction, guild, user); return true; }
    if (customId.startsWith('onboarding_trust_')) { await handleTrustValidation(interaction, guild, user); return true; }

    return false;
}

async function handleAgeChoice(interaction, guild, user) {
    const member = await fetchMember(guild, user.id);
    if (!member) { await replyEphemeral(interaction, '❌ Membre introuvable.'); return; }
    if (!member.roles.cache.has(config.ROLE_ETAPE_2_ID)) { await replyEphemeral(interaction, '❌ Tu n\'es pas dans l\'étape de validation âge.'); return; }

    const isMinor = interaction.customId === 'onboarding_age_minor';
    const roleToAdd = isMinor ? config.ROLE_MINEUR_ID : config.ROLE_MAJEUR_ID;
    const roleToRemove = isMinor ? config.ROLE_MAJEUR_ID : config.ROLE_MINEUR_ID;

    if (member.roles.cache.has(roleToRemove)) await member.roles.remove(roleToRemove).catch(() => null);
    await member.roles.add(roleToAdd).catch(console.error);
    await interaction.message.delete().catch(() => null);

    await replyEphemeral(interaction,
        `✅ Âge enregistré.\n\nDernière étape : lie ton compte Twitch ou clique sur Skip.`,
        [buildOnboardingTwitchButtons()]
    );
}

async function showTwitchLinkModal(interaction) {
    const modal = new ModalBuilder().setCustomId('onboarding_twitch_modal').setTitle('Lier ton compte Twitch');
    modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('twitch_pseudo').setLabel('Ton pseudo Twitch').setPlaceholder('Exemple : BlackAlpha39').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(32).setRequired(true)
    ));
    await interaction.showModal(modal);
}

async function handleTwitchSkip(interaction, guild, user) {
    await interaction.deferReply({ flags: 64 });
    const member = await fetchMember(guild, user.id);
    if (!member) { await interaction.editReply({ content: '❌ Membre introuvable.' }); return; }
    if (!member.roles.cache.has(config.ROLE_ETAPE_2_ID)) { await interaction.editReply({ content: '❌ Tu n\'es pas dans l\'étape de validation.' }); return; }
    if (!(await hasChosenAgeRole(member))) { await interaction.editReply({ content: '❌ Tu dois d\'abord choisir Mineur ou Majeur.' }); return; }

    await finishOnboarding(member, interaction, null);
    await interaction.editReply({ content: '✅ Validation terminée ! Tu as maintenant accès au serveur.' });
}

async function handleTrustValidation(interaction, guild, user) {
    const targetId = interaction.customId.replace('onboarding_trust_', '');
    const member = await fetchMember(guild, targetId);
    if (!member) { await replyEphemeral(interaction, '❌ Membre introuvable.'); return; }
    if (!await isTeamMember(interaction.member)) { await replyEphemeral(interaction, '❌ Seule la Team peut valider un membre Bibiche.'); return; }

    await member.roles.add(config.ROLE_BIBICHE_ID).catch(console.error);
    await interaction.message.edit({
        content: interaction.message.content + `\n\n✅ Fiabilité validée par ${user}\n🦌 Rôle Bibiche ajouté.`,
        components: [],
    }).catch(() => null);
    await replyEphemeral(interaction, `✅ ${member} a été validé en Bibiche.`);
}

async function handleOnboardingModal(interaction) {
    const { customId, user, guild } = interaction;
    if (customId !== 'onboarding_twitch_modal') return false;

    const twitchName = interaction.fields.getTextInputValue('twitch_pseudo').toLowerCase().replace('@', '').trim();
    const member = await fetchMember(guild, user.id);

    if (!member) { await replyEphemeral(interaction, '❌ Membre introuvable.'); return true; }
    if (!member.roles.cache.has(config.ROLE_ETAPE_2_ID)) { await replyEphemeral(interaction, '❌ Tu n\'es pas dans l\'étape de validation.'); return true; }
    if (!(await hasChosenAgeRole(member))) { await replyEphemeral(interaction, '❌ Tu dois d\'abord choisir Mineur ou Majeur.'); return true; }

    // Avec guildId maintenant
    await db.setTwitchLink(guild.id, twitchName, user.id);
    await finishOnboarding(member, interaction, twitchName);

    await replyEphemeral(interaction, `✅ Ton Twitch **${twitchName}** est lié.\n\nBienvenue officiellement sur le serveur 🖤`);
    return true;
}

module.exports = { handleOnboardingButton, handleOnboardingModal };