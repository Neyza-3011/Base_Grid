type FocusableElement = {
  focus: () => void;
  disabled?: boolean;
  tabIndex?: number;
  getAttribute: (name: string) => string | null;
};

type DialogElement = {
  querySelectorAll: (selectors: string) => ArrayLike<FocusableElement>;
  contains: (element: unknown) => boolean;
};

type TabKeyEvent = {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
};

/**
 * Keep keyboard Tab navigation inside a modal dialog.
 * The structural types make the boundary unit-testable without a browser DOM.
 */
export function trapDialogTab(
  event: TabKeyEvent,
  dialog: DialogElement | null,
  activeElement: unknown,
): void {
  if (event.key !== "Tab" || !dialog) return;

  const focusable = Array.from(
    dialog.querySelectorAll(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((element) =>
    !element.disabled &&
    (element.tabIndex === undefined || element.tabIndex >= 0) &&
    element.getAttribute("aria-hidden") !== "true",
  );

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
