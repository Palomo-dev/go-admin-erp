/**
 * Lógica de la vista «Buscador › Apariencia» (Figma «16 Sitio web» 3242:99098, aprobada
 * 2026-11-25). Puro: lee y arma los cambios de `search_appearance` / `mobile_search_appearance`
 * (shell.header.opciones del documento V2). Lectura, valores de hoy, plantillas y contraste:
 * `@/lib/website/v2/aparienciaBuscador` (la misma copia que lee la tienda).
 */
import {
  aparienciaActiva,
  aparienciaDeDispositivo,
  aplicarPlantilla,
  cambiarApariencia,
  normalizarAparienciaBuscador,
  type AparienciaBuscador,
  type ClaveApariencia,
  type DispositivoBuscador,
  type FormaBuscador,
  type PlantillaBuscador,
} from '@/lib/website/v2/aparienciaBuscador';
import { buscadorCelular, buscadorComputador, buscadorEnConjunto } from './buscadorCelularLogica';

type Ajustes = Record<string, unknown>;

/** Clave del documento que se edita para cada dispositivo. */
export function claveApariencia(d: DispositivoBuscador): 'search_appearance' | 'mobile_search_appearance' {
  return d === 'celular' ? 'mobile_search_appearance' : 'search_appearance';
}

/** Con «igual al de escritorio» encendido solo se edita el computador (vale para los dos). */
export function dispositivosEditables(a: Ajustes): DispositivoBuscador[] {
  return buscadorEnConjunto(a) ? ['computador'] : ['computador', 'celular'];
}

/** Forma del buscador del dispositivo (la de computador o la que muestra el celular). */
export function formaDe(a: Ajustes, d: DispositivoBuscador): FormaBuscador {
  return d === 'celular' ? buscadorCelular(a) : buscadorComputador(a);
}

/** La vista «Apariencia» tiene sentido si alguno de los dos no está oculto. */
export function aparienciaDisponible(a: Ajustes): boolean {
  return buscadorComputador(a) !== 'hidden' || buscadorCelular(a) !== 'hidden';
}

/** Lo guardado del dispositivo (sin herencia). */
export function aparienciaGuardada(a: Ajustes, d: DispositivoBuscador): AparienciaBuscador | null {
  return normalizarAparienciaBuscador(a[claveApariencia(d)]);
}

/** Lo que se ve en el dispositivo (el celular vacío copia al computador). */
export function aparienciaVista(a: Ajustes, d: DispositivoBuscador): AparienciaBuscador | null {
  return aparienciaDeDispositivo(a, d);
}

/** El celular está copiando al computador (su apariencia está vacía y el interruptor apagado). */
export function celularCopia(a: Ajustes): boolean {
  return !buscadorEnConjunto(a) && !aparienciaActiva(aparienciaGuardada(a, 'celular'));
}

/**
 * Cambiar subclaves del dispositivo. El celular que copiaba arranca desde lo del computador, así
 * el primer cambio no borra lo que ya se veía. `null` en una subclave = volver a lo de hoy.
 */
export function cambioApariencia(a: Ajustes, d: DispositivoBuscador, cambios: Partial<Record<ClaveApariencia, unknown>>): Ajustes {
  const base = d === 'celular' && celularCopia(a) ? aparienciaGuardada(a, 'computador') : aparienciaGuardada(a, d);
  return { [claveApariencia(d)]: cambiarApariencia(base, cambios) };
}

/** Aplicar una plantilla al dispositivo. «Hoy» deja la clave vacía (en el celular, copia al computador). */
export function cambioPlantilla(d: DispositivoBuscador, id: PlantillaBuscador): Ajustes {
  return { [claveApariencia(d)]: id === 'today' ? null : aplicarPlantilla(id) };
}

/** «Restablecer buscador»: borra la apariencia de los dos. Forma, interruptor y populares no cambian. */
export function cambioRestablecerApariencia(): Ajustes {
  return { search_appearance: null, mobile_search_appearance: null };
}
