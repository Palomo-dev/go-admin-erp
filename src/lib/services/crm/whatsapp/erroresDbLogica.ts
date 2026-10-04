import { WhatsAppError } from "./types";

/** Traduce errores de las RPC privadas; un fallo de datos nunca autoriza enviar. */
export function errorWhatsAppDb(error: { code?: string; message: string }): WhatsAppError {
  if (error.code === "42501") return new WhatsAppError("ADMIN_REQUIRED", "No tienes permiso para esta operación", 403);
  if (error.code === "P0002") return new WhatsAppError("NOT_FOUND", "No se encontró el registro en la organización", 404);
  if (error.code === "22023" || error.code === "22P02") return new WhatsAppError("VALIDATION", "Revisa los datos de la solicitud", 400);
  if (error.message === "creditos_insuficientes") return new WhatsAppError("NO_CREDITS", "Sin créditos de WhatsApp", 402);
  if (["rne_required", "contacto_bloqueado:rne_required"].includes(error.message))
    return new WhatsAppError("RNE_REQUIRED", "Verifica la campaña con un archivo RNE vigente antes de continuar", 409);
  if (["data_policy_required", "contacto_bloqueado:data_policy_required"].includes(error.message))
    return new WhatsAppError("DATA_POLICY_REQUIRED", "Configura la URL HTTPS de la política de datos antes de continuar", 409);
  if (error.message === "audiencia_rne_modificada")
    return new WhatsAppError("NOT_EDITABLE", "Cambió el teléfono de un contacto. Actualiza la audiencia y vuelve a verificar el RNE", 409);
  if (error.message === "contacto_bloqueado:consent_blocked") return new WhatsAppError("OPTED_OUT", "El contacto no autoriza este envío", 422);
  if (["plantilla_no_aprobada", "contacto_bloqueado:template_not_verified"].includes(error.message))
    return new WhatsAppError("TEMPLATE_NOT_APPROVED", "La plantilla debe estar aprobada para este canal", 409);
  if (error.message === "canal_no_disponible") return new WhatsAppError("NO_CHANNEL", "El canal no está disponible", 422);
  if (["audiencia_no_calculada", "audiencia_sin_pendientes"].includes(error.message))
    return new WhatsAppError("NOT_MATERIALIZED", "Calcula una audiencia con contactos pendientes antes de lanzar", 409);
  if (error.message === "campana_modificada") return new WhatsAppError("CAMPAIGN_MODIFIED", "La campaña fue modificada. Actualiza los datos antes de guardar", 409);
  if (error.code === "40001") return new WhatsAppError("NOT_EDITABLE", "Los datos cambiaron. Actualiza antes de continuar", 409);
  if (error.message === "campana_requiere_conciliacion")
    return new WhatsAppError("RECONCILIATION_REQUIRED", "Hay entregas pendientes de conciliación. Revisa su resultado antes de archivar", 409);
  if (error.message === "campana_programada_no_editable")
    return new WhatsAppError("NOT_EDITABLE", "Una campaña programada solo permite cambiar el nombre y la descripción", 409);
  if (error.code === "P0001") return new WhatsAppError("NOT_EDITABLE", "La campaña o el envío cambió. Actualiza los datos antes de continuar", 409);
  return new WhatsAppError("INTERNAL", error.message, 500);
}
