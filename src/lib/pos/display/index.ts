/**
 * Pantalla del cliente del POS — núcleo compartido por la caja y /pos-display.
 * Ver docs/pos-doble-pantalla/PLAN.md.
 */

export * from './protocol';
export { projectCartForDisplay, type DisplayTotalsOverride, type ProjectCartOptions } from './projection';
export {
  DisplayEmitter,
  RAF_FALLBACK_MS,
  THANKS_DURATION_MS,
  defaultScheduler,
  findChangedLineId,
  sameLines,
  type DisplayEmitterOptions,
  type DisplayEmitterStartOptions,
  type DisplaySessionInfo,
  type Scheduler,
} from './emitter';
export { isQrPaymentCode, resolveCashReceived, toDisplayPayment, type CashReceivedEntry, type DisplayPaymentInput } from './payment';
// settings.ts y posDisplay.ts NO se reexportan: tocan Supabase y la organización
// activa (solo navegador). Se importan por su ruta desde la caja.
export {
  BroadcastChannelReceiver,
  BroadcastChannelTransport,
  ADOPTION_WINDOW_MS,
  HEARTBEAT_INTERVAL_MS,
  STALE_AFTER_MS,
  displayChannelName,
  isBroadcastChannelSupported,
  type BroadcastChannelReceiverOptions,
  type BroadcastChannelTransportOptions,
  type DisplayReceiver,
  type DisplayTransport,
  type HelloDraft,
} from './transport';
export {
  TERMINAL_ID_STORAGE_KEY,
  generateTerminalId,
  getOrCreateLocalTerminalId,
  isTerminalId,
  readLocalTerminalId,
  type TerminalIdStorage,
} from './terminal';
// Ruta de la pantalla y su detección desde el layout raíz (PWA, push): ver route.ts.
export { isCustomerDisplayPath } from './route';
// Parte D: indicador de la caja y tarjeta de Configuración › POS.
export {
  DEFAULT_PRESENCE_ENVIRONMENT,
  DISCONNECTED_PRESENCE,
  isDisplayPresent,
  isSamePresence,
  readDisplayPresence,
  resolvePresenceReason,
  type DisplayPresenceEnvironment,
  type DisplayPresenceReason,
  type DisplayPresenceSnapshot,
  type DisplayPresenceSource,
} from './presence';
export {
  CUSTOMER_DISPLAY_HINT_STORAGE_KEY,
  CUSTOMER_DISPLAY_ROUTE,
  CUSTOMER_DISPLAY_WINDOW_FEATURES,
  CUSTOMER_DISPLAY_WINDOW_NAME,
  canCloseViaNativeBridge,
  closeCustomerDisplay,
  getOpenedCustomerDisplayWindow,
  openCustomerDisplay,
  resolveNativePosDisplayApi,
  type CloseCustomerDisplayDeps,
  type CloseCustomerDisplayResult,
  type NativePosDisplayApi,
  type OpenCustomerDisplayDeps,
  type OpenCustomerDisplayResult,
} from './openDisplay';
