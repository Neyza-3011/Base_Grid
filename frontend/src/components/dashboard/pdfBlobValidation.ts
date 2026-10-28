export async function validatePdfBlob(blob: Blob): Promise<void> {
  if (blob.size < 8 || (blob.type && blob.type !== "application/pdf")) {
    throw new Error("Il server non ha restituito un PDF valido.");
  }

  if ((await blob.slice(0, 5).text()) !== "%PDF-") {
    throw new Error("La risposta del server non contiene un documento PDF valido.");
  }
}
