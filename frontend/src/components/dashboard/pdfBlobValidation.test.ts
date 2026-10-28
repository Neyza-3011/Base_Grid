import { describe, expect, it } from "vitest";
import { validatePdfBlob } from "./pdfBlobValidation";

describe("validatePdfBlob", () => {
  it("accepts a PDF with a valid signature and application/pdf MIME type", async () => {
    const blob = new Blob(["%PDF-1.7\nvalid test document"], { type: "application/pdf" });
    await expect(validatePdfBlob(blob)).resolves.toBeUndefined();
  });

  it("accepts a valid PDF signature when the response omits the MIME type", async () => {
    const blob = new Blob(["%PDF-1.7\nvalid test document"]);
    await expect(validatePdfBlob(blob)).resolves.toBeUndefined();
  });

  it("rejects responses that are too small to be a PDF", async () => {
    const blob = new Blob(["%PDF-"], { type: "application/pdf" });
    await expect(validatePdfBlob(blob)).rejects.toThrow(
      "Il server non ha restituito un PDF valido.",
    );
  });

  it("rejects a non-PDF MIME type", async () => {
    const blob = new Blob(["%PDF-1.7\ncontent"], { type: "text/html" });
    await expect(validatePdfBlob(blob)).rejects.toThrow("Il server non ha restituito un PDF valido.");
  });

  it("rejects a sufficiently large response without the PDF signature", async () => {
    const blob = new Blob(["<!doctype html><html>not a PDF</html>"], { type: "application/pdf" });
    await expect(validatePdfBlob(blob)).rejects.toThrow(
      "La risposta del server non contiene un documento PDF valido.",
    );
  });
});
