/** Shared operational company-profile allowlists used by validation and the onboarding gate. */
export const SUPPORTED_SERVICE_CATEGORIES = new Set([
  "installazione",
  "manutenzione",
  "pronto-intervento",
  "verifiche-collaudi",
  "domotica-automazione",
  "fotovoltaico",
  "ricarica-veicoli-elettrici",
]);

export const SUPPORTED_LOCALES = new Set(["it-IT"]);
export const SUPPORTED_TIME_ZONES = new Set(["Europe/Rome", "UTC"]);
