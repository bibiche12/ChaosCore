const { SlashCommandBuilder } = require('discord.js');

const commandDefinitions = [
    new SlashCommandBuilder()
    .setName('warning')
    .setDescription('Envoyer un avertissement modération à un membre')
    .addUserOption(o =>
        o.setName('membre')
            .setDescription('Membre à avertir')
            .setRequired(true)
    )
    .addStringOption(o =>
        o.setName('raison')
            .setDescription('Raison du warning')
            .setRequired(false)
    ),
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Vérifie que ChaosCore fonctionne'),

    new SlashCommandBuilder()
        .setName('profil')
        .setDescription('Voir ton profil ChaosCore'),

    new SlashCommandBuilder()
        .setName('adpoint')
        .setDescription('Ajouter des Bichcoins à un membre')
        .addUserOption(o =>
            o.setName('membre')
                .setDescription('Membre à créditer')
                .setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName('montant')
                .setDescription('Montant à ajouter')
                .setRequired(true)
                .setMinValue(1)
        ),

    new SlashCommandBuilder()
        .setName('retpoint')
        .setDescription('Retirer des Bichcoins à un membre')
        .addUserOption(o =>
            o.setName('membre')
                .setDescription('Membre à débiter')
                .setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName('montant')
                .setDescription('Montant à retirer')
                .setRequired(true)
                .setMinValue(1)
        ),

    new SlashCommandBuilder()
        .setName('adticket')
        .setDescription('Ajouter des Tickets du Chaos à un membre')
        .addUserOption(o =>
            o.setName('membre')
                .setDescription('Membre à créditer')
                .setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName('montant')
                .setDescription('Nombre de tickets')
                .setRequired(true)
                .setMinValue(1)
        ),

    new SlashCommandBuilder()
        .setName('retticket')
        .setDescription('Retirer des Tickets du Chaos à un membre')
        .addUserOption(o =>
            o.setName('membre')
                .setDescription('Membre à débiter')
                .setRequired(true)
        )
        .addIntegerOption(o =>
            o.setName('montant')
                .setDescription('Nombre de tickets')
                .setRequired(true)
                .setMinValue(1)
        ),

    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Afficher le résumé / classement Tickets du Chaos'),

    new SlashCommandBuilder()
        .setName('live')
        .setDescription('Démarrer le comptage live Twitch'),

    new SlashCommandBuilder()
        .setName('scan')
        .setDescription('Scanner Twitch maintenant pour détecter un live'),

    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Arrêter le comptage live Twitch'),

    new SlashCommandBuilder()
        .setName('raidoff')
        .setDescription('Désactiver le mode raid'),

    new SlashCommandBuilder()
        .setName('twitch')
        .setDescription('Associer un membre Discord à son pseudo Twitch')
        .addUserOption(o =>
            o.setName('membre')
                .setDescription('Membre Discord')
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('pseudo')
                .setDescription('Pseudo Twitch')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('setupboutique')
        .setDescription('Installer ou mettre à jour la boutique Oncle’Bich'),

    new SlashCommandBuilder()
        .setName('viderboutique')
        .setDescription('Vider les messages de la boutique Oncle’Bich'),

    new SlashCommandBuilder()
        .setName('cleanupshop')
        .setDescription('Nettoyer les demandes boutique expirées ou terminées'),

    new SlashCommandBuilder()
        .setName('clearoverlay')
        .setDescription('Vider tous les gages de la bannière OBS'),

    new SlashCommandBuilder()
        .setName('testoverlay')
        .setDescription('Tester l’affichage d’un gage sur la bannière OBS')
        .addStringOption(o =>
            o.setName('reward')
                .setDescription('Récompense')
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('texte')
                .setDescription('Texte à afficher')
                .setRequired(true)
        ),
].map(c => c.toJSON());

module.exports = {
    commandDefinitions,
};