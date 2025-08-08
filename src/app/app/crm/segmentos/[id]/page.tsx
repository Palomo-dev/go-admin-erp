"use client";

import React from "react";
import { useParams } from "next/navigation";
import SegmentDetail from "@/components/crm/segments/SegmentDetail";

/**
 * Página de detalle del segmento CRM
 * Ruta: /app/crm/segmentos/[id]
 */
export default function SegmentDetailPage() {
  const params = useParams();
  const segmentId = params.id as string;

  return (
    <div className="container mx-auto p-6">
      <SegmentDetail segmentId={segmentId} />
    </div>
  );
}
