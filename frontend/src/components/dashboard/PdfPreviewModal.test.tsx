import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { PdfPreviewModal } from "./PdfPreviewModal";
import { trapDialogTab } from "./pdfPreviewAccessibility";

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


describe("PDF preview dialog keyboard focus trap", () => {
  function makeFocusable(tabIndex = 0, ariaHidden: string | null = null) {
    return {
      focus: vi.fn(),
      tabIndex,
      getAttribute: vi.fn((name: string) => (name === "aria-hidden" ? ariaHidden : null)),
    } as unknown as HTMLElement;
  }

  function makeDialog(elements: HTMLElement[]) {
    return {
      querySelectorAll: vi.fn(() => elements),
      contains: vi.fn((element: unknown) => elements.includes(element as HTMLElement)),
    } as unknown as HTMLElement;
  }

  function makeTabEvent(shiftKey = false) {
    return {
      key: "Tab",
      shiftKey,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
  }

  it("wraps forward Tab from the last focusable control to the first", () => {
    const first = makeFocusable();
    const last = makeFocusable();
    const dialog = makeDialog([first, last]);
    const event = makeTabEvent();

    trapDialogTab(event, dialog, last);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledOnce();
    expect(last.focus).not.toHaveBeenCalled();
  });

  it("wraps Shift+Tab from the first focusable control to the last", () => {
    const first = makeFocusable();
    const last = makeFocusable();
    const dialog = makeDialog([first, last]);
    const event = makeTabEvent(true);

    trapDialogTab(event, dialog, first);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(last.focus).toHaveBeenCalledOnce();
    expect(first.focus).not.toHaveBeenCalled();
  });

  it("moves focus back into the dialog if the active element is outside it", () => {
    const first = makeFocusable();
    const dialog = makeDialog([first]);
    const outside = makeFocusable();
    const event = makeTabEvent();

    trapDialogTab(event, dialog, outside);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledOnce();
  });

  it("prevents tabbing when the dialog has no visible focusable controls", () => {
    const hidden = makeFocusable(0, "true");
    const negativeTabIndex = makeFocusable(-1);
    const dialog = makeDialog([hidden, negativeTabIndex]);
    const event = makeTabEvent();

    trapDialogTab(event, dialog, null);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(hidden.focus).not.toHaveBeenCalled();
    expect(negativeTabIndex.focus).not.toHaveBeenCalled();
  });

  it("does not intercept non-Tab keys", () => {
    const first = makeFocusable();
    const dialog = makeDialog([first]);
    const event = { ...makeTabEvent(), key: "Escape" } as KeyboardEvent;

    trapDialogTab(event, dialog, null);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(first.focus).not.toHaveBeenCalled();
  });
});
