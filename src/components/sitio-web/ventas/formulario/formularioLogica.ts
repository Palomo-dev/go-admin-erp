/**
 * Lógica PURA del configurador «Formulario del checkout» (Figma «16 Sitio web» › Checkout v2,
 * Parte F 3141-93709, F1–F7; encargo aprobado por el dueño el 2026-11-25). Sin React: la usan
 * `FormularioCheckout.tsx`, `DialogoCheckout.tsx` y las pruebas.
 *
 * El estado es la lista resuelta de la regla compartida con la tienda
 * (src/lib/website/formularioCheckout.ts): los 9 campos en su orden, con visible, obligatorio y los
 * textos propios (ausentes = los de la tienda). Los candados de los indispensables viven allá; aquí
 * solo se respetan (una acción sobre un campo fijo no cambia nada).
 */
import {
  LARGO_AYUDA_CAMPO,
  LARGO_EJEMPLO_CAMPO,
  LARGO_ETIQUETA_CAMPO,
  VERSION_FORMULARIO_CHECKOUT,
  ajusteDeResuelto,
  defCampoFormulario,
  esFormularioRecomendado,
  formularioRecomendado,
  resolverFormulario,
  type AjusteCampoFormulario,
  type CampoResuelto,
  type ClaveCampoFormulario,
  type FormularioCheckout,
  type SeccionFormulario,
} from '@/lib/website/formularioCheckout';

export type FilaFormulario = CampoResuelto;

export const SECCIONES_FORMULARIO: readonly SeccionFormulario[] = ['contacto', 'entrega'];

/** Lo guardado → las filas del configurador (sin configuración: el recomendado). */
export function filasIniciales(guardado: readonly AjusteCampoFormulario[] | null | undefined): FilaFormulario[] {
  return resolverFormulario(guardado) ?? formularioRecomendado();
}

export function filasDeSeccion(filas: readonly FilaFormulario[], seccion: SeccionFormulario): FilaFormulario[] {
  return filas.filter((f) => f.seccion === seccion);
}

function cambiarFila(filas: readonly FilaFormulario[], clave: ClaveCampoFormulario, cambio: (f: FilaFormulario) => FilaFormulario): FilaFormulario[] {
  return filas.map((f) => (f.clave === clave ? cambio(f) : f));
}

/** Mostrar u ocultar en la tienda. Un campo fijo no se oculta. */
export function ponerVisible(filas: readonly FilaFormulario[], clave: ClaveCampoFormulario, visible: boolean): FilaFormulario[] {
  if (defCampoFormulario(clave).fijoVisible) return [...filas];
  return cambiarFila(filas, clave, (f) => ({ ...f, visible }));
}

/** Obligatorio u opcional. Un campo fijo no cambia. */
export function ponerObligatorio(filas: readonly FilaFormulario[], clave: ClaveCampoFormulario, obligatorio: boolean): FilaFormulario[] {
  if (defCampoFormulario(clave).fijoObligatorio) return [...filas];
  return cambiarFila(filas, clave, (f) => ({ ...f, obligatorio }));
}

export interface TextosCampo {
  etiqueta: string;
  ayuda: string;
  placeholder: string;
}

/** Los textos que ve el diálogo «Editar»: los propios o los de la tienda. */
export function textosDe(fila: FilaFormulario): TextosCampo {
  const def = defCampoFormulario(fila.clave);
  return {
    etiqueta: fila.etiqueta ?? def.etiqueta,
    ayuda: fila.ayuda === undefined ? def.ayuda ?? '' : fila.ayuda ?? '',
    placeholder: fila.placeholder === undefined ? def.placeholder ?? '' : fila.placeholder ?? '',
  };
}

const limpio = (t: string) => t.replace(/\s+/g, ' ').trim();

/**
 * Guarda los textos del diálogo. Igual al de la tienda = sin texto propio (se borra). Etiqueta
 * vacía = la de la tienda. Ayuda o ejemplo vacíos = sin ayuda / sin ejemplo (`null`), salvo que la
 * tienda tampoco tenga (entonces, sin texto propio).
 */
export function ponerTextos(filas: readonly FilaFormulario[], clave: ClaveCampoFormulario, t: TextosCampo): FilaFormulario[] {
  const def = defCampoFormulario(clave);
  return cambiarFila(filas, clave, (f) => {
    const nueva: FilaFormulario = { ...f };
    delete nueva.etiqueta;
    delete nueva.ayuda;
    delete nueva.placeholder;
    const etiqueta = limpio(t.etiqueta).slice(0, LARGO_ETIQUETA_CAMPO);
    if (etiqueta && etiqueta !== def.etiqueta) nueva.etiqueta = etiqueta;
    const ayuda = limpio(t.ayuda).slice(0, LARGO_AYUDA_CAMPO);
    if (ayuda !== (def.ayuda ?? '')) nueva.ayuda = ayuda || null;
    if (def.conEjemplo) {
      const ejemplo = limpio(t.placeholder).slice(0, LARGO_EJEMPLO_CAMPO);
      if (ejemplo !== (def.placeholder ?? '')) nueva.placeholder = ejemplo || null;
    }
    return nueva;
  });
}

/** «Volver al texto recomendado»: los textos de la tienda. */
export function textosRecomendados(clave: ClaveCampoFormulario): TextosCampo {
  const def = defCampoFormulario(clave);
  return { etiqueta: def.etiqueta, ayuda: def.ayuda ?? '', placeholder: def.placeholder ?? '' };
}

/** ¿Se puede mover? (las indicaciones van siempre al final). */
export function sePuedeMover(clave: ClaveCampoFormulario): boolean {
  return !defCampoFormulario(clave).fijoOrden;
}

/**
 * Mueve un campo a `destino` (índice dentro de su sección). Los campos fijos no se mueven ni se
 * saltan: el destino se recorta a los lugares de los que se pueden mover.
 */
export function moverCampo(filas: readonly FilaFormulario[], clave: ClaveCampoFormulario, destino: number): FilaFormulario[] {
  if (!sePuedeMover(clave)) return [...filas];
  const seccion = defCampoFormulario(clave).seccion;
  const enSeccion = filasDeSeccion(filas, seccion);
  const movibles = enSeccion.filter((f) => sePuedeMover(f.clave));
  const desde = movibles.findIndex((f) => f.clave === clave);
  if (desde < 0) return [...filas];
  const hasta = Math.max(0, Math.min(destino, movibles.length - 1));
  if (hasta === desde) return [...filas];
  const nuevos = [...movibles];
  const [fila] = nuevos.splice(desde, 1);
  nuevos.splice(hasta, 0, fila);
  // Los fijos se quedan en su lugar dentro de la sección.
  let i = 0;
  const seccionNueva = enSeccion.map((f) => (sePuedeMover(f.clave) ? nuevos[i++] : f));
  let j = 0;
  return filas.map((f) => (f.seccion === seccion ? seccionNueva[j++] : f));
}

/** Volver al recomendado (orden, visibles, obligatorios y textos de la tienda). */
export function restablecer(): FilaFormulario[] {
  return formularioRecomendado();
}

function igualesSinOrden(a: FilaFormulario, b: FilaFormulario): boolean {
  return (
    a.visible === b.visible &&
    a.obligatorio === b.obligatorio &&
    a.etiqueta === b.etiqueta &&
    a.ayuda === b.ayuda &&
    a.placeholder === b.placeholder &&
    (a.exigirApellido ?? false) === (b.exigirApellido ?? false)
  );
}

/**
 * Cambios sin guardar del formulario (para «N cambios sin guardar»): cada campo con algo distinto
 * cuenta uno, y cada sección con otro orden cuenta uno (subir el celular = 1 cambio).
 */
export function contarCambiosFormulario(antes: readonly FilaFormulario[], ahora: readonly FilaFormulario[]): number {
  let n = 0;
  for (const f of ahora) {
    const a = antes.find((x) => x.clave === f.clave);
    if (!a || !igualesSinOrden(a, f)) n += 1;
  }
  for (const s of SECCIONES_FORMULARIO) {
    const oa = filasDeSeccion(antes, s).map((f) => f.clave).join();
    const ob = filasDeSeccion(ahora, s).map((f) => f.clave).join();
    if (oa !== ob) n += 1;
  }
  return n;
}

export function hayCambiosFormulario(antes: readonly FilaFormulario[], ahora: readonly FilaFormulario[]): boolean {
  return contarCambiosFormulario(antes, ahora) > 0;
}

export type ErrorConfigurador = { codigo: 'contacto'; claves: ClaveCampoFormulario[]; seccion: SeccionFormulario };

/**
 * Lo que impide guardar (F3): la tienda sin correo y sin celular visibles. Hoy el correo es fijo,
 * así que no pasa; la regla queda aquí y en el servidor por si deja de serlo.
 */
export function erroresConfigurador(filas: readonly FilaFormulario[]): ErrorConfigurador[] {
  const email = filas.find((f) => f.clave === 'email');
  const celular = filas.find((f) => f.clave === 'celular');
  const visibleYObligatorio = (f?: FilaFormulario) => !!f && f.visible && f.obligatorio;
  if (!visibleYObligatorio(email) && !visibleYObligatorio(celular)) return [{ codigo: 'contacto', claves: ['email', 'celular'], seccion: 'contacto' }];
  return [];
}

/** Lo que viaja al PUT: el recomendado = `null` (la tienda queda exactamente como siempre). */
export function formularioParaGuardar(filas: readonly FilaFormulario[]): FormularioCheckout | null {
  if (esFormularioRecomendado(filas)) return null;
  return { version: VERSION_FORMULARIO_CHECKOUT, campos: filas.map(ajusteDeResuelto) };
}

/** ¿Lo guardado y el formulario del diálogo son lo mismo? */
export function mismoFormulario(guardado: readonly AjusteCampoFormulario[] | null | undefined, filas: readonly FilaFormulario[]): boolean {
  return contarCambiosFormulario(filasIniciales(guardado), filas) === 0;
}

/**
 * La etiqueta que pinta la tienda (vista previa). Sin configuración (el recomendado) la de siempre,
 * que ya trae «(opcional)» en el apto y en las indicaciones; configurado, «(opcional)» se agrega solo.
 */
export function etiquetaEnTienda(fila: FilaFormulario, configurado: boolean): string {
  const def = defCampoFormulario(fila.clave);
  const base = fila.etiqueta ?? def.etiqueta;
  if (!configurado) return fila.clave === 'complemento' || fila.clave === 'notas' ? `${base} (opcional)` : base;
  return fila.obligatorio || fila.clave === 'factura' ? base : `${base} (opcional)`;
}

/** Campos de la sección y visibles («6 campos · 5 visibles»). */
export function conteoSeccion(filas: readonly FilaFormulario[], seccion: SeccionFormulario): { campos: number; visibles: number } {
  const lista = filasDeSeccion(filas, seccion);
  return { campos: lista.length, visibles: lista.filter((f) => f.visible).length };
}

/** Claves cuyo dato cambió respecto a lo guardado (la vista previa las marca). */
export function clavesCambiadas(antes: readonly FilaFormulario[], ahora: readonly FilaFormulario[]): ClaveCampoFormulario[] {
  return ahora
    .filter((f) => {
      const a = antes.find((x) => x.clave === f.clave);
      const posA = antes.filter((x) => x.seccion === f.seccion).findIndex((x) => x.clave === f.clave);
      const posB = ahora.filter((x) => x.seccion === f.seccion).findIndex((x) => x.clave === f.clave);
      return !a || !igualesSinOrden(a, f) || posA !== posB;
    })
    .map((f) => f.clave);
}
