"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase/config";
import { Dialogo, FormField, SeccionPlegable, clasesBoton } from "@/components/kit";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { PaymentMethod, OrganizationPaymentMethod } from "./PaymentMethodsPage";
import { claveErrorMetodoPago, requiereReferenciaMetodo } from "@/lib/finanzas/metodosPagoOrganizacion";
import { SelectorSucursalesMetodoPago } from "./SucursalesMetodoPago";
import { normalizarSucursales, esColumnaAusente } from "@/lib/finanzas/metodosPagoAlcance";
import { rutaConectar } from '@/lib/services/integrations/conexiones/rutaAsistente';

interface PaymentMethodFormProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizationId: number;
  globalMethods: PaymentMethod[];
  selectedMethod: OrganizationPaymentMethod | null;
  onSaveComplete: () => void;
}

// Métodos manuales que SÍ se pueden crear directamente
const MANUAL_METHODS = ['cash', 'transfer', 'card'];

// Integraciones de pago disponibles con su provider_id para redirección
const PAYMENT_INTEGRATIONS = [
  { code: 'wompi', name: 'Wompi', providerId: '46c3d81f-c515-49ed-9067-958bcd50e946' },
  { code: 'payu', name: 'PayU', providerId: '1084bdca-1c07-4989-a3d8-8169de72e6c0' },
  { code: 'mercadopago', name: 'Mercado Pago', providerId: 'ef7a28a1-f698-4518-91ed-c15166728bd3' },
  { code: 'stripe', name: 'Stripe', providerId: '7d9abb20-5bbb-410c-b4da-c2231511be34' },
  { code: 'paypal', name: 'PayPal', providerId: '18bee38f-9d27-4360-b2e3-3274bbb0b2d9' },
  { code: 'bancolombia_qr', name: 'Bancolombia QR', providerId: '4befaa82-4a82-459d-bb9c-f508aa953542' },
  { code: 'breb_qr', name: 'Bre-B (Mono)', providerId: '487d94de-4273-4b42-a49b-27250ed05fc7' },
  { code: 'redeban_qr', name: 'Redeban QR', providerId: 'a32ba5c2-064a-4041-b368-c4a2f1f8e4c9' },
  // Integraciones Bold - Links de pago y QR
  { code: 'bold_link', name: 'Bold (Link de Pago)', providerId: '67e3749b-d8e5-4c0a-ab23-309e46064cad' },
  { code: 'bold_qr', name: 'Bold QR', providerId: '67e3749b-d8e5-4c0a-ab23-309e46064cad' },
];

/** Iconos que la tienda web sabe pintar (`website_icon`). */
const ICONOS_TIENDA = ['banknotes', 'coins', 'credit-card', 'building-bank', 'arrow-left-right', 'wallet', 'smartphone', 'qr-code', 'globe', 'zap', 'truck', 'store'] as const;

/** Claves de `settings.account_mapping` (las mismas de siempre). */
type ClaveMapeo = 'bank_account_id' | 'receivable_account' | 'income_account' | 'cash_account';

interface CuentaContable { account_code: string; name: string; type: string }
interface CuentaBancaria { id: number; name: string; bank_name: string; account_number: string }

interface Valores {
  payment_method_code: string;
  is_active: boolean;
  gateway: string;
  requires_reference: boolean;
  name: string;
  code: string;
  show_on_website: boolean;
  website_display_order: number;
  website_display_name: string;
  website_description: string;
  website_icon: string;
}

const CLASE_CONTROL = "h-10 border-line-strong bg-surface";
const NINGUNA = "none";

function valoresDe(m: OrganizationPaymentMethod | null): Valores {
  return {
    payment_method_code: m?.payment_method_code || "",
    is_active: m?.is_active ?? true,
    gateway: m?.settings?.gateway || "",
    requires_reference: requiereReferenciaMetodo(m?.settings, m?.payment_method?.requires_reference),
    name: m?.settings?.display_name || m?.payment_method?.name || "",
    code: "",
    show_on_website: m?.show_on_website ?? true,
    website_display_order: m?.website_display_order ?? 0,
    website_display_name: m?.website_display_name || "",
    website_description: m?.website_description || "",
    website_icon: m?.website_icon || "",
  };
}

/**
 * Diálogo «Nuevo / Editar método de pago» (Finanzas ronda 2, A12; captura
 * 82-finanzas-r2-12). Antes era una pestaña de la página. Guarda igual que
 * antes: el nombre y «pedir referencia» van en el vínculo de la organización
 * (`settings`), nunca en el catálogo global; un método personalizado nuevo lo
 * crea la RPC. El pie ofrece «Desactivar» (o «Activar»): un método no se borra
 * desde aquí; eliminarlo solo se ofrece en la lista y si no tiene pagos.
 */
export default function PaymentMethodForm({
  abierto,
  onAbiertoChange,
  organizationId,
  globalMethods,
  selectedMethod,
  onSaveComplete,
}: PaymentMethodFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations("finanzasCobrosR2");
  const tErr = useTranslations("metodosPagoSeguridad");
  const [isSaving, setIsSaving] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [isNewMethod, setIsNewMethod] = useState(false);
  const [valores, setValores] = useState<Valores>(() => valoresDe(selectedMethod));
  const [errores, setErrores] = useState<Partial<Record<"payment_method_code" | "name" | "code", string>>>({});
  const [gatewayConfig, setGatewayConfig] = useState<Record<string, unknown>>({});
  const [accountMapping, setAccountMapping] = useState<Record<string, string>>({});
  // Sucursales del método (20261028180000): null = todas.
  const [sucursales, setSucursales] = useState<number[] | null>(normalizarSucursales(selectedMethod?.branch_ids));
  const [cuentasContables, setCuentasContables] = useState<CuentaContable[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);

  const currentMethod = globalMethods.find((m) => m.code === valores.payment_method_code);
  const editando = selectedMethod !== null;
  const hasMethodSelected = Boolean(valores.payment_method_code) || isNewMethod || editando;

  // Al abrir: valores del método elegido (o vacíos para uno nuevo).
  useEffect(() => {
    if (!abierto) return;
    setIsNewMethod(false);
    setErrores({});
    setValores(valoresDe(selectedMethod));
    setGatewayConfig(selectedMethod?.settings?.gateway_config || {});
    setAccountMapping(selectedMethod?.settings?.account_mapping || {});
    setSucursales(normalizarSucursales(selectedMethod?.branch_ids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, selectedMethod?.id]);

  // Cuentas para la sección de contabilidad (las mismas lecturas que AccountMappingForm).
  useEffect(() => {
    if (!abierto || !organizationId) return;
    let vigente = true;
    void supabase
      .from("chart_of_accounts")
      .select("account_code, name, type")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("account_code", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error("Error al cargar cuentas contables:", error);
        if (vigente) setCuentasContables((data ?? []) as CuentaContable[]);
      });
    void supabase
      .from("bank_accounts")
      .select("id, name, bank_name, account_number")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("bank_name", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error("Error al cargar cuentas bancarias:", error);
        if (vigente) setCuentasBancarias((data ?? []) as CuentaBancaria[]);
      });
    return () => {
      vigente = false;
    };
  }, [abierto, organizationId]);

  const poner = <K extends keyof Valores>(campo: K, valor: Valores[K]) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    if (campo === "name" || campo === "code" || campo === "payment_method_code") setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  const ponerMapeo = (clave: ClaveMapeo, valor: string) => {
    setAccountMapping((m) => {
      const siguiente = { ...m };
      if (!valor || valor === NINGUNA) delete siguiente[clave];
      else siguiente[clave] = valor;
      return siguiente;
    });
  };

  // Manejar cambio en la selección de método de pago
  const handlePaymentMethodChange = (code: string) => {
    // Si seleccionó una integración → redirigir a la página de conexión
    if (code.startsWith('integration_')) {
      const integrationCode = code.replace('integration_', '');
      const integration = PAYMENT_INTEGRATIONS.find(i => i.code === integrationCode);
      if (integration) {
        // Asistente NUEVO de Conexiones con el proveedor elegido y regreso a Métodos de pago
        // (Frente INT). Bold y los QR propios siguen en el formulario avanzado.
        router.push(
          rutaConectar(integration.code, { volver: '/app/finanzas/metodos-pago' }) ??
            `/app/integraciones/conexiones/nueva?provider=${integration.providerId}&return=/app/finanzas/metodos-pago`,
        );
      }
      return;
    }

    const isNew = code === "new";
    setIsNewMethod(isNew);
    setErrores({});
    if (isNew) {
      setValores({ ...valoresDe(null), payment_method_code: "" });
      return;
    }
    const method = globalMethods.find(m => m.code === code);
    if (method) {
      setValores({
        ...valoresDe(null),
        payment_method_code: method.code,
        name: method.name,
        code: method.code,
        requires_reference: method.requires_reference,
      });
      setGatewayConfig({});
      setAccountMapping({});
    }
  };

  const validar = (): boolean => {
    const e: typeof errores = {};
    if (isNewMethod) {
      if (valores.name.trim().length < 3) e.name = t("metodo.errores.nombre");
      if (valores.code.trim().length < 2) e.code = t("metodo.errores.codigo");
    } else if (!valores.payment_method_code) {
      e.payment_method_code = t("metodo.errores.metodo");
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  // Envío del formulario
  const onSubmit = async () => {
    if (!validar()) return;
    const values = { ...valores };
    try {
      setIsSaving(true);

      if (!organizationId) {
        throw new Error("No se pudo determinar el ID de la organización");
      }

      // Si es un nuevo método personalizado. GO-sec (2026-09-28): el código del
      // catálogo global y el vínculo de la organización los crea la base en una
      // transacción, con el permiso de facturación resuelto allí.
      if (isNewMethod && values.name && values.code) {
        const { data: codigoCreado, error: rpcError } = await supabase.rpc("fn_metodo_pago_personalizado_crear", {
          p_organization_id: organizationId,
          p_code: values.code,
          p_name: values.name,
          p_requires_reference: values.requires_reference,
        });
        if (rpcError) throw rpcError;
        values.payment_method_code = (codigoCreado as string) || values.code;
      }

      if (!values.payment_method_code) {
        throw new Error("No se ha seleccionado un método de pago válido");
      }

      // Nombre propio de la organización: solo si difiere del catálogo global.
      const nombreGlobal = selectedMethod?.payment_method?.name ?? currentMethod?.name ?? "";
      const nombreEscrito = (values.name ?? "").trim();
      const nombrePropio = nombreEscrito && nombreEscrito !== nombreGlobal ? nombreEscrito : null;

      const settings = {
        // Se conservan las claves que la pantalla no edita (color, etc.).
        ...(selectedMethod?.settings ?? {}),
        display_name: nombrePropio,
        requires_reference: values.requires_reference,
        gateway: values.gateway === "none" ? "" : values.gateway,
        gateway_config: Object.keys(gatewayConfig).length > 0 ? gatewayConfig : undefined,
        account_mapping: Object.keys(accountMapping).length > 0 ? accountMapping : undefined,
      };

      // `branch_ids` solo viaja si hay restricción o si ya la había (la columna
      // existe); así, antes de aplicar la migración, guardar sigue igual que hoy.
      const conSucursales = sucursales !== null || (selectedMethod?.branch_ids !== undefined && selectedMethod?.branch_ids !== null);
      let avisoSucursales = false;
      const conAlcance = async <R extends { error: unknown }>(escribir: (extra: { branch_ids?: number[] | null }) => PromiseLike<R>): Promise<R> => {
        if (!conSucursales) return await escribir({});
        const r = await escribir({ branch_ids: sucursales });
        if (r.error && esColumnaAusente(r.error, "branch_ids")) {
          avisoSucursales = sucursales !== null;
          return await escribir({});
        }
        return r;
      };

      const payloadWebsite = {
        show_on_website: values.show_on_website ?? true,
        website_display_order: values.website_display_order ?? 0,
        website_display_name: values.website_display_name || null,
        website_description: values.website_description || null,
        website_icon: values.website_icon || null,
      };

      if (!selectedMethod?.id) {
        const { data: existingOrgMethod, error: checkOrgError } = await supabase
          .from("organization_payment_methods")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("payment_method_code", values.payment_method_code)
          .maybeSingle();

        if (checkOrgError) console.error("Error al verificar método existente:", checkOrgError);

        if (existingOrgMethod?.id) {
          const { error } = await conAlcance((extra) => supabase
            .from("organization_payment_methods")
            .update({ is_active: values.is_active, settings, ...payloadWebsite, ...extra, updated_at: new Date().toISOString() })
            .eq("id", existingOrgMethod.id));
          if (error) throw error;
        } else {
          const { error } = await conAlcance((extra) => supabase
            .from("organization_payment_methods")
            .insert({ organization_id: organizationId, payment_method_code: values.payment_method_code, is_active: values.is_active, settings, ...payloadWebsite, ...extra }));
          if (error) throw error;
        }
      } else {
        // GO-sec (2026-09-28): el nombre y «requiere referencia» se guardan en el
        // vínculo de la organización (settings), nunca en el catálogo global
        // `payment_methods`, que comparten todas. `.select()` para detectar un
        // UPDATE que RLS bloquea (0 filas, sin error).
        const { data: filas, error } = await conAlcance((extra) => supabase
          .from("organization_payment_methods")
          .update({ is_active: values.is_active, settings, ...payloadWebsite, ...extra, updated_at: new Date().toISOString() })
          .eq("id", selectedMethod.id)
          .select("id"));
        if (error) throw error;
        if (!filas || filas.length === 0) throw { message: "sin_permiso" };
      }

      toast(avisoSucursales
        ? { title: t("metodo.guardado"), description: t("metodo.avisoSucursales") }
        : { title: t("metodo.guardado") });
      onAbiertoChange(false);
      onSaveComplete();
    } catch (error: unknown) {
      console.error("Error al guardar método de pago:", error);
      const clave = claveErrorMetodoPago(error);
      const detalle = clave ? tErr(clave) : error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
      toast({ title: t("metodo.errores.guardar"), description: detalle, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // «Desactivar» / «Activar» del pie: solo cambia `is_active` del vínculo.
  const alternarActivo = async () => {
    if (!selectedMethod?.id) return;
    const activo = !selectedMethod.is_active;
    setCambiandoEstado(true);
    try {
      const { data: filas, error } = await supabase
        .from("organization_payment_methods")
        .update({ is_active: activo, updated_at: new Date().toISOString() })
        .eq("id", selectedMethod.id)
        .select("id");
      if (error) throw error;
      if (!filas || filas.length === 0) throw { message: "sin_permiso" };
      toast({ title: activo ? t("metodo.activado") : t("metodo.desactivado") });
      onAbiertoChange(false);
      onSaveComplete();
    } catch (error: unknown) {
      console.error("Error al cambiar el estado del método:", error);
      const clave = claveErrorMetodoPago(error);
      toast({ title: t("metodo.errores.estado"), description: clave ? tErr(clave) : undefined, variant: "destructive" });
    } finally {
      setCambiandoEstado(false);
    }
  };

  const nombreMostrado = selectedMethod
    ? selectedMethod.settings?.display_name || selectedMethod.payment_method?.name || selectedMethod.payment_method_code
    : "";
  const ocupado = isSaving || cambiandoEstado;

  const selectCuentaContable = (clave: ClaveMapeo, etiqueta: string, tipo: string, ayuda?: string) => (
    <FormField etiqueta={etiqueta} ayuda={ayuda}>
      {(c) => (
        <Select value={accountMapping[clave] || NINGUNA} onValueChange={(v) => ponerMapeo(clave, v)}>
          <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c["aria-describedby"]} className={CLASE_CONTROL}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NINGUNA}>{t("metodo.sinAsignar")}</SelectItem>
            <SelectGroup>
              {cuentasContables.filter((a) => a.type === tipo).map((a) => (
                <SelectItem key={a.account_code} value={a.account_code}>
                  {a.account_code} · {a.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    </FormField>
  );

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(a) => !ocupado && onAbiertoChange(a)}
      titulo={editando ? t("metodo.tituloEditar") : t("metodo.tituloNuevo")}
      descripcion={editando ? t("metodo.subtitulo", { nombre: nombreMostrado, codigo: selectedMethod?.payment_method_code ?? "" }) : t("metodo.subtituloNuevo")}
      ancho={672}
      primario={{
        etiqueta: t("metodo.guardar"),
        onClick: () => void onSubmit(),
        cargando: isSaving,
        deshabilitada: !hasMethodSelected || cambiandoEstado,
        motivo: !hasMethodSelected ? t("metodo.errores.metodo") : undefined,
      }}
      pie={
        editando ? (
          <button
            type="button"
            className={clasesBoton({ variante: "fantasma", tamano: "md" })}
            onClick={() => void alternarActivo()}
            disabled={ocupado}
          >
            {selectedMethod?.is_active ? t("metodo.desactivar") : t("metodo.activar")}
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        {/* Método: elegir uno del catálogo, ir a una integración o crear uno propio (solo al crear). */}
        {!editando && (
          <FormField etiqueta={t("metodo.campos.metodo")} obligatorio error={errores.payment_method_code}>
            {(c) => (
              <Select value={isNewMethod ? "new" : valores.payment_method_code || undefined} onValueChange={handlePaymentMethodChange}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c["aria-describedby"]} className={CLASE_CONTROL}>
                  <SelectValue placeholder={t("metodo.elegir")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{t("metodo.grupos.manuales")}</SelectLabel>
                    {globalMethods.filter((m) => MANUAL_METHODS.includes(m.code)).map((m) => (
                      <SelectItem key={m.code} value={m.code}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>{t("metodo.grupos.integraciones")}</SelectLabel>
                    {PAYMENT_INTEGRATIONS.map((i) => (
                      <SelectItem key={i.code} value={`integration_${i.code}`}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectItem value="new">{t("metodo.crearPersonalizado")}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}

        {hasMethodSelected && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField etiqueta={t("metodo.campos.nombre")} obligatorio error={errores.name}>
                <Input value={valores.name} onChange={(e) => poner("name", e.target.value)} className={CLASE_CONTROL} />
              </FormField>
              {isNewMethod ? (
                <FormField etiqueta={t("metodo.campos.codigo")} obligatorio error={errores.code} ayuda={t("metodo.ayudas.codigoNuevo")}>
                  <Input value={valores.code} onChange={(e) => poner("code", e.target.value)} className={CLASE_CONTROL} />
                </FormField>
              ) : (
                <FormField etiqueta={t("metodo.campos.codigo")} ayuda={t("metodo.ayudas.codigo")}>
                  <Input value={selectedMethod?.payment_method_code ?? valores.payment_method_code} readOnly disabled className={CLASE_CONTROL} />
                </FormField>
              )}
              <FormField etiqueta={t("metodo.campos.referencia")}>
                {(c) => (
                  <Select value={valores.requires_reference ? "si" : "no"} onValueChange={(v) => poner("requires_reference", v === "si")}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className={CLASE_CONTROL}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="si">{t("metodo.referencia.si")}</SelectItem>
                      <SelectItem value="no">{t("metodo.referencia.no")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </div>

            {/* Sucursales donde se puede cobrar con el método (NULL = todas) */}
            <SelectorSucursalesMetodoPago organizationId={organizationId} valor={sucursales} onChange={setSucursales} />

            <section className="flex flex-col gap-3" aria-labelledby="metodo-contabilidad">
              <h3 id="metodo-contabilidad" className="text-sm font-semibold text-fg">{t("metodo.secciones.contabilidad")}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField etiqueta={t("metodo.campos.entraA")} ayuda={cuentasBancarias.length === 0 ? t("metodo.ayudas.sinBancos") : undefined}>
                  {(c) => (
                    <Select value={accountMapping.bank_account_id || NINGUNA} onValueChange={(v) => ponerMapeo("bank_account_id", v)}>
                      <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c["aria-describedby"]} className={CLASE_CONTROL}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NINGUNA}>{t("metodo.sinAsignar")}</SelectItem>
                        {cuentasBancarias.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.name}
                            {b.bank_name ? ` · ${b.bank_name}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                {selectCuentaContable("receivable_account", t("metodo.campos.cuentaPorCobrar"), "asset")}
              </div>
              <SeccionPlegable
                titulo={t("metodo.secciones.masCuentas")}
                abiertaPorDefecto={Boolean(accountMapping.income_account || accountMapping.cash_account)}
              >
                <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
                  {selectCuentaContable("income_account", t("metodo.campos.cuentaIngresos"), "income")}
                  {selectCuentaContable("cash_account", t("metodo.campos.cuentaCaja"), "asset")}
                </div>
              </SeccionPlegable>
              {cuentasContables.length === 0 && (
                <p className="text-[13px] leading-[18px] text-fg-secondary">
                  {t("metodo.ayudas.sinPlan")}{" "}
                  <Link href="/app/finanzas/contabilidad/plan-cuentas" className="font-medium text-brand underline-offset-2 hover:underline">
                    {t("metodo.ayudas.irPlan")}
                  </Link>
                </p>
              )}
            </section>

            <section className="flex flex-col gap-3" aria-labelledby="metodo-tienda">
              <h3 id="metodo-tienda" className="text-sm font-semibold text-fg">{t("metodo.secciones.tienda")}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  etiqueta={t("metodo.campos.nombreTienda")}
                  ayuda={t("metodo.ayudas.nombreTienda", { nombre: currentMethod?.name || selectedMethod?.payment_method?.name || "—" })}
                >
                  <Input value={valores.website_display_name} onChange={(e) => poner("website_display_name", e.target.value)} className={CLASE_CONTROL} />
                </FormField>
                <FormField etiqueta={t("metodo.campos.visibleTienda")}>
                  {(c) => (
                    <Select value={valores.show_on_website ? "si" : "no"} onValueChange={(v) => poner("show_on_website", v === "si")}>
                      <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className={CLASE_CONTROL}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="si">{t("metodo.si")}</SelectItem>
                        <SelectItem value="no">{t("metodo.no")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <FormField etiqueta={t("metodo.campos.icono")}>
                  {(c) => (
                    <Select value={valores.website_icon || NINGUNA} onValueChange={(v) => poner("website_icon", v === NINGUNA ? "" : v)}>
                      <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className={CLASE_CONTROL}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NINGUNA}>{t("metodo.sinIcono")}</SelectItem>
                        {ICONOS_TIENDA.map((i) => (
                          <SelectItem key={i} value={i}>
                            {t(`metodo.iconos.${i}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <FormField etiqueta={t("metodo.campos.orden")} ayuda={t("metodo.ayudas.orden")}>
                  <Input
                    type="number"
                    min={0}
                    value={valores.website_display_order}
                    onChange={(e) => poner("website_display_order", Number.parseInt(e.target.value, 10) || 0)}
                    className={CLASE_CONTROL}
                  />
                </FormField>
              </div>
              <FormField etiqueta={t("metodo.campos.instrucciones")}>
                {() => (
                  <RichTextEditor
                    value={valores.website_description}
                    onChange={(html) => poner("website_description", html)}
                    placeholder={t("metodo.ayudas.instrucciones")}
                    minHeight={60}
                  />
                )}
              </FormField>
            </section>

            <p className="flex items-center gap-2 text-[13px] leading-[18px] text-fg-secondary">
              <ExternalLink aria-hidden className="size-4 shrink-0" />
              <span>
                {t("metodo.integraciones")}{" "}
                <Link href="/app/integraciones/conexiones" className="font-medium text-brand underline-offset-2 hover:underline">
                  {t("metodo.irIntegraciones")}
                </Link>
              </span>
            </p>
          </>
        )}
      </div>
    </Dialogo>
  );
}
