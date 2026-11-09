'use client';

/**
 * Nueva vigencia o corrección de una vigencia del perfil tributario (Figma
 * 2335:136222, «Nueva vigencia» y «⋮ › Editar»), con renta e IVA separados y
 * calidades con su soporte (P5/P8 del Contador, rondas 1 y 2). Mientras se
 * llena, la misma función que usa el servidor (`evaluarCombinacion`) muestra lo
 * contradictorio (no deja guardar), lo dudoso (se guarda solo si se acepta) y si
 * el cambio de periodicidad queda pendiente de soporte. El servidor y la base
 * vuelven a validar y a exigir `finance.approve`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { CampoFecha, Dialogo, FormField, StatusBadge, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectNativo } from '@/components/finanzas/tesoreria/compartido/TesoreriaComun';
import { PERIODICIDADES_ICA, PERIODICIDADES_IVA, contiguas, validarSolicitudPerfil, type IcaMunicipio, type PeriodicidadIca, type PeriodicidadIva, type VigenciaPerfil } from '@/lib/finanzas/tributario/perfil';
import {
  ACTIVIDADES_INC,
  CALIFICACIONES_GRAN_CONTRIBUYENTE,
  CONDICIONES_IVA,
  MOTIVOS_CAMBIO_PERIODICIDAD,
  REGIMENES_RENTA,
  TIPOS_RTE,
  advertenciasSinAceptar,
  evaluarCombinacion,
  type ActividadInc,
  type CalificacionGranContribuyente,
  type CondicionIva,
  type MotivoCambioPeriodicidad,
  type RegimenRenta,
  type TipoRte,
} from '@/lib/finanzas/tributario/combinaciones';
import { tributarioCliente, type CodigoCatalogoCliente, type MunicipioOpcion } from '../tributarioCliente';
import { codigoDe } from '../piezas';

export type BaseVigencia = Omit<VigenciaPerfil, 'id' | 'vigenteDesde' | 'vigenteHasta'>;

export interface VigenciaDialogoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** null = nueva vigencia. */
  vigencia: VigenciaPerfil | null;
  /** Datos con los que arranca una vigencia nueva (la más reciente o lo de la ficha). */
  base: BaseVigencia;
  /** Todas las vigencias (para el cambio de periodicidad respecto de la anterior y la siguiente). */
  vigencias: VigenciaPerfil[];
  inicioPropuesto: string;
  catalogo: CodigoCatalogoCliente[];
  catalogoRut: CodigoCatalogoCliente[];
  hoy: string;
  onGuardado: () => void;
}

interface Estado {
  vigenteDesde: string;
  regimenRenta: RegimenRenta | '';
  condicionIva: CondicionIva | '';
  periodicidadIva: PeriodicidadIva;
  granContribuyente: boolean;
  granContribuyenteActo: string;
  granContribuyenteDesde: string;
  granContribuyenteCalificacion: CalificacionGranContribuyente | '';
  granContribuyenteActoFecha: string;
  autorretenedor: boolean;
  autorretenedorActo: string;
  autorretenedorActoFecha: string;
  autorretencionEspecial: boolean;
  agenteRetencionIva: boolean;
  agenteRetencion: boolean;
  responsableInc: boolean;
  incActividad: ActividadInc | '';
  rteTipo: TipoRte | '';
  rteIngresos: '' | 'si' | 'no';
  noContribuyenteNaturaleza: string;
  responsabilidades: string[];
  responsabilidadesRut: string[];
  motivoCambioPeriodicidad: MotivoCambioPeriodicidad | '';
  cambioPeriodicidadHecho: string;
  cambioPeriodicidadNorma: string;
  cambioPeriodicidadFecha: string;
  notas: string;
  ica: IcaMunicipio[];
}

function estadoInicial(p: VigenciaDialogoProps): Estado {
  const f = p.vigencia ?? p.base;
  const propia = p.vigencia;
  return {
    vigenteDesde: propia?.vigenteDesde ?? p.inicioPropuesto,
    regimenRenta: f.regimenRenta ?? '',
    condicionIva: f.condicionIva ?? '',
    periodicidadIva: f.periodicidadIva,
    granContribuyente: f.granContribuyente === true,
    granContribuyenteActo: f.granContribuyenteActo ?? '',
    granContribuyenteDesde: f.granContribuyenteDesde ?? '',
    granContribuyenteCalificacion: f.granContribuyenteCalificacion ?? '',
    granContribuyenteActoFecha: f.granContribuyenteActoFecha ?? '',
    autorretenedor: f.autorretenedor === true,
    autorretenedorActo: f.autorretenedorActo ?? '',
    autorretenedorActoFecha: f.autorretenedorActoFecha ?? '',
    autorretencionEspecial: f.autorretencionEspecial === true,
    agenteRetencionIva: f.agenteRetencionIva === true,
    agenteRetencion: f.agenteRetencion,
    responsableInc: f.responsableInc,
    incActividad: f.incActividad ?? '',
    rteTipo: f.rteTipo ?? '',
    rteIngresos: f.rteIngresosSuperan160000Uvt === true ? 'si' : f.rteIngresosSuperan160000Uvt === false ? 'no' : '',
    noContribuyenteNaturaleza: f.noContribuyenteNaturaleza ?? '',
    responsabilidades: [...f.responsabilidades],
    responsabilidadesRut: [...f.responsabilidadesRut],
    // El soporte de un cambio de periodicidad es de la vigencia que se edita, no se hereda en una nueva.
    motivoCambioPeriodicidad: propia?.motivoCambioPeriodicidad ?? '',
    cambioPeriodicidadHecho: propia?.cambioPeriodicidadHecho ?? '',
    cambioPeriodicidadNorma: propia?.cambioPeriodicidadNorma ?? '',
    cambioPeriodicidadFecha: propia?.cambioPeriodicidadFecha ?? '',
    notas: f.notas ?? '',
    ica: f.ica.map((i) => ({ ...i })),
  };
}

const alternar = (lista: string[], codigo: string, marcada: boolean) => (marcada ? Array.from(new Set([...lista, codigo])) : lista.filter((c) => c !== codigo));
const oNull = (s: string) => (s.trim() ? s.trim() : null);

export function VigenciaDialogo(props: VigenciaDialogoProps) {
  const { abierto, onAbiertoChange, vigencia, vigencias, catalogo, catalogoRut, hoy, onGuardado } = props;
  const t = useTranslations('finanzasTributarioR4.perfil');
  const tc = useTranslations('finanzasTributarioR4.comun');
  const [estado, setEstado] = useState<Estado>(() => estadoInicial(props));
  const [aceptadas, setAceptadas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bloqueosServidor, setBloqueosServidor] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setEstado(estadoInicial(props));
      setAceptadas(false);
      setError(null);
      setBloqueosServidor([]);
    }
    // Solo al abrir: mientras está abierto, el formulario es de la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const cambiar = <K extends keyof Estado>(k: K, v: Estado[K]) => {
    setEstado((e) => ({ ...e, [k]: v }));
    setAceptadas(false);
    setBloqueosServidor([]);
  };

  const cuerpo = {
    id: vigencia?.id ?? null,
    vigenteDesde: estado.vigenteDesde,
    regimenRenta: estado.regimenRenta || null,
    condicionIva: estado.condicionIva || null,
    periodicidadIva: estado.periodicidadIva,
    granContribuyente: estado.granContribuyente,
    granContribuyenteActo: estado.granContribuyente ? oNull(estado.granContribuyenteActo) : null,
    granContribuyenteDesde: estado.granContribuyente ? oNull(estado.granContribuyenteDesde) : null,
    granContribuyenteCalificacion: estado.granContribuyente ? estado.granContribuyenteCalificacion || null : null,
    granContribuyenteActoFecha: estado.granContribuyente ? oNull(estado.granContribuyenteActoFecha) : null,
    autorretenedor: estado.autorretenedor,
    autorretenedorActo: estado.autorretenedor ? oNull(estado.autorretenedorActo) : null,
    autorretenedorActoFecha: estado.autorretenedor ? oNull(estado.autorretenedorActoFecha) : null,
    autorretencionEspecial: estado.autorretencionEspecial,
    agenteRetencionIva: estado.agenteRetencionIva,
    agenteRetencion: estado.agenteRetencion,
    responsableInc: estado.responsableInc,
    incActividad: estado.responsableInc ? estado.incActividad || null : null,
    rteTipo: estado.regimenRenta === 'especial' ? estado.rteTipo || null : null,
    rteIngresosSuperan160000Uvt: estado.regimenRenta === 'especial' ? (estado.rteIngresos === 'si' ? true : estado.rteIngresos === 'no' ? false : null) : null,
    noContribuyenteNaturaleza: estado.regimenRenta.startsWith('no_contribuyente') ? oNull(estado.noContribuyenteNaturaleza) : null,
    responsabilidades: estado.responsabilidades,
    responsabilidadesRut: estado.responsabilidadesRut,
    motivoCambioPeriodicidad: estado.motivoCambioPeriodicidad || null,
    cambioPeriodicidadHecho: oNull(estado.cambioPeriodicidadHecho),
    cambioPeriodicidadNorma: oNull(estado.cambioPeriodicidadNorma),
    cambioPeriodicidadFecha: oNull(estado.cambioPeriodicidadFecha),
    notas: estado.notas,
    ica: estado.ica.map((i) => ({ municipioId: i.municipioId, periodicidad: i.periodicidad, tarifaPorMil: i.tarifaPorMil, actividad: i.actividad })),
  };

  const evaluacion = useMemo(() => {
    const desde = vigencia?.vigenteDesde ?? estado.vigenteDesde;
    const { anterior, siguiente } = contiguas(vigencias, desde, vigencia?.id ?? null);
    return evaluarCombinacion(cuerpo, { vigenteDesde: desde, anterior, siguiente });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, vigencia, vigencias]);

  const bloqueos = Array.from(new Set([...evaluacion.bloqueos, ...bloqueosServidor]));
  const pideSoporteCambio = evaluacion.cambioPeriodicidad !== 'no_aplica' || !!estado.motivoCambioPeriodicidad;
  const faltaAceptar = advertenciasSinAceptar(evaluacion.advertencias, aceptadas ? evaluacion.advertencias : []).length > 0;

  const guardar = async () => {
    const v = validarSolicitudPerfil({ ...cuerpo, advertenciasAceptadas: aceptadas ? evaluacion.advertencias : [] });
    if (!v.ok) {
      setError(t(`errores.${v.error}`));
      return;
    }
    if (bloqueos.length > 0 || faltaAceptar) return;
    setGuardando(true);
    setError(null);
    try {
      await tributarioCliente.guardarPerfil(v.datos);
      onGuardado();
      onAbiertoChange(false);
    } catch (err) {
      const codigo = codigoDe(err);
      const detalle = (err as { detalle?: { bloqueos?: unknown } } | null)?.detalle;
      if (codigo === 'combinacion_contradictoria' && Array.isArray(detalle?.bloqueos)) setBloqueosServidor(detalle.bloqueos.map(String));
      setError(t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  const textoRegla = (grupo: 'bloqueos' | 'advertencias', codigo: string) => (t.has(`${grupo}.${codigo}`) ? t(`${grupo}.${codigo}`) : codigo);
  const casilla = (campo: 'granContribuyente' | 'autorretenedor' | 'autorretencionEspecial' | 'agenteRetencionIva' | 'agenteRetencion' | 'responsableInc') => (
    <label key={campo} htmlFor={`calidad-${campo}`} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm text-fg">
      <Checkbox id={`calidad-${campo}`} checked={estado[campo]} onCheckedChange={(v) => cambiar(campo, v === true)} className="mt-0.5" />
      <span>{t(`campos.${campo}`)}</span>
    </label>
  );

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={vigencia ? t('dialogo.tituloEditar') : t('dialogo.tituloNueva')}
      descripcion={vigencia ? t('dialogo.descripcionEditar') : t('dialogo.descripcionNueva')}
      ancho={880}
      primario={{
        etiqueta: t('dialogo.guardar'),
        onClick: () => void guardar(),
        cargando: guardando,
        deshabilitada: bloqueos.length > 0 || faltaAceptar,
        motivo: bloqueos.length > 0 ? t('dialogo.motivoBloqueo') : faltaAceptar ? t('dialogo.motivoAdvertencias') : undefined,
      }}
      textoCancelar={tc('cancelar')}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('campos.vigenteDesde')} obligatorio ayuda={vigencia ? t('campos.vigenteDesdeFija') : t('campos.vigenteDesdeAyuda')}>
            {(c) => <CampoFecha id={c.id} valor={estado.vigenteDesde} onValorChange={(d) => cambiar('vigenteDesde', d)} hoy={hoy} disabled={!!vigencia} />}
          </FormField>
          <FormField etiqueta={t('campos.periodicidadIva')} obligatorio ayuda={t('campos.periodicidadIvaAyuda')}>
            {(c) => (
              <SelectNativo
                id={c.id}
                valor={estado.periodicidadIva}
                onCambiar={(v) => cambiar('periodicidadIva', v as PeriodicidadIva)}
                opciones={PERIODICIDADES_IVA.map((p) => ({ valor: p, etiqueta: t(`periodicidadIva.${p}`) }))}
                aria-describedby={c['aria-describedby']}
              />
            )}
          </FormField>
          <FormField etiqueta={t('campos.regimenRenta')} obligatorio ayuda={t('campos.regimenRentaAyuda')}>
            {(c) => (
              <SelectNativo
                id={c.id}
                valor={estado.regimenRenta}
                vacio={t('campos.sinDefinir')}
                onCambiar={(v) => cambiar('regimenRenta', v as RegimenRenta | '')}
                opciones={REGIMENES_RENTA.map((r) => ({ valor: r, etiqueta: t(`regimenRenta.${r}`) }))}
                aria-describedby={c['aria-describedby']}
              />
            )}
          </FormField>
          <FormField etiqueta={t('campos.condicionIva')} obligatorio ayuda={t('campos.condicionIvaAyuda')}>
            {(c) => (
              <SelectNativo
                id={c.id}
                valor={estado.condicionIva}
                vacio={t('campos.sinDefinir')}
                onCambiar={(v) => cambiar('condicionIva', v as CondicionIva | '')}
                opciones={CONDICIONES_IVA.map((r) => ({ valor: r, etiqueta: t(`condicionIva.${r}`) }))}
                aria-describedby={c['aria-describedby']}
              />
            )}
          </FormField>
          {estado.regimenRenta === 'especial' && (
            <>
              <FormField etiqueta={t('campos.rteTipo')} obligatorio ayuda={t('campos.rteTipoAyuda')}>
                {(c) => (
                  <SelectNativo
                    id={c.id}
                    valor={estado.rteTipo}
                    vacio={t('campos.sinDefinir')}
                    onCambiar={(v) => cambiar('rteTipo', v as TipoRte | '')}
                    opciones={TIPOS_RTE.map((r) => ({ valor: r, etiqueta: t(`rteTipo.${r}`) }))}
                    aria-describedby={c['aria-describedby']}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('campos.rteIngresos')} ayuda={t('campos.rteIngresosAyuda')}>
                {(c) => (
                  <SelectNativo
                    id={c.id}
                    valor={estado.rteIngresos}
                    vacio={t('campos.sinDato')}
                    onCambiar={(v) => cambiar('rteIngresos', v as Estado['rteIngresos'])}
                    opciones={[
                      { valor: 'si', etiqueta: t('campos.si') },
                      { valor: 'no', etiqueta: t('campos.no') },
                    ]}
                    aria-describedby={c['aria-describedby']}
                  />
                )}
              </FormField>
            </>
          )}
          {estado.regimenRenta.startsWith('no_contribuyente') && (
            <div className="sm:col-span-2">
              <FormField etiqueta={t('campos.noContribuyenteNaturaleza')} obligatorio ayuda={t('campos.noContribuyenteNaturalezaAyuda')}>
                {(c) => (
                  <Input id={c.id} value={estado.noContribuyenteNaturaleza} onChange={(e) => cambiar('noContribuyenteNaturaleza', e.target.value)} maxLength={300} />
                )}
              </FormField>
            </div>
          )}
        </div>

        {pideSoporteCambio && (
          <fieldset className="space-y-3 rounded-lg border border-line-warning p-3">
            <legend className="px-1 text-sm font-medium text-fg">{t('campos.cambioTitulo')}</legend>
            <p className="text-xs text-fg-secondary">{t('campos.cambioAyuda')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField etiqueta={t('campos.motivoCambio')} obligatorio>
                {(c) => (
                  <SelectNativo
                    id={c.id}
                    valor={estado.motivoCambioPeriodicidad}
                    vacio={t('campos.sinMotivo')}
                    onCambiar={(v) => cambiar('motivoCambioPeriodicidad', v as MotivoCambioPeriodicidad | '')}
                    opciones={MOTIVOS_CAMBIO_PERIODICIDAD.map((m) => ({ valor: m, etiqueta: t(`motivo.${m}`) }))}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('campos.cambioFecha')} obligatorio ayuda={t('campos.cambioFechaAyuda')}>
                {(c) => <CampoFecha id={c.id} valor={estado.cambioPeriodicidadFecha} onValorChange={(d) => cambiar('cambioPeriodicidadFecha', d)} hoy={hoy} />}
              </FormField>
              <div className="sm:col-span-2">
                <FormField etiqueta={t('campos.cambioHecho')} obligatorio>
                  {(c) => <Textarea id={c.id} value={estado.cambioPeriodicidadHecho} onChange={(e) => cambiar('cambioPeriodicidadHecho', e.target.value)} rows={2} maxLength={1000} />}
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField etiqueta={t('campos.cambioNorma')} obligatorio>
                  {(c) => <Input id={c.id} value={estado.cambioPeriodicidadNorma} onChange={(e) => cambiar('cambioPeriodicidadNorma', e.target.value)} maxLength={300} />}
                </FormField>
              </div>
            </div>
            <StatusBadge
              estado={evaluacion.cambioPeriodicidad}
              etiqueta={t(`cambioEstado.${evaluacion.cambioPeriodicidad}`)}
              tono={evaluacion.cambioPeriodicidad === 'documentado' ? 'informacion' : 'advertencia'}
            />
          </fieldset>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-fg">{t('campos.calidades')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {casilla('granContribuyente')}
            {casilla('autorretenedor')}
            {casilla('autorretencionEspecial')}
            {casilla('agenteRetencionIva')}
            {casilla('agenteRetencion')}
            {casilla('responsableInc')}
          </div>
          {estado.granContribuyente && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField etiqueta={t('campos.granContribuyenteActo')} obligatorio ayuda={t('campos.actoAyuda')}>
                {(c) => <Input id={c.id} value={estado.granContribuyenteActo} onChange={(e) => cambiar('granContribuyenteActo', e.target.value)} maxLength={120} />}
              </FormField>
              <FormField etiqueta={t('campos.granContribuyenteActoFecha')} obligatorio>
                {(c) => <CampoFecha id={c.id} valor={estado.granContribuyenteActoFecha} onValorChange={(d) => cambiar('granContribuyenteActoFecha', d)} hoy={hoy} />}
              </FormField>
              <FormField etiqueta={t('campos.granContribuyenteCalificacion')} obligatorio ayuda={t('campos.granContribuyenteCalificacionAyuda')}>
                {(c) => (
                  <SelectNativo
                    id={c.id}
                    valor={estado.granContribuyenteCalificacion}
                    vacio={t('campos.sinDefinir')}
                    onCambiar={(v) => cambiar('granContribuyenteCalificacion', v as CalificacionGranContribuyente | '')}
                    opciones={CALIFICACIONES_GRAN_CONTRIBUYENTE.map((r) => ({ valor: r, etiqueta: t(`calificacionGranContribuyente.${r}`) }))}
                    aria-describedby={c['aria-describedby']}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('campos.granContribuyenteDesde')} obligatorio>
                {(c) => <CampoFecha id={c.id} valor={estado.granContribuyenteDesde} onValorChange={(d) => cambiar('granContribuyenteDesde', d)} hoy={hoy} />}
              </FormField>
            </div>
          )}
          {estado.autorretenedor && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField etiqueta={t('campos.autorretenedorActo')} obligatorio ayuda={t('campos.actoAyuda')}>
                {(c) => <Input id={c.id} value={estado.autorretenedorActo} onChange={(e) => cambiar('autorretenedorActo', e.target.value)} maxLength={120} />}
              </FormField>
              <FormField etiqueta={t('campos.autorretenedorActoFecha')} obligatorio>
                {(c) => <CampoFecha id={c.id} valor={estado.autorretenedorActoFecha} onValorChange={(d) => cambiar('autorretenedorActoFecha', d)} hoy={hoy} />}
              </FormField>
            </div>
          )}
          {estado.responsableInc && (
            <div className="max-w-sm">
              <FormField etiqueta={t('campos.incActividad')} obligatorio ayuda={t('campos.incActividadAyuda')}>
                {(c) => (
                  <SelectNativo
                    id={c.id}
                    valor={estado.incActividad}
                    vacio={t('campos.sinDefinir')}
                    onCambiar={(v) => cambiar('incActividad', v as ActividadInc | '')}
                    opciones={ACTIVIDADES_INC.map((a) => ({ valor: a, etiqueta: t(`incActividad.${a}`) }))}
                  />
                )}
              </FormField>
            </div>
          )}
        </fieldset>

        <ListaCodigos
          leyenda={t('campos.codigosFe')}
          ayuda={t('campos.codigosFeAyuda')}
          prefijo="fe"
          catalogo={catalogo}
          marcados={estado.responsabilidades}
          onCambiar={(codigo, marcada) => cambiar('responsabilidades', alternar(estado.responsabilidades, codigo, marcada))}
        />

        {catalogoRut.length > 0 && (
          <details className="rounded-lg border border-line p-3" open={estado.responsabilidadesRut.length > 0}>
            <summary className="cursor-pointer text-sm font-medium text-fg">{t('campos.codigosRut', { cuantos: estado.responsabilidadesRut.length })}</summary>
            <div className="mt-3">
              <ListaCodigos
                leyenda={t('campos.codigosRut', { cuantos: estado.responsabilidadesRut.length })}
                ayuda={t('campos.codigosRutAyuda')}
                prefijo="rut"
                catalogo={catalogoRut}
                marcados={estado.responsabilidadesRut}
                buscable
                onCambiar={(codigo, marcada) => cambiar('responsabilidadesRut', alternar(estado.responsabilidadesRut, codigo, marcada))}
              />
            </div>
          </details>
        )}

        <EditorIca ica={estado.ica} onCambiar={(ica) => cambiar('ica', ica)} />

        <FormField etiqueta={t('campos.notas')}>
          {(c) => <Textarea id={c.id} value={estado.notas} onChange={(e) => cambiar('notas', e.target.value)} rows={2} maxLength={1000} />}
        </FormField>

        {bloqueos.length > 0 && (
          <div role="alert" className="rounded-lg border border-line-danger bg-danger-subtle p-3 text-sm text-danger-text">
            <p className="font-medium">{t('dialogo.bloqueosTitulo')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {bloqueos.map((b) => (
                <li key={b}>{textoRegla('bloqueos', b)}</li>
              ))}
            </ul>
          </div>
        )}
        {evaluacion.advertencias.length > 0 && (
          <div className="rounded-lg border border-line-warning bg-warning-subtle p-3 text-sm text-warning-text">
            <p className="font-medium">{t('dialogo.advertenciasTitulo')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {evaluacion.advertencias.map((a) => (
                <li key={a}>{textoRegla('advertencias', a)}</li>
              ))}
            </ul>
            <label htmlFor="aceptar-advertencias" className="mt-2 flex items-start gap-2 text-fg">
              <Checkbox id="aceptar-advertencias" checked={aceptadas} onCheckedChange={(v) => setAceptadas(v === true)} className="mt-0.5" />
              <span>{t('dialogo.aceptarAdvertencias')}</span>
            </label>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

/** Casillas de un catálogo de códigos con su estado de validación (FE o RUT). */
function ListaCodigos({
  leyenda,
  ayuda,
  prefijo,
  catalogo,
  marcados,
  onCambiar,
  buscable = false,
}: {
  leyenda: string;
  ayuda: string;
  prefijo: string;
  catalogo: CodigoCatalogoCliente[];
  marcados: string[];
  onCambiar: (codigo: string, marcada: boolean) => void;
  buscable?: boolean;
}) {
  const t = useTranslations('finanzasTributarioR4.perfil');
  const [q, setQ] = useState('');
  const visibles = useMemo(() => {
    const termino = q.trim().toLowerCase();
    return termino ? catalogo.filter((c) => c.codigo.includes(termino) || c.descripcion.toLowerCase().includes(termino)) : catalogo;
  }, [catalogo, q]);
  return (
    <fieldset className="space-y-2">
      <legend className={buscable ? 'sr-only' : 'text-sm font-medium text-fg'}>{leyenda}</legend>
      <p className="text-xs text-fg-secondary">{ayuda}</p>
      {buscable && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('campos.buscarCodigo')} aria-label={t('campos.buscarCodigo')} autoComplete="off" />}
      <div className={buscable ? 'grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2' : 'grid gap-2 sm:grid-cols-2'}>
        {visibles.map((r) => {
          const id = `${prefijo}-${r.codigo}`;
          return (
            <label key={r.codigo} htmlFor={id} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm text-fg">
              <Checkbox id={id} checked={marcados.includes(r.codigo)} onCheckedChange={(v) => onCambiar(r.codigo, v === true)} className="mt-0.5" />
              <span className="min-w-0">
                <span className="font-medium">{r.codigo}</span> · {r.descripcion}
                {r.estado !== 'validado' && r.estado !== 'sin_dato' && (
                  <span className="mt-1 block">
                    <StatusBadge estado={r.estado} etiqueta={t(`validacion.${r.estado}`)} tono={r.estado === 'no_pertenece_tabla_fe' ? 'advertencia' : r.estado === 'cotejado_fuente_oficial' ? 'informacion' : 'neutro'} />
                  </span>
                )}
                {!r.vigente && r.estado !== 'no_pertenece_tabla_fe' && <span className="block text-xs text-fg-secondary">{t('validacion.noVigente')}</span>}
                {r.nota && <span className="block text-xs text-fg-secondary">{r.nota}</span>}
                {r.fuente && buscable && <span className="block text-xs text-fg-muted">{r.fuente}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function EditorIca({ ica, onCambiar }: { ica: IcaMunicipio[]; onCambiar: (ica: IcaMunicipio[]) => void }) {
  const t = useTranslations('finanzasTributarioR4.perfil');
  const [q, setQ] = useState('');
  const [opciones, setOpciones] = useState<MunicipioOpcion[]>([]);
  const [buscando, setBuscando] = useState(false);
  const control = useRef<AbortController | null>(null);

  useEffect(() => {
    control.current?.abort();
    if (q.trim().length < 2) {
      setOpciones([]);
      return;
    }
    const c = new AbortController();
    control.current = c;
    setBuscando(true);
    const temporizador = setTimeout(() => {
      tributarioCliente
        .municipios(q, c.signal)
        .then((r) => setOpciones(r.municipios))
        .catch(() => {
          if (!c.signal.aborted) setOpciones([]);
        })
        .finally(() => {
          if (!c.signal.aborted) setBuscando(false);
        });
    }, 250);
    return () => {
      clearTimeout(temporizador);
      c.abort();
    };
  }, [q]);

  const agregar = (m: MunicipioOpcion) => {
    if (ica.some((i) => i.municipioId === m.id)) return;
    onCambiar([...ica, { municipioId: m.id, municipio: m.nombre, departamento: m.departamento, periodicidad: 'bimestral', tarifaPorMil: null, actividad: null }]);
    setQ('');
    setOpciones([]);
  };
  const cambiarFila = (i: number, cambio: Partial<IcaMunicipio>) => onCambiar(ica.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-fg">{t('campos.ica')}</legend>
      <p className="text-xs text-fg-secondary">{t('campos.icaAyuda')}</p>
      {ica.length > 0 && (
        <ul className="space-y-2">
          {ica.map((f, i) => (
            <li key={f.municipioId} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end">
              <div className="text-sm text-fg">
                <span className="font-medium">{f.municipio ?? f.municipioId}</span>
                {f.departamento && <span className="block text-xs text-fg-secondary">{f.departamento}</span>}
              </div>
              <FormField etiqueta={t('campos.icaPeriodicidad')}>
                {(c) => (
                  <SelectNativo
                    id={c.id}
                    valor={f.periodicidad}
                    onCambiar={(v) => cambiarFila(i, { periodicidad: v as PeriodicidadIca })}
                    opciones={PERIODICIDADES_ICA.map((p) => ({ valor: p, etiqueta: t(`periodicidadIca.${p}`) }))}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('campos.icaTarifa')}>
                {(c) => (
                  <Input
                    id={c.id}
                    inputMode="decimal"
                    value={f.tarifaPorMil ?? ''}
                    onChange={(e) => {
                      const texto = e.target.value.replace(',', '.');
                      const n = texto.trim() === '' ? null : Number(texto);
                      cambiarFila(i, { tarifaPorMil: n === null || Number.isFinite(n) ? n : f.tarifaPorMil });
                    }}
                  />
                )}
              </FormField>
              <button
                type="button"
                className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                onClick={() => onCambiar(ica.filter((_, j) => j !== i))}
                aria-label={t('campos.icaQuitar', { municipio: f.municipio ?? '' })}
              >
                <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <FormField etiqueta={t('campos.icaAgregar')} ayuda={buscando ? t('campos.icaBuscando') : undefined}>
        {(c) => <Input id={c.id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('campos.icaBuscar')} autoComplete="off" />}
      </FormField>
      {opciones.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-line" aria-label={t('campos.icaResultados')}>
          {opciones.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-subtle disabled:opacity-60"
                onClick={() => agregar(m)}
                disabled={ica.some((i) => i.municipioId === m.id)}
              >
                <Plus aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
                <span>
                  {m.nombre}
                  {m.departamento && <span className="text-fg-secondary"> · {m.departamento}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
