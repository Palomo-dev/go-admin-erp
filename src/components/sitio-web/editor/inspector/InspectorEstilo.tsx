'use client';

/**
 * Pestaña «Estilo» de una sección (Figma A/05c y «figma-estilo» 01-09, aprobado por el dueño):
 *
 * - Fondo, Entrada al aparecer, Espaciado y Ancho (chips).
 * - Tipografía: «Como el sitio» | «Personalizada». Personalizada: fuente del título y del texto
 *   (FontField: fuentes del tema enlazadas u otras del catálogo), «Ajustes de» Título | Texto,
 *   tamaño S·M·L·XL o px, grosor, interlineado y «Todo en mayúsculas».
 * - Mostrar en: computador, tableta y celular (DeviceToggle); siempre queda uno activo.
 * - Colores: texto y borde con los colores de la marca enlazados o un hex propio, con contraste.
 * - «Restablecer el estilo de la sección».
 *
 * En una sede (figma-estilo/03 y 04) cada grupo dice si se hereda del sitio principal o es
 * propio, con «Restablecer» por grupo y «Restablecer todo el estilo (volver a heredar)». Lo que no
 * se sobrescribe sigue al «Estilo del sitio». No guarda: avisa cada cambio.
 */
import { useId, useState, type ReactNode } from 'react';
import { Lock, Pencil } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { CampoNumero, ChipsOpcion, SegmentedControl, SettingRow } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { FontField } from '@/components/sitio-web/ui/FontField';
import { ColorMarcaField } from '@/components/sitio-web/ui/ColorMarcaField';
import { DeviceToggleGroup } from '@/components/sitio-web/ui/DeviceToggle';
import { TABLETA_EN_SITIO_PUBLICO, conTabletaSegunContrato } from '@/components/sitio-web/ui/visibilidadDispositivo';
import { DeviceVisibilityChip } from '@/components/sitio-web/ui/DeviceVisibilityChip';
import { InheritanceTag } from '@/components/sitio-web/ui/InheritanceTag';
import { familiaCss } from '@/components/sitio-web/diseno/catalogo';
import { useFuentesSitio } from '@/components/sitio-web/diseno/useFuentesSitio';
import { rolDeReferencia, type ColoresMarca } from '@/lib/website/v2/colorMarca';
import { resolverFuenteTema, type FuentesTema } from '@/lib/website/v2/fuenteTema';
import {
  ANCHOS_SECCION,
  DISPOSITIVOS,
  ENTRADAS_SECCION,
  ESPACIADOS_SECCION,
  ESTILO_POR_DEFECTO,
  FONDOS_SECCION,
  GROSORES_TEXTO,
  GRUPOS_ESTILO,
  INTERLINEADOS,
  LIMITES_INTERLINEADO,
  LIMITES_TAMANO_PX,
  TAMANOS_TEXTO,
  escalaDeInterlineado,
  escalaDePx,
  estiloVacio,
  interlineadoNumero,
  puedeOcultar,
  tamanoEnPx,
  type EstiloSeccion,
  type EstiloTexto,
  type GrupoEstilo,
  type OrigenGrupo,
  type RolTexto,
  type Visibilidad,
} from '@/lib/website/v2/estiloSeccion';
import { useTextosEditor, type TraductorEditor } from '../textos';

export interface TemaEstiloSeccion {
  colores: ColoresMarca;
  fuentes: FuentesTema;
}

export interface SedeEstilo {
  nombre: string;
  origen: Record<GrupoEstilo, OrigenGrupo>;
  onRestablecer: (grupo: GrupoEstilo | 'todo') => void;
}

export interface InspectorEstiloProps {
  estilo: EstiloSeccion;
  visibilidad: Visibilidad;
  onCambiarEstilo: (estilo: EstiloSeccion | null) => void;
  onCambiarVisibilidad: (v: Visibilidad) => void;
  tema: TemaEstiloSeccion;
  catalogoFuentes: readonly string[];
  sede?: SedeEstilo | null;
  deshabilitado?: boolean;
}

const TITULO = 'text-[13px] font-semibold leading-[18px] text-fg';
const AYUDA = 'text-[13px] leading-[18px] text-fg-secondary';

function Grupo({ titulo, id, extra, children }: { titulo: string; id: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id={id} className={TITULO}>
          {titulo}
        </h3>
        {extra}
      </div>
      {children}
    </div>
  );
}

/** Resumen de un grupo para la vista de sede (figma-estilo/03 y 04). */
export function resumenGrupo(
  g: GrupoEstilo,
  estilo: EstiloSeccion,
  visibilidad: Visibilidad,
  tema: TemaEstiloSeccion,
  t: TraductorEditor,
): string {
  if (g === 'tipografia') {
    if (estilo.tipografia?.modo !== 'propia') {
      return t('estilo.resumen.comoSitio', {
        titulos: tema.fuentes.titulos ?? '—',
        cuerpo: tema.fuentes.cuerpo ?? '—',
      });
    }
    const ti = estilo.tipografia.titulo ?? {};
    const partes = [t('estilo.resumen.propia'), resolverFuenteTema(ti.fuente ?? null, tema.fuentes, 'titulos') ?? '—'];
    const px = tamanoEnPx(ti.tamano, 'titulo');
    if (ti.tamano !== undefined && px !== null) partes.push(typeof ti.tamano === 'string' ? `${ti.tamano} ${px} px` : `${px} px`);
    if (ti.grosor) partes.push(t(`estilo.grosor.${ti.grosor}`));
    if (ti.mayusculas) partes.push(t('estilo.resumen.mayusculas'));
    return partes.join(' · ');
  }
  if (g === 'mostrar') {
    return DISPOSITIVOS.filter((d) => visibilidad[d])
      .map((d) => t(`estilo.dispositivo.${d}`))
      .join(' · ');
  }
  if (g === 'colores') {
    const color = (v: string | undefined, porDefecto: string) => {
      if (!v) return porDefecto;
      const rol = rolDeReferencia(v);
      return rol ? t('estilo.resumen.deMarca', { rol: t(`estilo.rol.${rol}`) }) : v;
    };
    return t('estilo.resumen.colores', {
      texto: color(estilo.colores?.texto, t('estilo.resumen.delTema')),
      borde: color(estilo.colores?.borde, t('estilo.resumen.delTema')),
    });
  }
  return t(`estilo.fondo.${estilo.fondo ?? ESTILO_POR_DEFECTO.fondo}`);
}

export function InspectorEstilo({
  estilo,
  visibilidad,
  onCambiarEstilo,
  onCambiarVisibilidad,
  tema,
  catalogoFuentes,
  sede,
  deshabilitado,
}: InspectorEstiloProps) {
  const t = useTextosEditor();
  const id = useId();
  const [rol, setRol] = useState<RolTexto>('titulo');
  const [avisoUltimo, setAvisoUltimo] = useState(false);
  // En una sede, los grupos heredados se muestran plegados hasta «Cambiar» (figma-estilo/03).
  const [abiertos, setAbiertos] = useState<Set<GrupoEstilo>>(new Set());

  const tipografia = estilo.tipografia?.modo === 'propia' ? estilo.tipografia : null;
  const texto: EstiloTexto = (rol === 'titulo' ? tipografia?.titulo : tipografia?.texto) ?? {};
  const fuentesUsadas = [tema.fuentes.titulos, tema.fuentes.cuerpo, tipografia?.titulo?.fuente, tipografia?.texto?.fuente].filter(
    (f): f is string => typeof f === 'string' && !f.startsWith('tema:'),
  );
  useFuentesSitio(fuentesUsadas);

  const cambiar = (parcial: Partial<EstiloSeccion>) => onCambiarEstilo({ ...estilo, ...parcial });
  const cambiarTexto = (parcial: Partial<EstiloTexto>) => {
    const actual = tipografia ?? { modo: 'propia' as const };
    const siguiente = { ...(rol === 'titulo' ? actual.titulo : actual.texto), ...parcial };
    cambiar({ tipografia: { ...actual, modo: 'propia', [rol]: siguiente } });
  };
  const opciones = <V extends string>(valores: readonly V[], clave: string) =>
    valores.map((v) => ({ valor: v, etiqueta: t(`${clave}.${v}`), deshabilitada: deshabilitado }));

  const px = tamanoEnPx(texto.tamano, rol);
  const escala = texto.tamano === undefined ? '' : typeof texto.tamano === 'string' ? texto.tamano : escalaDePx(texto.tamano, rol) ?? '';
  const lh = interlineadoNumero(texto.interlineado);
  const escalaLh = texto.interlineado === undefined ? '' : typeof texto.interlineado === 'string' ? texto.interlineado : escalaDeInterlineado(texto.interlineado) ?? '';

  const cambiarVisibilidad = (entrada: Visibilidad) => {
    const v = conTabletaSegunContrato(entrada);
    const apagado = DISPOSITIVOS.find((d) => visibilidad[d] && !v[d]);
    if (apagado && !puedeOcultar(visibilidad, apagado)) {
      setAvisoUltimo(true);
      return;
    }
    setAvisoUltimo(false);
    onCambiarVisibilidad(v);
  };

  /** Cabecera de un grupo en una sede: etiqueta de herencia y su resumen. */
  const cabeceraSede = (g: GrupoEstilo) =>
    sede ? (
      <InheritanceTag
        origen={sede.origen[g] === 'heredado' ? 'heredado' : 'personalizado'}
        onRestablecer={sede.origen[g] === 'personalizado' ? () => sede.onRestablecer(g) : undefined}
      />
    ) : undefined;
  const visibleEnSede = (g: GrupoEstilo) => !sede || sede.origen[g] === 'personalizado' || abiertos.has(g);
  const botonCambiar = (g: GrupoEstilo) =>
    sede && !visibleEnSede(g) ? (
      <button
        type="button"
        onClick={() => setAbiertos((a) => new Set(a).add(g))}
        disabled={deshabilitado}
        className="inline-flex items-center gap-1.5 self-start rounded-md text-[13px] font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Pencil aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        {t('estilo.sede.cambiar')}
      </button>
    ) : null;

  const propios = sede ? GRUPOS_ESTILO.filter((g) => sede.origen[g] === 'personalizado') : [];

  return (
    <div className="flex flex-col gap-5">
      {sede &&
        (propios.length === 0 ? (
          <div className="flex flex-col gap-1 rounded-lg bg-subtle p-3">
            <p className="flex items-start gap-2 text-sm leading-5 text-fg">
              <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
              {t('estilo.sede.heredado')}
            </p>
            <p className="pl-6 text-[13px] leading-[18px] text-fg-muted">{t('estilo.sede.heredadoAyuda', { sede: sede.nombre })}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <InheritanceTag origen="personalizado" onRestablecer={() => sede.onRestablecer('todo')} className="self-start" />
            <p className={AYUDA}>
              {t('estilo.sede.propios', {
                n: propios.length,
                sede: sede.nombre,
                grupos: propios.map((g) => t(`estilo.grupo.${g}`)).join(' y '),
              })}
            </p>
          </div>
        ))}

      {/* Fondo, entrada, espaciado y ancho: grupo «Fondo» en sedes */}
      <section className="flex flex-col gap-4">
        {sede && (
          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            <h3 className={TITULO}>{t('estilo.grupo.fondo')}</h3>
            {cabeceraSede('fondo')}
          </div>
        )}
        {sede && !visibleEnSede('fondo') ? (
          <>
            <p className={AYUDA}>{resumenGrupo('fondo', estilo, visibilidad, tema, t)}</p>
            {botonCambiar('fondo')}
          </>
        ) : (
          <>
            <Grupo titulo={t('estilo.fondoTitulo')} id={`${id}-fondo`}>
              <ChipsOpcion
                aria-labelledby={`${id}-fondo`}
                opciones={opciones(FONDOS_SECCION, 'estilo.fondo')}
                valor={estilo.fondo ?? ESTILO_POR_DEFECTO.fondo}
                onValorChange={(fondo) => cambiar({ fondo })}
              />
              <p className={AYUDA}>{t('estilo.fondoAyuda')}</p>
            </Grupo>
            <Grupo titulo={t('estilo.entradaTitulo')} id={`${id}-entrada`}>
              <ChipsOpcion
                aria-labelledby={`${id}-entrada`}
                opciones={opciones(ENTRADAS_SECCION, 'estilo.entrada')}
                valor={estilo.entrada ?? ESTILO_POR_DEFECTO.entrada}
                onValorChange={(entrada) => cambiar({ entrada })}
              />
              <p className={AYUDA}>{t('estilo.entradaAyuda')}</p>
            </Grupo>
            <Grupo titulo={t('estilo.espaciadoTitulo')} id={`${id}-espaciado`}>
              <ChipsOpcion
                aria-labelledby={`${id}-espaciado`}
                opciones={opciones(ESPACIADOS_SECCION, 'estilo.espaciado')}
                valor={estilo.espaciado ?? ESTILO_POR_DEFECTO.espaciado}
                onValorChange={(espaciado) => cambiar({ espaciado })}
              />
            </Grupo>
            <Grupo titulo={t('estilo.anchoTitulo')} id={`${id}-ancho`}>
              <ChipsOpcion
                aria-labelledby={`${id}-ancho`}
                opciones={opciones(ANCHOS_SECCION, 'estilo.ancho')}
                valor={estilo.ancho ?? ESTILO_POR_DEFECTO.ancho}
                onValorChange={(ancho) => cambiar({ ancho })}
              />
            </Grupo>
          </>
        )}
      </section>

      {/* Tipografía (figma-estilo/01, 06, 07) */}
      <section className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 id={`${id}-tipografia`} className={TITULO}>
            {t('estilo.grupo.tipografia')}
          </h3>
          {sede ? (
            cabeceraSede('tipografia')
          ) : (
            <SegmentedControl
              aria-labelledby={`${id}-tipografia`}
              opciones={[
                { valor: 'sitio', etiqueta: t('estilo.tipografia.sitio') },
                { valor: 'propia', etiqueta: t('estilo.tipografia.propia') },
              ]}
              valor={tipografia ? 'propia' : 'sitio'}
              onValorChange={(v) => cambiar({ tipografia: v === 'propia' ? { modo: 'propia', ...(tipografia ?? {}) } : { modo: 'sitio' } })}
              deshabilitado={deshabilitado}
            />
          )}
        </div>
        {sede && !visibleEnSede('tipografia') ? (
          <>
            <p className={AYUDA}>{resumenGrupo('tipografia', estilo, visibilidad, tema, t)}</p>
            {botonCambiar('tipografia')}
          </>
        ) : (
          <>
            {sede && (
              <SegmentedControl
                aria-labelledby={`${id}-tipografia`}
                opciones={[
                  { valor: 'sitio', etiqueta: t('estilo.tipografia.sitio') },
                  { valor: 'propia', etiqueta: t('estilo.tipografia.propia') },
                ]}
                valor={tipografia ? 'propia' : 'sitio'}
                onValorChange={(v) => cambiar({ tipografia: v === 'propia' ? { modo: 'propia', ...(tipografia ?? {}) } : { modo: 'sitio' } })}
                deshabilitado={deshabilitado}
                anchoCompleto
              />
            )}
            <p className={AYUDA}>
              {t('estilo.tipografia.ayuda', { titulos: tema.fuentes.titulos ?? '—', cuerpo: tema.fuentes.cuerpo ?? '—' })}
            </p>
            {tipografia && (
              <>
                <FontField
                  etiqueta={t('estilo.tipografia.fuenteTitulo')}
                  valor={tipografia.titulo?.fuente ?? null}
                  onCambiar={(fuente) => cambiar({ tipografia: { ...tipografia, titulo: { ...tipografia.titulo, fuente } } })}
                  fuentesTema={tema.fuentes}
                  porDefecto="titulos"
                  catalogo={catalogoFuentes}
                  familiaCss={familiaCss}
                  deshabilitado={deshabilitado}
                />
                <FontField
                  etiqueta={t('estilo.tipografia.fuenteTexto')}
                  valor={tipografia.texto?.fuente ?? null}
                  onCambiar={(fuente) => cambiar({ tipografia: { ...tipografia, texto: { ...tipografia.texto, fuente } } })}
                  fuentesTema={tema.fuentes}
                  porDefecto="cuerpo"
                  catalogo={catalogoFuentes}
                  familiaCss={familiaCss}
                  deshabilitado={deshabilitado}
                />
                <div className="flex items-center justify-between gap-3">
                  <span id={`${id}-rol`} className={TITULO}>
                    {t('estilo.tipografia.ajustesDe')}
                  </span>
                  <SegmentedControl
                    aria-labelledby={`${id}-rol`}
                    opciones={[
                      { valor: 'titulo', etiqueta: t('estilo.tipografia.titulo') },
                      { valor: 'texto', etiqueta: t('estilo.tipografia.texto') },
                    ]}
                    valor={rol}
                    onValorChange={setRol}
                  />
                </div>
                <Grupo titulo={t('estilo.tipografia.tamano')} id={`${id}-tamano`}>
                  <div className="flex items-center gap-2">
                    <ChipsOpcion
                      aria-labelledby={`${id}-tamano`}
                      opciones={TAMANOS_TEXTO.map((v) => ({ valor: v, etiqueta: v, deshabilitada: deshabilitado }))}
                      valor={escala as (typeof TAMANOS_TEXTO)[number]}
                      onValorChange={(tamano) => cambiarTexto({ tamano })}
                      className="flex-1"
                    />
                    <CampoNumero
                      aria-label={t('estilo.tipografia.tamanoPx')}
                      valor={px}
                      onValorChange={(v) => cambiarTexto({ tamano: v === null ? undefined : v })}
                      minimo={LIMITES_TAMANO_PX.min}
                      maximo={LIMITES_TAMANO_PX.max}
                      sufijo="px"
                      alinear="derecha"
                      disabled={deshabilitado}
                      className="w-24"
                    />
                  </div>
                  <p className={AYUDA}>{t(rol === 'titulo' ? 'estilo.tipografia.escalaTitulo' : 'estilo.tipografia.escalaTexto')}</p>
                </Grupo>
                <Grupo titulo={t('estilo.tipografia.grosor')} id={`${id}-grosor`}>
                  <ChipsOpcion
                    aria-labelledby={`${id}-grosor`}
                    opciones={GROSORES_TEXTO.map((g) => ({ valor: String(g), etiqueta: t(`estilo.grosor.${g}`), deshabilitada: deshabilitado }))}
                    valor={texto.grosor ? String(texto.grosor) : ''}
                    onValorChange={(g) => cambiarTexto({ grosor: Number(g) as EstiloTexto['grosor'] })}
                  />
                </Grupo>
                <Grupo titulo={t('estilo.tipografia.interlineado')} id={`${id}-interlineado`}>
                  <div className="flex items-center gap-2">
                    <ChipsOpcion
                      aria-labelledby={`${id}-interlineado`}
                      opciones={opciones(INTERLINEADOS, 'estilo.interlineado')}
                      valor={escalaLh as (typeof INTERLINEADOS)[number]}
                      onValorChange={(interlineado) => cambiarTexto({ interlineado })}
                      className="flex-1"
                    />
                    <CampoNumero
                      aria-label={t('estilo.tipografia.interlineadoValor')}
                      valor={lh}
                      onValorChange={(v) => cambiarTexto({ interlineado: v === null ? undefined : v })}
                      minimo={LIMITES_INTERLINEADO.min}
                      maximo={LIMITES_INTERLINEADO.max}
                      decimales={2}
                      sufijo="×"
                      alinear="derecha"
                      disabled={deshabilitado}
                      className="w-24"
                    />
                  </div>
                </Grupo>
                <SettingRow
                  titulo={t('estilo.tipografia.mayusculas')}
                  descripcion={t('estilo.tipografia.mayusculasAyuda')}
                  htmlFor={`${id}-mayus`}
                >
                  <Switch
                    id={`${id}-mayus`}
                    checked={texto.mayusculas === true}
                    disabled={deshabilitado}
                    onCheckedChange={(mayusculas) => cambiarTexto({ mayusculas })}
                  />
                </SettingRow>
                <p className={AYUDA}>{t('estilo.tipografia.enVivo')}</p>
              </>
            )}
          </>
        )}
      </section>

      {/* Mostrar en (figma-estilo/08, 09) */}
      <section className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className={TITULO}>{t('estilo.grupo.mostrar')}</h3>
          {cabeceraSede('mostrar')}
        </div>
        {sede && !visibleEnSede('mostrar') ? (
          <>
            <p className={AYUDA}>{resumenGrupo('mostrar', estilo, visibilidad, tema, t)}</p>
            {botonCambiar('mostrar')}
          </>
        ) : (
          <>
            <DeviceToggleGroup
              etiqueta={t('estilo.mostrarEtiqueta')}
              valor={conTabletaSegunContrato({ computador: visibilidad.computador, tableta: visibilidad.tableta, celular: visibilidad.celular })}
              onCambiar={(v) => cambiarVisibilidad(v)}
              deshabilitado={deshabilitado}
              bloqueados={TABLETA_EN_SITIO_PUBLICO ? [] : ['tableta']}
            />
            {!TABLETA_EN_SITIO_PUBLICO && <p className={AYUDA}>{t('estilo.tabletaSigueComputador')}</p>}
            <DeviceVisibilityChip visibilidad={conTabletaSegunContrato(visibilidad)} className="self-start" />
            <p className={cn(AYUDA, avisoUltimo && 'font-medium text-warning-text')} role={avisoUltimo ? 'alert' : undefined}>
              {avisoUltimo ? t('estilo.mostrarUltimo') : t('estilo.mostrarAyuda')}
            </p>
          </>
        )}
      </section>

      {/* Colores (figma-estilo/05) */}
      <section className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className={TITULO}>{t('estilo.grupo.colores')}</h3>
          {cabeceraSede('colores')}
        </div>
        {sede && !visibleEnSede('colores') ? (
          <>
            <p className={AYUDA}>{resumenGrupo('colores', estilo, visibilidad, tema, t)}</p>
            {botonCambiar('colores')}
          </>
        ) : (
          <>
            <p className={AYUDA}>{t('estilo.coloresAyuda')}</p>
            <ColorMarcaField
              etiqueta={t('estilo.colorTexto')}
              valor={estilo.colores?.texto ?? 'marca:texto'}
              onCambiar={(texto) => cambiar({ colores: { ...estilo.colores, texto } })}
              colores={tema.colores}
              deshabilitado={deshabilitado}
            />
            <ColorMarcaField
              etiqueta={t('estilo.colorBorde')}
              valor={estilo.colores?.borde ?? 'marca:secundario'}
              onCambiar={(borde) => cambiar({ colores: { ...estilo.colores, borde } })}
              colores={tema.colores}
              minimo={1}
              deshabilitado={deshabilitado}
            />
          </>
        )}
      </section>

      {sede ? (
        propios.length > 0 && (
          <button
            type="button"
            onClick={() => sede.onRestablecer('todo')}
            disabled={deshabilitado}
            className="self-start rounded-md text-[13px] font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {t('estilo.sede.restablecerTodo')}
          </button>
        )
      ) : (
        <button
          type="button"
          onClick={() => onCambiarEstilo(null)}
          disabled={deshabilitado || estiloVacio(estilo)}
          title={estiloVacio(estilo) ? t('estilo.sinCambios') : undefined}
          className="self-start rounded-md text-[13px] font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:text-fg-muted disabled:no-underline"
        >
          {t('estilo.restablecer')}
        </button>
      )}
    </div>
  );
}
