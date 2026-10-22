import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { PdfPreviewModal } from "./PdfPreviewModal";

describe("PdfPreviewModal Component", () => {
  const mockReportId = "rep-test-123";
  const mockOnClose = vi.fn();

  it("exports PdfPreviewModal function", () => {
    expect(typeof PdfPreviewModal).toBe("function");
  });

  it("renders modal HTML with dialog role and accessible attributes", () => {
    // Mock fetch for SSR/server render test
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    const html = renderToString(
      React.createElement(PdfPreviewModal, { reportId: mockReportId, onClose: mockOnClose }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="pdf-modal-title"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Anteprima Rapportino Ufficiale");
    expect(html).toContain("Generazione documento PDF in corso...");
    expect(html).toContain("min-h-[280px]");
    expect(html).toContain("sm:min-h-[500px]");
    expect(html).toContain('aria-label="Apri PDF in nuova scheda"');
    expect(html).toContain('aria-label="Stampa rapportino"');
    expect(html).toContain('aria-label="Scarica PDF rapportino"');
    expect(html).toContain('aria-label="Chiudi anteprima PDF"');
  });
});
