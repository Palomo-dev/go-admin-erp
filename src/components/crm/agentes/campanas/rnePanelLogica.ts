/** Estado de presentación: los permisos y la evidencia vienen del servidor. */
export function estadoConstanciaRne(registro: {
  numbers_in_file: number;
  evidence_available?: boolean;
  audience_unchanged?: boolean;
  vigente?: boolean;
} | null) {
  const aviso = !registro ? null : registro.evidence_available === false ? 'sinEvidencia' :
    registro.audience_unchanged === false ? 'audienciaCambiada' :
      !Number.isInteger(registro.numbers_in_file) || registro.numbers_in_file <= 0 ? 'reimportar' : null;
  return { aviso, incompleta: aviso !== null, vigente: registro?.vigente === true && aviso === null };
}
