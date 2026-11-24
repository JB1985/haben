import type { ReceiptArchive } from "./export-files.ts";
import type { BuchhaltungsbutlerFile, BuchhaltungsbutlerJoinedRow } from "./types.ts";
import { BuchhaltungsbutlerError } from "./types.ts";

/**
 * Die Belegdateien einer Buchung. Die Namen stehen in „Beleg-Dateinamen“ (BB Standardexport), sonst in „Original-Dateiname“
 * (DATEV) oder am Ende der Beleg-URL. Fehlen sie, gilt das ältere Muster <Buchungsnummer>.pdf.
 */
export function receiptsOf(row: BuchhaltungsbutlerJoinedRow, archive: ReceiptArchive): BuchhaltungsbutlerFile[] {
  const names = receiptNames(row, archive);
  const found = names.map((name) => archive.byName.get(name));
  if (names.length > 0 && found.every((file) => file !== undefined)) return found as BuchhaltungsbutlerFile[];
  const legacy = archive.byBooking.get(row.info.bookingId);
  if (legacy) return legacy;
  const missing = names.filter((name) => !archive.byName.has(name));
  const detail = missing.length > 0 ? ` (gesucht: ${missing.join(", ")})` : "";
  throw new BuchhaltungsbutlerError(`Buchung ${row.info.bookingId}: Beleg-URL vorhanden, aber PDF fehlt in Belege.zip${detail}.`);
}

function receiptNames(row: BuchhaltungsbutlerJoinedRow, archive: ReceiptArchive): string[] {
  const listed = (row.bb["Beleg-Dateinamen"] ?? "").trim() || (row.info.raw["Original-Dateiname"] ?? "").trim();
  if (listed) {
    // Mehrere Dateien stehen mit Komma getrennt in einem Feld; ein Name darf selbst ein Komma enthalten
    if (archive.byName.has(listed)) return [listed];
    return listed
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }
  return row.info.url
    .split(/,(?=https?:\/\/)/)
    .map(nameOfUrl)
    .filter(Boolean);
}

function nameOfUrl(url: string): string {
  const last = url.trim().split(/[?#]/)[0]!.split("/").pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
