// La URL y la anon key de Supabase NO van aquí (auditoría desktop §4.5): se
// leen en tiempo de ejecución de resources/web/.env o del entorno, ver
// publicEnv.ts. Así rotar la clave o cambiar de proyecto no exige un release.

export const APP_NAME = 'Go Admin Desktop';
export const WEB_APP_URL = 'https://app.goadmin.io';

export const POLL_INTERVAL_MS = 5000;
export const HEARTBEAT_INTERVAL_MS = 20000;
export const DISCOVERY_PORT = 3456;

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
