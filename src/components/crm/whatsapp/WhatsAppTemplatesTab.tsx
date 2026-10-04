"use client";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Copy,
  Eye,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { KbdButton as Button } from "@/components/kit/KbdButton";
import { clasesBoton } from "@/components/kit/botonClases";
import { extractParams } from "@/lib/services/crm/whatsapp/templateRender";
import { Tarjeta, EmptyState, StatusBadge } from "@/components/kit";
import { RowActionsMenu } from "@/components/kit/RowActionsMenu";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/kit/SearchInput";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { useTemplateText } from "@/components/crm/plantillas/useTemplateText";
import {
  waApi,
  ApiError,
  type ChannelSummary,
  type WhatsAppTemplate,
} from "./api";
import { HsmEditorDialog } from "./HsmEditorDialog";
const statuses: Record<string, string> = {
  APPROVED: "Aprobada",
  PENDING: "En revisión",
  REJECTED: "Rechazada",
  PAUSED: "Pausada",
  DISABLED: "Deshabilitada",
  IN_APPEAL: "En apelación",
  DRAFT: "Borrador",
};
function variableCount(template: WhatsAppTemplate): number {
  const contents = [template.body, ...template.meta.components.flatMap(component => [component.text ?? '', ...(component.buttons ?? []).map(button => button.url ?? '')])];
  return new Set(contents.flatMap(extractParams)).size;
}
export function WhatsAppTemplatesTab({
  canEdit,
  actionsHost,
  toolbarHost,
  onEditorChange,
}: {
  canEdit?: boolean;
  actionsHost?: HTMLElement | null;
  toolbarHost?: HTMLElement | null;
  onEditorChange?: (open: boolean) => void;
}) {
  const tr = useTemplateText();
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const currentOrg = useRef(orgId);
  currentOrg.current = orgId;
  const revision = useRef(0);
  const pending = useRef(false);
  const [scope, setScope] = useState<number | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canManageChannels, setCanManageChannels] = useState(false);
  const [items, setItems] = useState<WhatsAppTemplate[]>([]);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{
    template: WhatsAppTemplate | null;
    clone: boolean;
  } | null>(null);
  useEffect(() => {
    onEditorChange?.(editing !== null);
    return () => onEditorChange?.(false);
  }, [editing, onEditorChange]);
  const listHost = useRef<HTMLDivElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const [focusTemplate, setFocusTemplate] = useState<string | null>(null);
  const closeEditor = () => { setFocusTemplate(editing?.template?.id ?? 'new'); setEditing(null); };
  useEffect(() => {
    if (editing || loading || !focusTemplate) return;
    const row = Array.from(listHost.current?.querySelectorAll<HTMLElement>('[data-template-id]') ?? []).find(item => item.dataset.templateId === focusTemplate);
    (row?.querySelector<HTMLElement>('button') ?? newButton.current ?? listHost.current?.querySelector<HTMLElement>('input[type="search"]'))?.focus();
    setFocusTemplate(null);
  }, [editing, loading, focusTemplate]);
  const [deleting, setDeleting] = useState<WhatsAppTemplate | null>(null);
  const allowed =
    canManage && canEdit !== false && scope === orgId && !loading && !error;
  const load = useCallback(async () => {
    const ticket = ++revision.current;
    setLoading(true);
    setError(null);
    setSyncFailed(false);
    if (!orgId) {
      setLoading(false);
      setCanManage(false);
      return;
    }
    try {
      const [templatesResult, channelResult] = await Promise.allSettled([
        waApi.templates({ status: "ALL", includeInactive: true }),
        waApi.channels(),
      ]);
      if (ticket !== revision.current || currentOrg.current !== orgId) return;
      if (channelResult.status === "fulfilled") {
        setChannels(channelResult.value.data);
        setCanManageChannels(channelResult.value.can_manage === true);
      }
      if (templatesResult.status === "rejected") throw templatesResult.reason;
      if (channelResult.status === "rejected") throw channelResult.reason;
      const templates = templatesResult.value;
      setItems(templates.data);
      setCanManage(templates.can_manage === true);
      setScope(orgId);
    } catch (e) {
      if (ticket === revision.current && currentOrg.current === orgId) {
        setError(e);
        setCanManage(false);
      }
    } finally {
      if (ticket === revision.current && currentOrg.current === orgId)
        setLoading(false);
    }
  }, [orgId]);
  useEffect(() => {
    const epoch = revision;
    setItems([]);
    setChannels([]);
    setScope(null);
    setCanManage(false);
    setCanManageChannels(false);
    setEditing(null);
    setFocusTemplate(null);
    setDeleting(null);
    void load();
    return () => {
      epoch.current++;
    };
  }, [load]);
  const mutate = async (
    action: () => Promise<void>,
    captureSyncError = false,
  ) => {
    const canRetrySync =
      captureSyncError &&
      canManage &&
      canEdit !== false &&
      scope === orgId &&
      !loading;
    if ((!allowed && !canRetrySync) || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      if (captureSyncError && currentOrg.current === orgId) {
        setError(e);
        setSyncFailed(true);
      }
      toast({
        title: tr("No se pudo actualizar la plantilla."),
        description: e instanceof Error ? e.message : tr("Error"),
        variant: "destructive",
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const sync = () =>
    void mutate(async () => {
      await waApi.syncTemplates();
      if (currentOrg.current === orgId) {
        toast({ title: tr("Plantillas sincronizadas.") });
        await load();
      }
    }, true);
  const submit = (template: WhatsAppTemplate) =>
    void mutate(async () => {
      if (template.meta.status !== "DRAFT") return;
      await waApi.submitTemplate(template.id, template.meta.channel_id ?? null);
      if (currentOrg.current === orgId) {
        toast({ title: tr("Plantilla enviada a aprobación.") });
        await load();
      }
    });
  const remove = () =>
    void mutate(async () => {
      if (!deleting || deleting.meta.status !== "DRAFT") return;
      await waApi.deleteTemplate(deleting.id);
      if (currentOrg.current === orgId) {
        setDeleting(null);
        await load();
      }
    });
  const visible =
    scope === orgId
      ? items.filter((template) =>
          `${template.name} ${template.body}`
            .toLowerCase()
            .includes(q.toLowerCase()),
        )
      : [];
  const details =
    error instanceof ApiError &&
    typeof error.details === "object" &&
    error.details !== null &&
    !Array.isArray(error.details)
      ? (error.details as Record<string, unknown>)
      : null;
  const disconnected =
    error instanceof ApiError &&
    (error.status === 401 ||
      error.code === "190" ||
      (error.code === "PROVIDER" &&
        (details?.code === 190 || details?.code === "190")));
  const actions = allowed && (
    <>
      <Button
        patron="button"
        variante="secundario"
        onClick={sync}
        icono={RefreshCw}
        disabled={busy}
      >
        {tr("Sincronizar")}
      </Button>
      <Button
        patron="button"
        disabled={
          busy || !channels.some((channel) => channel.capabilities.templates)
        }
        onClick={() => setEditing({ template: null, clone: false })} icono={Plus} ref={newButton}
      >
        {tr("Nueva plantilla")}
      </Button>
    </>
  );
  const toolbar = (
    <SearchInput
      value={q}
      onChange={setQ}
      placeholder={tr("Buscar plantillas…")}
      etiqueta={tr("Buscar plantillas…")}
      className="min-w-48 flex-1"
    />
  );
  if (editing)
    return (
      <HsmEditorDialog
        key={`${scope}:${editing.template?.id ?? "new"}:${editing.clone}`}
        open
        presentacion="pagina"
        template={editing.template}
        clone={editing.clone}
        canManage={allowed}
        channels={channels}
        onDuplicate={
          allowed && editing.template
            ? () => setEditing({ template: editing.template, clone: true })
            : undefined
        }
        onClose={closeEditor}
        onSaved={() => {
          closeEditor();
          void load();
        }}
      />
    );
  return (
    <div className="space-y-4" ref={listHost}>
      {actionsHost ? (
        createPortal(actions, actionsHost)
      ) : (
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      )}
      {toolbarHost ? (
        createPortal(toolbar, toolbarHost)
      ) : (
        <div className="flex items-center gap-2">{toolbar}</div>
      )}
      {!canManage && !loading && !error && (
        <p className="text-xs text-fg-muted">{tr("Sólo lectura")}</p>
      )}
      {error !== null && visible.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-line-danger bg-danger-subtle p-3 text-sm text-danger-text"
        >
          <p>
            {tr(
              disconnected
                ? "La conexión con WhatsApp necesita atención. Reconecta el canal para sincronizar."
                : syncFailed
                  ? "No se pudo actualizar la plantilla."
                  : "No se pudieron cargar las plantillas.",
            )}
          </p>
          {visible.length > 0 && (
            <p>{tr("Mostrando la última información disponible.")}</p>
          )}
          <Button
            patron="button"
            variante="secundario"
            disabled={busy}
            onClick={() => (syncFailed ? sync() : void load())}
          >
            {tr("Reintentar")}
          </Button>
          {disconnected && canManageChannels && (
            <Link
              className={clasesBoton({
                patron: "button",
                variante: "secundario",
              })}
              href="/app/configuracion/crm/whatsapp"
            >
              {tr("Reconectar WhatsApp")}
            </Link>
          )}
        </div>
      )}
      {!loading &&
        !error &&
        !channels.some((channel) => channel.capabilities.templates) && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
            {tr(
              "Conecta un canal de WhatsApp para crear y sincronizar plantillas.",
            )}
            {canManageChannels && (
              <Link
                className={clasesBoton({
                  patron: "button",
                  variante: "secundario",
                })}
                href="/app/configuracion/crm/whatsapp"
              >
                {tr("Conectar WhatsApp")}
              </Link>
            )}
          </p>
        )}
      {loading ? (
        <div
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-busy="true"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="flex h-40 items-center gap-3 rounded-xl border border-line p-3"
            >
              <Skeleton className="size-12 shrink-0 rounded-lg bg-pressed" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-full rounded bg-pressed" />
                <Skeleton className="h-2.5 w-2/3 rounded bg-pressed" />
              </div>
              <Skeleton className="h-3 w-14 rounded bg-pressed" />
            </div>
          ))}
        </div>
      ) : !visible.length ? (
        <EmptyState
          variante={error ? "error" : q ? "search" : "empty"}
          accionPrimaria
          className="min-h-[398px] justify-start rounded-xl border border-line bg-surface pt-24 pb-8 [&>div:nth-child(2)]:gap-3 [&>div:last-child:not(:nth-child(2))]:mt-12"
          titulo={tr(
            error
              ? "No pudimos consultar tus plantillas en Meta"
              : q
                ? "No hay plantillas que coincidan"
                : "No tienes plantillas de WhatsApp",
          )}
          descripcion={tr(
            error
              ? disconnected
                ? "La conexión con WhatsApp necesita atención. Reconecta el canal para sincronizar."
                : "No se pudieron cargar las plantillas."
              : q
                ? "Prueba con otro nombre o quita los filtros."
                : "Meta exige plantillas aprobadas para escribir primero a un cliente. Crea una o sincroniza las que ya tienes en tu cuenta de WhatsApp Business.",
          )}
          icono={error ? undefined : MessageSquare}
          onLimpiarFiltros={q ? () => setQ("") : undefined}
          accion={
            error
              ? disconnected && canManageChannels
                ? {
                    etiqueta: tr("Reconectar WhatsApp"),
                    href: "/app/configuracion/crm/whatsapp",
                    icono: RefreshCw,
                  }
                : {
                    etiqueta: tr("Reintentar"),
                    onClick: () => void load(),
                    icono: RefreshCw,
                  }
              : !q && allowed &&
                  channels.some((channel) => channel.capabilities.templates)
                ? {
                    etiqueta: tr("Nueva plantilla"),
                    icono: Plus,
                    onClick: () => setEditing({ template: null, clone: false }),
                  }
                : undefined
          }
          accionSecundaria={
            !error && !q && allowed
              ? { etiqueta: tr("Sincronizar"), icono: RefreshCw, onClick: sync }
              : undefined
          }
        />
      ) : (
        <ul
          aria-label={tr("Plantillas de WhatsApp")}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {visible.map((template) => (
            <li key={template.id} data-template-id={template.id}>
              <Tarjeta className="[&>div]:px-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-2 text-left text-sm font-medium text-fg"
                      onClick={() => setEditing({ template, clone: false })}
                    >
                      <MessageSquare
                        className="size-4 shrink-0 text-fg-secondary"
                        strokeWidth={1.5}
                      />
                      <span className="truncate">{template.name}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <StatusBadge tipografia="figma"
                        estado={template.meta.status}
                        etiqueta={tr(
                          statuses[template.meta.status] ?? "Borrador",
                        )}
                        tono={
                          template.meta.status === "APPROVED"
                            ? "exito"
                            : template.meta.status === "REJECTED"
                              ? "peligro"
                              : template.meta.status === "PENDING"
                                ? "advertencia"
                                : "neutro"
                        }
                      />
                      <RowActionsMenu
                        titulo={template.name}
                        acciones={[
                          {
                            id: "view",
                            etiqueta: tr(
                              allowed && template.meta.status === "DRAFT"
                                ? "Editar"
                                : "Ver",
                            ),
                            icono:
                              allowed && template.meta.status === "DRAFT"
                                ? Pencil
                                : Eye,
                            onSelect: () =>
                              setEditing({ template, clone: false }),
                          },
                          ...(allowed && template.meta.status !== "PENDING"
                            ? [
                                {
                                  id: "clone",
                                  etiqueta: tr(
                                    template.meta.status === "REJECTED"
                                      ? "Corregir y reenviar"
                                      : "Duplicar como nueva",
                                  ),
                                  icono: Copy,
                                  deshabilitada: busy,
                                  onSelect: () =>
                                    setEditing({ template, clone: true }),
                                },
                                ...(template.meta.status === "DRAFT"
                                  ? [
                                      {
                                        id: "submit",
                                        etiqueta: tr("Enviar a aprobación"),
                                        icono: Send,
                                        deshabilitada: busy,
                                        onSelect: () => submit(template),
                                      },
                                      {
                                        id: "delete",
                                        etiqueta: tr("Eliminar"),
                                        icono: Trash2,
                                        destructiva: true,
                                        deshabilitada: busy,
                                        onSelect: () => setDeleting(template),
                                      },
                                    ]
                                  : []),
                              ]
                            : []),
                        ]}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-fg-secondary">
                    {tr(
                      template.meta.category === "utility"
                        ? "Transaccional"
                        : template.meta.category === "marketing"
                          ? "Marketing"
                          : "Autenticación",
                    )}{" "}
                    · {template.meta.language}
                  </p>
                  <button
                    type="button"
                    className="block w-full rounded-lg bg-subtle p-2.5 text-left text-[13px] leading-[18px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    onClick={() => setEditing({ template, clone: false })}
                  >
                    <span className="line-clamp-4 whitespace-pre-wrap">
                      {template.body}
                    </span>
                  </button>
                  {template.meta.rejected_reason ? (
                    <p className="text-xs text-danger-text">
                      {tr("Motivo del rechazo")}:{" "}
                      {template.meta.rejected_reason}
                    </p>
                  ) : (
                    <p className="text-xs text-fg-secondary">
                      {tr(variableCount(template) === 1 ? "{p0} variable" : "{p0} variables", {
                        p0: Array.from(new Set(extractParams(template.body)))
                          .length,
                      })}
                      {template.description ? ` · ${template.description}` : ""}
                    </p>
                  )}
                </div>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr("¿Eliminar esta plantilla?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                "La plantilla dejará de estar disponible para nuevos mensajes.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              patron="button"
              variante="secundario"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              {tr("Cancelar")}
            </Button>
            <Button
              patron="button"
              variante="destructivo"
              disabled={busy || !allowed}
              onClick={remove}
            >
              {tr("Eliminar")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
