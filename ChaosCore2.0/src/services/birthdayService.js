const config = require('../config');
const db = require('../db/queries');

function getParisDateParts() {
    const formatter = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    const parts = formatter.formatToParts(new Date());

    const day = Number(parts.find(p => p.type === 'day').value);
    const month = Number(parts.find(p => p.type === 'month').value);
    const year = Number(parts.find(p => p.type === 'year').value);

    return {
        day,
        month,
        year,
        announceDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    };
}

async function checkBirthdays(client) {
    const { day, month, announceDate } = getParisDateParts();

    const birthdays = await db.getBirthdaysForDate(day, month);

    for (const birthday of birthdays) {
        const alreadyAnnounced = await db.hasBirthdayAnnouncement(
            birthday.guild_id,
            birthday.user_id,
            announceDate
        );

        if (alreadyAnnounced) {
            continue;
        }

        const setting = await db.getBirthdayChannel(birthday.guild_id);

        // config.BIRTHDAY_CHANNEL_ID n'existe pas dans config.js — pas de fallback
        // possible ici, le salon doit être configuré par serveur dans le dashboard.
        const channelId = setting?.channel_id;

        if (!channelId) {
            continue;
        }

        const channel = await client.channels
            .fetch(channelId)
            .catch(() => null);

        if (!channel) {
            continue;
        }

        await channel.send(
            `🎂 Aujourd'hui c'est l'anniversaire de <@${birthday.user_id}> !\n\n` +
            `Toute l'équipe te souhaite une magnifique journée remplie de bonheur, de cadeaux et de bonnes surprises ! 🥳`
        );

        await db.markBirthdayAnnounced(
            birthday.guild_id,
            birthday.user_id,
            announceDate
        );
    }
}

function startBirthdayJob(client) {
    setInterval(() => {
        checkBirthdays(client).catch(console.error);
    }, 60 * 60 * 1000);

    checkBirthdays(client).catch(console.error);
}

module.exports = {
    startBirthdayJob,
};