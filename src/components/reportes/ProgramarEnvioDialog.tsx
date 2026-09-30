'use client';

import { useEffect, useMemo, useState } from 'react';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { ChipsOpcion, Dialogo, SelectorFranja, clasesBoton } from '@/components/kit';
import { toastSuccess } from '@/components/ui/use-toast';
import { clienteReportes } from '@/lib/services/reportes/clienteReportes';
import type { CuerpoProgramado } from '@/lib/services/reportes/contrato';
import { getReporteById } from '@/lib/services/reportes/reportesCatalogo';
import {
  FORMATOS_ENVIO,
  FRECUENCIAS,
  PERIODOS_ENVIO,
  PERIODO_POR_FRECUENCIA,
  esCorreo,
  programacionValida,
  type Frecuencia,
  type FormatoEnvio,
  type PeriodoEnvio,
} from '@/lib/services/reportes/programados/programacion';
import type { DestinatarioDisponible } from '@/lib/services/reportes/programados/destinatarios.server';
import type { Comparacion } from '@/lib/services/reportes/filtrosUrl';
import type { PedidoEnvioUi } from './accionesReportes';
import { clasesSelect } from './BarraFiltros';
import type { ContextoReportes } from './useContextoReportes';
import { useMensajeError } from './useMensajeError';

const HORAS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export function ProgramarEnvioDialog({
  pedido,
  onCerrar,
  ctx,
  onListo,
}: {
  pedido: PedidoEnvioUi | null;
  onCerrar: () => void;
  ctx: ContextoReportes;
  onListo: () => void;
}) {
  const t = useTranslations('reportes.envioDlg');
  const tTipos = useTranslations('reportes.tipos');
  const tFrec = useTranslations('reportes.programados.frecuencia');
  const tFormato = useTranslations('reportes.programados.formato');
  const tFiltros = useTranslations('reportes.filtros');
  const tProg = useTranslations('reportes.programados');
  const tErr = useTranslations('reportes.errores');
  const mensaje = useMensajeError();
  const editando = pedido?.editar ?? null;
  const reportes = useMemo(() => ctx.grupos.flatMap((g) => g.reportes), [ctx.grupos]);

  const [nombre, setNombre] = useState('');
  const [reportId, setReportId] = useState('');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('weekly');
  const [hora, setHora] = useState('07:00');
  const [dia, setDia] = useState(1);
  const [diasSemana, setDiasSemana] = useState<number[]>([1]);
  const [periodo, setPeriodo] = useState<PeriodoEnvio>('semanal');
  const [franja, setFranja] = useState<{ desde: string; hasta: string } | null>(null);
  const [sucursalId, setSucursalId] = useState<number | null>(null);
  const [comparar, setComparar] = useState<Comparacion | ''>('');
  const [formato, setFormato] = useState<FormatoEnvio>('pdf');
  const [miembros, setMiembros] = useState<string[]>([]);
  const [externos, setExternos] = useState<string[]>([]);
  const [correo, setCorreo] = useState('');
  const [gente, setGente] = useState<DestinatarioDisponible[]>([]);
  const [ocupado, setOcupado] = useState<'guardar' | 'prueba' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pedido) return;
    const e = pedido.editar;
    const id = e?.reportId ?? pedido.reportId ?? reportes[0]?.id ?? '';
    const def = getReporteById(id);
    setReportId(id);
    setNombre(e?.nombre ?? def?.titulo ?? '');
    setFrecuencia(e?.frecuencia ?? 'weekly');
    setHora((e?.hora ?? '07:00').slice(0, 5));
    setDia(e?.dia ?? 1);
    setDiasSemana(e?.diasSemana ?? [1]);
    setPeriodo(e?.filtros.periodo ?? 'semanal');
    setFranja(e?.filtros.horaInicio && e.filtros.horaFin ? { desde: e.filtros.horaInicio, hasta: e.filtros.horaFin } : null);
    setSucursalId(e ? e.sucursalId : ctx.accesoTotal ? null : ctx.sucursalEncabezado);
    setComparar(e?.filtros.comparar ?? '');
    setFormato(e?.formato ?? 'pdf');
    setMiembros(e?.destinatarios.filter((d) => d.tipo === 'miembro').map((d) => d.user_id) ?? []);
    setExternos(e?.destinatarios.filter((d) => d.tipo === 'externo').map((d) => d.email) ?? []);
    setError(null);
    let vivo = true;
    void clienteReportes.destinatarios().then((lista) => vivo && setGente(lista)).catch(() => vivo && setGente([]));
    return () => {
      vivo = false;
    };
  }, [pedido, reportes, ctx.accesoTotal, ctx.sucursalEncabezado]);

  const def = getReporteById(reportId);
  const admiteFranja = !!def?.filtros.includes('franja');
  const admiteComparar = !!def?.filtros.includes('comparativo');

  const cambiarFrecuencia = (f: Frecuencia) => {
    setFrecuencia(f);
    setPeriodo(PERIODO_POR_FRECUENCIA[f]);
  };

  const agregarCorreo = () => {
    const limpio = correo.trim().toLowerCase();
    if (!esCorreo(limpio)) {
      setError(t('correoInvalido'));
      return;
    }
    setExternos((prev) => (prev.includes(limpio) ? prev : [...prev, limpio]));
    setCorreo('');
    setError(null);
  };

  const cuerpo = (): CuerpoProgramado | null => {
    const datos = {
      nombre: nombre.trim(),
      reportId,
      frecuencia,
      hora,
      dia: frecuencia === 'weekly' || frecuencia === 'monthly' || frecuencia === 'quarterly' ? dia : null,
      diasSemana: frecuencia === 'custom' ? diasSemana : null,
      periodo,
      horaInicio: admiteFranja ? (franja?.desde ?? null) : null,
      horaFin: admiteFranja ? (franja?.hasta ?? null) : null,
      comparar: admiteComparar && comparar ? comparar : null,
      sucursalId: def?.alcance === 'organizacion' ? null : sucursalId,
      formato,
      miembros,
      externos,
    };
    if (!datos.nombre || !datos.reportId) return null;
    if (!programacionValida({ frequency: frecuencia, hora, dia: datos.dia, dias_semana: datos.diasSemana })) return null;
    if (miembros.length + externos.length === 0) return null;
    return datos;
  };

  const guardar = async () => {
    const datos = cuerpo();
    if (!datos) {
      const diaMal = !programacionValida({ frequency: frecuencia, hora, dia: frecuencia === 'custom' ? null : dia, dias_semana: frecuencia === 'custom' ? diasSemana : null });
      setError(miembros.length + externos.length === 0 ? tErr('destinatarios') : diaMal ? tErr('dia_invalido') : tErr('datos_invalidos'));
      return;
    }
    setOcupado('guardar');
    setError(null);
    try {
      if (editando) await clienteReportes.editarProgramado(editando.id, datos);
      else await clienteReportes.crearProgramado(datos);
      toastSuccess(editando ? t('guardado') : t('listo'));
      onListo();
      onCerrar();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setOcupado(null);
    }
  };

  const probar = async () => {
    if (!editando) return;
    setOcupado('prueba');
    setError(null);
    try {
      const r = await clienteReportes.probarProgramado(editando.id);
      toastSuccess(tProg('pruebaEnviada', { para: r.para }));
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setOcupado(null);
    }
  };

  const alcanceDe = (d: DestinatarioDisponible) => (d.accesoTotal ? tFiltros('todasLasSucursales') : d.sucursales.map((s) => s.nombre).join(', ') || t('sinAcceso'));

  return (
    <Dialogo
      abierto={pedido !== null}
      onAbiertoChange={(abierto) => !abierto && ocupado === null && onCerrar()}
      icono={Mail}
      titulo={editando ? t('tituloEditar') : t('titulo')}
      descripcion={t('descripcion')}
      ancho={672}
      secundarios={editando ? [{ etiqueta: t('prueba'), onClick: () => void probar(), cargando: ocupado === 'prueba', deshabilitada: ocupado !== null }] : []}
      primario={{ etiqueta: editando ? t('guardar') : t('programar'), onClick: () => void guardar(), cargando: ocupado === 'guardar', deshabilitada: ocupado !== null }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary sm:col-span-2">
          {t('nombre')}
          <input className={clasesSelect} value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
          {t('reporte')}
          <select className={clasesSelect} value={reportId} onChange={(e) => setReportId(e.target.value)}>
            {reportes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.titulo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
          {t('hora')}
          <select className={clasesSelect} value={hora} onChange={(e) => setHora(e.target.value)}>
            {HORAS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs font-semibold text-fg-secondary">{t('frecuencia')}</p>
      <ChipsOpcion opciones={FRECUENCIAS.map((f) => ({ valor: f, etiqueta: tFrec(f) }))} valor={frecuencia} onValorChange={cambiarFrecuencia} />
      {(frecuencia === 'weekly' || frecuencia === 'monthly' || frecuencia === 'quarterly') && (
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
          {frecuencia === 'weekly' ? t('dias') : t('dia')}
          <select className={clasesSelect} value={dia} onChange={(e) => setDia(Number(e.target.value))}>
            {Array.from({ length: frecuencia === 'weekly' ? 7 : 28 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {frecuencia === 'weekly' ? t(`diasSemana.${n}`) : n}
              </option>
            ))}
          </select>
        </label>
      )}
      {frecuencia === 'custom' && (
        <ChipsOpcion<string>
          multiple
          etiqueta={t('dias')}
          opciones={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ valor: String(n), etiqueta: t(`diasSemana.${n}`) }))}
          valor={diasSemana.map(String)}
          onValorChange={(v) => setDiasSemana(v.map(Number))}
        />
      )}
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
        {t('periodo')}
        <select className={clasesSelect} value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoEnvio)}>
          {PERIODOS_ENVIO.map((p) => (
            <option key={p} value={p}>
              {tTipos(p)}
            </option>
          ))}
        </select>
      </label>
      <SelectorFranja valor={admiteFranja ? franja : null} deshabilitado={!admiteFranja} motivo={tFiltros('franjaNoAplicaMotivo')} onValorChange={setFranja} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
          {t('sucursal')}
          <select className={clasesSelect} disabled={def?.alcance === 'organizacion' || ctx.sucursalFija} value={sucursalId ?? 'todas'} onChange={(e) => setSucursalId(e.target.value === 'todas' ? null : Number(e.target.value))}>
            {ctx.accesoTotal && <option value="todas">{tFiltros('todasLasSucursales')}</option>}
            {ctx.sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
          {t('comparar')}
          <select className={clasesSelect} disabled={!admiteComparar} value={admiteComparar ? comparar : ''} onChange={(e) => setComparar(e.target.value as Comparacion | '')}>
            <option value="">{admiteComparar ? tFiltros('sinComparar') : tFiltros('compararNoAplica')}</option>
            <option value="anterior">{tFiltros('compararCon', { periodo: tTipos('mensual') })}</option>
            <option value="anio-anterior">{tFiltros('compararCon', { periodo: tTipos('anual') })}</option>
          </select>
        </label>
      </div>
      <p className="text-xs font-semibold text-fg-secondary">{t('formato')}</p>
      <ChipsOpcion opciones={FORMATOS_ENVIO.map((f) => ({ valor: f, etiqueta: tFormato(f) }))} valor={formato} onValorChange={setFormato} />
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold text-fg-secondary">{t('destinatarios')}</p>
        <p className="text-xs text-fg-muted">{miembros.length + externos.length}</p>
      </div>
      <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {gente.map((d) => (
          <li key={d.userId} className="flex items-center gap-2 py-1">
            <Checkbox checked={miembros.includes(d.userId)} disabled={!d.puedeRecibir} onCheckedChange={(v) => setMiembros((prev) => (v === true ? [...prev, d.userId] : prev.filter((id) => id !== d.userId)))} aria-label={d.nombre ?? d.email ?? d.userId} />
            <span className="min-w-0 flex-1 truncate text-sm text-fg">
              {d.nombre} <span className="text-fg-secondary">· {d.rol}</span>
            </span>
            <span className="shrink-0 text-xs text-fg-secondary">{d.puedeRecibir ? alcanceDe(d) : t('sinAcceso')}</span>
          </li>
        ))}
        {externos.map((correoExterno) => (
          <li key={correoExterno} className="flex items-center gap-2 py-1">
            <Checkbox checked onCheckedChange={() => setExternos((prev) => prev.filter((c) => c !== correoExterno))} aria-label={correoExterno} />
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{correoExterno}</span>
            <span className="text-xs text-warning-text">{t('requiere')}</span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className={clasesSelect + ' flex-1'} type="email" placeholder={t('externo')} value={correo} onChange={(e) => setCorreo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarCorreo())} />
        <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={agregarCorreo}>
          {t('agregar')}
        </button>
      </div>
      <div className="rounded-lg bg-info-subtle px-3 py-2">
        <p className="text-sm font-semibold text-info-text">{t('avisoTitulo')}</p>
        <p className="text-xs text-fg-secondary">{t('aviso')}</p>
      </div>
      {error && <p className="text-sm text-danger-text">{error}</p>}
    </Dialogo>
  );
}
