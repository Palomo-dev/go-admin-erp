"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Copy, Pencil, Percent, Plus, Power, Star, Trash2 } from 'lucide-react';
import {
  DataTable,
  FilterPanel,
  FormField,
  ListCard,
  ListToolbar,
  Pagination,
  SearchInput,
  SegmentedControl,
  formatearTarifa,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { setOrganizationDefaultTax } from '@/lib/services/defaultTaxService';
import TaxForm from './TaxForm';
import DeleteTaxDialog from './DeleteTaxDialog';
import TarifaPorDefectoCard from './TarifaPorDefectoCard';
import type { OrganizationTax, PlantillaImpuesto } from './useImpuestosOrganizacion';
import {
  FILTROS_VACIOS,
  codigoDian,
  conteoFiltros,
  esExento,
  estadoListado,
  filtrarImpuestos,
  tipoImpuesto,
  type FiltrosImpuestos,
  type TipoImpuesto,
  type UsoProductos,
} from './impuestosLogica';

interface TaxesTableProps {
  /** Impuestos de venta y compra (sin retenciones: ver useImpuestosOrganizacion). */
  taxes: OrganizationTax[];
  plantillas: PlantillaImpuesto[];
  uso: UsoProductos | null;
  loading: boolean;
  error: boolean;
  sinPermiso: boolean;
  organizationId: number | null;
  /** Permiso de gestión (finance.create o finance.approve), resuelto en el servidor. */
  puedeGestionar: boolean;
  /** Cada incremento abre «Nuevo impuesto» (el botón vive en la cabecera de la página). */
  solicitudNuevo: number;
  onRefresh: () => void | Promise<void>;
}

const TIPOS: ReadonlyArray<TipoImpuesto> = ['iva', 'inc', 'ibua', 'ica', 'otro'];
type Formulario = { modo: 'nuevo' } | { modo: 'editar'; tax: OrganizationTax } | { modo: 'duplicar'; tax: OrganizationTax };

/**
 * Pestaña «Impuestos» de Finanzas › Impuestos (Figma 1012:86383; estados
 * 830:526193–830:529376; móvil 830:534553 y 830:535609). La tabla del kit con
 * tarjetas en móvil, menú ⋯ por fila y la tarjeta de tarifa por defecto.
 *
 * Toda escritura va por RPC con permiso de impuestos: crear/editar
 * (`manage_organization_tax`, en TaxForm), activar o desactivar
 * (`fn_impuesto_cambiar_activo`), tarifa por defecto
 * (`fn_impuesto_fijar_por_defecto`) y eliminar (`delete_organization_tax`, que
 * rechaza el predeterminado y el que usan productos).
 */
const TaxesTable = ({
  taxes,
  plantillas,
  uso,
  loading,
  error,
  sinPermiso,
  organizationId,
  puedeGestionar,
  solicitudNuevo,
  onRefresh,
}: TaxesTableProps) => {
  const t = useTranslations('finanzasImpuestos');
  const locale = useLocale();
  const { toast } = useToast();
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState<FiltrosImpuestos>(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(20);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [aEliminar, setAEliminar] = useState<OrganizationTax | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);

  useEffect(() => {
    if (solicitudNuevo > 0) setFormulario({ modo: 'nuevo' });
  }, [solicitudNuevo]);

  const codigoPlantilla = useMemo(() => new Map(plantillas.map((p) => [p.id, p.code])), [plantillas]);
  const tipoDe = (tax: OrganizationTax) => tipoImpuesto(tax.template_id ? codigoPlantilla.get(tax.template_id) : null, tax.name);
  const dianDe = (tax: OrganizationTax) => codigoDian(tax.template_id ? codigoPlantilla.get(tax.template_id) : null, tax.name);
  const productosDe = (tax: OrganizationTax): number | null => (uso ? uso.porImpuesto[tax.id] ?? 0 : null);
  const tasa = (rate: number) => formatearTarifa(Number(rate), locale) ?? `${rate} %`;

  const filtradas = useMemo(
    () => filtrarImpuestos(taxes, busqueda, filtros, tipoDe),
    // tipoDe depende solo de las plantillas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [taxes, busqueda, filtros, codigoPlantilla],
  );
  useEffect(() => setPagina(1), [busqueda, filtros, tamano]);
  const visibles = filtradas.slice((pagina - 1) * tamano, pagina * tamano);

  const estado = estadoListado({ cargando: loading, sinPermiso, error, total: taxes.length, visibles: filtradas.length });

  // Función para cambiar el estado activo de un impuesto
  const handleToggleActive = async (tax: OrganizationTax) => {
    if (!organizationId) return;
    setCambiando(tax.id);
    try {
      // RPC con permiso de finanzas y acotada a la organización (la tabla ya no
      // admite escritura directa desde el navegador).
      const { error: rpcError } = await supabase.rpc('fn_impuesto_cambiar_activo', {
        p_organization_id: organizationId,
        p_id: tax.id,
        p_activo: !tax.is_active,
      });
      if (rpcError) throw rpcError;
      await onRefresh();
      toast({ description: t(tax.is_active ? 'toast.desactivado' : 'toast.activado', { nombre: tax.name }) });
    } catch (err) {
      console.error('Error al actualizar el estado del impuesto:', err);
      toast({ title: t('toast.errorTitulo'), description: t('toast.errorEstado'), variant: 'destructive' });
    } finally {
      setCambiando(null);
    }
  };

  const hacerPredeterminado = async (tax: OrganizationTax) => {
    if (!organizationId) return;
    try {
      await setOrganizationDefaultTax(supabase, organizationId, tax.id);
      await onRefresh();
      toast({ description: t('toast.predeterminado', { nombre: tax.name }) });
    } catch (err) {
      console.error('Error al fijar la tarifa por defecto:', err);
      toast({ title: t('toast.errorTitulo'), description: t('toast.errorPredeterminado'), variant: 'destructive' });
    }
  };

  const acciones = (tax: OrganizationTax): AccionFila[] => {
    if (!puedeGestionar) return [];
    const productos = productosDe(tax);
    return [
      { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => setFormulario({ modo: 'editar', tax }) },
      { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => setFormulario({ modo: 'duplicar', tax }) },
      {
        id: 'predeterminado',
        etiqueta: t('acciones.predeterminado'),
        icono: Star,
        onSelect: () => void hacerPredeterminado(tax),
        oculta: tax.is_default,
        deshabilitada: !tax.is_active,
        motivo: !tax.is_active ? t('acciones.predeterminadoInactivo') : undefined,
      },
      {
        id: 'estado',
        etiqueta: t(tax.is_active ? 'acciones.desactivar' : 'acciones.activar'),
        icono: Power,
        onSelect: () => void handleToggleActive(tax),
        deshabilitada: cambiando === tax.id,
      },
      {
        id: 'eliminar',
        etiqueta: t('acciones.eliminar'),
        icono: Trash2,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => setAEliminar(tax),
        // El servidor vuelve a validarlo; aquí se explica antes de intentarlo.
        deshabilitada: tax.is_default || (productos ?? 0) > 0,
        motivo: tax.is_default
          ? t('acciones.eliminarPredeterminado')
          : (productos ?? 0) > 0
            ? t('acciones.eliminarEnUso', { count: productos ?? 0 })
            : undefined,
      },
    ];
  };

  const insigniasNombre = (tax: OrganizationTax, tipo: TipoImpuesto) => (
    <>
      {esExento(tax, tipo) && (
        <Badge tono="informacion" apariencia="contorno" tamano="sm">
          {t('insignias.exento')}
        </Badge>
      )}
      {tax.is_default && (
        <Badge tono="exito" apariencia="suave" tamano="sm">
          {t('insignias.predeterminado')}
        </Badge>
      )}
      {tax.tax_included && (
        <Badge tono="marca" apariencia="contorno" tamano="sm">
          {t('insignias.incluido')}
        </Badge>
      )}
    </>
  );

  const columnas: ColumnaTabla<OrganizationTax>[] = [
    {
      id: 'nombre',
      encabezado: t('columnas.nombre'),
      celda: (tax) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate font-medium text-fg">{tax.name}</span>
            {insigniasNombre(tax, tipoDe(tax))}
          </div>
          {tax.description && <span className="truncate text-xs text-fg-secondary">{tax.description}</span>}
        </div>
      ),
    },
    {
      id: 'tipo',
      encabezado: t('columnas.tipo'),
      celda: (tax) => (
        <Badge tono="neutro" apariencia="suave" tamano="sm">
          {t(`tipos.${tipoDe(tax)}`)}
        </Badge>
      ),
    },
    {
      id: 'tarifa',
      encabezado: t('columnas.tarifa'),
      variante: 'importe',
      alinear: 'derecha',
      celda: (tax) => <span className="font-semibold text-fg">{tasa(tax.rate)}</span>,
    },
    {
      id: 'dian',
      encabezado: t('columnas.codigoDian'),
      ocultarDebajo: 'md',
      celda: (tax) => {
        const codigo = dianDe(tax);
        return codigo ? (
          <span className="whitespace-nowrap text-fg-secondary">{t('codigoDian', { codigo, tipo: t(`tipos.${tipoDe(tax)}`) })}</span>
        ) : (
          <span className="text-fg-muted">—</span>
        );
      },
    },
    {
      id: 'productos',
      encabezado: t('columnas.productos'),
      variante: 'importe',
      alinear: 'derecha',
      ocultarDebajo: 'lg',
      celda: (tax) => {
        const n = productosDe(tax);
        return n === null ? <span className="text-fg-muted">—</span> : <span className={n === 0 ? 'text-fg-muted' : 'text-fg'}>{n.toLocaleString(locale)}</span>;
      },
    },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (tax) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={tax.is_active}
            disabled={!puedeGestionar || cambiando === tax.id}
            onCheckedChange={() => void handleToggleActive(tax)}
            aria-label={t(tax.is_active ? 'acciones.desactivarNombre' : 'acciones.activarNombre', { nombre: tax.name })}
          />
          <span className="text-sm text-fg-secondary">{t(tax.is_active ? 'estado.activo' : 'estado.inactivo')}</span>
        </div>
      ),
    },
  ];

  const tarjeta = (tax: OrganizationTax) => {
    const tipo = tipoDe(tax);
    const detalle = [
      t(`tipos.${tipo}`),
      tax.is_default ? t('insignias.predeterminado') : null,
      tax.tax_included ? t('insignias.incluidoLargo') : null,
      esExento(tax, tipo) ? t('insignias.exento') : null,
      !tax.is_default && !tax.tax_included && tax.description ? tax.description : null,
    ].filter(Boolean);
    return (
      <ListCard
        icono={Percent}
        titulo={tax.name}
        subtitulo={detalle.join(' · ')}
        valor={tasa(tax.rate)}
        estado={
          <Badge tono={tax.is_active ? 'exito' : 'neutro'} apariencia="suave" tamano="sm">
            {t(tax.is_active ? 'estado.activo' : 'estado.inactivo')}
          </Badge>
        }
        acciones={acciones(tax)}
        onClick={puedeGestionar ? () => setFormulario({ modo: 'editar', tax }) : undefined}
      />
    );
  };

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltros(FILTROS_VACIOS);
  };

  return (
    <div className="flex flex-col gap-4">
      {organizationId && !sinPermiso && (!loading || taxes.length > 0) && (
        <TarifaPorDefectoCard organizationId={organizationId} taxes={taxes} uso={uso} puedeGestionar={puedeGestionar} onSaved={onRefresh} />
      )}

      {estado !== 'vacio' && estado !== 'sinPermiso' && (
        <ListToolbar
          busqueda={<SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder={t('buscar')} />}
          filtros={
            <FilterPanel conteo={conteoFiltros(filtros)} onLimpiar={() => setFiltros(FILTROS_VACIOS)} titulo={t('filtros.titulo')}>
              <FormField etiqueta={t('filtros.estado')}>
                <SegmentedControl
                  opciones={[
                    { valor: 'todos', etiqueta: t('filtros.todos') },
                    { valor: 'activos', etiqueta: t('filtros.activos') },
                    { valor: 'inactivos', etiqueta: t('filtros.inactivos') },
                  ]}
                  valor={filtros.estado}
                  onValorChange={(estadoFiltro) => setFiltros((f) => ({ ...f, estado: estadoFiltro }))}
                  anchoCompleto
                />
              </FormField>
              <FormField etiqueta={t('filtros.tipo')}>
                <SegmentedControl
                  opciones={[{ valor: 'todos', etiqueta: t('filtros.todos') }, ...TIPOS.map((tp) => ({ valor: tp, etiqueta: t(`tipos.${tp}`) }))]}
                  valor={filtros.tipo}
                  onValorChange={(tipo) => setFiltros((f) => ({ ...f, tipo }))}
                  anchoCompleto
                />
              </FormField>
            </FilterPanel>
          }
        />
      )}

      <DataTable
        etiqueta={t('tablaEtiqueta')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(tax) => tax.id}
        estado={estado}
        etiquetaFila={(tax) => tax.name}
        acciones={puedeGestionar ? acciones : undefined}
        onFilaClick={puedeGestionar ? (tax) => setFormulario({ modo: 'editar', tax }) : undefined}
        tarjetaMovil={tarjeta}
        termino={busqueda}
        onLimpiarFiltros={limpiarFiltros}
        onReintentar={() => void onRefresh()}
        filasEsqueleto={4}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Percent,
          accion: puedeGestionar ? { etiqueta: t('nuevo'), icono: Plus, onClick: () => setFormulario({ modo: 'nuevo' }) } : undefined,
        }}
        sinResultados={{ titulo: t('sinResultados.titulo'), descripcion: t('sinResultados.descripcion') }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        pie={
          filtradas.length > 0 ? (
            <Pagination
              pagina={pagina}
              tamano={tamano}
              total={filtradas.length}
              onPaginaChange={setPagina}
              onTamanoChange={setTamano}
              sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
            />
          ) : undefined
        }
      />

      {formulario && organizationId && (
        <TaxForm
          open
          onClose={(recargarDatos) => {
            setFormulario(null);
            if (recargarDatos) void onRefresh();
          }}
          tax={formulario.modo === 'editar' ? formulario.tax : null}
          editMode={formulario.modo === 'editar'}
          duplicarDe={formulario.modo === 'duplicar' ? formulario.tax : null}
          productos={formulario.modo === 'editar' ? productosDe(formulario.tax) : null}
          organizationId={organizationId}
          clase="tax"
        />
      )}

      {aEliminar && (
        <DeleteTaxDialog
          open
          onClose={(eliminado) => {
            setAEliminar(null);
            if (eliminado) void onRefresh();
          }}
          tax={aEliminar}
        />
      )}
    </div>
  );
};

export default TaxesTable;
