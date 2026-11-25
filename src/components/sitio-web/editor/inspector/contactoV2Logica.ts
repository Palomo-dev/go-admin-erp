/**
 * Lógica pura de los editores de Contacto v2 (Figma 3108:85760 Formulario, 3108:86969 Canales,
 * 3112:87143 Redes): qué se guarda en `form_fields`, `channels` y `networks`. La lectura de lo
 * guardado es la del contrato (`paginaContacto.ts`), la misma de la tienda.
 */
import {
  CAMPOS_CONTACTO_POR_DEFECTO,
  MAX_CANALES,
  canalPorDefecto,
  leerCamposContacto,
  leerCanales,
  redesDelSitio,
  type CampoContacto,
  type CanalContacto,
  type IdRedSocial,
} from '@/lib/website/contrato/paginaContacto';

// ─── Campos del formulario ─────────────────────────────────────────────────────────────────

/** Campos que muestra el editor: los guardados o, sin `form_fields`, los de la página Contacto. */
export function camposEnEditor(valor: unknown): { campos: CampoContacto[]; guardados: boolean } {
  const guardados = leerCamposContacto(valor);
  if (guardados) return { campos: guardados, guardados: true };
  return { campos: leerCamposContacto(CAMPOS_CONTACTO_POR_DEFECTO) ?? [], guardados: false };
}

/** Lo que se guarda en `form_fields` (sin `estandar`, que se deduce del nombre al leer). */
export function camposAGuardar(campos: readonly CampoContacto[]): Record<string, unknown>[] {
  return campos.map((c) => {
    const fila: Record<string, unknown> = { name: c.name, label: c.label, type: c.type, required: c.required, visible: c.visible };
    if (c.options.length > 0) fila.options = [...c.options];
    if (c.placeholder) fila.placeholder = c.placeholder;
    if (c.type === 'consent') {
      fila.link_url = c.link_url;
      fila.link_label = c.link_label;
    }
    return fila;
  });
}

/** Nombre y correo no se pueden ocultar ni volver opcionales (el CRM los necesita). */
export function campoFijo(c: CampoContacto): boolean {
  return c.estandar === 'name' || c.estandar === 'email';
}

export function cambiarCampo(campos: readonly CampoContacto[], name: string, cambio: Partial<CampoContacto>): CampoContacto[] {
  return campos.map((c) => {
    if (c.name !== name) return c;
    const siguiente = { ...c, ...cambio };
    if (campoFijo(c)) {
      siguiente.visible = true;
      siguiente.required = true;
    }
    // La casilla de datos, si se muestra, siempre es obligatoria.
    if (c.type === 'consent') siguiente.required = siguiente.visible;
    return siguiente;
  });
}

export function moverCampo(campos: readonly CampoContacto[], i: number, paso: -1 | 1): CampoContacto[] {
  const j = i + paso;
  if (i < 0 || j < 0 || j >= campos.length) return [...campos];
  const lista = [...campos];
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return lista;
}

/** «Añadir campo propio»: texto, visible y opcional, con un nombre que no choca. */
export function anadirCampoPropio(campos: readonly CampoContacto[], etiqueta: string): CampoContacto[] {
  let n = 1;
  while (campos.some((c) => c.name === `campo_${n}`)) n++;
  const nuevo: CampoContacto = {
    name: `campo_${n}`,
    label: etiqueta,
    type: 'text',
    required: false,
    options: [],
    estandar: null,
    visible: true,
    placeholder: '',
    link_url: '',
    link_label: '',
  };
  // Antes de la casilla de datos, que va al final.
  const i = campos.findIndex((c) => c.type === 'consent');
  return i < 0 ? [...campos, nuevo] : [...campos.slice(0, i), nuevo, ...campos.slice(i)];
}

export function quitarCampo(campos: readonly CampoContacto[], name: string): CampoContacto[] {
  return campos.filter((c) => c.name !== name || c.estandar !== null || c.type === 'consent');
}

// ─── Canales ───────────────────────────────────────────────────────────────────────────────

export function canalesAGuardar(canales: readonly CanalContacto[]): Record<string, unknown>[] {
  return canales.map((c) => ({ ...c }));
}

export function cambiarCanal(canales: readonly CanalContacto[], id: string, cambio: Partial<CanalContacto>): CanalContacto[] {
  return canales.map((c) => (c.id === id ? { ...c, ...cambio, id: c.id, type: c.type } : c));
}

export function moverCanal(canales: readonly CanalContacto[], i: number, paso: -1 | 1): CanalContacto[] {
  const j = i + paso;
  if (i < 0 || j < 0 || j >= canales.length) return [...canales];
  const lista = [...canales];
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return lista;
}

export function anadirCanalPropio(canales: readonly CanalContacto[], etiqueta: string): CanalContacto[] {
  if (canales.length >= MAX_CANALES) return [...canales];
  let n = 1;
  while (canales.some((c) => c.id === `propio-${n}`)) n++;
  return [...canales, { ...canalPorDefecto('custom', `propio-${n}`), label: etiqueta }];
}

export function quitarCanal(canales: readonly CanalContacto[], id: string): CanalContacto[] {
  return canales.filter((c) => c.id !== id || c.type !== 'custom');
}

export { leerCanales };

// ─── Redes ─────────────────────────────────────────────────────────────────────────────────

/** Redes encendidas: las de `networks` o, sin la clave, todas las que el sitio tiene. */
export function redesEncendidas(networks: unknown, socialLinks: unknown): Set<IdRedSocial> {
  const delSitio = redesDelSitio(socialLinks).map((r) => r.id);
  if (!Array.isArray(networks)) return new Set(delSitio);
  return new Set(networks.filter((n): n is IdRedSocial => typeof n === 'string' && (delSitio as string[]).includes(n)));
}

/** Enciende o apaga una red: guarda la lista explícita, en el orden de las redes del sitio. */
export function alternarRed(networks: unknown, socialLinks: unknown, id: IdRedSocial, encendida: boolean): IdRedSocial[] {
  const actuales = redesEncendidas(networks, socialLinks);
  if (encendida) actuales.add(id);
  else actuales.delete(id);
  return redesDelSitio(socialLinks).map((r) => r.id).filter((r) => actuales.has(r));
}
