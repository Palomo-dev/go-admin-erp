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
  cartLinesSignature,
  defaultScheduler,
  findChangedLineId,
  linesSignature,
  sameLines,
  type DisplayEmitterOptions,
  type DisplayEmitterStartOptions,
  type DisplaySessionInfo,
  type Scheduler,
  type TipPhase,
} from './emitter';
// F2-B: aritmética y saneado de la propina en pantalla, compartidos por la caja y /pos-display.
export {
  TIP_AMOUNT_LIMIT,
  TIP_CUSTOM_MAX_DIGITS,
  computeTipAmount,
  isAcceptableTipChoice,
  isValidTipPercent,
  resolveTipBase,
  resolveTipSelection,
  sanitizeDisplayTip,
  sanitizeTipAmount,
  tipOptions,
  type DisplayTipBlock,
  type TipOption,
  type TipSelection,
} from './tip';
export {
  QR_TEXT_MAX_CHARS,
  isImageSource,
  isQrPaymentCode,
  normalizeQrImageSource,
  parseExpiresAt,
  pickQrFromProviderResponse,
  qrTextFits,
  resolveCashReceived,
  resolveDisplayQr,
  toDisplayPayment,
  type CashReceivedEntry,
  type DisplayPaymentInput,
  type DisplayQr,
  type PickedProviderQr,
  type ResolveDisplayQrInput,
  type ResolvedDisplayQr,
} from './payment';
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
  setLocalTerminalId,
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
export {
  DESKTOP_DISPLAY_ID_STORAGE_KEY,
  UNKNOWN_DISPLAY_CHOICE,
  describeDisplay,
  describeSelectedDisplay,
  describeWindowStatus,
  displayChoiceToPersist,
  enableDesktopDisplayHere,
  findDisplay,
  formatDisplayOption,
  getDesktopPosDisplayBridge,
  listDesktopDisplays,
  needsReopenForDisplayChange,
  nextOpenedAt,
  persistDesktopDisplayChoice,
  readDesktopDisplayStatus,
  readSavedDisplayChoice,
  readSavedDisplayId,
  resolveDesktopWindowSignal,
  resolveIndicatorState,
  resolveNothingToClose,
  resolveSelectedDisplayId,
  saveDisplayChoice,
  saveDisplayId,
  subscribeDesktopDisplayStatus,
  supportsDesktopDisplayPicker,
  supportsDesktopDisplayStatus,
  type CustomerDisplayIndicatorState,
  type DesktopDisplayPickerBridge,
  type DesktopStatusSource,
  type DesktopWindowSignal,
  type DisplayChoice,
  type DisplayDescription,
  type DisplayIdStorage,
  type SelectedDisplayView,
  type WindowStatusView,
} from './desktopDisplay';
