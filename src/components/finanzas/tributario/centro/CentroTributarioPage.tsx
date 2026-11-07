'use client';

/**
 * Centro tributario (Figma «07 Finanzas» 2335:136794, captura
 * `docs/design/figma/88-tributario-centro.png`): las obligaciones del último
 * periodo cerrado al mes de corte, derivadas del perfil vigente, con su
 * vencimiento del calendario oficial (cargado, nunca adivinado), el valor
 * estimado cuando sale de los libros y adónde ir: el borrador (Finanzas) o el
 * reporte (Reportes).
 *
 * Página de trabajo: decide qué hay que preparar y lleva a cada borrador. Los
 * informes (retenciones practicadas, impuestos) siguen en Reportes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Download, Settings2 } from 'lucide-react';
import { AvisoTonal, DataTable, FormField, StatusBadge, clasesBoton, useOpcionUrl, type ColumnaTabla, type TonoBadge } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { etiquetaPeriodo, mesAnterior } from '@/lib/finanzas/tributario/periodos';
import { SelectNativo } from '@/components/finanzas/tesoreria/compartido/TesoreriaComun';
import { tributarioCliente, RUTAS_TRIBUTARIO, type CentroCliente } from '../tributarioCliente';
import { AvisoBorradores, AvisoPendienteActivar, CabeceraTributario, ErrorLectura, codigoDe, type Lectura } from '../piezas';

type Fila = CentroCliente['filas'][number];

/** Los 12 meses de corte que se ofrecen: del mes anterior hacia atrás. */
function mesesDeCorte(hoy: string): string[] {
  const out: string[] = [];
  let m = mesAnterior(hoy);
  for (let i = 0; i < 12; i++) {
    out.push(m);
    m = mesAnterior(`${m}-01`);
  }
  return out;
}

export function CentroTributarioPage() {
  const t = useTranslations('finanzasTributarioR4.centro');
  const tc = useTranslations('finanzasTributarioR4.comun');
  const locale = useLocale();
  const { formatear } = useMonedaOrganizacion();
  const { formatPlain, getToday } = useFormatDate();
  const hoy = getToday();
  const opcionesCorte = useMemo(() => mesesDeCorte(hoy), [hoy]);
  const [corte, setCorte] = useOpcionUrl<string>('corte', opcionesCorte, opcionesCorte[0]);
  const [lectura, setLectura] = useState<Lectura<CentroCliente>>({ estado: 'cargando' });

  const cargar = useCallback(async () => {
    setLectura({ estado: 'cargando' });
    try {
      setLectura({ estado: 'listo', datos: await tributarioCliente.centro(corte) });
    } catch (err) {
      setLectura({ estado: 'error', codigo: codigoDe(err) });
    }
  }, [corte]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const datos = lectura.estado === 'listo' ? lectura.datos : null;

  const nombre = (f: Fila) => {
    const base = t(`obligaciones.${f.obligacion.clave}`);
    const conMunicipio = f.obligacion.clave === 'ica' && f.obligacion.municipio ? `${base} · ${f.obligacion.municipio}` : base;
    return f.obligacion.formulario ? `${conMunicipio} · ${f.obligacion.formulario}` : conMunicipio;
  };

  const estadoFila = (f: Fila): { etiqueta: string; tono: TonoBadge } => {
    const v = f.valor;
    if (v.estado === 'pendiente_activar') return { etiqueta: tc('estados.pendienteActivar'), tono: 'neutro' };
    if (v.estado === 'error') return { etiqueta: tc('estados.error'), tono: 'peligro' };
    if (v.estado === 'no_calculable') return { etiqueta: tc('estados.porConfirmar'), tono: 'advertencia' };
    if (v.revisar) return { etiqueta: tc('estados.revisar'), tono: 'advertencia' };
    return f.obligacion.fuente === 'borrador_iva' ? { etiqueta: tc('estados.borrador'), tono: 'informacion' } : { etiqueta: tc('estados.estimado'), tono: 'informacion' };
  };

  const vence = (f: Fila): string => {
    const v = f.vencimiento;
    switch (v.estado) {
      case 'fecha':
        return formatPlain(v.fecha);
      case 'sin_cargar':
        return t('vence.sinCargar', { anio: v.anio });
      case 'sin_nit':
        return t('vence.sinNit');
      case 'no_encontrado':
        return t('vence.noEncontrado');
      case 'municipal':
        return t('vence.municipal');
      default:
        return t('vence.pendienteActivar');
    }
  };

  const valor = (f: Fila): string => (f.valor.estado === 'calculado' ? formatear(f.valor.valor) : '—');

  const enlace = (f: Fila): { href: string; etiqueta: string } | null => {
    if (f.obligacion.fuente === 'borrador_iva') return { href: RUTAS_TRIBUTARIO.iva(f.obligacion.periodo.desde, f.obligacion.periodo.hasta), etiqueta: t('verBorrador') };
    if (f.obligacion.fuente === 'reporte_retenciones') return { href: RUTAS_TRIBUTARIO.reporteRetenciones, etiqueta: t('verReporte') };
    return null;
  };

  const columnas: ColumnaTabla<Fila>[] = [
    {
      id: 'obligacion',
      encabezado: t('columnas.obligacion'),
      celda: (f) => (
        <div>
          <span className="font-medium text-fg">{nombre(f)}</span>
          {f.obligacion.notas.map((n) => (
            <span key={n} className="block text-xs text-fg-secondary">
              {t(`notas.${n}`)}
            </span>
          ))}
        </div>
      ),
    },
    { id: 'periodo', encabezado: t('columnas.periodo'), celda: (f) => etiquetaPeriodo(f.obligacion.periodo, locale) },
    { id: 'vence', encabezado: t('columnas.vence'), celda: (f) => vence(f), ocultarDebajo: 'md' },
    { id: 'valor', encabezado: t('columnas.valor'), celda: (f) => valor(f), variante: 'importe', alinear: 'derecha' },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (f) => {
        const e = estadoFila(f);
        return <StatusBadge estado={e.etiqueta} etiqueta={e.etiqueta} tono={e.tono} />;
      },
    },
    {
      id: 'ir',
      encabezado: t('columnas.ir'),
      alinear: 'derecha',
      celda: (f) => {
        const e = enlace(f);
        return e ? (
          <Link href={e.href} className="font-medium text-brand hover:underline">
            {e.etiqueta}
          </Link>
        ) : null;
      },
    },
  ];

  const exportar = () => {
    if (!datos) return;
    const filas: (string | number | null)[][] = [[t('columnas.obligacion'), t('columnas.periodo'), t('columnas.vence'), t('columnas.valor'), t('columnas.estado')]];
    for (const f of datos.filas) {
      filas.push([nombre(f), etiquetaPeriodo(f.obligacion.periodo, locale), vence(f), f.valor.estado === 'calculado' ? f.valor.valor : null, estadoFila(f).etiqueta]);
    }
    descargarCsv(`centro-tributario-${datos.corte}.csv`, aCsv(filas));
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <CabeceraTributario
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        enCentro
        acciones={
          <>
            <Link href={RUTAS_TRIBUTARIO.perfil} className={clasesBoton({ variante: 'secundario' })}>
              <Settings2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('perfil')}
            </Link>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={exportar} disabled={!datos || datos.filas.length === 0}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {tc('excel')}
            </button>
          </>
        }
      />

      <AvisoBorradores />

      <div className="max-w-xs">
        <FormField etiqueta={t('corte')} ayuda={t('corteAyuda')}>
          {(c) => (
            <SelectNativo
              id={c.id}
              valor={corte}
              onCambiar={setCorte}
              opciones={opcionesCorte.map((m) => ({ valor: m, etiqueta: etiquetaPeriodo({ desde: `${m}-01`, hasta: `${m}-28` }, locale) }))}
              aria-describedby={c['aria-describedby']}
            />
          )}
        </FormField>
      </div>

      {lectura.estado === 'error' && <ErrorLectura codigo={lectura.codigo} onReintentar={() => void cargar()} />}

      {datos?.perfil === 'pendiente_activar' && <AvisoPendienteActivar descripcion={t('pendientePerfil')} />}

      {datos?.perfil === 'sin_perfil' && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('sinPerfil.titulo')}
          descripcion={t('sinPerfil.descripcion')}
          accion={{ etiqueta: t('sinPerfil.accion'), href: RUTAS_TRIBUTARIO.perfil }}
        />
      )}

      {datos?.perfil === 'activo' && datos.faltan.length > 0 && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('faltan.titulo')}
          descripcion={datos.faltan.map((f) => t(`faltan.${f}`)).join(' ')}
          accion={{ etiqueta: t('faltan.accion'), href: RUTAS_TRIBUTARIO.perfil }}
        />
      )}

      {datos?.perfil === 'activo' && datos.calendario === 'pendiente_activar' && <AvisoPendienteActivar descripcion={t('pendienteCalendario')} />}

      {lectura.estado !== 'error' && (!datos || datos.perfil === 'activo') && (
        <DataTable<Fila>
          etiqueta={t('titulo')}
          columnas={columnas}
          filas={datos?.filas ?? []}
          obtenerId={(f) => f.obligacion.id}
          estado={lectura.estado === 'cargando' ? 'cargando' : datos && datos.filas.length === 0 ? 'vacio' : 'listo'}
          vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
        />
      )}

      <p className="text-sm text-fg-secondary">
        {t('informes')}{' '}
        <Link href={RUTAS_TRIBUTARIO.reporteImpuestos} className="font-medium text-brand hover:underline">
          {t('informeImpuestos')}
        </Link>
        {' · '}
        <Link href={RUTAS_TRIBUTARIO.reporteRetenciones} className="font-medium text-brand hover:underline">
          {t('informeRetenciones')}
        </Link>
        {' · '}
        <Link href={RUTAS_TRIBUTARIO.certificados} className="font-medium text-brand hover:underline">
          {t('certificados')}
        </Link>
      </p>
    </div>
  );
}
