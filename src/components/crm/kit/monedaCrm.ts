/**
 * Movido a `src/lib/crm/monedaCrm.ts` (2026-10-07): el servidor de voz (Railway) solo copia
 * `src/lib` y `src/types`, y el agente de voz necesita estas funciones. Se reexporta aquí para
 * que las pantallas sigan importándolo como antes.
 */
export * from '@/lib/crm/monedaCrm';
