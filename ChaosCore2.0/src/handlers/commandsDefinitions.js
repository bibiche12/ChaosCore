const { SlashCommandBuilder } = require('discord.js');

const commandDefinitions = [
    // =========================
    // Modération
    // =========================

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
        .setName('clear')
        .setDescription('Supprimer un nombre de messages dans le salon')
        .addIntegerOption(o =>
            o.setName('nombre')
                .setDescription('Nombre de messages à supprimer')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        ),

    new SlashCommandBuilder()
        .setName('raidoff')
        .setDescription('Désactiver le mode raid'),

    // =========================
    // Admin / Tests
    // =========================

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Vérifie que ChaosCore fonctionne'),

    new SlashCommandBuilder()
        .setName('setuproles')
        .setDescription('Créer les messages de rôles'),

    new SlashCommandBuilder()
        .setName('clearoverlay')
        .setDescription('Vider tous les gages de la bannière OBS'),

    new SlashCommandBuilder()
        .setName('testoverlay')
        .setDescription("Tester l'affichage d'un gage sur la bannière OBS")
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

    // =========================
    // Économie
    // =========================

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

    // =========================
    // Tickets du Chaos
    // =========================

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

    // =========================
    // Live Twitch
    // =========================

    new SlashCommandBuilder()
        .setName('live')
        .setDescription('Démarrer le comptage live Twitch'),

    new SlashCommandBuilder()
        .setName('scan')
        .setDescription('Scanner Twitch maintenant pour détecter un live'),

    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Arrêter le comptage live Twitch'),

    // =========================
    // Twitch
    // =========================

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

    // =========================
    // Boutique
    // =========================

    new SlashCommandBuilder()
        .setName('setupboutique')
        .setDescription("Installer ou mettre à jour la boutique Oncle'Bich"),

    new SlashCommandBuilder()
        .setName('viderboutique')
        .setDescription("Vider les messages de la boutique Oncle'Bich"),

    new SlashCommandBuilder()
        .setName('cleanupshop')
        .setDescription('Nettoyer les demandes boutique expirées ou terminées'),

    // =========================
    // Sondages
    // =========================

    new SlashCommandBuilder()
        .setName('sondage')
        .setDescription('Créer un sondage interactif')
        .addStringOption(o =>
            o.setName('titre')
                .setDescription('Titre du sondage')
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('question')
                .setDescription('Question du sondage')
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('choix1')
                .setDescription('Choix 1')
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('choix2')
                .setDescription('Choix 2')
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('duree')
                .setDescription('Durée du sondage')
                .setRequired(true)
                .addChoices(
                    { name: '🕐 1 heure', value: '1h' },
                    { name: '📅 1 jour', value: '1j' },
                    { name: '🗓️ 1 semaine', value: '1semaine' }
                )
        )
        .addStringOption(o =>
            o.setName('couleur')
                .setDescription('Couleur du sondage')
                .setRequired(true)
                .addChoices(
                    { name: '🔴 Rouge', value: 'rouge' },
                    { name: '🟠 Orange', value: 'orange' },
                    { name: '🟡 Jaune', value: 'jaune' },
                    { name: '🟢 Vert', value: 'vert' },
                    { name: '🔵 Bleu', value: 'bleu' },
                    { name: '🟣 Violet', value: 'violet' },
                    { name: '🌸 Rose', value: 'rose' },
                    { name: '⚫ Noir', value: 'noir' }
                )
        )
        .addBooleanOption(o =>
            o.setName('multiple')
                .setDescription('Autoriser plusieurs réponses ?')
                .setRequired(true)
        )
        .addBooleanOption(o =>
            o.setName('reponse_libre')
                .setDescription('Autoriser une réponse libre ?')
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('choix3')
                .setDescription('Choix 3')
                .setRequired(false)
        )
        .addStringOption(o =>
            o.setName('choix4')
                .setDescription('Choix 4')
                .setRequired(false)
        )
        .addStringOption(o =>
            o.setName('choix5')
                .setDescription('Choix 5')
                .setRequired(false)
        )
        .addStringOption(o =>
            o.setName('choix6')
                .setDescription('Choix 6')
                .setRequired(false)
        ),
].map(c => c.toJSON());

module.exports = {
    commandDefinitions,
};