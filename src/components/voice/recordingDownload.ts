/** Descarga por la ruta privada existente; nunca expone una URL permanente del proveedor. */
export async function downloadCallRecording(recordingId: string) {
  const response = await fetch(`/api/voice/recording/${recordingId}/stream`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('recording_download_unavailable');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `llamada-${recordingId}.mp3`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
