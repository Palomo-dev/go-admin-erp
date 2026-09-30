"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Phone } from "lucide-react";
import { PageHeader } from "@/components/kit/PageHeader";
import { clasesBoton } from "@/components/kit/botonClases";
import { Skeleton } from "@/components/ui/skeleton";
import { CallsTable } from "@/components/voice/CallsTable";
import { useSoftphone } from "@/components/voice/SoftphoneProvider";
import { abrirMarcador } from "@/components/voice/softphoneUi";

function LlamadasContent() {
  const t = useTranslations("crm.llamadas");
  const searchParams = useSearchParams();
  const sp = useSoftphone();
  const [revision, setRevision] = useState(0);
  const hadEndedCall = useRef(false);
  const lastEnded = sp.available ? sp.lastEndedCall : null;
  useEffect(() => {
    if (lastEnded) {
      hadEndedCall.current = true;
      return;
    }
    if (!hadEndedCall.current) return;
    hadEndedCall.current = false;
    setRevision((n) => n + 1);
  }, [lastEnded]);
  const action = (
    <button
      className={clasesBoton({ variante: "primario" })}
      onClick={abrirMarcador}
      disabled={!sp.available}
    >
      <Phone className="size-4" aria-hidden="true" />
      {t("llamar")}
    </button>
  );
  return (
    <div className="space-y-6 bg-canvas p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t("titulo")}
        subtitulo={t("subtitulo")}
        icono={Phone}
        acciones={action}
        movil={{ accion: action }}
      />
      <CallsTable
        openCallId={searchParams?.get("call") ?? null}
        refreshKey={revision}
      />
    </div>
  );
}

export default function LlamadasPage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-32" />}>
      <LlamadasContent />
    </Suspense>
  );
}
