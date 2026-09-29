'use client';

import Link from 'next/link';
import { Crown, History, Info, Package, Pencil, Receipt, Settings2, ShoppingCart, TriangleAlert, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  EmptyState,
  FilaDato,
  KpiStrip,
  ListaDatos,
  PageHeader,
  RelatedLinkCard,
  StatCard,
  Tarjeta,
  clasesBoton,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { apiMembresias } from '@/lib/services/membresias/clienteMembresias';
import type { DetallePlan as DatosPlan } from '@/lib/services/membresias/tipos';
import { BadgeEstadoMembresia } from '../comun/BadgeEstadoMembresia';
import { EsqueletoPantalla, EstadoPantalla } from '../comun/EstadoPantalla';
import { useCargaMembresias } from '../comun/useCargaMembresias';
import { useFormatoMembresias } from '../comun/useFormatoMembresias';
import { RUTA_MEMBRESIAS, rutaCobrarEnPos, rutaDetalle } from '../logica';
import { useContextoPlanes } from './contextoPlanes';
import { RUTA_PLANES, TONO_ESTADO_PLAN, estadoPlan, rutaEditarProducto, rutaProducto } from './logicaPlanes';
import { useTextosPlan } from './useTextosPlan';

/**
 * Detalle del plan ligado a su producto (Figma B2 981:612094). La configuración se edita SOLO
 * en el formulario del producto («Editar en el producto», con memberships.plans.manage); el
 * precio es el del producto (P9). «Vender» abre el POS con el producto.
 */
export function DetallePlan({ id }: { id: number }) {
  const t = useTranslations('membresias.plan');
  const tp = useTranslations('membresias.planes');
  const carga = useCargaMembresias<DatosPlan>(`plan-${id}`, () => apiMembresias.plan(id));
  const datos = carga.datos;
  const plan = datos?.plan ?? null;
  const formato = useFormatoMembresias(datos?.zona);
  const contexto = useContextoPlanes(plan?.productId ? [plan.productId] : []);
  const textos = useTextosPlan(contexto.nombreSede);

  const migas = [
    { etiqueta: tp('migaModulo'), href: RUTA_MEMBRESIAS },
    { etiqueta: tp('titulo'), href: RUTA_PLANES },
    { etiqueta: plan?.nombre ?? t('migaPlan') },
  ];

  if (!plan) {
    const noEncontrado = carga.error && (carga.error.estado === 404 || carga.error.codigo === 'membresia_no_encontrada');
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader variante="detail" titulo={t('migaPlan')} icono={Crown} migas={migas} cargando={carga.cargando} />
        {carga.cargando || !carga.error ? (
          <EsqueletoPantalla bloques={2} />
        ) : noEncontrado ? (
          <EmptyState
            titulo={t('noEncontrado.titulo')}
            descripcion={t('noEncontrado.descripcion')}
            accion={{ etiqueta: t('noEncontrado.volver'), href: RUTA_PLANES }}
          />
        ) : (
          <EstadoPantalla error={carga.error} onReintentar={carga.recargar} tituloError={t('errorTitulo')} />
        )}
      </div>
    );
  }

  const estado = estadoPlan(plan);
  const uuid = plan.productId ? contexto.uuidProducto.get(plan.productId) : undefined;
  // «Editar en el producto» exige memberships.plans.manage (resuelto en el servidor) y el uuid del producto.
  const uuidEditable = datos?.permisos.planes === true ? uuid : undefined;
  const puedeVender = estado === 'activo';
  const r = plan.reglas;
  const subtitulo = [plan.sku, textos.duracion(r), t('subtituloRenovacion'), plan.productId ? textos.cobroCorto(r).toLowerCase() : null]
    .filter(Boolean)
    .join(' · ');

  const botonEditar = uuidEditable && (
    <Link href={rutaEditarProducto(uuidEditable)} className={clasesBoton({ variante: 'secundario' })}>
      <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('editarEnProducto')}
    </Link>
  );
  const badgeEstado = (
    <Badge tono={TONO_ESTADO_PLAN[estado]} apariencia="suave" tamano="md">
      {tp(`estadoPlan.${estado}`)}
    </Badge>
  );
  const botonVender = puedeVender && (
    <Link href={rutaCobrarEnPos(null, plan.productId)} className={clasesBoton({ variante: 'primario' })}>
      <ShoppingCart aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('vender')}
    </Link>
  );

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        variante="detail"
        titulo={plan.nombre}
        icono={Crown}
        migas={migas}
        subtitulo={subtitulo}
        badge={badgeEstado}
        acciones={
          botonEditar || botonVender ? (
            <>
              {botonEditar}
              {botonVender}
            </>
          ) : undefined
        }
        movil={{
          titulo: plan.nombre,
          subtitulo: plan.sku ?? undefined,
          accion: puedeVender ? (
            <Link
              href={rutaCobrarEnPos(null, plan.productId)}
              aria-label={t('vender')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ShoppingCart aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Link>
          ) : undefined,
        }}
      />

      {estado === 'sin_producto' && (
        <Tarjeta tono="advertencia" icono={TriangleAlert} titulo={t('sinProducto.titulo')} descripcion={t('sinProducto.descripcion')} />
      )}

      <KpiStrip etiqueta={t('kpi.etiqueta')}>
        <StatCard
          etiqueta={t('kpi.precio')}
          valor={plan.precio !== null ? formato.moneda(plan.precio) : '—'}
          detalle={plan.productId ? t('kpi.precioDetalle') : t('kpi.precioSinProducto')}
        />
        <StatCard
          etiqueta={t('kpi.activas')}
          valor={formato.entero(plan.membresiasActivas)}
          detalle={t('kpi.activasDetalle', { n: plan.membresiasVivas })}
          tono="exito"
          href={`${RUTA_MEMBRESIAS}/membresias?plan=${plan.id}`}
        />
        <StatCard etiqueta={t('kpi.ingresos')} valor={formato.moneda(datos?.ingresosMes ?? 0)} detalle={t('kpi.ingresosDetalle')} />
        <StatCard etiqueta={t('kpi.ventas')} valor={formato.entero(datos?.ventasMes ?? 0)} detalle={t('kpi.ventasDetalle')} />
      </KpiStrip>

      {/* Móvil: la cabecera del kit solo lleva título y una acción; el estado y los botones van aquí. */}
      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        {badgeEstado}
        {botonEditar}
        {botonVender}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Tarjeta
            titulo={t('producto.titulo')}
            icono={Package}
            accion={
              uuid ? (
                <Link href={rutaProducto(uuid)} className="rounded-md text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  {t('producto.verProducto')}
                </Link>
              ) : undefined
            }
          >
            <ListaDatos etiqueta={t('producto.titulo')}>
              <FilaDato etiqueta={t('producto.producto')} valor={plan.nombre} href={uuid ? rutaProducto(uuid) : undefined} />
              <FilaDato etiqueta={t('producto.sku')} valor={plan.sku ?? '—'} />
              <FilaDato etiqueta={t('producto.tipo')} valor={plan.productId ? t('producto.tipoValor') : '—'} />
              <FilaDato etiqueta={t('producto.precio')} valor={plan.precio !== null ? formato.moneda(plan.precio) : '—'} tono="fuerte" />
              <FilaDato etiqueta={t('producto.categoria')} valor={plan.categoria ?? t('producto.sinCategoria')} />
            </ListaDatos>
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle px-3 py-2 text-xs text-info-text">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
              {t('producto.nota')}
            </p>
          </Tarjeta>

          <Tarjeta
            titulo={t('reglas.titulo')}
            icono={Settings2}
            accion={
              uuidEditable ? (
                <Link
                  href={rutaEditarProducto(uuidEditable)}
                  aria-label={t('reglas.editarAria')}
                  className="rounded-md text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {t('reglas.editar')}
                </Link>
              ) : undefined
            }
          >
            <ListaDatos etiqueta={t('reglas.titulo')}>
              <FilaDato etiqueta={t('reglas.duracion')} valor={textos.duracion(r)} />
              <FilaDato etiqueta={t('reglas.renovacion')} valor={t('reglas.renovacionValor')} />
              <FilaDato etiqueta={t('reglas.cobro')} valor={t(`reglas.cobroValor.${r.billingMode}`)} />
              <FilaDato etiqueta={t('reglas.gracia')} valor={textos.gracia(r)} />
              <FilaDato etiqueta={t('reglas.activacion')} valor={textos.activacion(r)} />
              <FilaDato etiqueta={t('reglas.congelamientos')} valor={textos.congelamientos(r)} />
              <FilaDato etiqueta={t('reglas.sedes')} valor={textos.sedes(r, true)} />
              <FilaDato etiqueta={t('reglas.horario')} valor={textos.horario(r) ?? t('reglas.horarioTodo')} />
              <FilaDato etiqueta={t('reglas.limite')} valor={textos.limite(r)} />
            </ListaDatos>
          </Tarjeta>

          <Tarjeta
            titulo={t('ultimas.titulo')}
            icono={Users}
            sinRelleno
            accion={
              (datos?.ultimas.length ?? 0) > 0 ? (
                <Link
                  href={`${RUTA_MEMBRESIAS}/membresias?plan=${plan.id}`}
                  className="rounded-md text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {t('ultimas.verTodas')}
                </Link>
              ) : undefined
            }
          >
            {(datos?.ultimas.length ?? 0) === 0 ? (
              <EmptyState compacto titulo={t('ultimas.vacioTitulo')} descripcion={t('ultimas.vacio')} icono={Users} />
            ) : (
              <ul className="divide-y divide-line">
                {datos?.ultimas.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={rutaDetalle(m.id)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{m.cliente.nombre}</span>
                        <span className="block truncate text-xs text-fg-secondary">
                          {t('ultimas.vigencia', { desde: m.desde ? formato.fecha(m.desde) : '—', hasta: formato.fecha(m.hasta) })}
                        </span>
                      </span>
                      <BadgeEstadoMembresia estado={m.estadoVisual} dias={m.dias} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Tarjeta titulo={t('conecta.titulo')} icono={History}>
            <div className="flex flex-col gap-2">
              <RelatedLinkCard
                icono={Package}
                etiqueta={t('conecta.producto')}
                valor={plan.sku ?? '—'}
                href={uuid ? rutaProducto(uuid) : undefined}
                textoAccion={t('conecta.abrir')}
                tono={plan.productId ? 'neutral' : 'warning'}
              />
              <RelatedLinkCard
                icono={Receipt}
                etiqueta={t('conecta.ventas')}
                valor={t('conecta.ventasValor', { n: datos?.ventasMes ?? 0, importe: formato.monedaCompacta(datos?.ingresosMes ?? 0) })}
                href={`${RUTA_MEMBRESIAS}/pagos`}
                textoAccion={t('conecta.abrir')}
              />
              <RelatedLinkCard
                icono={Users}
                etiqueta={t('conecta.membresias')}
                valor={t('conecta.membresiasValor', { n: plan.membresiasActivas })}
                href={`${RUTA_MEMBRESIAS}/membresias?plan=${plan.id}`}
                textoAccion={t('conecta.abrir')}
              />
            </div>
          </Tarjeta>
          <Tarjeta titulo={t('cambios.titulo')} icono={Info}>
            <p className="text-sm text-fg-secondary">{t('cambios.texto')}</p>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
