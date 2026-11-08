"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Globe, Pencil, Plug, Plus, Power, Trash2, Zap } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase/config";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AvisoTonal,
  ConfirmDialog,
  DataTable,
  ListCard,
  StatusBadge,
  clasesBoton,
  iconoMetodoPago,
  useEsEscritorio,
  type AccionFila,
  type ColumnaTabla,
} from "@/components/kit";
import { accionQuitarMetodo } from "./metodosPagoLogica";
import { SucursalesMetodoBadges } from "./SucursalesMetodoPago";
import type { OrganizationPaymentMethod, PaymentMethod } from "./PaymentMethodsPage";
import { useDatosListaMetodos } from "./useDatosListaMetodos";
import {
  construirFilasMetodos,
  esPasarelaConectable,
  estadoListaMetodos,
  filtrarFilasMetodos,
  moverMetodo,
  resumirMetodos,
  type DestinoMetodo,
  type FilaMetodoPago,
} from "@/lib/finanzas/metodosPagoLista";
import { rutaConectar } from "@/lib/services/integrations/conexiones/rutaAsistente";

const RUTA_METODOS = "/app/finanzas/metodos-pago";
const RUTA_CONEXIONES = "/app/integraciones/conexiones";

export interface PaymentMethodsListProps {
  /** Organización de la sesión (para contar sus pagos aunque aún no tenga métodos). */
  organizationId?: number | null;
  /** Catálogo visible (nombres de los códigos usados sin configurar). */
  paymentMethods: PaymentMethod[];
  orgPaymentMethods: OrganizationPaymentMethod[];
  /** Compatibilidad: la lista ya no muestra la columna de recomendación por país. */
  recommendedMethods?: Array<{ code?: string; payment_method_code?: string }>;
  countryCode?: string | null;
  onEdit: (method: OrganizationPaymentMethod) => void;
  /** «Agregar» de un código usado sin configurar, o del estado vacío. */
  onAgregar?: (codigo?: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
  /** La carga de los métodos falló: `sinPermiso` si RLS la negó. */
  errorCarga?: "error" | "sinPermiso" | null;
  /** Puede crear, editar, activar y quitar (`billing_management`, resuelto en el servidor). */
  puedeGestionar?: boolean;
  /** Sube para volver a leer los datos de apoyo (bancos, conexiones, pagos). */
  recarga?: number;
}

/**
 * Lista de Métodos de pago (Figma `1010:85721` escritorio, `1010:86844` móvil).
 * Escritorio: `DataTable` Método · Tipo · Entra a · Caja abierta · Referencia ·
 * POS · Tienda web · «⋯». Móvil: `ListCard` con destino y reglas, canales,
 * estado y «⋯». Aviso «N métodos usados y sin configurar · Revisar».
 *
 * Las escrituras son las de siempre, desde el navegador con RLS
 * (`organization_payment_methods`, permiso `billing_management`):
 * activar/desactivar (`is_active`, lo que lee el POS), tienda web
 * (`show_on_website`), orden (`website_display_order`, el que lee el POS) y
 * quitar (eliminar solo sin pagos; el trigger 20261107220000 lo impide con pagos).
 */
export default function PaymentMethodsList({
  organizationId: organizationIdProp,
  paymentMethods,
  orgPaymentMethods,
  onEdit,
  onAgregar,
  isLoading,
  onRefresh,
  errorCarga = null,
  puedeGestionar = true,
  recarga = 0,
}: PaymentMethodsListProps) {
  const t = useTranslations("finanzasMetodosPagoLista");
  const tQuitar = useTranslations("finanzasCobrosR2");
  const { toast } = useToast();
  const router = useRouter();
  const escritorio = useEsEscritorio();

  const [localOrgMethods, setLocalOrgMethods] = useState<OrganizationPaymentMethod[]>(orgPaymentMethods);
  useEffect(() => setLocalOrgMethods(orgPaymentMethods), [orgPaymentMethods]);
  const [actualizando, setActualizando] = useState<string | null>(null);
  const [soloRevisar, setSoloRevisar] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<OrganizationPaymentMethod | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Pagos del método a quitar: null mientras se cuentan o si no se pudieron contar
  // (entonces se trata como «con pagos»: se desactiva, no se borra).
  const [pagosTarget, setPagosTarget] = useState<number | null>(null);
  const [contandoPagos, setContandoPagos] = useState(false);

  const organizationId = organizationIdProp ?? orgPaymentMethods[0]?.organization_id ?? null;
  const idsConexion = useMemo(
    () => localOrgMethods.map((m) => m.integration_connection_id).filter((x): x is string => !!x),
    [localOrgMethods],
  );
  const apoyo = useDatosListaMetodos(organizationId ?? undefined, idsConexion, recarga);

  const filas = useMemo(
    () =>
      construirFilasMetodos({
        metodos: localOrgMethods,
        bancos: apoyo.bancos,
        conexiones: apoyo.conexiones,
        exigeCaja: apoyo.exigeCaja,
        usoPorMetodo: apoyo.usoPorMetodo,
        catalogo: paymentMethods,
      }),
    [localOrgMethods, apoyo, paymentMethods],
  );
  const resumen = useMemo(() => resumirMetodos(filas), [filas]);
  const visibles = useMemo(() => filtrarFilasMetodos(filas, soloRevisar), [filas, soloRevisar]);
  useEffect(() => {
    if (soloRevisar && resumen.incompletos === 0) setSoloRevisar(false);
  }, [soloRevisar, resumen.incompletos]);

  const estado = estadoListaMetodos({
    cargando: isLoading,
    error: errorCarga === "error",
    sinPermiso: errorCarga === "sinPermiso",
    total: filas.length,
    visibles: visibles.length,
  });

  // ─── Escrituras (las mismas de antes) ──────────────────────────────────────

  const handleToggleActive = async (orgMethod: OrganizationPaymentMethod) => {
    const nuevo = !orgMethod.is_active;
    setLocalOrgMethods((prev) => prev.map((m) => (m.id === orgMethod.id ? { ...m, is_active: nuevo } : m)));
    setActualizando(`activo-${orgMethod.id}`);
    try {
      const { error } = await supabase.from("organization_payment_methods").update({ is_active: nuevo }).eq("id", orgMethod.id);
      if (error) throw error;
      toast({ title: nuevo ? t("toast.activado") : t("toast.desactivado") });
    } catch (error: unknown) {
      setLocalOrgMethods((prev) => prev.map((m) => (m.id === orgMethod.id ? { ...m, is_active: !nuevo } : m)));
      console.error("Error al actualizar estado:", error);
      toast({ title: t("toast.errorTitulo"), description: t("toast.errorEstado"), variant: "destructive" });
    } finally {
      setActualizando(null);
    }
  };

  const handleToggleWebsite = async (orgMethod: OrganizationPaymentMethod) => {
    const nuevo = !orgMethod.show_on_website;
    setLocalOrgMethods((prev) => prev.map((m) => (m.id === orgMethod.id ? { ...m, show_on_website: nuevo } : m)));
    setActualizando(`web-${orgMethod.id}`);
    try {
      const { error } = await supabase.from("organization_payment_methods").update({ show_on_website: nuevo }).eq("id", orgMethod.id);
      if (error) throw error;
      toast({ title: nuevo ? t("toast.webVisible") : t("toast.webOculto") });
    } catch (error: unknown) {
      setLocalOrgMethods((prev) => prev.map((m) => (m.id === orgMethod.id ? { ...m, show_on_website: !nuevo } : m)));
      console.error("Error al actualizar visibilidad:", error);
      toast({ title: t("toast.errorTitulo"), description: t("toast.errorWeb"), variant: "destructive" });
    } finally {
      setActualizando(null);
    }
  };

  /** Subir/Bajar: reescribe `website_display_order` = posición, como hacía el arrastre. */
  const mover = async (fila: FilaMetodoPago, direccion: -1 | 1) => {
    const orden = moverMetodo(filas, fila.id, direccion);
    if (!orden) return;
    const anteriores = localOrgMethods;
    setLocalOrgMethods((prev) => prev.map((m) => (orden.includes(m.id) ? { ...m, website_display_order: orden.indexOf(m.id) } : m)));
    try {
      for (const [indice, id] of orden.entries()) {
        const { error } = await supabase.from("organization_payment_methods").update({ website_display_order: indice }).eq("id", id);
        if (error) throw error;
      }
      toast({ title: t("toast.orden") });
    } catch (error: unknown) {
      setLocalOrgMethods(anteriores);
      console.error("Error al actualizar orden:", error);
      toast({ title: t("toast.errorTitulo"), description: t("toast.errorOrden"), variant: "destructive" });
    }
  };

  // «Quitar» (Finanzas ronda 2, A12): con pagos se desactiva; sin pagos se elimina.
  const abrirQuitar = async (method: OrganizationPaymentMethod) => {
    setDeleteTarget(method);
    setPagosTarget(null);
    setContandoPagos(true);
    try {
      const { count, error } = await supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", method.organization_id)
        .eq("method", method.payment_method_code);
      if (error) throw error;
      setPagosTarget(count ?? 0);
    } catch (error: unknown) {
      console.error("Error al contar los pagos del método:", error);
      setPagosTarget(null);
    } finally {
      setContandoPagos(false);
    }
  };

  const accionQuitar = deleteTarget
    ? accionQuitarMetodo({ esSistema: Boolean(deleteTarget.payment_method?.is_system), pagos: pagosTarget, activo: deleteTarget.is_active })
    : "ninguna";

  const desactivarTarget = async () => {
    if (!deleteTarget) return;
    await handleToggleActive({ ...deleteTarget, is_active: true });
    setDeleteTarget(null);
  };

  // Solo se borra el VÍNCULO de la organización, nunca el catálogo global (GO-sec 2026-09-28).
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      // `.select()` obligatorio: un DELETE que RLS bloquea no da error, solo 0 filas.
      const { data: borradas, error } = await supabase
        .from("organization_payment_methods")
        .delete()
        .eq("id", deleteTarget.id)
        .select("id");
      if (error) {
        // Trigger 20261107220000: la base rechaza borrar un método con pagos.
        if (/metodo_con_pagos/.test(String(error.message))) throw new Error(tQuitar("metodos.quitar.conPagosError"));
        throw error;
      }
      if (!borradas || borradas.length === 0) throw new Error(t("toast.sinPermisoEliminar"));
      setLocalOrgMethods((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      toast({ title: t("toast.eliminado", { nombre: nombreDe(deleteTarget) }) });
      setDeleteTarget(null);
    } catch (error: unknown) {
      console.error("Error al eliminar método de pago:", error);
      toast({
        title: t("toast.errorTitulo"),
        description: error instanceof Error ? error.message : t("toast.errorEliminar"),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const nombreDe = (m: OrganizationPaymentMethod) => filas.find((f) => f.original?.id === m.id)?.nombre ?? m.payment_method_code;

  // ─── Textos de la fila ─────────────────────────────────────────────────────

  const textoDestino = (d: DestinoMetodo): string => {
    switch (d.tipo) {
      case "caja":
        return t("destino.caja");
      case "banco":
        if (!d.banco) return t("destino.bancoDesconocido");
        return d.ultimos ? t("destino.banco", { banco: d.banco, ultimos: d.ultimos }) : d.banco;
      case "pasarela":
        return d.conectada ? t("destino.pasarela") : t("destino.sinConectar");
      case "cxc":
        return t("destino.cxc");
      default:
        return t("destino.sinDestino");
    }
  };

  const textoCanales = (f: FilaMetodoPago): string => {
    const lista = [f.canales.pos && t("canales.pos"), f.canales.web && t("canales.web")].filter(Boolean);
    return lista.length ? lista.join(" · ") : t("canales.ninguno");
  };

  const subtituloMovil = (f: FilaMetodoPago): string => {
    if (f.sinConfigurar) return t("usadoSinConfigurar", { n: f.pagos ?? 0 });
    const partes = [textoDestino(f.destino)];
    if (f.cajaObligatoria) partes.push(t("cajaMovil"));
    if (f.referencia === "obligatoria") partes.push(t("referenciaMovil"));
    return partes.join(" · ");
  };

  const segundaLinea = (f: FilaMetodoPago): string => {
    if (f.sinConfigurar) return t("usadoSinConfigurar", { n: f.pagos ?? 0 });
    const partes = [t("codigo", { codigo: f.codigo })];
    if (f.destino.tipo === "pasarela" && f.destino.conexion) partes.push(f.destino.conexion);
    if (f.incompleta) partes.push(t("usadoSinDestino", { n: f.pagos ?? 0 }));
    return partes.join(" · ");
  };

  const estadoBadge = (f: FilaMetodoPago) =>
    f.sinConfigurar ? (
      <StatusBadge estado="pendiente" etiqueta={t("estado.sinConfigurar")} tono="advertencia" tamano="sm" />
    ) : (
      <StatusBadge estado={f.activo ? "activa" : "inactiva"} etiqueta={f.activo ? t("estado.activa") : t("estado.inactiva")} tamano="sm" />
    );

  // ─── Acciones ──────────────────────────────────────────────────────────────

  const configuradas = filas.filter((f) => f.original);
  const accionesDe = (f: FilaMetodoPago): AccionFila[] => {
    if (!puedeGestionar) return [];
    if (!f.original) {
      return onAgregar ? [{ id: "agregar", etiqueta: t("acciones.agregar"), icono: Plus, onSelect: () => onAgregar(f.codigo) }] : [];
    }
    const m = f.original as OrganizationPaymentMethod;
    const posicion = configuradas.findIndex((x) => x.id === f.id);
    const conConexion = Boolean(m.integration_connection_id || (typeof m.settings?.gateway === "string" && m.settings.gateway));
    return [
      { id: "editar", etiqueta: t("acciones.editar"), icono: Pencil, onSelect: () => onEdit(m) },
      { id: "subir", etiqueta: t("acciones.subir"), icono: ArrowUp, onSelect: () => void mover(f, -1), oculta: posicion <= 0 },
      {
        id: "bajar",
        etiqueta: t("acciones.bajar"),
        icono: ArrowDown,
        onSelect: () => void mover(f, 1),
        oculta: posicion < 0 || posicion >= configuradas.length - 1,
      },
      {
        id: "conectar",
        etiqueta: t("acciones.conectar"),
        icono: Zap,
        separadorAntes: true,
        oculta: !esPasarelaConectable(m.payment_method_code),
        // Asistente NUEVO de Conexiones con el proveedor elegido y regreso aquí (Frente INT).
        onSelect: () =>
          router.push(
            rutaConectar(m.payment_method_code, { volver: RUTA_METODOS }) ??
              `${RUTA_CONEXIONES}/nueva?provider=${m.payment_method_code.toLowerCase()}&return=${RUTA_METODOS}`,
          ),
      },
      { id: "verConexion", etiqueta: t("acciones.verConexion"), icono: Plug, oculta: !conConexion, onSelect: () => router.push(RUTA_CONEXIONES) },
      // En escritorio los interruptores están en la fila; en el celular van aquí.
      {
        id: "activo",
        etiqueta: m.is_active ? t("acciones.desactivar") : t("acciones.activar"),
        icono: Power,
        separadorAntes: true,
        oculta: escritorio,
        onSelect: () => void handleToggleActive(m),
      },
      {
        id: "web",
        etiqueta: m.show_on_website ? t("acciones.ocultarWeb") : t("acciones.mostrarWeb"),
        icono: Globe,
        oculta: escritorio,
        onSelect: () => void handleToggleWebsite(m),
      },
      { id: "quitar", etiqueta: t("acciones.quitar"), icono: Trash2, destructiva: true, oculta: f.esSistema, onSelect: () => void abrirQuitar(m) },
    ];
  };

  // ─── Columnas (escritorio) ─────────────────────────────────────────────────

  const columnas: ColumnaTabla<FilaMetodoPago>[] = [
    {
      id: "metodo",
      encabezado: t("columnas.metodo"),
      celda: (f) => {
        const Icono = iconoMetodoPago(f.codigo);
        return (
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
              <Icono className="size-4" strokeWidth={1.5} />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-fg">{f.nombre}</span>
              <span className="truncate text-xs text-fg-secondary">{segundaLinea(f)}</span>
              {f.original?.branch_ids ? (
                <span className="pt-0.5">
                  <SucursalesMetodoBadges organizationId={f.original.organization_id} branchIds={f.original.branch_ids} />
                </span>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      id: "tipo",
      encabezado: t("columnas.tipo"),
      celda: (f) => (
        <Badge tono="neutro" tamano="sm">
          {t(`tipos.${f.tipo}`)}
        </Badge>
      ),
    },
    {
      id: "entraA",
      encabezado: t("columnas.entraA"),
      celda: (f) =>
        f.sinConfigurar ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <span className={f.incompleta ? "text-warning-text" : undefined}>{textoDestino(f.destino)}</span>
        ),
    },
    {
      id: "caja",
      encabezado: t("columnas.cajaAbierta"),
      ocultarDebajo: "xl",
      celda: (f) => (f.sinConfigurar ? <span className="text-fg-muted">—</span> : f.cajaObligatoria ? t("caja.obligatoria") : t("caja.no")),
    },
    {
      id: "referencia",
      encabezado: t("columnas.referencia"),
      ocultarDebajo: "xl",
      celda: (f) => (f.referencia === "noAplica" ? <span className="text-fg-muted">—</span> : t(`referencia.${f.referencia}`)),
    },
    {
      id: "pos",
      encabezado: t("columnas.pos"),
      alinear: "centro",
      celda: (f) =>
        f.original ? (
          <Switch
            checked={f.activo}
            disabled={!puedeGestionar || actualizando === `activo-${f.original.id}`}
            onCheckedChange={() => void handleToggleActive(f.original as OrganizationPaymentMethod)}
            aria-label={t("aria.pos", { nombre: f.nombre })}
          />
        ) : null,
    },
    {
      id: "web",
      encabezado: t("columnas.web"),
      alinear: "centro",
      celda: (f) =>
        f.original ? (
          <Switch
            checked={f.original.show_on_website === true}
            disabled={!puedeGestionar || actualizando === `web-${f.original.id}`}
            onCheckedChange={() => void handleToggleWebsite(f.original as OrganizationPaymentMethod)}
            aria-label={t("aria.web", { nombre: f.nombre })}
          />
        ) : null,
    },
  ];

  const tarjeta = (f: FilaMetodoPago) => (
    <ListCard
      icono={iconoMetodoPago(f.codigo)}
      titulo={f.nombre}
      subtitulo={subtituloMovil(f)}
      valor={f.sinConfigurar ? undefined : <span className="text-sm font-medium text-fg">{textoCanales(f)}</span>}
      estado={estadoBadge(f)}
      acciones={accionesDe(f)}
      className={f.incompleta ? "border-line-warning" : undefined}
    />
  );

  const listaPagos = resumen.detalle.map((d) => t("aviso.item", { nombre: d.nombre, n: d.pagos })).join(", ");

  return (
    <div className="flex flex-col gap-4" data-prueba="lista-metodos-pago">
      {!puedeGestionar && estado !== "sinPermiso" && (
        <AvisoTonal tono="informacion" compacto titulo={t("soloLectura.titulo")} descripcion={t("soloLectura.descripcion")} />
      )}

      {estado !== "cargando" && estado !== "error" && estado !== "sinPermiso" && resumen.incompletos > 0 && (
        <AvisoTonal
          tono="advertencia"
          compacto={!escritorio}
          titulo={t("aviso.titulo", { n: resumen.incompletos })}
          descripcion={escritorio ? t("aviso.descripcion", { lista: listaPagos, total: resumen.pagosIncompletos }) : undefined}
          accion={{ etiqueta: soloRevisar ? t("aviso.verTodos") : t("aviso.revisar"), onClick: () => setSoloRevisar((v) => !v) }}
        />
      )}

      <DataTable<FilaMetodoPago>
        etiqueta={t("lista.etiqueta")}
        columnas={columnas}
        filas={visibles}
        obtenerId={(f) => f.id}
        estado={estado}
        etiquetaFila={(f) => f.nombre}
        acciones={accionesDe}
        accionesRapidas={(f) =>
          f.sinConfigurar && puedeGestionar && onAgregar ? (
            <button type="button" className={clasesBoton({ variante: "secundario", tamano: "sm" })} onClick={() => onAgregar(f.codigo)}>
              {t("acciones.agregar")}
            </button>
          ) : null
        }
        tonoFila={(f) => (f.incompleta ? "advertencia" : undefined)}
        atributosFila={(f) => ({ "data-metodo": f.codigo, "data-incompleta": f.incompleta ? "true" : undefined })}
        tarjetaMovil={(f) => tarjeta(f)}
        filasEsqueleto={5}
        onReintentar={onRefresh}
        onLimpiarFiltros={() => setSoloRevisar(false)}
        vacio={{
          titulo: t("estados.vacioTitulo"),
          descripcion: t("estados.vacioDescripcion"),
          accion: puedeGestionar && onAgregar ? { etiqueta: t("acciones.nuevo"), icono: Plus, onClick: () => onAgregar() } : undefined,
        }}
        error={{ titulo: t("estados.errorTitulo"), descripcion: t("estados.errorDescripcion") }}
        sinPermiso={{ titulo: t("estados.sinPermisoTitulo"), descripcion: t("estados.sinPermisoDescripcion") }}
      />

      <ConfirmDialog
        abierto={!!deleteTarget}
        onAbiertoChange={(open) => !open && !isDeleting && setDeleteTarget(null)}
        titulo={
          contandoPagos
            ? tQuitar("metodos.quitar.titulo")
            : accionQuitar === "eliminar"
              ? tQuitar("metodos.quitar.tituloEliminar")
              : accionQuitar === "desactivar"
                ? tQuitar("metodos.quitar.tituloDesactivar")
                : tQuitar("metodos.quitar.titulo")
        }
        descripcion={(() => {
          const nombre = deleteTarget ? nombreDe(deleteTarget) : "";
          if (contandoPagos) return tQuitar("metodos.quitar.contando");
          if (accionQuitar === "eliminar") return tQuitar("metodos.quitar.descripcionEliminar", { nombre });
          if (accionQuitar === "desactivar") {
            return pagosTarget === null
              ? tQuitar("metodos.quitar.descripcionDesactivarSinConteo", { nombre })
              : tQuitar("metodos.quitar.descripcionDesactivar", { nombre, n: pagosTarget });
          }
          return tQuitar("metodos.quitar.descripcionNinguna", { nombre });
        })()}
        textoConfirmar={
          accionQuitar === "eliminar"
            ? tQuitar("metodos.quitar.eliminar")
            : accionQuitar === "desactivar"
              ? tQuitar("metodos.quitar.desactivar")
              : tQuitar("metodos.quitar.entendido")
        }
        tono={accionQuitar === "eliminar" ? "peligro" : "advertencia"}
        icono={Trash2}
        cargando={isDeleting || contandoPagos}
        onConfirmar={() =>
          accionQuitar === "eliminar" ? handleDelete() : accionQuitar === "desactivar" ? desactivarTarget() : setDeleteTarget(null)
        }
      />
    </div>
  );
}
