import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatDate } from "../lib/format.ts";
import { readForeignInvoice } from "../server/functions/fremdrechnung.ts";
import { discardInboxOutgoing, getInboxOutgoing, readInboxOutgoing } from "../server/functions/inbox.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { ForeignInvoiceImport, type Read } from "./ForeignInvoiceImport.tsx";
import { MoreActionsMenu } from "./MoreActionsMenu.tsx";

type Eintrag = Awaited<ReturnType<typeof getInboxOutgoing>>[number];

/** „Rechnung-DE-2026090026.pdf“ → „DE-2026090026“: die Nummer steht im Dateinamen */
const nummerOf = (dateiname: string) => dateiname.replace(/\.pdf$/i, "").replace(/^rechnung[-_ ]*/i, "") || dateiname;
/** „JABA e.K. <info@jaba.hosting>“ → „JABA e.K.“ */
const absenderOf = (absender: string) => absender.replace(/\s*<[^>]*>\s*$/, "").trim() || absender;

async function dateiOf(id: string): Promise<File> {
  const datei = await readInboxOutgoing({ data: { id } });
  const bytes = Uint8Array.from(atob(datei.base64), (c) => c.charCodeAt(0));
  return new File([bytes], datei.filename, { type: datei.mimeType });
}

/**
 * Ausgangsrechnungen, die der Abruf aus dem Ordner für Ausgangsrechnungen des Postfachs geholt hat (#660). Gebucht ist noch
 * nichts: „Übernehmen“ öffnet dasselbe Formular wie „Ausgangsrechnung hochladen“, mit dem PDF aus dem Postfach. Mit
 * „Alle übernehmen“ (oder der Auswahl) folgen die Formulare nacheinander.
 */
export function PostfachAusgang() {
  const router = useRouter();
  const [liste, setListe] = useState<Eintrag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [offen, setOffen] = useState<{ file: File; data: Read; postfach: string } | null>(null);
  /** Was nach der Rechnung im Formular noch folgt */
  const [danach, setDanach] = useState<string[]>([]);
  const [verwerfen, setVerwerfen] = useState<string[] | null>(null);

  async function laden() {
    try {
      const neu = await getInboxOutgoing();
      setListe(neu);
      setGewaehlt((alt) => new Set([...alt].filter((id) => neu.some((e) => e.id === id))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die Ausgangsrechnungen aus dem Postfach lassen sich nicht laden.");
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: einmal beim Öffnen der Seite laden
  useEffect(() => {
    void laden();
  }, []);

  async function oeffnen(ids: string[]) {
    const [id, ...rest] = ids;
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const file = await dateiOf(id);
      const form = new FormData();
      form.set("file", file);
      setOffen({ file, data: await readForeignInvoice({ data: form }), postfach: id });
      setDanach(rest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die Datei lässt sich nicht lesen.");
    } finally {
      setBusy(false);
    }
  }

  async function ansehen(id: string) {
    setError(null);
    try {
      const url = URL.createObjectURL(await dateiOf(id));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die Datei lässt sich nicht öffnen.");
    }
  }

  async function verwerfenBestaetigt(ids: string[]) {
    setBusy(true);
    setError(null);
    try {
      for (const id of ids) await discardInboxOutgoing({ data: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die Datei lässt sich nicht verwerfen.");
    } finally {
      setBusy(false);
      await laden();
    }
  }

  if (offen) {
    return (
      <ForeignInvoiceImport
        key={offen.postfach}
        vorgabe={offen}
        onAdopted={
          danach.length > 0
            ? () => void oeffnen(danach)
            : () => {
                setOffen(null);
                void laden();
                void router.invalidate();
              }
        }
        onClose={() => {
          setOffen(null);
          setDanach([]);
          void laden();
        }}
      />
    );
  }
  if (liste.length === 0 && !error) return null;

  const alle = liste.length > 0 && gewaehlt.size === liste.length;
  const ziele = gewaehlt.size > 0 ? liste.filter((e) => gewaehlt.has(e.id)).map((e) => e.id) : liste.map((e) => e.id);
  const umschalten = (id: string) =>
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (!neu.delete(id)) neu.add(id);
      return neu;
    });

  return (
    <section className="card postfach-ausgang" aria-labelledby="postfach-ausgang-heading" style={{ marginBottom: 16 }}>
      <div className="actions" style={{ alignItems: "center", marginBottom: 8 }}>
        <h2 id="postfach-ausgang-heading" style={{ margin: 0 }}>
          Aus dem Postfach
        </h2>
        <span className="small muted">{liste.length} offen</span>
        <span style={{ flex: 1 }} />
        {gewaehlt.size > 0 && (
          <button type="button" className="btn" disabled={busy} onClick={() => setVerwerfen([...gewaehlt])}>
            Auswahl verwerfen
          </button>
        )}
        <button type="button" className="btn btn-primary" disabled={busy || ziele.length === 0} onClick={() => void oeffnen(ziele)}>
          {gewaehlt.size > 0 ? `${gewaehlt.size} übernehmen` : "Alle übernehmen"}
        </button>
      </div>
      {error && <ErrorBanner title="Postfach" detail={error} />}
      <div className="table">
        <div
          className="table-row head"
          style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1.3fr) minmax(0,1fr) 90px auto", gap: 12, alignItems: "center" }}
        >
          <input type="checkbox" aria-label="Alle auswählen" checked={alle} onChange={() => setGewaehlt(alle ? new Set() : new Set(liste.map((e) => e.id)))} />
          <div>Rechnung</div>
          <div>Absender</div>
          <div>Eingang</div>
          <div style={{ minWidth: 150 }} />
        </div>
        {liste.map((eintrag) => (
          <div
            key={eintrag.id}
            className="table-row"
            style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1.3fr) minmax(0,1fr) 90px auto", gap: 12, alignItems: "center" }}
          >
            <input
              type="checkbox"
              aria-label={`${nummerOf(eintrag.filename)} auswählen`}
              checked={gewaehlt.has(eintrag.id)}
              onChange={() => umschalten(eintrag.id)}
            />
            <div
              className="mono small"
              title={eintrag.subject || eintrag.filename}
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {nummerOf(eintrag.filename)}
            </div>
            <div className="small muted" title={eintrag.sender} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {absenderOf(eintrag.sender)}
            </div>
            <div className="small muted">{eintrag.receivedAt ? formatDate(eintrag.receivedAt) : "–"}</div>
            <div className="actions" style={{ justifyContent: "flex-end", minWidth: 150 }}>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void oeffnen([eintrag.id])}>
                Übernehmen
              </button>
              <MoreActionsMenu
                label={`Weitere Aktionen zu ${nummerOf(eintrag.filename)}`}
                items={[
                  { key: "pdf", label: "PDF ansehen", onSelect: () => void ansehen(eintrag.id) },
                  { key: "verwerfen", label: "Verwerfen", disabled: busy, onSelect: () => setVerwerfen([eintrag.id]) },
                ]}
              />
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={verwerfen !== null}
        title={verwerfen && verwerfen.length > 1 ? `${verwerfen.length} Ausgangsrechnungen verwerfen?` : "Ausgangsrechnung verwerfen?"}
        confirmLabel="Verwerfen"
        danger
        onConfirm={() => {
          const ids = verwerfen ?? [];
          setVerwerfen(null);
          void verwerfenBestaetigt(ids);
        }}
        onClose={() => setVerwerfen(null)}
      >
        <p>Die Datei wird nicht übernommen und vom Abruf nicht wieder angeboten. Die Mail im Postfach bleibt unberührt.</p>
      </ConfirmDialog>
    </section>
  );
}
