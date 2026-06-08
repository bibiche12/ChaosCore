const { SlashCommandBuilder } = require('discord.js');

const commandDefinitions = [
    new SlashCommandBuilder()
        .setName('setuproles')
        .setDescription('Créer les messages de rôles'),

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Vérifie que ChaosCore fonctionne'),

    new SlashCommandBuilder()
        .setName('solde')
        .setDescription('Voir ton solde de Bichcoins'),

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
        .setName('tickets')
        .setDescription('Voir tes Tickets du Chaos'),

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
        .setDescription('Afficher le classement Tickets du Chaos'),

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
        .setName('twitchlinks')
        .setDescription('Afficher les liaisons Twitch enregistrées'),

    new SlashCommandBuilder()
        .setName('setupboutique')
        .setDescription('Installer ou mettre à jour la boutique Oncle’Bich'),

    new SlashCommandBuilder()
        .setName('clearoverlay')
        .setDescription('Vider tous les gages de la bannière'),

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