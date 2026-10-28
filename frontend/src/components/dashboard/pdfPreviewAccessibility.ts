export type TabKeyEvent = Pick<KeyboardEvent, "key" | "shiftKey" | "preventDefault">;

/**
 * Keep keyboard Tab navigation inside a modal dialog.
 * The structural types make the boundary unit-testable without a browser DOM.
 */
export function trapDialogTab(
  event: TabKeyEvent,
  dialog: HTMLElement | null,
  activeElement: Element | null,
): void {
  if (event.key !== "Tab" || !dialog) return;

  const focusable = Array.from(
    dialog.querySelectorAll(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((element) => element.tabIndex >= 0 && element.getAttribute("aria-hidden") !== "true");

  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const focusIsOutsideDialog = !dialog.contains(activeElement);

  if (event.shiftKey && (activeElement === first || focusIsOutsideDialog)) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && (activeElement === last || focusIsOutsideDialog)) {
    event.preventDefault();
    first.focus();
  }
}
