const { handleModerationButton } = require('./buttons/moderationButtons');
const { handleRoleButton } = require('./buttons/roleButtons');
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

async function handleButton(interaction, discordClient, sendLog) {
    if (await handleRoleButton(interaction)) return;
    if (await handleOnboardingButton(interaction)) return;
    if (await handleOverlayButton(interaction)) return;
    if (await handleEmojiButton(interaction)) return;
    if (await handleModerationButton(interaction)) return;
    if (await handleShopButton(interaction, discordClient, sendLog)) return;
    if (await handlePollButton(interaction)) return;
}

async function handleModal(interaction, discordClient, sendLog) {
    if (await handleOnboardingModal(interaction)) return;
    if (await handleEmojiModal(interaction)) return;
    if (await handleShopModal(interaction, discordClient, sendLog)) return;
    if (await handlePollModal(interaction)) return;
}

async function handleSelectMenu(interaction) {
    if (await handleShopSelectMenu(interaction)) return;
}

module.exports = {
    handleButton,
    handleModal,
    handleSelectMenu,
    pendingEmojiRequests,
};