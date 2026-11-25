/** Rutas de la app del domiciliario (qué páginas ve cada quien lo decide el catálogo de navegación). */
import { RUTAS_LOGISTICA } from '@/lib/logistica/rutas';

export const RUTA_MIS_ENVIOS = RUTAS_LOGISTICA.misEnvios;
export const rutaParada = (id: string) => `${RUTA_MIS_ENVIOS}/${encodeURIComponent(id)}`;
export const rutaEntregar = (id: string) => `${rutaParada(id)}/entregar`;
export const rutaNoEntregado = (id: string) => `${rutaParada(id)}/no-entregado`;
export const RUTA_FIN_JORNADA = `${RUTA_MIS_ENVIOS}/fin-jornada`;
export const RUTA_MAPA_RUTA = `${RUTA_MIS_ENVIOS}/mapa`;
export const RUTA_MI_VEHICULO = `${RUTA_MIS_ENVIOS}/vehiculo`;
