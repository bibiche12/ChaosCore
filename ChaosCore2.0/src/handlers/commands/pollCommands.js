// ============================================================
// IMPORTS
// ============================================================

const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} = require('discord.js');

const config = require('../../config');
const db = require('../../db/queries');

const { buildPollEmbed } = require('../../services/polls/pollResults');
const { closePollAndPublishResults } = require('../../services/polls/pollService');

// ============================================================
// HELPERS
// ============================================================

function hasModeratorPermission(member) {
    const isModerator = member.roles.cache.has(config.MODERATOR_ROLE_ID);
    const isTeam = member.roles.cache.some(
        role => role.name === config.TEAM_ROLE_NAME
    );

    return isModerator || isTeam;
}

async function replyEphemeral(interaction, content) {
    await interaction.reply({
        content,
        flags: 64,
    });
}

async function editEphemeral(interaction, content) {
    await interaction.editReply({
        content,
    });
}

async function updatePollMessage(interaction, pollId) {
    const poll = await db.getPoll(pollId);

    if (!poll || poll.closed) {
        return;
    }

    const options = await db.getPollOptions(pollId);
    const results = await db.getPollResults(pollId);

    await interaction.message.edit({
        embeds: [buildPollEmbed(poll, options, results)],
    }).catch(() => null);
}

// ============================================================
// HANDLER BOUTONS
// ============================================================

async function handlePollButton(interaction) {
    const { customId } = interaction;

    if (customId.startsWith('poll_close_')) {
        await handlePollClose(interaction);
        return true;
    }

    if (customId.startsWith('poll_free_')) {
        await handlePollFreeAnswerButton(interaction);
        return true;
    }

    if (customId.startsWith('poll_vote_')) {
        await handlePollVote(interaction);
        return true;
    }

    return false;
}

// ============================================================
// CLÔTURE DU SONDAGE
// ============================================================

async function handlePollClose(interaction) {
    await interaction.deferReply({ flags: 64 });

    if (!hasModeratorPermission(interaction.member)) {
        await editEphemeral(
            interaction,
            '❌ Seule la modération peut clôturer un sondage.'
        );

        return;
    }

    const pollId = interaction.customId.replace('poll_close_', '');

    const closed = await closePollAndPublishResults(
        interaction.client,
        pollId,
        interaction.user.tag
    );

    await editEphemeral(
        interaction,
        closed
            ? '🔒 Sondage clôturé et résultats envoyés.'
            : '❌ Sondage introuvable ou déjà clôturé.'
    );
}

// ============================================================
// BOUTON RÉPONSE LIBRE
// ============================================================

async function handlePollFreeAnswerButton(interaction) {
    const pollId = interaction.customId.replace('poll_free_', '');
    const poll = await db.getPoll(pollId);

    if (!poll || poll.closed) {
        await replyEphemeral(
            interaction,
            '❌ Ce sondage est terminé ou introuvable.'
        );

        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`poll_free_modal_${pollId}`)
        .setTitle('Réponse libre');

    const input = new TextInputBuilder()
        .setCustomId('free_answer')
        .setLabel('Ta réponse')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);

    modal.addComponents(
        new ActionRowBuilder().addComponents(input)
    );

    await interaction.showModal(modal);
}

// ============================================================
// BOUTON VOTE
// ============================================================

async function handlePollVote(interaction) {
    await interaction.deferReply({ flags: 64 });

    const { pollId, optionId } = parseVoteCustomId(interaction.customId);
    const poll = await db.getPoll(pollId);

    if (!poll || poll.closed) {
        await editEphemeral(
            interaction,
            '❌ Ce sondage est terminé ou introuvable.'
        );

        return;
    }

    const alreadyVoted = await db.hasUserVotedOption(
        pollId,
        interaction.user.id,
        optionId
    );

    if (alreadyVoted) {
        await db.removePollVote(
            pollId,
            interaction.user.id,
            optionId
        );

        await updatePollMessage(interaction, pollId);

        await editEphemeral(
            interaction,
            '↩️ Ton vote a été retiré.'
        );

        return;
    }

    if (!poll.allow_multiple) {
        await db.clearUserPollVotes(
            pollId,
            interaction.user.id
        );
    }

    await db.addPollVote(
        pollId,
        interaction.user.id,
        optionId
    );

    await updatePollMessage(interaction, pollId);

    await editEphemeral(
        interaction,
        poll.allow_multiple
            ? '✅ Vote ajouté.'
            : '✅ Vote enregistré. Ton ancien vote a été remplacé.'
    );
}

function parseVoteCustomId(customId) {
    const parts = customId.split('_');

    return {
        pollId: parts[2],
        optionId: parts[3],
    };
}

// ============================================================
// HANDLER MODAL
// ============================================================

async function handlePollModal(interaction) {
    if (!interaction.customId.startsWith('poll_free_modal_')) {
        return false;
    }

    await handlePollFreeAnswerModal(interaction);
    return true;
}

// ============================================================
// MODAL RÉPONSE LIBRE
// ============================================================

async function handlePollFreeAnswerModal(interaction) {
    await interaction.deferReply({ flags: 64 });

    const pollId = interaction.customId.replace('poll_free_modal_', '');
    const answer = interaction.fields.getTextInputValue('free_answer');

    const poll = await db.getPoll(pollId);

    if (!poll || poll.closed) {
        await editEphemeral(
            interaction,
            '❌ Ce sondage est terminé ou introuvable.'
        );

        return;
    }

    await db.addPollFreeAnswer(
        pollId,
        interaction.user.id,
        answer
    );

    await editEphemeral(
        interaction,
        '✅ Ta réponse libre a été enregistrée.'
    );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handlePollButton,
    handlePollModal,
};