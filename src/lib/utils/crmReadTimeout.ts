import { DEFAULT_FETCH_TIMEOUT_MS } from './fetchJson';

/** Next dev compila los handlers antes de que empiece su plazo de servidor. */
export function tiempoLecturaCrm(): number {
  return process.env.NODE_ENV === 'development' ? 60_000 : DEFAULT_FETCH_TIMEOUT_MS;
}
