/**
 * Pantalla del cliente del POS — núcleo compartido por la caja y /pos-display.
 * Ver docs/pos-doble-pantalla/PLAN.md.
 */

export * from './protocol';
export { projectCartForDisplay, type ProjectCartOptions } from './projection';
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
} from './transport';
export {
  TERMINAL_ID_STORAGE_KEY,
  generateTerminalId,
  getOrCreateLocalTerminalId,
  isTerminalId,
  readLocalTerminalId,
  type TerminalIdStorage,
} from './terminal';
