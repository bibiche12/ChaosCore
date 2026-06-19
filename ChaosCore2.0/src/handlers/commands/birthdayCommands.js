const config = require('../../config');
const db = require('../../db/queries');
const { hasTeamRole } = require('../../utils/guildSettings');

function isValidDate(day, month) {
    const date = new Date(2024, month - 1, day);

    return (
        date.getDate() === day &&
        date.getMonth() === month - 1
    );
}

async function handleBirthdayCommand(interaction) {
    if (interaction.commandName === 'anniversaire') {
        const day = interaction.options.getInteger('jour');
        const month = interaction.options.getInteger('mois');

        if (!isValidDate(day, month)) {
            await interaction.reply({
                content: '❌ Date invalide. Exemple valide : `/anniversaire jour:16 mois:7`',
                flags: 64,
            });

            return true;
        }

        await db.setBirthday(
            interaction.guild.id,
            interaction.user.id,
            day,
            month
        );

        await interaction.reply({
            content: `🎂 Ton anniversaire a bien été enregistré pour le **${day}/${month}**.`,
            flags: 64,
        });

        return true;
    }

    if (interaction.commandName === 'setupanniversaire') {
        if (!await hasTeamRole(interaction.member)) {
            await interaction.reply({
                content: "❌ Tu n'as pas l'autorisation d'utiliser cette commande.",
                flags: 64,
            });

            return true;
        }

        const channel = interaction.options.getChannel('salon');

        await db.setBirthdayChannel(interaction.guild.id, channel.id);

        await interaction.reply({
            content: `✅ Les messages d'anniversaire seront envoyés dans ${channel}.`,
            flags: 64,
        });

        return true;
    }

    return false;
}

module.exports = {
    handleBirthdayCommand,
};