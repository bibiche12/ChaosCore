const config = require('../../config');
const db = require('../../db/queries');

function hasTeamRole(member) {
    return member.roles.cache.some(role => role.name === config.TEAM_ROLE_NAME);
}

function requireTeam(interaction) {
    if (!hasTeamRole(interaction.member)) {
        interaction.reply({
            content: '❌ Tu n’as pas l’autorisation d’utiliser cette commande.',
            flags: 64,
        });

        return false;
    }

    return true;
}

async function handleTwitchCommand(interaction, { sendContestLog }) {
    if (interaction.commandName === 'twitch') {
        if (!requireTeam(interaction)) return true;

        await interaction.deferReply({ flags: 64 });

        const target = interaction.options.getUser('membre');
        const pseudo = interaction.options
            .getString('pseudo')
            .toLowerCase()
            .replace('@', '')
            .trim();

        await db.setTwitchLink(pseudo, target.id);

        await sendContestLog(
            `🔗 **Association Twitch**\n\n` +
            `👤 Discord : ${target}\n` +
            `📺 Twitch : **${pseudo}**\n` +
            `👑 Par : ${interaction.user}`
        ).catch(() => null);

        await interaction.editReply(
            `✅ ${target} est maintenant associé au pseudo Twitch **${pseudo}**.`
        );

        return true;
    }

    if (interaction.commandName === 'twitchlinks') {
        if (!requireTeam(interaction)) return true;

        await interaction.deferReply({ flags: 64 });

        const links = await db.listTwitchLinks();

        if (links.length === 0) {
            await interaction.editReply(
                '🔗 Aucune liaison Twitch enregistrée.'
            );

            return true;
        }

        const lines = links.slice(0, 30).map(
            link => `📺 **${link.twitch_name}** → <@${link.user_id}>`
        );

        await interaction.editReply(
            `🔗 **Liaisons Twitch enregistrées**\n\n${lines.join('\n')}`
        );

        return true;
    }

    return false;
}

module.exports = {
    handleTwitchCommand,
};