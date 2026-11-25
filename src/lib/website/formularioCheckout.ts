/**
 * Formulario del checkout configurable desde el ERP (Figma «16 Sitio web» › Checkout v2, Parte F
 * 3141-93709; encargo aprobado por el dueño el 2026-11-25): qué campos pide la tienda, en qué orden,
 * cuáles son obligatorios y con qué textos.
 *
 * MÓDULO COMPARTIDO, idéntico byte a byte en los dos repos (goadmin-websites lo comprueba con
 * scripts/verify-copias-erp.mjs):
 * - go-admin-erp:     src/lib/website/formularioCheckout.ts (configurador y PUT del checkout).
 * - goadmin-websites: lib/website/formularioCheckout.ts (checkout y validación de /api/orders).
 * Puro y sin imports.
 *
 * Dónde se guarda: `organization_settings` (UNIQUE organization_id + key), key
 * `checkout_formulario`, `settings` = `{ version: 1, campos: [...] }`. Sin columnas nuevas en
 * `website_settings` (ADR-002): una sola clave, la misma para sitios V2 y legacy. Sin fila = el
 * formulario de siempre (la tienda no cambia nada).
 *
 * Campos indispensables (no se pueden ocultar ni volver opcionales), según el código real:
 * - Correo: /api/orders busca o crea la ficha del invitado POR CORREO (lib/orders/pedidoWeb.ts), la
 *   confirmación y el enlace del pedido salen por correo y las pasarelas lo piden (PayU
 *   `buyerEmail`, Stripe `customer_email`, Wompi y Mercado Pago lo prellenan). Sin correo, los
 *   pedidos sin correo caerían en la misma ficha. Por eso el correo queda fijo y el celular es el
 *   que se puede volver opcional u ocultar.
 * - Nombre y apellido: `customer_name` del pedido, la ficha del cliente, la entrega y la factura.
 * - Dirección y Ciudad o municipio: con domicilio, sin ellas no hay a dónde llevar el pedido ni con
 *   qué calcular el envío (al recoger en tienda no se piden).
 * - Barrio: con domicilio propio por zonas ubica la zona y el costo del envío; se muestra siempre
 *   que la zona lo necesita (se puede volver obligatorio, no ocultar).
 * - Factura a nombre de empresa: la casilla es siempre opcional; marcada, el documento, el DV, la
 *   razón social y el correo de la factura son obligatorios (facturaEmpresa.ts y /api/orders).
 * - Indicaciones: van siempre al final («Agregar indicaciones»): no se mueven.
 */

export const CLAVE_FORMULARIO_CHECKOUT = 'checkout_formulario'
export const VERSION_FORMULARIO_CHECKOUT = 1

export const CLAVES_CAMPO_FORMULARIO = ['email', 'celular', 'nombre', 'factura', 'direccion', 'complemento', 'ciudad', 'barrio', 'notas'] as const
export type ClaveCampoFormulario = (typeof CLAVES_CAMPO_FORMULARIO)[number]
export type SeccionFormulario = 'contacto' | 'entrega'

/** Por qué un campo no se puede cambiar (el ERP lo explica con este código). */
export type MotivoFijo = 'correo' | 'nombre' | 'direccion' | 'ciudad' | 'barrio' | 'factura' | 'notas'

export interface DefCampoFormulario {
  clave: ClaveCampoFormulario
  seccion: SeccionFormulario
  /** Etiqueta de la tienda por defecto, SIN «(opcional)» (se agrega sola si el campo es opcional). */
  etiqueta: string
  ayuda: string | null
  placeholder: string | null
  visible: boolean
  obligatorio: boolean
  /** No se puede ocultar. */
  fijoVisible: boolean
  /** No se puede cambiar entre obligatorio y opcional. */
  fijoObligatorio: boolean
  /** No se mueve de su lugar. */
  fijoOrden: boolean
  /** Admite texto de ejemplo (la casilla de la factura no lo tiene). */
  conEjemplo: boolean
  motivo: MotivoFijo | null
}

/** El formulario recomendado: el de hoy, en el orden en que la tienda lo pinta. */
export const CAMPOS_FORMULARIO: readonly DefCampoFormulario[] = [
  { clave: 'email', seccion: 'contacto', etiqueta: 'Correo electrónico', ayuda: 'Aquí te llega la confirmación', placeholder: 'tu@correo.com', visible: true, obligatorio: true, fijoVisible: true, fijoObligatorio: true, fijoOrden: false, conEjemplo: true, motivo: 'correo' },
  { clave: 'celular', seccion: 'contacto', etiqueta: 'Celular', ayuda: 'Para coordinar la entrega', placeholder: null, visible: true, obligatorio: true, fijoVisible: false, fijoObligatorio: false, fijoOrden: false, conEjemplo: true, motivo: null },
  { clave: 'nombre', seccion: 'contacto', etiqueta: 'Nombre y apellido', ayuda: null, placeholder: 'Ej.: Laura Pérez', visible: true, obligatorio: true, fijoVisible: true, fijoObligatorio: true, fijoOrden: false, conEjemplo: true, motivo: 'nombre' },
  { clave: 'factura', seccion: 'contacto', etiqueta: 'Necesito factura a nombre de empresa', ayuda: 'Opcional · con NIT, cédula u otro documento', placeholder: null, visible: true, obligatorio: false, fijoVisible: false, fijoObligatorio: true, fijoOrden: false, conEjemplo: false, motivo: 'factura' },
  { clave: 'direccion', seccion: 'entrega', etiqueta: 'Dirección', ayuda: 'Calle, carrera o avenida y número', placeholder: 'Ej.: Cra 7 # 45-12', visible: true, obligatorio: true, fijoVisible: true, fijoObligatorio: true, fijoOrden: false, conEjemplo: true, motivo: 'direccion' },
  { clave: 'complemento', seccion: 'entrega', etiqueta: 'Apto, casa u oficina', ayuda: null, placeholder: 'Ej.: Apto 301', visible: true, obligatorio: false, fijoVisible: false, fijoObligatorio: false, fijoOrden: false, conEjemplo: true, motivo: null },
  { clave: 'ciudad', seccion: 'entrega', etiqueta: 'Ciudad o municipio', ayuda: 'Escribe para buscar; si no aparece, escríbela completa', placeholder: 'Escribe para buscar', visible: true, obligatorio: true, fijoVisible: true, fijoObligatorio: true, fijoOrden: false, conEjemplo: true, motivo: 'ciudad' },
  { clave: 'barrio', seccion: 'entrega', etiqueta: 'Barrio', ayuda: null, placeholder: 'Ej.: Chapinero', visible: true, obligatorio: false, fijoVisible: true, fijoObligatorio: false, fijoOrden: false, conEjemplo: true, motivo: 'barrio' },
  { clave: 'notas', seccion: 'entrega', etiqueta: 'Indicaciones para la entrega', ayuda: null, placeholder: 'Ej.: el timbre no sirve, llamar al llegar', visible: true, obligatorio: false, fijoVisible: false, fijoObligatorio: false, fijoOrden: true, conEjemplo: true, motivo: 'notas' },
]

export const LARGO_ETIQUETA_CAMPO = 60
export const LARGO_AYUDA_CAMPO = 120
export const LARGO_EJEMPLO_CAMPO = 60

/** Lo que el ERP guarda de un campo. Texto ausente = el de la tienda; `null` en ayuda = sin ayuda. */
export interface AjusteCampoFormulario {
  clave: ClaveCampoFormulario
  visible?: boolean
  obligatorio?: boolean
  etiqueta?: string
  ayuda?: string | null
  placeholder?: string | null
  /** Solo `nombre`: exigir apellido (dos palabras). */
  exigirApellido?: boolean
}

export interface FormularioCheckout {
  version: number
  campos: AjusteCampoFormulario[]
}

/** Un campo ya resuelto: candados aplicados y orden final. Textos ausentes = los de la tienda. */
export interface CampoResuelto {
  clave: ClaveCampoFormulario
  seccion: SeccionFormulario
  visible: boolean
  obligatorio: boolean
  etiqueta?: string
  ayuda?: string | null
  placeholder?: string | null
  exigirApellido?: boolean
}

export function defCampoFormulario(clave: ClaveCampoFormulario): DefCampoFormulario {
  return CAMPOS_FORMULARIO.find((c) => c.clave === clave) as DefCampoFormulario
}

function esClave(v: unknown): v is ClaveCampoFormulario {
  return typeof v === 'string' && (CLAVES_CAMPO_FORMULARIO as readonly string[]).includes(v)
}

function textoLimpio(v: unknown, largo: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, largo) : undefined
}

/**
 * El orden final: las claves de `ajustes` ocupan, en el orden en que vienen, los lugares que esas
 * mismas claves tienen en el formulario recomendado (una lista parcial solo permuta lo que nombra:
 * un ajuste suelto no mueve nada). Lo que tiene `fijoOrden` no se mueve.
 */
export function ordenFormulario(ajustes: readonly { clave: ClaveCampoFormulario }[]): ClaveCampoFormulario[] {
  const base = CAMPOS_FORMULARIO.map((c) => c.clave)
  const movibles = (k: ClaveCampoFormulario) => !defCampoFormulario(k).fijoOrden
  const vistos = new Set<ClaveCampoFormulario>()
  const pedidas: ClaveCampoFormulario[] = []
  for (const a of ajustes) {
    if (esClave(a.clave) && movibles(a.clave) && !vistos.has(a.clave)) {
      vistos.add(a.clave)
      pedidas.push(a.clave)
    }
  }
  const resultado = [...base]
  for (const seccion of ['contacto', 'entrega'] as const) {
    const enSeccion = pedidas.filter((k) => defCampoFormulario(k).seccion === seccion)
    const huecos = base.map((k, i) => (enSeccion.includes(k) ? i : -1)).filter((i) => i >= 0)
    huecos.forEach((hueco, j) => {
      resultado[hueco] = enSeccion[j]
    })
  }
  return resultado
}

/**
 * Lista final de la tienda con los ajustes encima. Sin ajustes (`null`, `undefined` o lista vacía)
 * devuelve `null`: la tienda usa su formulario de siempre, sin cambios. Los candados se aplican
 * aquí, así que un ajuste guardado a mano tampoco quita un campo indispensable.
 */
export function resolverFormulario(ajustes: readonly AjusteCampoFormulario[] | null | undefined): CampoResuelto[] | null {
  if (!ajustes || ajustes.length === 0) return null
  const porClave = new Map<ClaveCampoFormulario, AjusteCampoFormulario>()
  for (const a of ajustes) if (esClave(a.clave) && !porClave.has(a.clave)) porClave.set(a.clave, a)
  if (porClave.size === 0) return null
  const lista = ordenFormulario(ajustes).map((clave): CampoResuelto => {
    const def = defCampoFormulario(clave)
    const a = porClave.get(clave)
    const r: CampoResuelto = {
      clave,
      seccion: def.seccion,
      visible: def.fijoVisible ? true : typeof a?.visible === 'boolean' ? a.visible : def.visible,
      obligatorio: def.fijoObligatorio ? def.obligatorio : typeof a?.obligatorio === 'boolean' ? a.obligatorio : def.obligatorio,
    }
    if (a) {
      const etiqueta = textoLimpio(a.etiqueta, LARGO_ETIQUETA_CAMPO)
      if (etiqueta !== undefined) r.etiqueta = etiqueta
      if (a.ayuda === null) r.ayuda = null
      else {
        const ayuda = textoLimpio(a.ayuda, LARGO_AYUDA_CAMPO)
        if (ayuda !== undefined) r.ayuda = ayuda
      }
      if (def.conEjemplo) {
        if (a.placeholder === null) r.placeholder = null
        else {
          const ejemplo = textoLimpio(a.placeholder, LARGO_EJEMPLO_CAMPO)
          if (ejemplo !== undefined) r.placeholder = ejemplo
        }
      }
      if (clave === 'nombre' && typeof a.exigirApellido === 'boolean') r.exigirApellido = a.exigirApellido
    }
    return r
  })
  // Correo o celular: al menos uno visible y obligatorio (hoy el correo es fijo; la regla queda por
  // si algún día deja de serlo).
  const email = lista.find((c) => c.clave === 'email') as CampoResuelto
  const celular = lista.find((c) => c.clave === 'celular') as CampoResuelto
  if (!(email.visible && email.obligatorio) && !(celular.visible && celular.obligatorio)) {
    email.visible = true
    email.obligatorio = true
  }
  return lista
}

/**
 * Lee lo guardado (`organization_settings.settings`) sin confiar en su forma: lo que no se entiende
 * se ignora. Devuelve los ajustes o `null` (sin configuración = el formulario de siempre).
 */
export function leerFormularioCheckout(raw: unknown): AjusteCampoFormulario[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const campos = (raw as { campos?: unknown }).campos
  if (!Array.isArray(campos)) return null
  const salida: AjusteCampoFormulario[] = []
  const vistos = new Set<string>()
  for (const c of campos) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) continue
    const o = c as Record<string, unknown>
    if (!esClave(o.clave) || vistos.has(o.clave)) continue
    vistos.add(o.clave)
    const a: AjusteCampoFormulario = { clave: o.clave }
    if (typeof o.visible === 'boolean') a.visible = o.visible
    if (typeof o.obligatorio === 'boolean') a.obligatorio = o.obligatorio
    if (typeof o.etiqueta === 'string') a.etiqueta = o.etiqueta
    if (o.ayuda === null || typeof o.ayuda === 'string') a.ayuda = o.ayuda as string | null
    if (o.placeholder === null || typeof o.placeholder === 'string') a.placeholder = o.placeholder as string | null
    if (o.clave === 'nombre' && typeof o.exigirApellido === 'boolean') a.exigirApellido = o.exigirApellido
    salida.push(a)
  }
  return salida.length > 0 ? salida : null
}

export type CodigoErrorFormulario = 'forma' | 'clave' | 'repetido' | 'propiedad' | 'tipo' | 'largo' | 'fijo' | 'contacto'

export interface ErrorFormulario {
  codigo: CodigoErrorFormulario
  clave?: ClaveCampoFormulario
  propiedad?: string
}

const PROPIEDADES = new Set(['clave', 'visible', 'obligatorio', 'etiqueta', 'ayuda', 'placeholder', 'exigirApellido'])

/**
 * Validación estricta del PUT del ERP (lista blanca). `null` = volver al formulario de siempre
 * (borra la fila). Rechaza en vez de corregir: un candado roto, una clave desconocida, un texto
 * largo o dejar la tienda sin correo y sin celular. Devuelve el formulario completo (los 9 campos,
 * en su orden final) listo para guardar.
 */
export function validarFormularioCheckout(raw: unknown): { ok: true; formulario: FormularioCheckout | null } | { ok: false; errores: ErrorFormulario[] } {
  if (raw === null) return { ok: true, formulario: null }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errores: [{ codigo: 'forma' }] }
  const cuerpo = raw as Record<string, unknown>
  const errores: ErrorFormulario[] = []
  for (const k of Object.keys(cuerpo)) if (k !== 'version' && k !== 'campos') errores.push({ codigo: 'propiedad', propiedad: k })
  if (!Array.isArray(cuerpo.campos) || cuerpo.campos.length === 0) return { ok: false, errores: [...errores, { codigo: 'forma' }] }
  const vistos = new Set<string>()
  const ajustes: AjusteCampoFormulario[] = []
  for (const c of cuerpo.campos) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      errores.push({ codigo: 'forma' })
      continue
    }
    const o = c as Record<string, unknown>
    if (!esClave(o.clave)) {
      errores.push({ codigo: 'clave' })
      continue
    }
    const clave = o.clave
    if (vistos.has(clave)) {
      errores.push({ codigo: 'repetido', clave })
      continue
    }
    vistos.add(clave)
    const def = defCampoFormulario(clave)
    for (const k of Object.keys(o)) {
      if (!PROPIEDADES.has(k) || (k === 'exigirApellido' && clave !== 'nombre') || (k === 'placeholder' && !def.conEjemplo)) errores.push({ codigo: 'propiedad', clave, propiedad: k })
    }
    const a: AjusteCampoFormulario = { clave }
    for (const k of ['visible', 'obligatorio', 'exigirApellido'] as const) {
      if (!(k in o)) continue
      if (typeof o[k] !== 'boolean') errores.push({ codigo: 'tipo', clave, propiedad: k })
      else if (k !== 'exigirApellido' || clave === 'nombre') a[k] = o[k] as boolean
    }
    if (a.visible === false && def.fijoVisible) errores.push({ codigo: 'fijo', clave, propiedad: 'visible' })
    if (typeof a.obligatorio === 'boolean' && def.fijoObligatorio && a.obligatorio !== def.obligatorio) errores.push({ codigo: 'fijo', clave, propiedad: 'obligatorio' })
    const textos: [keyof AjusteCampoFormulario & ('etiqueta' | 'ayuda' | 'placeholder'), number, boolean][] = [
      ['etiqueta', LARGO_ETIQUETA_CAMPO, false],
      ['ayuda', LARGO_AYUDA_CAMPO, true],
      ['placeholder', LARGO_EJEMPLO_CAMPO, true],
    ]
    for (const [k, largo, admiteNulo] of textos) {
      if (!(k in o) || o[k] === undefined) continue
      const v = o[k]
      if (v === null && admiteNulo) {
        ;(a as unknown as Record<string, unknown>)[k] = null
        continue
      }
      if (typeof v !== 'string') {
        errores.push({ codigo: 'tipo', clave, propiedad: k })
        continue
      }
      const t = v.replace(/\s+/g, ' ').trim()
      if (t.length > largo) errores.push({ codigo: 'largo', clave, propiedad: k })
      else if (t) (a as unknown as Record<string, unknown>)[k] = t
    }
    ajustes.push(a)
  }
  if (errores.length > 0) return { ok: false, errores }
  const resueltos = resolverFormulario(ajustes) as CampoResuelto[]
  const email = ajustes.find((a) => a.clave === 'email')
  const celular = ajustes.find((a) => a.clave === 'celular')
  const emailOk = (email?.visible ?? true) && (email?.obligatorio ?? true)
  const celularOk = (celular?.visible ?? true) && (celular?.obligatorio ?? true)
  if (!emailOk && !celularOk) return { ok: false, errores: [{ codigo: 'contacto' }] }
  return { ok: true, formulario: { version: VERSION_FORMULARIO_CHECKOUT, campos: resueltos.map(ajusteDeResuelto) } }
}

/** Un campo resuelto → lo que se guarda (sin `seccion`, que sale del catálogo). */
export function ajusteDeResuelto(c: CampoResuelto): AjusteCampoFormulario {
  const a: AjusteCampoFormulario = { clave: c.clave, visible: c.visible, obligatorio: c.obligatorio }
  if (c.etiqueta !== undefined) a.etiqueta = c.etiqueta
  if (c.ayuda !== undefined) a.ayuda = c.ayuda
  if (c.placeholder !== undefined) a.placeholder = c.placeholder
  if (c.exigirApellido !== undefined) a.exigirApellido = c.exigirApellido
  return a
}

/** El formulario recomendado como ajustes completos (lo que muestra el ERP sin configuración). */
export function formularioRecomendado(): CampoResuelto[] {
  return CAMPOS_FORMULARIO.map((c) => ({ clave: c.clave, seccion: c.seccion, visible: c.visible, obligatorio: c.obligatorio }))
}

/** ¿Es exactamente el recomendado? (el ERP entonces borra la fila: la tienda queda como siempre). */
export function esFormularioRecomendado(campos: readonly CampoResuelto[] | null): boolean {
  if (!campos) return true
  const rec = formularioRecomendado()
  if (campos.length !== rec.length) return false
  return campos.every((c, i) => {
    const r = rec[i]
    return (
      c.clave === r.clave &&
      c.visible === r.visible &&
      c.obligatorio === r.obligatorio &&
      c.etiqueta === undefined &&
      c.ayuda === undefined &&
      c.placeholder === undefined &&
      (c.exigirApellido === undefined || c.exigirApellido === false)
    )
  })
}

/** Línea de la factura que el checkout agrega a las notas (facturaEmpresa.ts): no cuenta como indicación. */
const PREFIJO_LINEA_FACTURA = '[Factura electrónica]'

export interface DatosPedidoFormulario {
  email?: unknown
  phone?: unknown
  firstName?: unknown
  address?: unknown
  city?: unknown
  notes?: unknown
  /** `delivery` | `pickup` | `dine_in` (lo que manda el checkout). */
  entrega?: unknown
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Red del SERVIDOR (/api/orders) con un formulario configurado: qué datos faltan. Sin
 * configuración devuelve `[]` (hoy el servidor no revisa estos datos y así sigue). Con
 * configuración, los indispensables se exigen SIEMPRE (correo, nombre; dirección y municipio a
 * domicilio) y, además, el celular y las indicaciones si el ERP los volvió obligatorios. Es
 * deliberadamente más suave que el checkout (que valida campo por campo con sus mensajes): solo
 * rechaza lo que el checkout nunca habría dejado pasar. Apto, barrio y complemento no se revisan
 * aquí: viajan dentro de la dirección o solo se piden cuando la zona los necesita.
 */
export function faltantesPedido(ajustes: readonly AjusteCampoFormulario[] | null | undefined, d: DatosPedidoFormulario): ClaveCampoFormulario[] {
  const campos = resolverFormulario(ajustes)
  if (!campos) return []
  const de = (k: ClaveCampoFormulario) => campos.find((c) => c.clave === k) as CampoResuelto
  const faltan: ClaveCampoFormulario[] = []
  const correo = texto(d.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) faltan.push('email')
  const celular = de('celular')
  if (celular.visible && celular.obligatorio && texto(d.phone).replace(/\D/g, '').length < 7) faltan.push('celular')
  if (!texto(d.firstName)) faltan.push('nombre')
  if (d.entrega === 'delivery') {
    if (!texto(d.address)) faltan.push('direccion')
    if (!texto(d.city)) faltan.push('ciudad')
  }
  const notas = de('notas')
  if (notas.visible && notas.obligatorio) {
    const propias = texto(d.notes)
      .split('\n')
      .filter((l) => !l.trim().startsWith(PREFIJO_LINEA_FACTURA))
      .join('\n')
      .trim()
    if (!propias) faltan.push('notas')
  }
  return faltan
}
