// ============================================================
// IMPORTS — BOUTONS
// ============================================================

const { handleModerationButton } = require('./buttons/moderationButtons');
const { handleRoleButton } = require('./buttons/roleButtons');
const { handleSupportTicketButton } = require('./buttons/supportTicketButtons');

const {
    handleOnboardingButton,
    handleOnboardingModal,
} = require('./buttons/onboardingButtons');

const { handleOverlayButton } = require('./buttons/overlayButtons');

const {
    handleEmojiButton,
    handleEmojiModal,
    pendingEmojiRequests,
} = require('./buttons/emojiButtons');

const {
    handleShopButton,
    handleShopModal,
    handleShopSelectMenu,
} = require('./buttons/shopButtons');

const {
    handlePollButton,
    handlePollModal,
} = require('./buttons/pollButtons');

// ============================================================
// HANDLER BOUTONS
// ============================================================

async function handleButton(interaction, discordClient, sendLog) {
    if (await handleRoleButton(interaction)) return;
    if (await handleOnboardingButton(interaction)) return;
    if (await handleOverlayButton(interaction)) return;
    if (await handleEmojiButton(interaction)) return;
    if (await handleModerationButton(interaction)) return;
    if (await handleShopButton(interaction, discordClient, sendLog)) return;
    if (await handlePollButton(interaction)) return;
    if (await handleSupportTicketButton(interaction)) return;
}

// ============================================================
// HANDLER MODALS
// ============================================================

async function handleModal(interaction, discordClient, sendLog) {
    if (await handleOnboardingModal(interaction)) return;
    if (await handleEmojiModal(interaction)) return;
    if (await handleShopModal(interaction, discordClient, sendLog)) return;
    if (await handlePollModal(interaction)) return;
}

// ============================================================
// HANDLER SELECT MENUS
// ============================================================

async function handleSelectMenu(interaction) {
    if (await handleShopSelectMenu(interaction)) return;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    handleButton,
    handleModal,
    handleSelectMenu,
    pendingEmojiRequests,
};