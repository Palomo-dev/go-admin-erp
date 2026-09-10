import type { JobHandler } from '../types';

/** Handler de prueba del runner (FASE-00 §4.4): devuelve el payload recibido. */
export const noopHandler: JobHandler = async ({ job }) => ({ echoed: job.payload, at: new Date().toISOString() });
