"use client";

import { seleccionarConColumnaOpcional, metodoCatalogoVisible } from "@/lib/finanzas/metodosPagoAlcance";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { useCapacidades } from "@/lib/navigation/useCapacidades";
import { supabase } from "@/lib/supabase/config";
import { CreditCard, Plus, RefreshCw } from "lucide-react";
import { ListToolbar, PageHeader, RowActionsMenu, SearchInput, TabBar, clasesBoton, idPanel, idPestana, type AccionFila } from "@/components/kit";
import PaymentMethodsList from "./PaymentMethodsList";
import PaymentMethodForm from "./PaymentMethodForm";
import { CobrosQrPestana } from "./CobrosQrPestana";

export interface PaymentMethodCountry {
  country_code: string;
  is_recommended: boolean;
  country?: {
    code: string;
    name: string;
  };
}

export interface PaymentMethod {
  code: string;
  name: string;
  requires_reference: boolean;
  is_active: boolean;
  is_system: boolean;
  countries?: PaymentMethodCountry[];
}

export interface OrganizationPaymentMethod {
  id: number;
  organization_id: number;
  payment_method_code: string;
  is_active: boolean;
  settings: {
    gateway?: string;
    gateway_config?: Record<string, unknown>;
    account_mapping?: Record<string, string>;
    // Personalización propia de la organización (el catálogo global no se toca):
    // ver src/lib/finanzas/metodosPagoOrganizacion.ts.
    display_name?: string | null;
    requires_reference?: boolean | null;
    [clave: string]: unknown;
  };
  payment_method?: PaymentMethod;
  integration_connection_id?: string | null;
  /** Sucursales donde se cobra (20261028180000). null/ausente = todas. */
  branch_ids?: number[] | null;
  // Campos de configuración para Website
  show_on_website?: boolean;
  website_display_order?: number;
  website_display_name?: string;
  website_description?: string;
  website_icon?: string;
}

export type PestanaMetodosPago = "metodos" | "qr";
const ID_TABS = "metodos-pago";

/**
 * Finanzas › Configuración › Métodos de pago (Finanzas ronda 2, A11 y A12).
 * Dos pestañas: «Métodos» y «Cobros QR» (antes la página suelta
 * `/metodos-pago/qr-sessions`, que sigue abriendo esta pestaña). Nuevo y editar
 * método son un diálogo (antes, una pestaña con el formulario).
 */
export default function PaymentMethodsPage({ pestanaInicial = "metodos" }: { pestanaInicial?: PestanaMetodosPago }) {
  const t = useTranslations("finanzasCobrosR2");
  const tLista = useTranslations("finanzasMetodosPagoLista");
  // Crear, editar, activar y quitar exigen `billing_management` (RLS de
  // organization_payment_methods); la UI lo pregunta al servidor, nunca al rol.
  const { datos: capacidades } = useCapacidades();
  const puedeGestionar = capacidades.capacidades.gestionarFacturacion;
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const countryCode = organization?.country_code;
  const [pestana, setPestana] = useState<PestanaMetodosPago>(pestanaInicial);
  const [busquedaQr, setBusquedaQr] = useState("");
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [recargaQr, setRecargaQr] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [orgPaymentMethods, setOrgPaymentMethods] = useState<OrganizationPaymentMethod[]>([]);
  const [recommendedMethods, setRecommendedMethods] = useState<Array<{ code?: string; payment_method_code?: string }>>([]);
  const [actualCountryCode, setActualCountryCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<OrganizationPaymentMethod | null>(null);
  const [codigoInicial, setCodigoInicial] = useState<string | undefined>(undefined);
  const [errorCarga, setErrorCarga] = useState<"error" | "sinPermiso" | null>(null);
  const [recargaLista, setRecargaLista] = useState(0);

  // Cargar los métodos de pago al iniciar
  useEffect(() => {
    if (organizationId) {
      loadPaymentMethods();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  // Función para cargar los métodos de pago
  const loadPaymentMethods = async () => {
    if (!organizationId) return;
    
    try {
      setIsLoading(true);
      setErrorCarga(null);
      
      // Obtener métodos de pago globales con sus países
      const { data: methodsData, error: methodsError } = await supabase
        .from("payment_methods")
        .select(`
          *,
          countries:country_payment_methods(
            country_code,
            is_recommended,
            display_order,
            is_active,
            country:country_code(code, name)
          )
        `)
        .eq("is_active", true)
        .order("name");
        
      if (methodsError) throw methodsError;
      
      // Obtener country_code directamente de la base de datos si no está disponible
      let currentCountryCode = countryCode;
      if (!currentCountryCode) {
        const { data: orgData, error: orgError } = await supabase
          .from("organizations")
          .select("country_code")
          .eq("id", organizationId)
          .single();
          
        if (!orgError && orgData) {
          currentCountryCode = orgData.country_code;
        }
      }
      
      // Aislamiento por organización (20261028181000): sistema + propios + los
      // comunes que ya tiene; nunca el personalizado de otra organización.
      const { data: codigosOrg } = await supabase
        .from("organization_payment_methods")
        .select("payment_method_code")
        .eq("organization_id", organizationId);
      const codigosPropios = new Set(((codigosOrg || []) as Array<{ payment_method_code: string }>).map((r) => r.payment_method_code));
      const recomendadosPais = new Set(
        ((methodsData || []) as Array<{ code: string; countries?: PaymentMethodCountry[] }>)
          .filter((m) => (m.countries || []).length > 0)
          .map((m) => m.code),
      );
      const visibles = (methodsData || []).filter((m: { code: string; is_system?: boolean | null; organization_id?: number | null }) =>
        // Los del catálogo por país (pasarelas comunes) siguen ofreciéndose para activar.
        metodoCatalogoVisible(m, organizationId, codigosPropios) || (m.organization_id == null && recomendadosPais.has(m.code)));

      // Filtrar métodos de pago según el país de la organización
      let filteredMethods = visibles;
      if (currentCountryCode) {
        filteredMethods = visibles.filter(method => {
          // Si no tiene países asignados, es global (disponible para todos)
          if (!method.countries || method.countries.length === 0) {
            return true;
          }
          // Si tiene países asignados, verificar si incluye el país de la organización
          return method.countries.some((c: PaymentMethodCountry) => c.country_code === currentCountryCode);
        });
      }
      
      // Obtener métodos de pago de la organización
      // `branch_ids` (20261028180000) solo si la migración ya está aplicada.
      const { data: orgMethodsData, error: orgMethodsError } = await seleccionarConColumnaOpcional("organization_payment_methods", "branch_ids", (extraSucursales) => supabase
        .from("organization_payment_methods")
        .select(`
          id,
          organization_id,
          payment_method_code,
          is_active,
          settings,
          integration_connection_id,
          show_on_website,
          website_display_order,
          website_display_name,
          website_description,
          website_icon,
          payment_method:payment_method_code(*)${extraSucursales}
        `)
        .eq("organization_id", organizationId));

      if (orgMethodsError) throw orgMethodsError;
      
      // Obtener métodos recomendados del país si está disponible
      let recommendedData = [];
      if (currentCountryCode) {
        const { data: recMethodsData, error: recMethodsError } = await supabase
          .rpc('get_recommended_payment_methods', { country_code: currentCountryCode });
          
        if (!recMethodsError && recMethodsData) {
          recommendedData = recMethodsData;
        }
      }
      
      setPaymentMethods(filteredMethods);
      setOrgPaymentMethods(((orgMethodsData ?? []) as unknown as Record<string, unknown>[]).map(item => ({
        ...(item as unknown as OrganizationPaymentMethod),
        payment_method: item.payment_method as unknown as PaymentMethod
      })));
      setRecommendedMethods(recommendedData || []);
      setActualCountryCode(currentCountryCode || null);
    } catch (error: unknown) {
      console.error("Error al cargar métodos de pago:", error);
      // Un error de carga NO es «no hay métodos»: la lista muestra el estado de error (o sin permiso).
      const codigo = (error as { code?: unknown } | null)?.code;
      setErrorCarga(codigo === "42501" || codigo === "PGRST301" ? "sinPermiso" : "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Recargar los métodos y los datos de apoyo de la lista (bancos, conexiones, pagos por método).
  const recargarTodo = () => {
    setRecargaLista((n) => n + 1);
    void loadPaymentMethods();
  };

  // Función para editar un método de pago
  const handleEditMethod = (method: OrganizationPaymentMethod) => {
    setSelectedMethod(method);
    setCodigoInicial(undefined);
    setDialogoAbierto(true);
  };

  // Función para añadir un nuevo método de pago
  const handleAddMethod = (codigo?: string) => {
    setSelectedMethod(null);
    setCodigoInicial(codigo);
    setDialogoAbierto(true);
  };

  // Activos = lo que lee el POS (`is_active`); el subtítulo dice que se muestran en este orden.
  const activos = orgPaymentMethods.filter((m) => m.is_active !== false).length;

  const menuCabecera: AccionFila[] = [
    {
      id: "recargar",
      etiqueta: t("acciones.recargar"),
      icono: RefreshCw,
      onSelect: () => (pestana === "qr" ? setRecargaQr((n) => n + 1) : recargarTodo()),
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t("metodos.titulo")}
        subtitulo={isLoading || errorCarga ? t("metodos.subtitulo") : tLista("subtitulo", { n: activos })}
        icono={CreditCard}
        migas={[
          { etiqueta: t("migas.finanzas"), href: "/app/finanzas" },
          { etiqueta: t("migas.configuracion") },
          { etiqueta: t("metodos.titulo") },
        ]}
        acciones={
          <div className="flex items-center gap-2">
            {puedeGestionar && (
              <button type="button" className={clasesBoton({ variante: "primario", tamano: "md" })} onClick={() => handleAddMethod()} disabled={!organizationId}>
                <Plus aria-hidden className="size-4" />
                {t("metodos.nuevo")}
              </button>
            )}
            <RowActionsMenu acciones={menuCabecera} orientacion="horizontal" tamano="md" titulo={t("metodos.titulo")} />
          </div>
        }
        // En móvil (< lg) el PageHeader no se dibuja: la acción va en el
        // MobileHeader como «+» (Figma 1010:86844), igual que Saldos a favor o
        // Consignaciones. Sin esto no había forma de añadir un método en el celular.
        movil={{
          subtitulo: isLoading || errorCarga ? undefined : tLista("subtituloMovil", { n: activos }),
          // Sin permiso de gestión no hay «+»: el «⋯» (Recargar) ocupa su lugar.
          menu: menuCabecera,
          accion: !puedeGestionar ? undefined : (
            <button
              type="button"
              onClick={() => handleAddMethod()}
              disabled={!organizationId}
              aria-label={t("metodos.nuevo")}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ),
        }}
      />

      {pestana === "qr" && (
        <ListToolbar
          busqueda={
            <SearchInput value={busquedaQr} onChange={setBusquedaQr} onValueChange={setBusquedaQr} placeholder={t("qr.buscar")} etiqueta={t("qr.buscar")} />
          }
        />
      )}

      <TabBar
        id={ID_TABS}
        etiqueta={t("metodos.pestanas.etiqueta")}
        valor={pestana}
        onValorChange={setPestana}
        pestanas={[
          { valor: "metodos", etiqueta: t("metodos.pestanas.metodos"), contador: isLoading || errorCarga ? undefined : orgPaymentMethods.length },
          { valor: "qr", etiqueta: t("metodos.pestanas.qr") },
        ]}
      />

      <div role="tabpanel" id={idPanel(ID_TABS, "metodos")} aria-labelledby={idPestana(ID_TABS, "metodos")} hidden={pestana !== "metodos"}>
        <PaymentMethodsList
          organizationId={organizationId}
          paymentMethods={paymentMethods}
          orgPaymentMethods={orgPaymentMethods}
          recommendedMethods={recommendedMethods}
          countryCode={actualCountryCode}
          onEdit={handleEditMethod}
          onAgregar={handleAddMethod}
          isLoading={isLoading}
          onRefresh={recargarTodo}
          errorCarga={errorCarga}
          puedeGestionar={puedeGestionar}
          recarga={recargaLista}
        />
      </div>

      <div role="tabpanel" id={idPanel(ID_TABS, "qr")} aria-labelledby={idPestana(ID_TABS, "qr")} hidden={pestana !== "qr"}>
        {pestana === "qr" && <CobrosQrPestana organizationId={organizationId} recarga={recargaQr} busqueda={busquedaQr} onLimpiarBusqueda={() => setBusquedaQr("")} />}
      </div>

      {organizationId ? (
        <PaymentMethodForm
          abierto={dialogoAbierto}
          onAbiertoChange={setDialogoAbierto}
          organizationId={organizationId}
          globalMethods={paymentMethods}
          selectedMethod={selectedMethod}
          codigoInicial={codigoInicial}
          onSaveComplete={recargarTodo}
        />
      ) : null}
    </div>
  );
}
