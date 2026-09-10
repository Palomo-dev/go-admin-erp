/**
 * Módulo WhatsApp del CRM (FASE-16). Todo es SOLO servidor salvo `types.ts`,
 * `windowService.computeWindow/describeWindow`, `allowedHours.ts`,
 * `templateRender.ts` y `consent.isOptOutKeyword` (puros).
 */
export * from './types';
export { sendWhatsApp, createWhatsAppActivity } from './outboundService';
export { getWindow, getWindowByConversation, computeWindow, describeWindow, WINDOW_MS } from './windowService';
export { listChannels, resolveChannel, resolveRecipient, getOrgSettings, saveOrgSettings, capabilitiesFor, normalizePhoneDigits, countryFromPhone } from './channelService';
export { listHsm, getHsm, requireHsm, createHsm, updateHsm, deleteHsm, submitHsm, syncFromMeta, previewHsm } from './templateService';
export { renderTemplateComponents, renderedToText, validateHsm, extractParams } from './templateRender';
export { parseTemplateStatusUpdate, applyTemplateStatusUpdate } from './webhookTemplateStatus';
export { canContact, setConsent, listConsents, isOptOutKeyword, isOptInKeyword, applyInboundConsent } from './consent';
export { estimateMessageCost } from './costs';
export { isWithinAllowedHours, nextAllowedSlot } from './allowedHours';
export { listCampaigns, getCampaign, requireCampaign, createCampaign, updateCampaign, deleteCampaign } from './campaignStore';
export { materializeCampaign, resolveAudience, classifyCandidate } from './campaignMaterialize';
export { launchCampaign, pauseCampaign, resumeCampaign, cancelCampaign, getCampaignStats, listCampaignContacts, contactsToCsv, countContacts, checkMessagingLimit } from './campaignService';
export { runCampaignBatch, planDelay, classifySendError } from './campaignBatch';
export { applyMessageEventToCampaign, syncCampaignFromEvents, linkInboundReply, providerErrorAction } from './campaignEvents';
export { handleWhatsAppInbound, extractInboundText, inboundContentType } from './inboundService';
