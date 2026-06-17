const { EmbedBuilder } = require('discord.js');
const db = require('../../db/queries');

async function handleRoueCommand(interaction) {
    if (interaction.commandName !== 'roue') return false;

    const guildId = interaction.guildId;
    const nomDemande = interaction.options.getString('nom');

    // Récupérer les roues du guild
    const result = await db.pool.query(
        `SELECT * FROM roues WHERE guild_id = $1 ORDER BY created_at ASC`,
        [guildId]
    ).catch(() => ({ rows: [] }));

    const roues = result.rows;

    // Aucune roue configurée
    if (roues.length === 0) {
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor('#ef4444')
                .setTitle('❌ Aucune roue configurée')
                .setDescription('Crée une roue depuis le dashboard → Économie → Casino → Roues de défi.')
            ],
            ephemeral: true,
        });
        return true;
    }

    // Pas de nom spécifié → liste les roues disponibles
    if (!nomDemande) {
        const liste = roues.map((r, i) => `**${i + 1}.** ${r.name} — ${JSON.parse(r.segments).length} segments`).join('\n');
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor('#9146ff')
                .setTitle('🎡 Roues de défi disponibles')
                .setDescription(`Utilise \`/roue nom:<nom>\` pour tourner une roue.\n\n${liste}`)
            ],
            ephemeral: true,
        });
        return true;
    }

    // Chercher la roue par nom
    const roue = roues.find(r => r.name.toLowerCase() === nomDemande.toLowerCase());
    if (!roue) {
        await interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor('#ef4444')
                .setTitle('❌ Roue introuvable')
                .setDescription(`Aucune roue nommée **${nomDemande}**.\nUtilise \`/roue\` pour voir la liste.`)
            ],
            ephemeral: true,
        });
        return true;
    }

    const segments = JSON.parse(roue.segments);
    if (segments.length === 0) {
        await interaction.reply({ content: '❌ Cette roue n\'a aucun segment configuré.', ephemeral: true });
        return true;
    }

    // Animation de tirage
    await interaction.deferReply();

    // Simuler animation avec plusieurs messages
    const suspense = ['🎡 La roue tourne...', '🎡 Ça tourne encore...', '🎡 Presque...'];
    const animEmbed = new EmbedBuilder()
        .setColor('#9146ff')
        .setTitle(`🎡 ${roue.name}`)
        .setDescription('🎡 La roue tourne...')
        .setFooter({ text: 'ChaosCore • Roue de défi' });

    await interaction.editReply({ embeds: [animEmbed] });
    await new Promise(r => setTimeout(r, 1000));
    animEmbed.setDescription('🎡 Ça tourne encore...');
    await interaction.editReply({ embeds: [animEmbed] });
    await new Promise(r => setTimeout(r, 1000));
    animEmbed.setDescription('🎡 Presque...');
    await interaction.editReply({ embeds: [animEmbed] });
    await new Promise(r => setTimeout(r, 800));

    // Tirage aléatoire
    const resultat = segments[Math.floor(Math.random() * segments.length)];

    // Résultat final — visible par tous
    const resultEmbed = new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle(`🎡 ${roue.name} — Résultat !`)
        .setDescription(`## 🎯 ${resultat}`)
        .addFields({ name: '🎲 Lancé par', value: `${interaction.user}`, inline: true })
        .setFooter({ text: 'ChaosCore • Roue de défi' })
        .setTimestamp();

    await interaction.editReply({ embeds: [resultEmbed] });

    console.log(`🎡 [${guildId}] Roue "${roue.name}" → ${resultat} (par ${interaction.user.tag})`);
    return true;
}

module.exports = { handleRoueCommand };