import { AssetRecord, InterventionRecord, ReportRecord } from "../types";
import { validateSignatureBase64 } from "../validation";

export interface JobCompleteCheck {
  id: string;
  label: string;
  passed: boolean;
  weight: number;
  isMandatory: boolean;
  missingDataReason?: string;
  details?: string;
}

export interface JobCompleteScoreResult {
  score: number;
  readyForBilling: boolean;
  checks: JobCompleteCheck[];
  missingMandatoryCount: number;
}

/**
 * Pure domain function to calculate the Job Complete Score and billing readiness
 * for a given intervention based on persisted records.
 */
export function calculateJobCompleteScore(
  intervention: InterventionRecord,
  report?: ReportRecord | null,
  asset?: AssetRecord | null
): JobCompleteScoreResult {
  const checks: JobCompleteCheck[] = [];

  // 1. Assignment Check (Mandatory, Weight 15)
  const isAssigned = Boolean(intervention.technicianId && intervention.technicianId.trim().length > 0);
  checks.push({
    id: "assignment",
    label: "Assegnazione Tecnico",
    passed: isAssigned,
    weight: 15,
    isMandatory: true,
    missingDataReason: isAssigned ? undefined : "Nessun tecnico assegnato all'intervento.",
    details: isAssigned ? "Tecnico assegnato all'intervento." : undefined,
  });

  // 2. Actual Hours Check (Mandatory, Weight 15)
  const hasActualHours =
    typeof intervention.actualHours === "number" &&
    Number.isFinite(intervention.actualHours) &&
    intervention.actualHours > 0;
  checks.push({
    id: "actual_hours",
    label: "Ore Effettive Lavorate",
    passed: hasActualHours,
    weight: 15,
    isMandatory: true,
    missingDataReason: hasActualHours ? undefined : "Ore effettive di lavoro non registrate o pari a zero.",
    details: hasActualHours ? `${intervention.actualHours} ore registrate.` : undefined,
  });

  // 3. Operational Notes Check (Optional, Weight 10)
  const hasNotes = Boolean(intervention.notes && intervention.notes.trim().length > 0);
  checks.push({
    id: "notes",
    label: "Note Conclusive Intervento",
    passed: hasNotes,
    weight: 10,
    isMandatory: false,
    missingDataReason: hasNotes ? undefined : "Note operative o note conclusive non inserite.",
    details: hasNotes ? "Note operative compilate." : undefined,
  });

  // 4. Report Linked & Validity Check (Mandatory, Weight 20)
  let isReportLinkedPassed = false;
  let reportMissingReason: string | undefined = undefined;
  let reportDetails: string | undefined = undefined;

  const isReportPresent = Boolean(report && report.id);
  const isCompanyValid = Boolean(report && report.companyId && intervention.companyId && report.companyId === intervention.companyId);
  const isInterventionValid = Boolean(report && report.interventionId && intervention.id && report.interventionId === intervention.id);
  const isCustomerValid = Boolean(
    report &&
      (!intervention.customerId || (report.customerId && report.customerId === intervention.customerId))
  );
  const isLocationValid = Boolean(
    report &&
      (!intervention.locationId || (report.locationId && report.locationId === intervention.locationId))
  );
  const isStatusValid = Boolean(
    report &&
      (report.status === "submitted" || report.status === "approved")
  );

  const isCoherent = isReportPresent && isCompanyValid && isInterventionValid && isCustomerValid && isLocationValid && isStatusValid;

  if (!isReportPresent) {
    isReportLinkedPassed = false;
    reportMissingReason = "Rapportino di lavoro non creato o non collegato all'intervento.";
  } else if (!isCompanyValid) {
    isReportLinkedPassed = false;
    reportMissingReason = "Azienda del rapportino discordante o non specificata rispetto all'intervento.";
  } else if (!isInterventionValid) {
    isReportLinkedPassed = false;
    reportMissingReason = "ID intervento del rapportino mancante o discordante.";
  } else if (!isCustomerValid) {
    isReportLinkedPassed = false;
    reportMissingReason = "Cliente del rapportino mancante o discordante rispetto all'intervento.";
  } else if (!isLocationValid) {
    isReportLinkedPassed = false;
    reportMissingReason = "Sede del rapportino mancante o discordante rispetto all'intervento.";
  } else if (!isStatusValid) {
    isReportLinkedPassed = false;
    reportMissingReason = report?.status === "draft"
      ? "Il rapportino di lavoro è in stato 'bozza' (richiesto inviato o approvato per la fatturazione)."
      : "Stato del rapportino non ammesso o non valido per la fatturazione.";
  } else {
    isReportLinkedPassed = true;
    reportDetails = `Rapportino ${report.id} collegato e valido (${report.status}).`;
  }

  checks.push({
    id: "report_linked",
    label: "Rapportino di Lavoro",
    passed: isReportLinkedPassed,
    weight: 20,
    isMandatory: true,
    missingDataReason: reportMissingReason,
    details: reportDetails,
  });

  // 5. Customer Signature Check (Mandatory, Weight 20)
  let isSignaturePassed = false;
  let signatureMissingReason: string | undefined = undefined;
  let signatureDetails: string | undefined = undefined;

  if (!isReportPresent) {
    isSignaturePassed = false;
    signatureMissingReason = "Firma del cliente non presente nel rapportino.";
  } else if (!isCoherent) {
    isSignaturePassed = false;
    signatureMissingReason = "Rapportino collegato non valido o non coerente con l'intervento.";
  } else if (!report.signatureBase64 || report.signatureBase64.trim().length === 0) {
    isSignaturePassed = false;
    signatureMissingReason = "Firma del cliente non presente nel rapportino.";
  } else {
    const sigValidation = validateSignatureBase64(report.signatureBase64);
    if (!sigValidation.valid) {
      isSignaturePassed = false;
      signatureMissingReason = `Firma del cliente non valida o corrotta: ${sigValidation.error}`;
    } else {
      isSignaturePassed = true;
      signatureDetails = "Firma del cliente acquisita e convalidata con successo.";
    }
  }

  checks.push({
    id: "signature",
    label: "Firma del Cliente",
    passed: isSignaturePassed,
    weight: 20,
    isMandatory: true,
    missingDataReason: signatureMissingReason,
    details: signatureDetails,
  });

  // 6. Materials Verification Check (Mandatory, Weight 10)
  // Explicit representation: distinguishes used, none (confirmed zero materials), and unverified
  let isMaterialsPassed = false;
  let materialsMissingReason: string | undefined = undefined;
  let materialsDetails: string | undefined = undefined;

  if (!isReportPresent) {
    isMaterialsPassed = false;
    materialsMissingReason = "Rapportino non collegato: verifica materiali non disponibile.";
  } else if (!isCoherent) {
    isMaterialsPassed = false;
    materialsMissingReason = "Rapportino collegato non valido o non coerente con l'intervento.";
  } else {
    const status = report.materialsStatus;
    if (status === "none") {
      isMaterialsPassed = true;
      materialsDetails = "Confermato nessun materiale utilizzato.";
    } else if (status === "used") {
      const items = Array.isArray(report.materialsUsed) ? report.materialsUsed : [];
      const hasPositiveQuantity = items.some((m) => typeof m.quantity === "number" && m.quantity > 0);
      if (items.length > 0 && hasPositiveQuantity) {
        isMaterialsPassed = true;
        materialsDetails = `${items.length} materiali registrati.`;
      } else {
        isMaterialsPassed = false;
        materialsMissingReason = "Stato materiali impostato su 'usati' ma nessun articolo con quantità positiva (> 0) registrato.";
      }
    } else {
      // 'unverified' or undefined (legacy historical reports without explicit confirmation)
      isMaterialsPassed = false;
      materialsMissingReason = "Verifica materiali non eseguita: confermare esplicitamente i materiali usati o dichiarare nessun materiale.";
    }
  }

  checks.push({
    id: "materials",
    label: "Verifica Materiali Utilizzati",
    passed: isMaterialsPassed,
    weight: 10,
    isMandatory: true,
    missingDataReason: materialsMissingReason,
    details: materialsDetails,
  });

  // 7. Equipment / Asset Serial Number & Specifics Check (Optional, Weight 10)
  let isAssetCheckPassed = true;
  let assetMissingReason: string | undefined = undefined;
  let assetDetails = "Nessun impianto/asset associato all'intervento (non applicabile).";

  if (intervention.assetId) {
    if (asset) {
      if (asset.serialNumber && asset.serialNumber.trim().length > 0) {
        isAssetCheckPassed = true;
        assetDetails = `Impianto '${asset.name}' con S/N: ${asset.serialNumber}.`;
      } else {
        isAssetCheckPassed = false;
        assetMissingReason = `Numero di serie non specificato per l'impianto '${asset.name}'.`;
        assetDetails = `Impianto '${asset.name}' privo di numero di serie.`;
      }
    } else {
      isAssetCheckPassed = false;
      assetMissingReason = "Impianto associato non trovato nel sistema.";
      assetDetails = "Impianto associato non trovato.";
    }
  }

  checks.push({
    id: "checklist_photos_serials",
    label: "Scheda Impianto e Numero di Serie",
    passed: isAssetCheckPassed,
    weight: 10,
    isMandatory: false,
    missingDataReason: assetMissingReason,
    details: assetDetails,
  });

  // Calculate total score deterministically
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const passedWeight = checks.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0);

  const rawScore = totalWeight > 0 ? (passedWeight / totalWeight) * 100 : 0;
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  // readyForBilling requires ALL mandatory checks to pass
  const missingMandatoryChecks = checks.filter((c) => c.isMandatory && !c.passed);
  const readyForBilling = missingMandatoryChecks.length === 0;

  return {
    score,
    readyForBilling,
    checks,
    missingMandatoryCount: missingMandatoryChecks.length,
  };
}
