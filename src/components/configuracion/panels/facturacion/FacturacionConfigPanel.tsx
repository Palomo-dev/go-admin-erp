'use client';

/**
 * Configuración › Facturación electrónica › Resumen: «Resoluciones y
 * numeración» (Figma `52-documentos-resoluciones-listo.png`; diseño
 * docs/design/FINANZAS-DOCUMENTOS-V2.md §7.6). Mismo lugar de siempre
 * (`/app/finanzas/configuracion/secuencias` redirige aquí), sin página nueva.
 *
 * Antes: tarjetas `ui/card` que repetían el estado del servicio y la
 * preferencia «facturar siempre electrónica» (que viven en la sección
 * Servicio) y escribían `invoice_sequences` desde el navegador, moviendo el
 * rango a la sucursal guardada en `localStorage` al editar. Ahora:
 *   - una línea con el estado del servicio y el enlace a Servicio;
 *   - la tabla de rangos con consumo, vigencia, estado y avisos por
 *     `alert_threshold` y por vencimiento (30, 15 y 7 días);
 *   - «Sincronizar con el proveedor» por sucursal (`POST /api/factus/config`,
 *     como antes) y «Editar» (`POST /api/factus/rangos`), ambos para
 *     administrador o `finance.approve`.
 * Crear rangos a mano no se ofrece (no lo ofrecía la pantalla vieja): los
 * registra GO Admin ante el proveedor y llegan con «Sincronizar».
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, BarChart3, Hash, Loader2, Pencil, RefreshCw } from 'lucide-react';
import { DataTable, ListCard, SearchInput, SegmentedControl, StatusBadge, clasesBoton, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { BarraProgreso } from '@/components/kit/BarraProgreso';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { rutaSeccion } from '@/components/configuracion/config/configSectionsRegistry';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { ErrorPeticion, pedirJson } from '@/components/finanzas/facturacion-electronica/bandeja/bandejaCliente';
import {
  TONO_RANGO,
  avisosRangos,
  leerRango,
  ordenarRangos,
  requiereResolucion,
  type RangoNumeracion,
} from '@/lib/finanzas/facturacionElectronica/resolucionesLogica';
import { RangoEditDialog, type RangoEditable } from './RangoEditDialog';

type Rango = RangoEditable & { branch: { name: string } | { name: string }[] | null };

function nombreSucursal(r: Rango): string | null {
  const b = Array.isArray(r.branch) ? r.branch[0] : r.branch;
  return b?.name ?? null;
}

export function FacturacionConfigPanel() {
  const t = useTranslations('finanzasDocumentosR3.resoluciones');
  const entero = useFormatoEntero();
  const { branches } = useBranch();
  const { getToday } = useFormatDate();
  const hoy = getToday();

  const [rangos, setRangos] = useState<Rango[]>([]);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [servicio, setServicio] = useState<'active' | 'pending_activation' | 'suspended' | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'sinPermiso'>('cargando');
  const [busqueda, setBusqueda] = useState('');
  const [alcance, setAlcance] = useState<'activas' | 'todas'>('activas');
  const [sucursal, setSucursal] = useState('');
  const [sincronizando, setSincronizando] = useState(false);
  const [editando, setEditando] = useState<Rango | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        pedirJson<{ rangos: Rango[]; puedeEditar: boolean }>('/api/factus/rangos'),
        pedirJson<{ service: { status: 'active' | 'pending_activation' | 'suspended' } }>('/api/factus/config').catch(() => null),
      ]);
      setRangos(r.rangos ?? []);
      setPuedeEditar(!!r.puedeEditar);
      setServicio(c?.service.status ?? null);
      setEstado('listo');
    } catch (e) {
      setEstado(e instanceof ErrorPeticion && (e.status === 401 || e.status === 403) ? 'sinPermiso' : 'error');
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const sincronizar = async () => {
    if (!sucursal) return;
    setSincronizando(true);
    try {
      const r = await pedirJson<{ importados?: number; desactivados?: number }>('/api/factus/config', {
        method: 'POST',
        body: JSON.stringify({ action: 'sincronizar_rangos', branchId: Number(sucursal) }),
      });
      toastSuccess(t('sincronizadas'), t('resumenSincronizacion', { importados: Number(r.importados ?? 0), desactivados: Number(r.desactivados ?? 0) }));
      await cargar();
    } catch (e) {
      toastError(e instanceof ErrorPeticion && e.status === 403 ? t('errores.sinPermiso') : t('errores.sincronizar'), e instanceof ErrorPeticion && e.status !== 403 ? e.message : undefined);
    } finally {
      setSincronizando(false);
    }
  };

  const guardar = async (cuerpo: Record<string, unknown>): Promise<string | null> => {
    try {
      await pedirJson('/api/factus/rangos', { method: 'POST', body: JSON.stringify(cuerpo) });
      toastSuccess(t('editar.guardado'));
      setEditando(null);
      await cargar();
      return null;
    } catch (e) {
      if (e instanceof ErrorPeticion) {
        if (e.status === 403) return t('errores.sinPermiso');
        if (e.codigo === 'duplicado') return t('errores.duplicado');
        if (e.codigo === 'datos_invalidos') return t('errores.datosInvalidos');
      }
      return t('errores.guardar');
    }
  };

  const ordenados = useMemo(() => ordenarRangos(rangos), [rangos]);
  const avisos = useMemo(() => avisosRangos(rangos, hoy), [rangos, hoy]);
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return ordenados.filter(
      (r) =>
        (alcance === 'todas' || r.is_active) &&
        (!q || (r.prefix ?? '').toLowerCase().includes(q) || (r.resolution_number ?? '').toLowerCase().includes(q)),
    );
  }, [ordenados, alcance, busqueda]);

  const textoVigencia = (r: RangoNumeracion) => {
    const l = leerRango(r, hoy);
    if (!r.valid_until) return <span className="text-fg-secondary">{t('sinVencimiento')}</span>;
    if (l.estado === 'vencida') return <span className="text-danger-text">{t('vencio', { fecha: formatPlainDate(r.valid_until) })}</span>;
    return (
      <span className={l.umbralVencimiento ? 'text-warning-text' : 'text-fg'}>
        {l.umbralVencimiento ? t('venceEn', { dias: entero(l.diasParaVencer ?? 0), count: l.diasParaVencer ?? 0 }) : t('hasta', { fecha: formatPlainDate(r.valid_until) })}
      </span>
    );
  };

  const consumo = (r: RangoNumeracion) => {
    const l = leerRango(r, hoy);
    const tono = TONO_RANGO[l.estado];
    return (
      <div className="flex min-w-[180px] flex-col gap-1">
        <span className="text-xs tabular-nums text-fg-secondary">
          {l.consumo.total === 0
            ? '—'
            : l.consumo.quedan === 0
              ? t('consumoAgotado', { usados: entero(l.consumo.usados), total: entero(l.consumo.total) })
              : t('consumoQuedan', { usados: entero(l.consumo.usados), total: entero(l.consumo.total), quedan: entero(l.consumo.quedan) })}
        </span>
        <BarraProgreso
          valor={l.consumo.usados}
          max={Math.max(1, l.consumo.total)}
          etiqueta={t('consumoDe', { prefijo: r.prefix ?? '' })}
          tono={tono === 'peligro' ? 'peligro' : tono === 'advertencia' ? 'advertencia' : 'marca'}
          tamano="sm"
        />
      </div>
    );
  };

  const badge = (r: RangoNumeracion) => {
    const e = leerRango(r, hoy).estado;
    return <StatusBadge estado={e} tono={TONO_RANGO[e]} etiqueta={t(`estados.${e}`)} />;
  };

  const resolucion = (r: Rango) =>
    requiereResolucion(r.document_type) || r.resolution_number ? (
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-fg">{r.resolution_number || t('sinResolucionRegistrada')}</span>
        {r.resolution_date && <span className="text-xs text-fg-muted">{t('del', { fecha: formatPlainDate(r.resolution_date) })}</span>}
      </div>
    ) : (
      <div className="flex min-w-0 flex-col">
        <span className="text-fg">{t('noRequiere')}</span>
        <span className="text-xs text-fg-muted">{t('numeracionPropia')}</span>
      </div>
    );

  const accionesDe = (r: Rango): AccionFila[] => [
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => setEditando(r), oculta: !puedeEditar },
  ];

  const columnas: ColumnaTabla<Rango>[] = [
    {
      id: 'tipo',
      encabezado: t('columnas.tipo'),
      celda: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{t(`tipos.${r.document_type}`)}</span>
          <span className="truncate text-xs text-fg-muted">{nombreSucursal(r) ?? t('todasSucursales')}</span>
        </div>
      ),
    },
    { id: 'prefijo', encabezado: t('columnas.prefijo'), variante: 'mono', celda: (r) => r.prefix ?? '—' },
    { id: 'resolucion', encabezado: t('columnas.resolucion'), ocultarDebajo: 'md', celda: resolucion },
    {
      id: 'rango',
      encabezado: t('columnas.rango'),
      ocultarDebajo: 'lg',
      celda: (r) => <span className="whitespace-nowrap tabular-nums">{r.range_end ? `${entero(r.range_start ?? 0)} – ${entero(r.range_end)}` : '—'}</span>,
    },
    { id: 'consumo', encabezado: t('columnas.consumo'), celda: consumo },
    { id: 'vigencia', encabezado: t('columnas.vigencia'), ocultarDebajo: 'md', celda: textoVigencia },
    { id: 'estado', encabezado: t('columnas.estado'), alinear: 'centro', celda: badge },
  ];

  const aviso = avisos[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand" aria-hidden="true">
            <Hash className="size-5" strokeWidth={1.5} />
          </span>
          <div className="flex flex-col">
            <h2 className="text-base font-semibold text-fg">{t('titulo')}</h2>
            <p className="text-sm text-fg-secondary">{t('descripcion')}</p>
          </div>
        </div>
        {puedeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sucursal} onValueChange={setSucursal}>
              <SelectTrigger className="h-10 w-48" aria-label={t('sucursal')}>
                <SelectValue placeholder={t('sucursal')} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario' })}
              onClick={() => void sincronizar()}
              disabled={!sucursal || sincronizando}
              title={!sucursal ? t('motivos.eligeSucursal') : undefined}
            >
              {sincronizando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />}
              {t('sincronizar')}
            </button>
          </div>
        )}
      </div>

      {servicio && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-fg">
            {t('servicio.linea')}
            <StatusBadge
              estado={servicio}
              tono={servicio === 'active' ? 'exito' : servicio === 'suspended' ? 'peligro' : 'advertencia'}
              etiqueta={t(`servicio.estados.${servicio}`)}
            />
          </span>
          <Link href={rutaSeccion('facturacion.servicio')} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
            {t('servicio.ver')}
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </Link>
        </div>
      )}

      {aviso && (
        <AvisoTonal
          tono={aviso.tipo === 'agotada' || aviso.tipo === 'vencida' ? 'peligro' : 'advertencia'}
          titulo={t(`avisos.${aviso.tipo}.titulo`, { tipo: t(`tipos.${aviso.documentType}`), prefijo: aviso.prefijo, dias: entero(Math.abs(aviso.dias ?? 0)), count: Math.abs(aviso.dias ?? 0) })}
          descripcion={[
            t(`avisos.${aviso.tipo}.descripcion`, { quedan: entero(aviso.quedan), count: aviso.quedan }),
            avisos.length > 1 ? t('avisos.otros', { n: entero(avisos.length - 1), count: avisos.length - 1 }) : null,
          ]
            .filter(Boolean)
            .join(' ')}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />
        </div>
        <SegmentedControl
          etiqueta={t('alcance.etiqueta')}
          valor={alcance}
          onValorChange={(v) => setAlcance(v as 'activas' | 'todas')}
          opciones={[
            { valor: 'activas', etiqueta: t('alcance.activas') },
            { valor: 'todas', etiqueta: t('alcance.todas') },
          ]}
        />
      </div>

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(r) => String(r.id)}
        estado={estado === 'cargando' ? 'cargando' : estado === 'sinPermiso' ? 'sinPermiso' : estado === 'error' ? 'error' : visibles.length === 0 ? (busqueda || (alcance === 'activas' && rangos.length > 0) ? 'sinResultados' : 'vacio') : 'listo'}
        acciones={puedeEditar ? accionesDe : undefined}
        onFilaClick={puedeEditar ? (r) => setEditando(r) : undefined}
        etiquetaFila={(r) => `${r.prefix ?? ''} · ${t(`tipos.${r.document_type}`)}`}
        tarjetaMovil={(r) => (
          <ListCard
            icono={Hash}
            titulo={`${r.prefix ?? '—'} · ${t(`tipos.${r.document_type}`)}`}
            subtitulo={nombreSucursal(r) ?? t('todasSucursales')}
            meta={textoVigencia(r)}
            datos={[{ icono: BarChart3, etiqueta: t('columnas.consumo'), texto: consumo(r) }]}
            estado={badge(r)}
            acciones={puedeEditar ? accionesDe(r) : undefined}
            onClick={puedeEditar ? () => setEditando(r) : undefined}
          />
        )}
        vacio={{ icono: Hash, titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('errores.carga') }}
        sinPermiso={{ titulo: t('errores.sinPermiso') }}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={() => {
          setBusqueda('');
          setAlcance('todas');
        }}
        termino={busqueda}
      />

      <p className="text-xs text-fg-muted">{t('nota')}</p>

      {editando && (
        <RangoEditDialog
          rango={editando}
          sucursales={branches.filter((b): b is typeof b & { id: number } => typeof b.id === 'number').map((b) => ({ id: b.id, name: b.name }))}
          onCerrar={() => setEditando(null)}
          onGuardar={guardar}
        />
      )}
    </div>
  );
}
