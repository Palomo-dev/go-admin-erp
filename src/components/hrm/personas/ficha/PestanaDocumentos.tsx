'use client';

/**
 * Documentos (Figma 95-hrm-03-07 y 03-09): el expediente por carpetas, lo que
 * exige el cargo (faltantes), vencimientos y «Leer documento con IA».
 *
 * - Lista: `GET /api/hrm/personas/[id]/documentos` (solo grupos que el usuario
 *   puede ver; los demás llegan «restringidos», sin nombre).
 * - Subir: URL firmada al bucket privado; el grupo lo decide el servidor por la
 *   categoría. Descargar: URL firmada de 60 s, con registro.
 * - IA: propone, la persona confirma campo por campo; una lectura fallida no se
 *   cobra (decisión 13).
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Download, FileText, Folder, Lock, Sparkles, Upload } from 'lucide-react';
import {
  AvisoTonal,
  CampoFecha,
  ChipsOpcion,
  Dialogo,
  EmptyState,
  FilterPanel,
  FormField,
  ListToolbar,
  PanelAdaptable,
  SearchInput,
  Skeleton,
  clasesBoton,
  type AccionFila,
} from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { CARPETAS_DOCUMENTO, CATEGORIAS_DOCUMENTO, carpetaDeCategoria, type CarpetaDocumento } from '@/lib/hrm/personas/catalogo';
import { diasEntre, normalizar } from '@/lib/hrm/personas/logica';
import { ErrorPersonas, pedir, subirDocumento, urlDocumento, useCarga, type DocumentoPersona } from '../apiPersonas';
import { useNombreCategoria } from '../textosPersonas';
import { TarjetaDocumento, type EstadoDocumento } from '../piezas/TarjetaDocumento';
import { CampoPropuestoIA } from '../piezas/CampoPropuestoIA';
import type { ContextoFicha } from './FichaEmpleado';

type FiltroEstado = 'todos' | 'vigentes' | 'por_vencer' | 'vencidos' | 'faltan';
interface Tarjeta {
  clave: string;
  categoria: string;
  carpeta: CarpetaDocumento;
  estado: EstadoDocumento;
  doc?: DocumentoPersona;
}

export function PestanaDocumentos({ ficha, recargar: recargarFicha }: ContextoFicha) {
  const t = useTranslations('hrmPersonas.documentos');
  const tc = useTranslations('hrmPersonas.comun');
  const nombreCategoria = useNombreCategoria();
  const { formatDate } = useFormatDate();
  const params = useSearchParams();
  const { carga, recargar } = useCarga<{ documentos: DocumentoPersona[]; exigidos: string[]; grupos_visibles: string[] }>(
    `/api/hrm/personas/${ficha.persona.id}/documentos`
  );
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('todos');
  const [carpeta, setCarpeta] = useState<CarpetaDocumento | 'todas'>('todas');
  const [subir, setSubir] = useState<string | null>(params?.get('subir') === '1' ? '' : null);
  const [ia, setIa] = useState<string | null | undefined>(undefined);
  const g = ficha.permisos.grupos;
  const dias = ficha.dias_aviso;

  const tarjetas = useMemo<Tarjeta[]>(() => {
    if (carga.estado !== 'listo') return [];
    const docs = carga.datos.documentos;
    const faltan = carga.datos.exigidos.filter((c) => !docs.some((d) => d.categoria === c));
    const deDoc = (d: DocumentoPersona): EstadoDocumento =>
      d.restringido
        ? 'restringido'
        : !d.vence
          ? 'sin_vencimiento'
          : d.vence < ficha.hoy
            ? 'vencido'
            : diasEntre(ficha.hoy, d.vence) <= dias
              ? 'por_vencer'
              : 'vigente';
    return [
      ...faltan.map((c) => ({ clave: `falta-${c}`, categoria: c, carpeta: carpetaDeCategoria(c), estado: 'falta' as const })),
      ...docs.map((d) => ({ clave: d.id, categoria: d.categoria, carpeta: carpetaDeCategoria(d.categoria), estado: deDoc(d), doc: d })),
    ];
  }, [carga, ficha.hoy, dias]);

  useEffect(() => {
    if (params?.get('subir') === '1') setSubir('');
  }, [params]);

  if (carga.estado === 'sinPermiso') return <EmptyState variante="forbidden" titulo={t('sinPermiso')} />;
  if (carga.estado === 'error' || carga.estado === 'noExiste') {
    return <EmptyState variante="error" titulo={tc('errorCarga')} onReintentar={() => void recargar()} />;
  }
  if (carga.estado === 'cargando') return <Skeleton className="h-64 w-full" />;

  const q = normalizar(texto);
  const visibles = tarjetas.filter(
    (x) =>
      (carpeta === 'todas' || x.carpeta === carpeta) &&
      (estado === 'todos' ||
        (estado === 'vigentes' && (x.estado === 'vigente' || x.estado === 'sin_vencimiento')) ||
        (estado === 'por_vencer' && x.estado === 'por_vencer') ||
        (estado === 'vencidos' && x.estado === 'vencido') ||
        (estado === 'faltan' && x.estado === 'falta')) &&
      (!q || normalizar(nombreCategoria(x.categoria)).includes(q) || normalizar(x.doc?.nombre ?? '').includes(q))
  );
  const conteo = (c: CarpetaDocumento) => tarjetas.filter((x) => x.carpeta === c && x.estado !== 'falta').length;
  const faltanEn = (c: CarpetaDocumento) => tarjetas.filter((x) => x.carpeta === c && x.estado === 'falta').length;
  const faltantes = tarjetas.filter((x) => x.estado === 'falta');
  const porVencer = tarjetas.filter((x) => x.estado === 'por_vencer');
  const puedeSubir = Object.values(g).some((x) => x.editar);
  const identidades = tarjetas.filter((x) => x.categoria === 'documento_identidad' && x.doc && !x.doc.restringido);

  const abrir = async (id: string) => {
    try {
      const { url } = await urlDocumento(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(t('errorAbrir'));
    }
  };

  const accionesDe = (x: Tarjeta): AccionFila[] =>
    x.doc && !x.doc.restringido
      ? [
          { id: 'ver', etiqueta: t('ver'), icono: Download, onSelect: () => void abrir(x.doc?.id as string) },
          {
            id: 'ia',
            etiqueta: t('leerIa'),
            icono: Sparkles,
            onSelect: () => setIa(x.doc?.id ?? null),
            oculta: x.categoria !== 'documento_identidad' || !g.identificacion.editar,
          },
          {
            id: 'reemplazar',
            etiqueta: t('reemplazar'),
            icono: Upload,
            onSelect: () => setSubir(x.categoria),
            oculta: !g[CATEGORIAS_DOCUMENTO[x.categoria]?.grupo ?? 'identificacion']?.editar,
          },
        ]
      : [];

  return (
    <div className="flex flex-col gap-4">
      {(faltantes.length > 0 || porVencer.length > 0) && (
        <AvisoTonal
          tono="informacion"
          icono={FileText}
          titulo={t('comparado', {
            cargo: ficha.vinculo?.cargo ?? tc('sinDato'),
            detalle: [
              faltantes.length ? t('falta', { lista: faltantes.map((x) => nombreCategoria(x.categoria)).join(', ') }) : null,
              porVencer.length
                ? t('venceLista', { lista: porVencer.map((x) => nombreCategoria(x.categoria)).join(', ') })
                : null,
            ]
              .filter(Boolean)
              .join('; '),
          })}
          accion={faltantes.length ? { etiqueta: t('verFaltantes'), onClick: () => setEstado('faltan') } : undefined}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-fg">{t('titulo')}</h2>
        <div className="flex flex-wrap gap-2">
          {g.identificacion.editar && (
            <button type="button" onClick={() => setIa(identidades[0]?.doc?.id ?? null)} className={clasesBoton({ variante: 'secundario' })}>
              <Sparkles aria-hidden className="size-4" strokeWidth={1.5} />
              {t('leerIa')}
            </button>
          )}
          {puedeSubir && (
            <button type="button" onClick={() => setSubir('')} className={clasesBoton({ variante: 'primario' })}>
              <Upload aria-hidden className="size-4" strokeWidth={1.5} />
              {t('subirDocumento')}
            </button>
          )}
        </div>
      </div>

      <ListToolbar
        busqueda={<SearchInput value={texto} onChange={setTexto} placeholder={t('buscar')} etiqueta={t('buscar')} />}
        filtros={
          <FilterPanel conteo={estado === 'todos' ? 0 : 1} onLimpiar={() => setEstado('todos')} textoVerResultados={t('verN', { n: visibles.length })}>
            <FormField etiqueta={t('estado')}>
              {(c) => (
                <ChipsOpcion<FiltroEstado>
                  aria-labelledby={c.idEtiqueta}
                  valor={estado}
                  onValorChange={setEstado}
                  opciones={(['todos', 'vigentes', 'por_vencer', 'vencidos', 'faltan'] as const).map((v) => ({ valor: v, etiqueta: t(`filtros.${v}`) }))}
                />
              )}
            </FormField>
          </FilterPanel>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label={t('carpetas')} className="hidden rounded-xl border border-line bg-surface p-2 lg:block">
          <ul className="flex flex-col gap-0.5">
            {(['todas', ...CARPETAS_DOCUMENTO] as const).map((c) => {
              const activa = carpeta === c;
              const restringida = c !== 'todas' && ((c === 'salud' && !g.salud.ver) || (c === 'disciplinarios' && !g.disciplinario.ver));
              const Icono = restringida ? Lock : Folder;
              return (
                <li key={c}>
                  <button
                    type="button"
                    aria-current={activa ? 'true' : undefined}
                    onClick={() => setCarpeta(c)}
                    className={
                      activa
                        ? 'flex w-full items-center gap-2 rounded-lg bg-brand-tint px-3 py-2 text-left text-sm font-medium text-brand-deep'
                        : 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-hover'
                    }
                  >
                    <Icono aria-hidden className="size-4 shrink-0" strokeWidth={1.5} />
                    <span className="flex-1 truncate">{t(`carpetasNombres.${c}`)}</span>
                    <span className="text-xs text-fg-secondary">
                      {c === 'todas'
                        ? tarjetas.filter((x) => x.estado !== 'falta').length
                        : faltanEn(c)
                          ? t('conteoFalta', { n: conteo(c), f: faltanEn(c) })
                          : conteo(c)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="-mx-1 overflow-x-auto px-1 lg:hidden">
          <ChipsOpcion<CarpetaDocumento | 'todas'>
            etiqueta={t('carpetas')}
            valor={carpeta}
            onValorChange={setCarpeta}
            className="w-max flex-nowrap"
            opciones={(['todas', ...CARPETAS_DOCUMENTO] as const).map((c) => ({ valor: c, etiqueta: t(`carpetasNombres.${c}`) }))}
          />
        </div>

        {visibles.length === 0 ? (
          <EmptyState
            variante={texto || estado !== 'todos' ? 'search' : 'empty'}
            icono={FileText}
            titulo={t('vacio')}
            onLimpiarFiltros={() => {
              setTexto('');
              setEstado('todos');
              setCarpeta('todas');
            }}
            accion={puedeSubir ? { etiqueta: t('subirDocumento'), onClick: () => setSubir(''), icono: Upload } : undefined}
            compacto
          />
        ) : (
          <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibles.map((x) => (
              <TarjetaDocumento
                key={x.clave}
                titulo={nombreCategoria(x.categoria)}
                carpeta={t(`carpetasNombres.${x.carpeta}`)}
                estado={x.estado}
                detalle={
                  x.estado === 'falta'
                    ? t('loExige', { cargo: ficha.vinculo?.cargo ?? tc('sinDato') })
                    : x.estado === 'restringido'
                      ? t('soloConPermiso')
                      : [x.doc?.tipo === 'application/pdf' ? 'PDF' : t('imagen'), x.doc?.tamano ? `${Math.max(1, Math.round(x.doc.tamano / 1024))} KB` : null]
                          .filter(Boolean)
                          .join(' · ')
                }
                vence={x.doc?.vence ?? null}
                dias={x.doc?.vence ? diasEntre(ficha.hoy, x.doc.vence) : null}
                subido={x.doc?.creado ? t('subidoPor', { fecha: formatDate(x.doc.creado), nombre: x.doc.subio ?? '—' }) : null}
                acciones={accionesDe(x)}
                onSubir={puedeSubir ? () => setSubir(x.categoria) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {subir !== null && (
        <DialogoSubirDocumento
          ficha={ficha}
          categoriaInicial={subir}
          onCerrar={() => setSubir(null)}
          onSubido={() => {
            setSubir(null);
            void recargar();
            void recargarFicha();
          }}
        />
      )}
      {ia !== undefined && (
        <PanelLeerIa
          ficha={ficha}
          documentoInicial={ia}
          identidades={identidades.map((x) => ({ id: x.doc?.id as string, nombre: x.doc?.nombre ?? '' }))}
          onCerrar={() => setIa(undefined)}
          onGuardado={() => {
            setIa(undefined);
            void recargar();
            void recargarFicha();
          }}
        />
      )}
    </div>
  );
}

function DialogoSubirDocumento({
  ficha,
  categoriaInicial,
  onCerrar,
  onSubido,
}: {
  ficha: ContextoFicha['ficha'];
  categoriaInicial: string;
  onCerrar: () => void;
  onSubido: (id: string) => void;
}) {
  const t = useTranslations('hrmPersonas.documentos');
  const tc = useTranslations('hrmPersonas.comun');
  const nombreCategoria = useNombreCategoria();
  const g = ficha.permisos.grupos;
  const categorias = Object.entries(CATEGORIAS_DOCUMENTO)
    .filter(([, c]) => g[c.grupo]?.editar)
    .map(([k]) => k);
  const [categoria, setCategoria] = useState(categorias.includes(categoriaInicial) ? categoriaInicial : '');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vence, setVence] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async () => {
    if (!archivo || !categoria) return;
    setSubiendo(true);
    setError(null);
    try {
      const r = await subirDocumento(ficha.persona.id, archivo, categoria, { venceEl: vence || null, vinculoId: ficha.vinculo?.id ?? null });
      toast.success(t('subido'));
      onSubido(r.id);
    } catch (e) {
      const c = e instanceof ErrorPersonas ? e.codigo : '';
      setError(c === 'tipo_no_permitido' || c === 'tamano_no_permitido' ? t(`errores.${c}`) : tc('errorGuardar'));
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Dialogo
      abierto
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={t('subirDocumento')}
      descripcion={ficha.persona.nombre}
      ancho={520}
      icono={Upload}
      primario={{ etiqueta: t('subir'), onClick: () => void enviar(), cargando: subiendo, deshabilitada: !archivo || !categoria }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('tipoDocumento')} obligatorio>
          {(c) => (
            <Select value={categoria || undefined} onValueChange={setCategoria}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={tc('elegir')} />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((k) => (
                  <SelectItem key={k} value={k}>
                    {nombreCategoria(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('archivo')} obligatorio ayuda={t('archivoAyuda')}>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-fg file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-fg"
          />
        </FormField>
        <FormField etiqueta={t('venceEl')} ayuda={t('venceAyuda', { n: ficha.dias_aviso })}>
          <CampoFecha valor={vence} onValorChange={setVence} limpiable />
        </FormField>
        <AvisoTonal tono="neutro" compacto icono={Lock} titulo={t('privado')} />
        {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} />}
      </div>
    </Dialogo>
  );
}

type CampoIa = 'doc_type' | 'doc_number' | 'nombres' | 'apellidos' | 'birth_date' | 'doc_issue_date' | 'doc_issue_place';
interface CampoLeido {
  campo: CampoIa;
  valor: string;
  confianza: 'alta' | 'media' | 'baja';
  actual: string | null;
}

function PanelLeerIa({
  ficha,
  documentoInicial,
  identidades,
  onCerrar,
  onGuardado,
}: {
  ficha: ContextoFicha['ficha'];
  documentoInicial: string | null;
  identidades: { id: string; nombre: string }[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const t = useTranslations('hrmPersonas.ia');
  const tc = useTranslations('hrmPersonas.comun');
  const [documento, setDocumento] = useState<string | null>(documentoInicial);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [campos, setCampos] = useState<CampoLeido[] | null>(null);
  const [segundos, setSegundos] = useState<number | null>(null);
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const igual = (c: CampoLeido) => !!c.actual && normalizar(c.actual).replace(/[.\s]/g, '') === normalizar(c.valor).replace(/[.\s]/g, '');

  const leer = async (id: string) => {
    setLeyendo(true);
    setError(null);
    try {
      const r = await pedir<{ campos: CampoLeido[]; segundos: number }>(`/api/hrm/personas/${ficha.persona.id}/leer-documento`, {
        metodo: 'POST',
        cuerpo: { accion: 'leer', documento_id: id },
      });
      setCampos(r.campos);
      setSegundos(r.segundos);
      // Decisión 13: baja confianza o distinto de la ficha → llega sin marcar.
      setMarcados(Object.fromEntries(r.campos.map((c) => [c.campo, c.confianza === 'alta' && (igual(c) || !c.actual)])));
    } catch (e) {
      const c = e instanceof ErrorPersonas ? e.codigo : '';
      setError(['sin_creditos', 'ia_no_disponible', 'lectura_fallida', 'lectura_vacia', 'sin_permiso'].includes(c) ? t(`errores.${c}`) : t('errores.lectura_fallida'));
    } finally {
      setLeyendo(false);
    }
  };

  const confirmados = (campos ?? []).filter((c) => marcados[c.campo] && c.valor.trim());
  const guardar = async () => {
    if (!documento) return;
    setGuardando(true);
    try {
      await pedir(`/api/hrm/personas/${ficha.persona.id}/leer-documento`, {
        metodo: 'POST',
        cuerpo: { accion: 'confirmar', documento_id: documento, valores: Object.fromEntries(confirmados.map((c) => [c.campo, c.valor])) },
      });
      toast.success(t('guardado', { n: confirmados.length }));
      onGuardado();
    } catch {
      toast.error(tc('errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <PanelAdaptable
      abierto
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={t('titulo')}
      descripcion={t('subtitulo')}
      icono={Sparkles}
      ancho={560}
      ocupado={leyendo || guardando}
      pie={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={clasesBoton({ variante: 'secundario' })}>
            {t('descartar')}
          </button>
          {campos ? (
            <button type="button" onClick={() => void guardar()} disabled={confirmados.length === 0 || guardando} className={clasesBoton({ variante: 'primario' })}>
              {t('guardar', { n: confirmados.length })}
            </button>
          ) : (
            <button type="button" onClick={() => documento && void leer(documento)} disabled={!documento || leyendo} className={clasesBoton({ variante: 'primario' })}>
              <Sparkles aria-hidden className="size-4" strokeWidth={1.5} />
              {leyendo ? t('leyendo') : t('leer')}
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {!campos && (
          <>
            {identidades.length === 0 ? (
              <AvisoTonal tono="advertencia" titulo={t('sinDocumento')} />
            ) : (
              <FormField etiqueta={t('documento')}>
                {(c) => (
                  <Select value={documento ?? undefined} onValueChange={setDocumento}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue placeholder={tc('elegir')} />
                    </SelectTrigger>
                    <SelectContent>
                      {identidades.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            )}
            {leyendo && <Skeleton className="h-40 w-full" />}
          </>
        )}
        {campos && (
          <>
            <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-fg">
              {t('leido', { nombre: identidades.find((d) => d.id === documento)?.nombre ?? '', s: segundos ?? 0 })}
            </p>
            {campos.map((c) => (
              <CampoPropuestoIA
                key={c.campo}
                id={`ia-${c.campo}`}
                etiqueta={t(`campos.${c.campo}`)}
                valor={c.valor}
                onValorChange={(v) => setCampos((x) => (x ?? []).map((y) => (y.campo === c.campo ? { ...y, valor: v } : y)))}
                confianza={c.confianza}
                actual={c.actual}
                igual={igual(c)}
                confirmado={!!marcados[c.campo]}
                onConfirmadoChange={(v) => setMarcados((m) => ({ ...m, [c.campo]: v }))}
              />
            ))}
          </>
        )}
        {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} />}
        <AvisoTonal tono="neutro" compacto titulo={t('nota')} descripcion={t('creditos')} />
      </div>
    </PanelAdaptable>
  );
}
