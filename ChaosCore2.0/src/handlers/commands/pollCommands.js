const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const config = require('../../config');
const db = require('../../db/queries');
const { buildPollEmbed } = require('../../services/polls/pollResults');
const { checkCommandEnabled } = require('../../utils/guildSettings');

const COLORS = {
    rouge: 0xFF0000, orange: 0xFF8000, jaune: 0xFFD700,
    vert: 0x00CC66, bleu: 0x0099FF, violet: 0x9933FF,
    rose: 0xFF69B4, noir: 0x2F3136,
};

async function handlePollCommand(interaction) {
    if (interaction.commandName !== 'sondage') return false;

    // command_poll_enabled (page Sondages → Commandes) était configurable
    // mais jamais lu. Le champ DB s'appelle "poll" même si la commande
    // Discord réelle est /sondage.
    if (!await checkCommandEnabled(interaction, 'polls', 'poll')) return true;

    await interaction.deferReply({ flags: 64 });

    const guildId = interaction.guild.id;

    // Lire le salon de sondage depuis les settings polls du dashboard
    const pollSettings = await db.getModuleSettings(guildId, 'polls').catch(() => null);
    const serverSettings = await db.getServerSettings(guildId).catch(() => null);

    const pollChannelId = pollSettings?.poll_channel_id
        || config.POLL_SEND_CHANNEL_ID;

    const title = interaction.options.getString('titre');
    const question = interaction.options.getString('question');
    const durationType = interaction.options.getString('duree');
    const color = interaction.options.getString('couleur');
    const allowMultiple = interaction.options.getBoolean('multiple');
    const allowFreeAnswer = interaction.options.getBoolean('reponse_libre');

    const choices = [
        interaction.options.getString('choix1'),
        interaction.options.getString('choix2'),
        interaction.options.getString('choix3'),
        interaction.options.getString('choix4'),
        interaction.options.getString('choix5'),
        interaction.options.getString('choix6'),
    ].filter(Boolean);

    const endsAt = getPollEndDate(durationType);

    const poll = await db.createPoll({
        guildId,
        channelId: pollChannelId,
        creatorId: interaction.user.id,
        title,
        question,
        color,
        allowMultiple,
        allowFreeAnswer,
        durationType,
        endsAt,
    });

    for (const choice of choices) {
        await db.addPollOption(poll.id, choice);
    }

    const options = await db.getPollOptions(poll.id);

    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();

    options.forEach((option, index) => {
        const button = new ButtonBuilder()
            .setCustomId(`poll_vote_${poll.id}_${option.id}`)
            .setLabel(`${index + 1}`)
            .setStyle(ButtonStyle.Primary);
        if (index < 5) row1.addComponents(button);
        else row2.addComponents(button);
    });

    const controlRow = new ActionRowBuilder();
    if (allowFreeAnswer) {
        controlRow.addComponents(new ButtonBuilder().setCustomId(`poll_free_${poll.id}`).setLabel('Réponse libre').setEmoji('✍️').setStyle(ButtonStyle.Secondary));
    }
    controlRow.addComponents(new ButtonBuilder().setCustomId(`poll_close_${poll.id}`).setLabel('Clôturer').setEmoji('🔒').setStyle(ButtonStyle.Danger));

    const components = [row1];
    if (row2.components.length > 0) components.push(row2);
    components.push(controlRow);

    const pollChannel = await interaction.client.channels.fetch(pollChannelId).catch(() => null);
    if (!pollChannel) {
        await interaction.editReply({ content: "❌ Salon d'envoi du sondage introuvable. Configure-le dans le dashboard." });
        return true;
    }

    const message = await pollChannel.send({ embeds: [buildPollEmbed(poll, options)], components });
    await db.setPollMessageId(poll.id, message.id);

    await interaction.editReply({ content: `✅ Sondage envoyé dans <#${pollChannelId}>.` });
    return true;
}

function getPollEndDate(durationType) {
    const now = new Date();
    if (durationType === '1h') return new Date(now.getTime() + 60 * 60 * 1000);
    if (durationType === '1j') return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (durationType === '1semaine') return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return new Date(now.getTime() + 60 * 60 * 1000);
}

module.exports = { handlePollCommand };