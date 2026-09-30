import type { JobHandler } from "../types";

/** Operaciones locales sin efectos externos. Las versiones anteriores solo devuelven el payload. */
export const noopHandler: JobHandler = async (ctx) => {
  if (ctx.job.payload.operation === "crm_duplicate_scan") {
    const { ejecutarBusquedaDuplicados } =
      await import("@/lib/services/crm/customerDuplicateScanService");
    return ejecutarBusquedaDuplicados(ctx);
  }
  return { echoed: ctx.job.payload, at: new Date().toISOString() };
};
