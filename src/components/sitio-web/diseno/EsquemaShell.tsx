'use client';

/**
 * Pinta el DIBUJO del encabezado y el pie de una plantilla (`lib/website/v2/dibujoShell.ts`),
 * Figma «16 Sitio web» › «Plantillas · encabezado y pie en la galería, la vista previa y «Usar»».
 *
 * Una sola pieza para tres tamaños, como en Figma:
 * - miniatura de la galería (`escala` < 0,8): líneas en vez de textos; solo los botones llevan
 *   su texto abreviado, porque son lo que distingue una plantilla de otra a ese tamaño;
 * - vista previa grande (`escala` = 1), en escritorio o en celular (con la barra fija);
 * - comparación de «Usar esta plantilla» (`escala` ≈ 0,66).
 *
 * Solo `span` con estilos en línea: va dentro de botones (TemplateCard, TarjetaSeleccionable) y
 * son 32 tarjetas; nada de imágenes. Los colores y fuentes son DATOS de la plantilla y solo
 * existen aquí dentro.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { AccionEncabezado, BotonDibujo, DibujoShell, PiezaBarraSuperior } from '@/lib/website/v2/dibujoShell';
import { familiaCss } from './catalogo';
import { useTextosDiseno, type TraductorDiseno } from './textos';

/** Por debajo de esta escala se dibuja la versión «mini» (líneas en vez de textos). */
export const ESCALA_MINI = 0.8;
/** Escala de la miniatura de la galería (igual que Figma: 296 px de ancho). */
export const ESCALA_MINIATURA = 0.44;
/** Escala de la comparación de «Usar esta plantilla». */
export const ESCALA_COMPARACION = 0.66;
/** Texto del botón en la miniatura: fijo para que se lea a ese tamaño. */
const TEXTO_BOTON_MINI = 6.5;

interface Ctx {
  d: DibujoShell;
  u: number;
  mini: boolean;
  t: TraductorDiseno;
  /** Nombre del negocio en el logo; sin él, «Tu marca». */
  marca?: string;
}

const bloque = (estilo: CSSProperties): CSSProperties => ({ display: 'flex', ...estilo });

function Linea({ ancho, color, c }: { ancho: number; color: string; c: Ctx }) {
  return <span style={{ display: 'block', flexShrink: 0, width: ancho * c.u, height: Math.max(2, 4 * c.u), borderRadius: 2, backgroundColor: color }} />;
}

function Logo({ c, color }: { c: Ctx; color?: string }) {
  const { d, u, mini } = c;
  return (
    <span style={bloque({ alignItems: 'center', gap: 6 * u, flexShrink: 0 })}>
      <span
        style={bloque({ width: 20 * u, height: 20 * u, borderRadius: 3 * u, backgroundColor: d.colores.acento, color: d.colores.textoAcento, alignItems: 'center', justifyContent: 'center', fontSize: 7 * u, fontWeight: 600 })}
      >
        {mini ? null : 'TM'}
      </span>
      {mini ? (
        <Linea ancho={56} color={color ?? d.colores.texto} c={c} />
      ) : (
        <span style={{ fontFamily: familiaCss(d.fuenteTitulos), fontSize: 14 * u, color: color ?? d.colores.texto, whiteSpace: 'nowrap' }}>{c.marca || c.t('shell.muestra.marca')}</span>
      )}
    </span>
  );
}

function Boton({ b, c, escala, lleno }: { b: BotonDibujo; c: Ctx; escala?: number; lleno?: boolean }) {
  const { d, mini } = c;
  const u = escala ?? c.u;
  const solido = b.variante === 'solido';
  return (
    <span
      data-boton={b.variante}
      style={bloque({
        flex: lleno ? 1 : undefined,
        flexShrink: lleno ? 1 : 0,
        minWidth: 0,
        justifyContent: 'center',
        padding: mini ? '2px 4px' : `${6 * u}px ${12 * u}px`,
        borderRadius: Math.min(d.radioBoton, 999) * u,
        backgroundColor: solido ? d.colores.acento : 'transparent',
        border: solido ? 'none' : `1px solid ${d.colores.acento}`,
        color: solido ? d.colores.textoAcento : d.colores.texto,
        fontSize: mini ? TEXTO_BOTON_MINI : 10 * u,
        fontWeight: 500,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      })}
    >
      {mini ? b.corto : b.texto}
    </span>
  );
}

function Accion({ a, c }: { a: AccionEncabezado; c: Ctx }) {
  const { d, u, mini, t } = c;
  if (a === 'barraBusqueda') {
    return (
      <span data-accion={a} style={bloque({ flex: 1, minWidth: 0, alignItems: 'center', padding: `${5 * u}px ${8 * u}px`, border: `1px solid ${d.colores.linea}`, borderRadius: 6 * u, fontSize: 9 * u, color: d.colores.suave })}>
        {mini ? <Linea ancho={70} color={d.colores.linea} c={c} /> : t('shell.muestra.buscar')}
      </span>
    );
  }
  if (a === 'idioma' || a === 'sede') {
    return (
      <span data-accion={a} style={bloque({ flexShrink: 0, padding: `${3 * u}px ${6 * u}px`, border: `1px solid ${d.colores.linea}`, borderRadius: 4 * u, fontSize: 8 * u, fontWeight: 500, color: d.colores.suave })}>
        {mini ? <Linea ancho={12} color={d.colores.suave} c={c} /> : t(a === 'idioma' ? 'shell.muestra.idioma' : 'shell.muestra.sedeSelector')}
      </span>
    );
  }
  return <span data-accion={a} style={{ display: 'block', flexShrink: 0, width: 16 * u, height: 16 * u, border: `1px solid ${d.colores.suave}`, borderRadius: a === 'cuenta' ? 999 : 3 * u }} />;
}

const TEXTO_BARRA: Record<PiezaBarraSuperior, string> = { sede: 'sede', envio: 'envio', cupos: 'cupos', telefono: 'telefono', correo: 'correo' };
/** Las piezas de la izquierda se separan de las de contacto (teléfono, correo) a la derecha. */
const PIEZAS_IZQUIERDA: ReadonlySet<PiezaBarraSuperior> = new Set(['sede', 'envio', 'cupos']);

function BarraSuperior({ piezas, c }: { piezas: readonly PiezaBarraSuperior[]; c: Ctx }) {
  const { d, u, mini, t } = c;
  return (
    <span data-zona="barra-superior" style={bloque({ alignItems: 'center', gap: 14 * u, padding: `${4 * u}px ${16 * u}px`, backgroundColor: d.colores.barraSuperior, color: d.colores.textoBarraSuperior, fontSize: 8 * u })}>
      {piezas.map((p) => {
        const texto = t(`shell.muestra.${TEXTO_BARRA[p]}`);
        return (
          <span key={p} style={bloque({ alignItems: 'center', gap: 4 * u, marginRight: PIEZAS_IZQUIERDA.has(p) ? 'auto' : undefined, whiteSpace: 'nowrap' })}>
            {p === 'sede' && <span style={{ display: 'block', width: 5 * u, height: 5 * u, borderRadius: 999, backgroundColor: '#22C55E' }} />}
            {mini ? <Linea ancho={texto.length * 3.2} color={d.colores.textoBarraSuperior} c={c} /> : texto}
          </span>
        );
      })}
    </span>
  );
}

function Enlaces({ lista, c, centrado }: { lista: readonly string[]; c: Ctx; centrado?: boolean }) {
  const { d, u, mini } = c;
  return (
    <span style={bloque({ alignItems: 'center', gap: 14 * u, justifyContent: centrado ? 'center' : undefined, fontFamily: familiaCss(d.fuenteCuerpo), fontSize: 11 * u, color: d.colores.texto, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden' })}>
      {lista.map((s, i) => (mini ? <Linea key={`${s}-${i}`} ancho={s.length * 5} color={d.colores.texto} c={c} /> : <span key={`${s}-${i}`}>{s}</span>))}
    </span>
  );
}

const Espacio = () => <span style={{ flex: 1, minWidth: 0 }} />;

function Hamburguesa({ c }: { c: Ctx }) {
  return (
    <span aria-hidden="true" style={bloque({ flexDirection: 'column', gap: 3 * c.u, flexShrink: 0 })}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ display: 'block', width: 14 * c.u, height: Math.max(1, 1.5 * c.u), backgroundColor: c.d.colores.texto }} />
      ))}
    </span>
  );
}

function Encabezado({ c, enlaces, celular }: { c: Ctx; enlaces: readonly string[]; celular?: boolean }) {
  const { d, u, mini, t } = c;
  const E = d.encabezado;
  const lista = enlaces.slice(0, E.enlaces);
  const acciones = E.acciones.filter((a) => !celular || (a !== 'barraBusqueda' && a !== 'sede'));
  const nodosAcciones = acciones.map((a) => <Accion key={a} a={a} c={c} />);
  const nodosBotones = celular ? [] : E.botones.map((b) => <Boton key={b.texto} b={b} c={c} />);
  const fila = (hijos: ReactNode) => (
    <span data-zona="fila-principal" style={bloque({ alignItems: 'center', gap: 12 * u, padding: `${12 * u}px ${16 * u}px` })}>
      {hijos}
    </span>
  );
  let cuerpo: ReactNode;
  if (celular) {
    cuerpo = fila(
      E.logo === 'centro' ? (
        <>
          <Hamburguesa c={c} />
          <Espacio />
          <Logo c={c} />
          <Espacio />
          {nodosAcciones}
        </>
      ) : (
        <>
          <Logo c={c} />
          <Espacio />
          {nodosAcciones}
          <Hamburguesa c={c} />
        </>
      ),
    );
  } else if (E.menu === 'partido') {
    const mitad = Math.ceil(lista.length / 2);
    cuerpo = fila(
      <>
        <Enlaces lista={lista.slice(0, mitad)} c={c} />
        <Espacio />
        <Logo c={c} />
        <Espacio />
        <Enlaces lista={lista.slice(mitad)} c={c} />
        {nodosAcciones}
        {nodosBotones}
      </>,
    );
  } else if (E.menu === 'fila') {
    cuerpo = (
      <>
        {fila(
          <>
            <Espacio />
            <Logo c={c} />
            <span style={bloque({ flex: 1, justifyContent: 'flex-end', alignItems: 'center', gap: 8 * u })}>
              {nodosAcciones}
              {nodosBotones}
            </span>
          </>,
        )}
        <span data-zona="menu-en-fila" style={bloque({ justifyContent: 'center', padding: `${8 * u}px 0`, borderTop: `1px solid ${d.colores.linea}` })}>
          <Enlaces lista={lista} c={c} centrado />
        </span>
      </>
    );
  } else if (E.menu === 'oculto') {
    cuerpo = fila(
      <>
        <Logo c={c} />
        <Espacio />
        {nodosAcciones}
        {nodosBotones}
        <Hamburguesa c={c} />
      </>,
    );
  } else if (E.menu === 'categorias') {
    const busqueda = acciones.includes('barraBusqueda');
    cuerpo = (
      <>
        {fila(
          <>
            <Logo c={c} />
            {busqueda ? <Accion a="barraBusqueda" c={c} /> : <Espacio />}
            {acciones.filter((a) => a !== 'barraBusqueda').map((a) => <Accion key={a} a={a} c={c} />)}
            {nodosBotones}
          </>,
        )}
        <span data-zona="categorias" style={bloque({ alignItems: 'center', gap: 16 * u, padding: `${7 * u}px ${16 * u}px`, borderTop: `1px solid ${d.colores.linea}`, borderBottom: `1px solid ${d.colores.linea}`, fontSize: 10 * u, fontWeight: 500, color: d.colores.texto })}>
          {mini ? <Linea ancho={50} color={d.colores.texto} c={c} /> : t('shell.muestra.categorias')}
          {[0, 1, 2, 3, 4].map((i) => <Linea key={i} ancho={34} color={d.colores.suave} c={c} />)}
        </span>
        {E.megamenu && (
          <span data-zona="megamenu" data-columnas={E.megamenu.columnas} style={bloque({ gap: 16 * u, padding: `${10 * u}px ${16 * u}px`, backgroundColor: d.colores.contenido })}>
            {Array.from({ length: E.megamenu.columnas }, (_, col) => (
              <span key={col} style={bloque({ flex: 1, flexDirection: 'column', gap: 5 * u })}>
                <Linea ancho={46} color={d.colores.texto} c={c} />
                {[0, 1, 2].map((k) => <Linea key={k} ancho={30 + ((k * 7 + col * 5) % 18)} color={d.colores.suave} c={c} />)}
              </span>
            ))}
            {!mini && <span style={{ fontSize: 8 * u, color: d.colores.suave, whiteSpace: 'nowrap' }}>{t('shell.muestra.categoriasInventario')}</span>}
          </span>
        )}
      </>
    );
  } else {
    cuerpo = fila(
      <>
        <Logo c={c} />
        <Espacio />
        <Enlaces lista={lista} c={c} />
        {nodosAcciones}
        {nodosBotones}
      </>,
    );
  }
  return (
    <span data-zona="encabezado" data-composicion={E.composicion} data-menu={E.menu} style={bloque({ flexDirection: 'column', backgroundColor: d.colores.fondo, flexShrink: 0 })}>
      {E.barraSuperior && !celular && <BarraSuperior piezas={E.barraSuperior} c={c} />}
      {cuerpo}
      {E.barraReserva && (
        <span data-zona="barra-reserva" style={bloque({ alignItems: 'center', gap: 8 * u, padding: `${8 * u}px ${16 * u}px`, backgroundColor: d.colores.contenido })}>
          {(celular ? ['llegada', 'huespedes'] : ['llegada', 'salida', 'huespedes']).map((k) => (
            <span key={k} style={bloque({ flex: 1, padding: `${5 * u}px ${8 * u}px`, backgroundColor: d.colores.fondo, border: `1px solid ${d.colores.linea}`, borderRadius: 4 * u, fontSize: 9 * u, color: d.colores.suave })}>
              {mini ? <Linea ancho={30} color={d.colores.suave} c={c} /> : t(`shell.muestra.${k}`)}
            </span>
          ))}
          <Boton b={{ texto: t('shell.muestra.verDisponibilidad'), corto: t('shell.muestra.buscar'), variante: 'solido' }} c={c} />
        </span>
      )}
    </span>
  );
}

// ─── Pie ─────────────────────────────────────────────────────────────────────────────────────

function TituloPie({ texto, c }: { texto: string; c: Ctx }) {
  const { d, u, mini } = c;
  if (mini) return <Linea ancho={texto.length * 5} color={d.colores.textoPie} c={c} />;
  return <span style={{ fontSize: 8 * u, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: d.colores.textoPie, whiteSpace: 'nowrap' }}>{texto}</span>;
}

function Lineas({ n, c, ancho = 60 }: { n: number; c: Ctx; ancho?: number }) {
  return (
    <span style={bloque({ flexDirection: 'column', gap: 5 * c.u })}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} style={{ display: 'block', width: ancho * c.u * (1 - (i % 3) * 0.18), height: Math.max(1, 3 * c.u), borderRadius: 2, backgroundColor: c.d.colores.suavePie }} />
      ))}
    </span>
  );
}

function BloqueTitulado({ titulo, n, c, zona }: { titulo: string; n: number; c: Ctx; zona: string }) {
  return (
    <span data-bloque={zona} style={bloque({ flexDirection: 'column', gap: 7 * c.u, minWidth: 0 })}>
      <TituloPie texto={titulo} c={c} />
      <Lineas n={n} c={c} />
    </span>
  );
}

function Redes({ c }: { c: Ctx }) {
  return (
    <span data-bloque="redes" style={bloque({ gap: 6 * c.u })}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ display: 'block', width: 14 * c.u, height: 14 * c.u, borderRadius: 999, border: `1px solid ${c.d.colores.suavePie}` }} />
      ))}
    </span>
  );
}

function WhatsApp({ c }: { c: Ctx }) {
  const { d, u, mini, t } = c;
  return (
    <span data-bloque="whatsapp" style={bloque({ alignSelf: 'flex-start', padding: `${5 * u}px ${10 * u}px`, border: `1px solid ${d.colores.acento}`, borderRadius: Math.min(d.radioBoton, 999) * u, color: d.colores.acento, fontSize: 8 * u, fontWeight: 500, whiteSpace: 'nowrap' })}>
      {mini ? <Linea ancho={80} color={d.colores.acento} c={c} /> : t('shell.muestra.escribenos')}
    </span>
  );
}

function Mapa({ c, ancho, alto }: { c: Ctx; ancho: number | string; alto: number }) {
  const { d, u, mini, t } = c;
  return (
    <span data-bloque="mapa" style={bloque({ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 * u, width: typeof ancho === 'number' ? ancho * u : ancho, height: alto * u, flexShrink: 0, borderRadius: 6 * u, backgroundColor: d.colores.lineaPie, color: d.colores.textoPie, fontSize: 7 * u })}>
      <span style={{ display: 'block', width: Math.max(4, 8 * u), height: Math.max(4, 8 * u), borderRadius: 999, backgroundColor: d.colores.acento }} />
      {!mini && t('shell.muestra.comoLlegar')}
    </span>
  );
}

function Boletin({ c }: { c: Ctx }) {
  const { d, u, mini, t } = c;
  return (
    <span data-bloque="boletin" style={bloque({ flexDirection: 'column', gap: 6 * u })}>
      <TituloPie texto={d.pie.boletinTitulo ?? t('shell.muestra.boletin')} c={c} />
      <span style={bloque({ gap: 4 * u, alignItems: 'center' })}>
        <span style={bloque({ padding: `${5 * u}px ${30 * u}px ${5 * u}px ${6 * u}px`, border: `1px solid ${d.colores.lineaPie}`, borderRadius: 4 * u, fontSize: 8 * u, color: d.colores.suavePie, whiteSpace: 'nowrap' })}>
          {mini ? <Linea ancho={30} color={d.colores.suavePie} c={c} /> : t('shell.muestra.tuCorreo')}
        </span>
        <Boton b={{ texto: t('shell.muestra.suscribirme'), corto: 'OK', variante: 'solido' }} c={c} escala={u * 0.85} />
      </span>
    </span>
  );
}

function Pagos({ c }: { c: Ctx }) {
  return (
    <span data-bloque="pagos" style={bloque({ gap: 4 * c.u })}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ display: 'block', width: 20 * c.u, height: 13 * c.u, borderRadius: 2 * c.u, backgroundColor: c.d.colores.lineaPie }} />
      ))}
    </span>
  );
}

function MarcaPie({ c, centrado }: { c: Ctx; centrado?: boolean }) {
  const b = c.d.pie.bloques;
  return (
    <span data-bloque="marca" style={bloque({ flexDirection: 'column', gap: 8 * c.u, alignItems: centrado ? 'center' : 'flex-start' })}>
      <Logo c={c} color={c.d.colores.textoPie} />
      <Lineas n={1} c={c} ancho={90} />
      {b.includes('redes') && <Redes c={c} />}
      {b.includes('whatsapp') && <WhatsApp c={c} />}
    </span>
  );
}

function Pie({ c, menus }: { c: Ctx; menus: readonly string[] }) {
  const { d, u, mini, t } = c;
  const P = d.pie;
  const tiene = (b: (typeof P.bloques)[number]) => P.bloques.includes(b);
  const nodosMenus = menus.map((m, i) => <BloqueTitulado key={`${m}-${i}`} titulo={m} n={3} c={c} zona="menu" />);
  const extras = (conMapa: boolean) => (
    <>
      {tiene('horario') && <BloqueTitulado titulo={t('shell.muestra.horario')} n={2} c={c} zona="horario" />}
      {tiene('contacto') && <BloqueTitulado titulo={t('shell.muestra.contacto')} n={2} c={c} zona="contacto" />}
      {tiene('boletin') && <Boletin c={c} />}
      {conMapa && tiene('mapa') && <Mapa c={c} ancho={110} alto={60} />}
    </>
  );
  const columna = (hijos: ReactNode, gap = 12) => <span style={bloque({ flex: 1, minWidth: 0, flexDirection: 'column', gap: gap * u })}>{hijos}</span>;
  let cuerpo: ReactNode;
  switch (P.composicion) {
    case 'centered':
      cuerpo = (
        <span style={bloque({ flexDirection: 'column', alignItems: 'center', gap: 14 * u })}>
          <MarcaPie c={c} centrado />
          <span style={bloque({ gap: 36 * u, justifyContent: 'center', flexWrap: 'wrap' })}>
            {extras(true)}
            {nodosMenus}
          </span>
        </span>
      );
      break;
    case 'three_columns':
      cuerpo = (
        <span style={bloque({ gap: 24 * u })}>
          {columna(<MarcaPie c={c} />, 8)}
          {columna(nodosMenus)}
          {columna(extras(true))}
        </span>
      );
      break;
    case 'split':
      cuerpo = (
        <span style={bloque({ gap: 24 * u })}>
          {columna(<MarcaPie c={c} />, 8)}
          <span style={bloque({ flex: 1, minWidth: 0, gap: 20 * u, justifyContent: 'flex-end' })}>
            {nodosMenus}
            {extras(true)}
          </span>
        </span>
      );
      break;
    case 'minimal':
      cuerpo = (
        <span style={bloque({ alignItems: 'center', gap: 16 * u })}>
          <Logo c={c} color={d.colores.textoPie} />
          <Espacio />
          {Array.from({ length: Math.max(menus.length, 1) + 1 }, (_, i) => (
            <span key={i} style={{ display: 'block', width: 28 * u, height: Math.max(1, 3 * u), borderRadius: 2, backgroundColor: d.colores.suavePie }} />
          ))}
          {tiene('redes') && <Redes c={c} />}
          {tiene('whatsapp') && <WhatsApp c={c} />}
        </span>
      );
      break;
    default:
      cuerpo = (
        <span style={bloque({ gap: 24 * u })}>
          {columna(<MarcaPie c={c} />)}
          {nodosMenus}
          {extras(false)}
          {tiene('mapa') && <Mapa c={c} ancho={120} alto={64} />}
        </span>
      );
  }
  return (
    <span data-zona="pie" data-composicion={P.composicion} style={bloque({ flexDirection: 'column', gap: 14 * u, padding: `${18 * u}px ${20 * u}px ${12 * u}px`, backgroundColor: d.colores.fondoPie, flexShrink: 0 })}>
      {cuerpo}
      <span data-zona="franja-final" style={bloque({ alignItems: 'center', gap: 10 * u, paddingTop: 8 * u, borderTop: `1px solid ${d.colores.lineaPie}`, fontSize: 7 * u, color: d.colores.suavePie })}>
        {mini ? <Linea ancho={50} color={d.colores.suavePie} c={c} /> : t('shell.muestra.derechos')}
        <Espacio />
        {tiene('pagos') && <Pagos c={c} />}
        {P.firma && (mini ? <Linea ancho={60} color={d.colores.suavePie} c={c} /> : t('shell.muestra.firma'))}
      </span>
    </span>
  );
}

function PieCelular({ c, menus }: { c: Ctx; menus: readonly string[] }) {
  const { d, t } = c;
  const P = d.pie;
  const tiene = (b: (typeof P.bloques)[number]) => P.bloques.includes(b);
  const filas = [...(tiene('horario') ? [t('shell.muestra.horario')] : []), ...(tiene('contacto') ? [t('shell.muestra.contacto')] : []), ...menus];
  return (
    <span data-zona="pie" data-composicion={P.composicion} data-celular={P.celular} style={bloque({ flexDirection: 'column', gap: 10, padding: '16px 16px 12px', backgroundColor: d.colores.fondoPie, flexShrink: 0 })}>
      <MarcaPie c={c} />
      {filas.map((s, i) =>
        P.celular === 'acordeon' ? (
          <span key={`${s}-${i}`} style={bloque({ alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${d.colores.lineaPie}`, fontSize: 10, fontWeight: 500, color: d.colores.textoPie })}>
            {s}
            <Espacio />
            <span style={{ color: d.colores.suavePie }}>›</span>
          </span>
        ) : (
          <BloqueTitulado key={`${s}-${i}`} titulo={s} n={2} c={c} zona="fila" />
        ),
      )}
      {tiene('mapa') && <Mapa c={c} ancho="100%" alto={70} />}
      {tiene('boletin') && <Boletin c={c} />}
      {tiene('pagos') && <Pagos c={c} />}
    </span>
  );
}

function BarraCelular({ c }: { c: Ctx }) {
  const { d, t } = c;
  return (
    <span data-zona="barra-celular" style={bloque({ position: 'sticky', bottom: 0, gap: 6, padding: 8, backgroundColor: d.colores.fondo, borderTop: `1px solid ${d.colores.linea}`, flexShrink: 0 })}>
      {d.barraCelular.map((a, i) => {
        const texto = t(`shell.celular.${a}`);
        return <Boton key={a} b={{ texto, corto: texto, variante: i === 0 ? 'solido' : 'contorno' }} c={{ ...c, u: 1, mini: false }} lleno />;
      })}
    </span>
  );
}

export interface EsquemaShellProps {
  dibujo: DibujoShell;
  /** Enlaces del menú principal (los de la plantilla o los del borrador). */
  enlaces: readonly string[];
  /** Nombres de los menús del pie, en orden. */
  menusPie: readonly string[];
  /** 1 = grande; por debajo de {@link ESCALA_MINI}, versión mini. */
  escala?: number;
  celular?: boolean;
  /** Lo que va entre el encabezado y el pie; por defecto una banda neutra. */
  contenido?: ReactNode;
  /** Alto de la banda por defecto (px a escala 1); sin él, la banda ocupa el alto que sobre. */
  altoContenido?: number;
  /** Nombre del negocio para el logo (vista previa con tu contenido); sin él, «Tu marca». */
  marca?: string;
  /**
   * Texto alternativo: con él es una imagen (`role="img"`) y su interior no se lee. Sin él, quien
   * lo usa decide (la vista previa grande deja leer las secciones; la comparación se oculta).
   */
  alt?: string;
  className?: string;
  style?: CSSProperties;
}

/** Encabezado, contenido y pie de una plantilla, dibujados desde su modelo. */
export function EsquemaShell({ dibujo, enlaces, menusPie, escala = 1, celular, contenido, altoContenido, marca, alt, className, style }: EsquemaShellProps) {
  const t = useTextosDiseno();
  const c: Ctx = { d: dibujo, u: escala, mini: escala < ESCALA_MINI, t, marca };
  const banda =
    contenido ?? (
      <span
        data-zona="contenido"
        style={bloque({ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 * escala, flex: altoContenido ? undefined : 1, height: altoContenido ? altoContenido * escala : undefined, minHeight: 6, backgroundColor: dibujo.colores.contenido, color: dibujo.colores.suave, fontSize: 9 * escala })}
      >
        <span style={{ display: 'block', width: '40%', height: 6 * escala, borderRadius: 3, backgroundColor: dibujo.colores.linea }} />
        <span style={{ display: 'block', width: '26%', height: 4 * escala, borderRadius: 2, backgroundColor: dibujo.colores.linea }} />
        {!c.mini && t('shell.muestra.contenido')}
      </span>
    );
  return (
    <span
      role={alt ? 'img' : undefined}
      aria-label={alt}
      data-esquema-shell={celular ? 'celular' : c.mini ? 'mini' : 'grande'}
      className={className}
      // `clip` y no `hidden`: `hidden` crea un contenedor de desplazamiento y la barra fija del
      // celular dejaría de pegarse al borde de la vista previa.
      style={{ display: 'flex', flexDirection: 'column', overflow: 'clip', backgroundColor: dibujo.colores.fondo, fontFamily: familiaCss(dibujo.fuenteCuerpo), lineHeight: 1.25, ...style }}
    >
      <Encabezado c={c} enlaces={enlaces} celular={celular} />
      {banda}
      {celular ? <PieCelular c={c} menus={menusPie} /> : <Pie c={c} menus={menusPie} />}
      {celular && dibujo.barraCelular.length > 0 && <BarraCelular c={c} />}
    </span>
  );
}
