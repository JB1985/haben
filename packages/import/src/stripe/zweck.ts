import { normalizeText } from "../text.ts";
import type { StripeBalanceTransaction } from "./client.ts";

/** Längster Verwendungszweck aus Metadaten; Stripe erlaubt 50 Schlüssel mit Werten zu je 500 Zeichen (https://docs.stripe.com/api/metadata) */
const MAX_LAENGE = 500;

/** Nur hier stehen die Metadaten für eine Zahlung eines Kunden; Auszahlung, Gebühr, Transfer, Aufladung usw. bleiben wie bisher */
const MIT_METADATEN = new Set(["charge", "payment", "refund", "payment_refund", "dispute", "dispute_reversal", "refund_failure"]);

/**
 * Verwendungszweck aus den Metadaten der Zahlung: die Werte der gewählten Schlüssel in der gewählten Reihenfolge, durch
 * Leerzeichen getrennt (etwa `invoice_number`). Nur gewählte Schlüssel, weil sich Bankumsätze in Haben nicht ändern lassen
 * und interne Angaben sonst dauerhaft im Zweck stünden (Entscheidung in #1915). `undefined` ohne Auswahl oder ohne Wert.
 */
export function metadatenZweck(t: StripeBalanceTransaction, keys: readonly string[]): string | undefined {
  if (!t.metadata || !MIT_METADATEN.has(t.reporting_category ?? t.type)) return undefined;
  const ganz = normalizeText(keys.map((key) => (Object.hasOwn(t.metadata!, key) ? t.metadata![key] : "")).join(" ")).trim();
  const text = Array.from(ganz).slice(0, MAX_LAENGE).join("").trim();
  return text || undefined;
}
