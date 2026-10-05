"use client";

/**
 * /app/crm/plantillas — pestañas por canal. Email (F7) y WhatsApp (F16:
 * `@/components/crm/whatsapp/WhatsAppTemplatesTab`, cargado con next/dynamic
 * para no arrastrar su bundle en la pestaña de email). Pestaña activa en
 * `?tab=` (email | whatsapp).
 */

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Mail, MessageCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabErrorBoundary } from "./TabErrorBoundary";
import { TemplateList } from "./TemplateList";
import { useEsEscritorio } from "@/components/kit/useEsEscritorio";
import { PageHeader } from "@/components/kit/PageHeader";
import { useTemplateText } from "./useTemplateText";

/**
 * Fallback real de error (tester r1 #11): `loading` de next/dynamic es el
 * estado de carga, no el de error. Si F16 renombra el export o el chunk no
 * carga, la pestaña degrada con un aviso en vez de tumbar toda la página.
 */
function WhatsAppTabUnavailable({
  email = false,
}: {
  email?: boolean;
  canEdit?: boolean;
}) {
  const tr = useTemplateText();
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <p className="font-medium">
        {" "}
        {tr(
          email
            ? "No se pudieron cargar las plantillas."
            : "No se pudieron cargar las plantillas de WhatsApp",
        )}{" "}
      </p>
      {!email && (
        <p className="mt-1">
          {tr(
            "Vuelve a intentarlo recargando la página. Si el problema continúa, revisa la configuración del canal de WhatsApp en Configuración → CRM → WhatsApp.",
          )}{" "}
        </p>
      )}
    </div>
  );
}

const WhatsAppTemplatesTab = dynamic<{
  canEdit?: boolean;
  actionsHost?: HTMLElement | null;
  toolbarHost?: HTMLElement | null;
  onEditorChange?: (open: boolean) => void;
}>(
  () =>
    import("@/components/crm/whatsapp/WhatsAppTemplatesTab")
      .then((m) => m.WhatsAppTemplatesTab ?? WhatsAppTabUnavailable)
      .catch((err) => {
        console.error("[plantillas] WhatsAppTemplatesTab no disponible", err);
        return WhatsAppTabUnavailable;
      }),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> },
);

type Tab = "email" | "whatsapp";
const TABS: { id: Tab; label: string; icon: typeof Mail }[] = [
  { id: "email", label: "Correo", icon: Mail },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
];

export function PlantillasPage() {
  const desktop = useEsEscritorio();
  const [editorOpen, setEditorOpen] = useState(false);
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const tr = useTemplateText();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const active = useMemo<Tab>(() => {
    const p = searchParams?.get("tab");
    return p === "whatsapp" ? "whatsapp" : "email";
  }, [searchParams]);

  const setTab = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  return (
    <div
      className={editorOpen ? "bg-canvas" : "space-y-4 bg-canvas p-4 sm:p-6"}
      data-figma-node="1404:831575"
    >
      <Tabs value={active} onValueChange={setTab} className="space-y-4">
        {!editorOpen && (
          <PageHeader
            titulo={tr("Plantillas")}
            subtitulo={tr(
              "Mensajes reutilizables por canal, con variables del cliente y la oportunidad",
            )}
            icono={FileText}
            migas={[
              { etiqueta: "CRM", href: "/app/crm" },
              { etiqueta: tr("Plantillas") },
            ]}
            acciones={
              <div
                ref={setActionsHost}
                className="flex flex-wrap items-center gap-2"
              />
            }
            debajo={
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <TabsList
                  aria-label={tr("Canal de plantillas")}
                  className="h-10 rounded-lg border border-line bg-subtle p-1"
                >
                  {TABS.map((t) => (
                    <TabsTrigger
                      key={t.id}
                      value={t.id}
                      className="h-8 rounded-md px-3 text-[13px] text-fg-secondary data-[state=active]:bg-surface data-[state=active]:text-fg dark:bg-transparent dark:text-fg-secondary dark:data-[state=active]:bg-surface"
                    >
                      {tr(t.label)}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {desktop && (
                  <div
                    ref={setToolbarHost}
                    className="flex min-w-0 flex-1 items-center justify-end gap-2"
                  />
                )}
              </div>
            }
          />
        )}
        <TabsContent value="email" className="focus-visible:outline-none">
          <TabErrorBoundary
            label={tr("Correo")}
            fallback={<WhatsAppTabUnavailable email />}
          >
            <TemplateList
              actionsHost={desktop ? actionsHost : null}
              toolbarHost={desktop ? toolbarHost : null}
            />
          </TabErrorBoundary>
        </TabsContent>
        <TabsContent value="whatsapp" className="focus-visible:outline-none">
          <TabErrorBoundary
            label="WhatsApp"
            fallback={<WhatsAppTabUnavailable />}
          >
            <WhatsAppTemplatesTab
              actionsHost={desktop ? actionsHost : null}
              toolbarHost={desktop ? toolbarHost : null}
              onEditorChange={setEditorOpen}
            />
          </TabErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
