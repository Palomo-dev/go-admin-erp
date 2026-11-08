'use client';

/**
 * Dinero de terceros (Figma «07 Finanzas» `2335:139939`, captura
 * `docs/design/figma/88-terceros-dinero-de-terceros.png`): lo que se recibe
 * pero no es propio — propinas, recaudos y mandatos — con lo recibido, lo
 * liquidado, lo que falta pagar y la cuenta de cada concepto.
 *
 * Sin pantalla paralela de alta: registrar un recaudo y liquidarlo al tercero
 * abren el formulario ÚNICO de Movimientos de Tesorería
 * (`tesoreria/compartido`) con la categoría de recaudos (cuenta 2815 o la
 * configurada) y el tercero obligatorio. Repartir propinas sigue en la
 * pantalla de propinas del POS. La cuenta de la propina la decide el
 * Contador: aquí solo se avisa si hoy no es de pasivo.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowDownCircle, ArrowUpCircle, Gift, HandCoins, Settings, Users } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  PageHeader,
  RowActionsMenu,
  Tarjeta,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { toastError } from '@/components/ui/use-toast';
import { FormularioMovimientoTesoreria } from '@/components/finanzas/tesoreria/compartido/formularios';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  hayCuentaPorDefinir,
  type ConceptoTerceros,
  type RespuestaDineroTerceros,
  type SaldoTercero,
} from '@/lib/finanzas/dineroTerceros/dineroTercerosLogica';

const NS = 'finanzasTercerosR4.dinero';
const RUTA_PROPINAS = '/app/pos/propinas';
const RUTA_CONFIG_CONTABLE = '/app/finanzas/configuracion-contable';

function cabeceras(json = false): HeadersInit {
  const org = getOrganizationId();
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(org > 0 ? { 'x-organization-id': String(org) } : {}) };
}

export function DineroTercerosPage() {
  const t = useTranslations(NS);
  const router = useRouter();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const fmt = moneda.formatear;

  const [datos, setDatos] = useState<RespuestaDineroTerceros | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'sinPermiso'>('cargando');
  const [recarga, setRecarga] = useState(0);
  const [formulario, setFormulario] = useState<{ tipo: 'ingreso' | 'egreso'; categoriaId: number | null } | null>(null);
  const [preparando, setPreparando] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let vigente = true;
    setEstado((e) => (e === 'listo' ? e : 'cargando'));
    fetch('/api/dinero-terceros', { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() })
      .then(async (r) => {
        if (!vigente) return;
        if (r.status === 403) return setEstado('sinPermiso');
        if (!r.ok) return setEstado('error');
        setDatos((await r.json()) as RespuestaDineroTerceros);
        setEstado('listo');
      })
      .catch(() => vigente && setEstado('error'));
    return () => {
      vigente = false;
    };
  }, [recarga]);

  /** Abre el formulario único con la categoría de recaudos; si falta, la crea primero (misma alta que Categorías). */
  const abrir = async (tipo: 'ingreso' | 'egreso') => {
    let categoriaId = datos?.categorias[tipo] ?? null;
    if (!categoriaId) {
      setPreparando(true);
      try {
        const r = await fetch('/api/dinero-terceros/categorias', {
          method: 'POST',
          credentials: 'same-origin',
          headers: cabeceras(true),
          body: JSON.stringify({ ingreso: t('categorias.ingreso'), egreso: t('categorias.egreso') }),
        });
        if (!r.ok) throw new Error(String(r.status));
        const { categorias } = (await r.json()) as { categorias: RespuestaDineroTerceros['categorias'] };
        categoriaId = categorias[tipo];
        setDatos((d) => (d ? { ...d, categorias } : d));
      } catch {
        toastError(t('categorias.error'));
      } finally {
        setPreparando(false);
      }
    }
    setFormulario({ tipo, categoriaId });
  };

  const conceptos = datos?.conceptos ?? [];
  const recaudos = conceptos.find((c) => c.clave === 'recaudos');
  const propinas = conceptos.find((c) => c.clave === 'propinas');
  const avisoCuenta = datos ? hayCuentaPorDefinir(conceptos) : false;

  const textoCuenta = (c: ConceptoTerceros) => {
    if (!c.cuenta) return <span className="text-warning-text">{t('cuenta.porConfirmar')}</span>;
    if (c.cuentaNoEsPasivo) return <span className="text-warning-text">{t('cuenta.porConfirmarPropuesta', { cuenta: datos?.cuentaRecaudos ?? '2815', actual: c.cuenta })}</span>;
    if (!c.cuentaConfirmada) return <span className="text-warning-text">{t('cuenta.porConfirmarCodigo', { cuenta: c.cuenta })}</span>;
    return <span className="tabular-nums text-fg">{c.cuenta}</span>;
  };

  const columnas: ColumnaTabla<ConceptoTerceros>[] = [
    { id: 'concepto', encabezado: t('columnas.concepto'), celda: (c) => <span className="font-medium text-fg">{t(`conceptos.${c.clave}`)}</span> },
    { id: 'recibido', encabezado: t('columnas.recibido'), variante: 'importe', celda: (c) => fmt(c.recibido) },
    { id: 'liquidado', encabezado: t('columnas.liquidado'), variante: 'importe', celda: (c) => fmt(c.liquidado) },
    {
      id: 'porPagar',
      encabezado: t('columnas.porPagar'),
      variante: 'importe',
      celda: (c) => <span className={c.porPagar > 0 ? 'font-semibold text-fg' : 'text-fg-muted'}>{fmt(c.porPagar)}</span>,
    },
    { id: 'cuenta', encabezado: t('columnas.cuenta'), celda: textoCuenta },
  ];

  const columnasTercero: ColumnaTabla<SaldoTercero>[] = [
    {
      id: 'tercero',
      encabezado: t('columnas.tercero'),
      celda: (s) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{s.nombre || t('sinTercero')}</span>
          {s.nit && <span className="truncate text-xs text-fg-muted">{s.nit}</span>}
        </div>
      ),
    },
    { id: 'recibido', encabezado: t('columnas.recibido'), variante: 'importe', celda: (s) => fmt(s.recibido) },
    { id: 'liquidado', encabezado: t('columnas.liquidado'), variante: 'importe', celda: (s) => fmt(s.liquidado) },
    { id: 'porPagar', encabezado: t('columnas.porPagar'), variante: 'importe', celda: (s) => fmt(s.porPagar) },
  ];

  const menu: AccionFila[] = [
    ...(permisos.crear
      ? [{ id: 'registrar', etiqueta: t('acciones.registrarRecaudo'), icono: ArrowDownCircle, onSelect: () => void abrir('ingreso') }]
      : []),
    { id: 'propinas', etiqueta: t('acciones.repartirPropinas'), icono: Gift, onSelect: () => router.push(RUTA_PROPINAS) },
    { id: 'configuracion', etiqueta: t('acciones.configuracion'), icono: Settings, separadorAntes: true, onSelect: () => router.push(RUTA_CONFIG_CONTABLE) },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={HandCoins}
        cargando={estado === 'cargando'}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.tesoreria') }, { etiqueta: t('titulo') }]}
        acciones={
          <>
            {permisos.crear && (
              <button
                type="button"
                onClick={() => void abrir('egreso')}
                disabled={!datos || preparando}
                className={clasesBoton({ variante: 'primario' })}
              >
                <ArrowUpCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.liquidar')}
              </button>
            )}
            <RowActionsMenu acciones={menu} orientacion="horizontal" tamano="md" titulo={t('titulo')} />
          </>
        }
        movil={{ accionesEnFila: true, subtitulo: t('subtitulo') }}
      />

      {avisoCuenta && propinas?.cuentaNoEsPasivo && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('aviso.titulo')}
          descripcion={t('aviso.propina')}
          accion={{ etiqueta: t('aviso.verPropuesta'), href: RUTA_CONFIG_CONTABLE }}
        />
      )}
      {avisoCuenta && !propinas?.cuentaNoEsPasivo && (
        <AvisoTonal tono="advertencia" titulo={t('aviso.titulo')} descripcion={t('aviso.recaudos')} accion={{ etiqueta: t('aviso.verPropuesta'), href: RUTA_CONFIG_CONTABLE }} />
      )}
      {datos?.propinasTruncadas && <AvisoTonal tono="informacion" titulo={t('aviso.truncadas')} compacto />}

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={conceptos}
        obtenerId={(c) => c.clave}
        estado={estado === 'cargando' && !datos ? 'cargando' : estado === 'error' ? 'error' : estado === 'sinPermiso' ? 'sinPermiso' : 'listo'}
        etiquetaFila={(c) => t('etiquetaFila', { concepto: t(`conceptos.${c.clave}`), monto: fmt(c.porPagar) })}
        error={{ titulo: t('errorCarga') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onReintentar={recargar}
      />

      {recaudos && recaudos.terceros.length > 0 && (
        <Tarjeta titulo={t('porTercero.titulo')} icono={Users}>
          <DataTable
            etiqueta={t('porTercero.titulo')}
            columnas={columnasTercero}
            filas={recaudos.terceros}
            obtenerId={(s) => s.nit || '—'}
            etiquetaFila={(s) => t('etiquetaFila', { concepto: s.nombre || t('sinTercero'), monto: fmt(s.porPagar) })}
          />
        </Tarjeta>
      )}

      {formulario && (
        <FormularioMovimientoTesoreria
          tipo={formulario.tipo}
          open={!!formulario}
          onOpenChange={(v) => !v && setFormulario(null)}
          onSuccess={() => {
            setFormulario(null);
            recargar();
          }}
          preseleccion={{ categoriaId: formulario.categoriaId, exigirTercero: true }}
        />
      )}
    </div>
  );
}
