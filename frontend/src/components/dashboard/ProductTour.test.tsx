import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ProductTour } from "./ProductTour";

describe("ProductTour", () => {
  it("renders the first step with accessible dialog semantics and a skip action", () => {
    const html = renderToString(
      React.createElement(ProductTour, { open: true, onClose: vi.fn(), onNavigate: vi.fn() }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="product-tour-title"');
    expect(html).toContain("La tua dashboard");
    expect(html).toContain("Salta guida");
    expect(html).toContain("Apri dashboard");
    expect(html).toContain("Controlla gli interventi da gestire");
    expect(html).toContain("Passaggio");
    expect(html).toContain(" di ");
  });

  it("does not render while closed", () => {
    const html = renderToString(
      React.createElement(ProductTour, { open: false, onClose: vi.fn(), onNavigate: vi.fn() }),
    );

    expect(html).toBe("");
  });
});
