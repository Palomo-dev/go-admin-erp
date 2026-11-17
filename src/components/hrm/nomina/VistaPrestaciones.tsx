'use client';

/**
 * Nómina › Prestaciones (Figma 20.20): prima de servicios, cesantías e intereses.
 *
 * La prima y las cesantías se liquidan en su propio período (decisión 6 del dueño):
 * esta vista lee la última preliquidación de cada tipo y muestra, por persona, lo
 * que calculó el motor (días, salario, promedio variable, auxilio, base y valor).
 * «Liquidar» crea el período de ese tipo; nada se calcula en el navegador.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Gift, Landmark, PiggyBank, Plus } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  ListCard,
  ListToolbar,
  SearchInput,
  StatCard,
  TabBar,
  clasesBoton,
  type ColumnaTabla,
} from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CeldaPersona } from '../ausencias/piezasAusencias';
import { rutaEmpleadoPeriodo, rutaPeriodo, usePeriodo, usePersonasNomina, type ColillaPeriodo, type ResumenNomina } from './apiNomina';
import { normalizar, type FilaPeriodo } from './nominaLogica';
import { EstadoPeriodoBadge, useDinero, useFechas, useNombrePeriodo } from './piezasNomina';
import { DialogoNuevoPeriodo } from './DialogoNuevoPeriodo';

type Pestana = 'prima' | 'cesantias';

interface FilaPrestacion {
  vinculo_id: string;
  nombre: string | null;
  cargo: string | null;
  area: string | null;
  dias: number | null;
  salario: number | null;
  variable: number | null;
  auxilio: number | null;
  base: number | null;
  valor: number;
  intereses: number;
}

function filaDe(c: ColillaPeriodo, persona: { cargo: string | null; area: string | null } | undefined, pestana: Pestana): FilaPrestacion {
  const codigo = pestana === 'prima' ? 'PRIMA_SERVICIOS' : 'CESANTIAS_CONSIGNAR';
  const item = c.items.find((i) => i.codigo === codigo);
  const d = (item?.detalle ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  return {
    vinculo_id: c.vinculo_id,
    nombre: c.nombre,
    cargo: persona?.cargo ?? null,
    area: persona?.area ?? null,
    dias: n(item?.cantidad ?? d.dias),
    salario: n(d.salario),
    variable: n(d.variable),
    auxilio: n(d.auxilio),
    base: n(item?.base),
    valor: Number(item?.valor ?? 0),
    intereses: Number(c.items.find((i) => i.codigo === 'INTERESES_CESANTIAS')?.valor ?? 0),
  };
}

export function VistaPrestaciones({ resumen, onRecargar }: { resumen: ResumenNomina; onRecargar: () => void }) {
  const t = useTranslations('hrmNomina.prestaciones');
  const router = useRouter();
  const f = useFechas();
  const dinero = useDinero();
  const nombrar = useNombrePeriodo();
  const [pestana, setPestana] = useState<Pestana>('prima');
  const [elegido, setElegido] = useState<Record<Pestana, string | null>>({ prima: null, cesantias: null });
  const [texto, setTexto] = useState('');
  const [nuevo, setNuevo] = useState(false);

  const deTipo = useMemo(() => resumen.periodos.filter((p) => p.tipo === pestana), [resumen, pestana]);
  const periodo: FilaPeriodo | null = deTipo.find((p) => p.id === elegido[pestana]) ?? deTipo[0] ?? null;
  const { carga, recargar } = usePeriodo(periodo && periodo.version !== null ? periodo.id : null);
  const { carga: cargaPersonas } = usePersonasNomina();
  const personas = useMemo(
    () => new Map((cargaPersonas.estado === 'listo' ? cargaPersonas.datos.personas : []).map((x) => [x.vinculo_id, x])),
    [cargaPersonas]
  );
  const todas = useMemo(
    () => (carga.estado === 'listo' ? carga.datos.colillas.map((c) => filaDe(c, personas.get(c.vinculo_id), pestana)) : []),
    [carga, personas, pestana]
  );
  const filas = useMemo(() => {
    const q = normalizar(texto);
    return q ? todas.filter((x) => normalizar([x.nombre, x.cargo, x.area].filter(Boolean).join(' ')).includes(q)) : todas;
  }, [todas, texto]);
  const total = filas.reduce((s, x) => s + x.valor, 0);
  const intereses = filas.reduce((s, x) => s + x.intereses, 0);

  const sinCalculo = !periodo || periodo.version === null;
  const estadoTabla = sinCalculo
    ? 'vacio'
    : carga.estado === 'cargando'
      ? 'cargando'
      : carga.estado === 'sinPermiso'
        ? 'sinPermiso'
        : carga.estado !== 'listo'
          ? 'error'
          : filas.length === 0
            ? todas.length === 0
              ? 'vacio'
              : 'sinResultados'
            : 'listo';

  const columnas: ColumnaTabla<FilaPrestacion>[] = [
    { id: 'persona', encabezado: t('columnas.empleado'), celda: (x) => <CeldaPersona fila={x} /> },
    { id: 'dias', encabezado: t('columnas.dias'), alinear: 'derecha', celda: (x) => <span className="tabular-nums">{x.dias ?? '—'}</span> },
    { id: 'salario', encabezado: t('columnas.salario'), variante: 'importe', ocultarDebajo: 'lg', celda: (x) => dinero(x.salario) },
    { id: 'variable', encabezado: t('columnas.variable'), variante: 'importe', ocultarDebajo: 'xl', celda: (x) => dinero(x.variable) },
    { id: 'auxilio', encabezado: t('columnas.auxilio'), variante: 'importe', ocultarDebajo: 'xl', celda: (x) => (x.auxilio ? dinero(x.auxilio) : '—') },
    { id: 'base', encabezado: t('columnas.base'), variante: 'importe', ocultarDebajo: 'md', celda: (x) => dinero(x.base) },
    {
      id: 'valor',
      encabezado: pestana === 'prima' ? t('columnas.prima') : t('columnas.cesantias'),
      variante: 'importe',
      celda: (x) => <span className="font-semibold">{dinero(x.valor)}</span>,
    },
    ...(pestana === 'cesantias'
      ? [{ id: 'intereses', encabezado: t('columnas.intereses'), variante: 'importe' as const, ocultarDebajo: 'md' as const, celda: (x: FilaPrestacion) => dinero(x.intereses) }]
      : []),
  ];

  const abrir = (x: FilaPrestacion) => periodo && router.push(rutaEmpleadoPeriodo(periodo.id, x.vinculo_id));

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          etiqueta={t('kpi.prima')}
          valor={pestana === 'prima' && !sinCalculo ? dinero(total) : '—'}
          detalle={pestana === 'prima' && periodo ? nombrar(periodo) : t('kpi.sinPeriodo')}
          cargando={pestana === 'prima' && carga.estado === 'cargando' && !sinCalculo}
          icono={Gift}
        />
        <StatCard
          etiqueta={t('kpi.cesantias')}
          valor={pestana === 'cesantias' && !sinCalculo ? dinero(total) : '—'}
          detalle={t('kpi.cesantiasDetalle')}
          cargando={pestana === 'cesantias' && carga.estado === 'cargando' && !sinCalculo}
          icono={Landmark}
        />
        <StatCard
          etiqueta={t('kpi.intereses')}
          valor={pestana === 'cesantias' && !sinCalculo ? dinero(intereses) : '—'}
          detalle={t('kpi.interesesDetalle')}
          cargando={pestana === 'cesantias' && carga.estado === 'cargando' && !sinCalculo}
        />
      </div>

      <TabBar
        id="prestaciones"
        etiqueta={t('etiqueta')}
        valor={pestana}
        onValorChange={(v) => {
          setPestana(v);
          setTexto('');
        }}
        pestanas={[
          { valor: 'prima', etiqueta: t('pestanas.prima') },
          { valor: 'cesantias', etiqueta: t('pestanas.cesantias') },
        ]}
      />

      <AvisoTonal
        tono="informacion"
        titulo={pestana === 'prima' ? t('aviso.primaTitulo') : t('aviso.cesantiasTitulo')}
        descripcion={pestana === 'prima' ? t('aviso.primaDescripcion') : t('aviso.cesantiasDescripcion')}
        accion={resumen.permisos.procesar ? { etiqueta: pestana === 'prima' ? t('liquidarPrima') : t('liquidarCesantias'), onClick: () => setNuevo(true) } : undefined}
      />

      {deTipo.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {deTipo.length > 1 ? (
              <Select value={periodo?.id ?? ''} onValueChange={(v) => setElegido((e) => ({ ...e, [pestana]: v }))}>
                <SelectTrigger aria-label={t('elegirPeriodo')} className="h-10 w-72 max-w-full border-line-strong bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deTipo.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {nombrar(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="truncate text-sm font-medium text-fg">{periodo ? nombrar(periodo) : ''}</p>
            )}
            {periodo ? <EstadoPeriodoBadge estado={periodo.estado} /> : null}
          </div>
          {periodo ? (
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={() => router.push(rutaPeriodo(periodo.id))}>
              {t('abrirPeriodo')}
            </button>
          ) : null}
        </div>
      ) : null}

      {!sinCalculo && todas.length > 0 ? (
        <ListToolbar busqueda={<SearchInput value={texto} onChange={setTexto} placeholder={t('buscar')} etiqueta={t('buscar')} />} />
      ) : null}

      <DataTable
        etiqueta={pestana === 'prima' ? t('pestanas.prima') : t('pestanas.cesantias')}
        columnas={columnas}
        filas={filas}
        obtenerId={(x) => x.vinculo_id}
        estado={estadoTabla}
        onFilaClick={abrir}
        etiquetaFila={(x) => x.nombre ?? '—'}
        tarjetaMovil={(x) => (
          <ListCard
            avatar={{ nombre: x.nombre ?? '?' }}
            titulo={x.nombre ?? '—'}
            subtitulo={[x.cargo, x.area].filter(Boolean).join(' · ') || undefined}
            meta={x.dias !== null ? t('nDias', { n: x.dias }) : undefined}
            valor={dinero(x.valor)}
            onClick={() => abrir(x)}
          />
        )}
        vacio={{
          titulo: !periodo ? t('vacio.sinPeriodo') : t('vacio.sinCalculo'),
          descripcion: !periodo ? t('vacio.sinPeriodoDescripcion') : t('vacio.sinCalculoDescripcion', { fecha: f.corta(periodo.hasta) }),
          icono: PiggyBank,
          accion: !periodo && resumen.permisos.procesar
            ? { etiqueta: pestana === 'prima' ? t('liquidarPrima') : t('liquidarCesantias'), onClick: () => setNuevo(true), icono: Plus }
            : periodo
              ? { etiqueta: t('abrirPeriodo'), onClick: () => router.push(rutaPeriodo(periodo.id)) }
              : undefined,
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        onLimpiarFiltros={() => setTexto('')}
        termino={texto}
        error={{ titulo: t('error') }}
        sinPermiso={{ titulo: t('sinPermiso') }}
        onReintentar={() => void recargar()}
      />

      <DialogoNuevoPeriodo
        abierto={nuevo}
        onAbiertoChange={(v) => {
          setNuevo(v);
          if (!v) onRecargar();
        }}
        periodos={resumen.periodos}
        tipoInicial={pestana}
      />
    </>
  );
}
