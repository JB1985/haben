import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { errorMessage, formatDateTime } from "../lib/format.ts";
import type { getBankOverview } from "../server/functions/bank.ts";
import { disconnectVivid, syncVivid } from "../server/functions/vivid.ts";
import { VividStatus } from "./BankStatus.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

/*
 * Verbindungen zur Vivid Business API (#1393) mit „Jetzt abrufen“ und „Trennen“, auf der Bankseite und unter
 * Einstellungen › Bank. Dort legt man die Verbindung an (VividCard); ein neuer Schlüssel löst einen abgelehnten ab.
 */

type Vivid = Awaited<ReturnType<typeof getBankOverview>>["vivid"];
type Verbindung = Vivid["connections"][number];
export type Ergebnis = Awaited<ReturnType<typeof syncVivid>>;
export type Meldung = { tone: "ok" | "danger" | "info"; text: string };

const kontoName = (a: { name: string; iban: string }) => (a.name.endsWith(a.iban.slice(-4)) ? a.name : `${a.name} …${a.iban.slice(-4)}`);

export const meldungenAus = (e: Ergebnis): Meldung[] => [
  { tone: e.ok ? "ok" : "danger", text: e.meldung },
  ...e.hinweise.map((text) => ({ tone: "info" as const, text })),
];

export function MeldungsListe({ meldungen }: { meldungen: Meldung[] }) {
  if (meldungen.length === 0) return null;
  return (
    <ul className="upload-messages" role="status">
      {meldungen.map((m, i) => (
        <li key={i} className={`banner banner-${m.tone}`}>
          {m.text}
        </li>
      ))}
    </ul>
  );
}

/** Je Verbindung eine Zeile mit Zustand, Konten und letztem Abruf */
export function VividZeilen({ vivid }: { vivid: Vivid }) {
  const router = useRouter();
  const sync = useServerFn(syncVivid);
  const disconnect = useServerFn(disconnectVivid);
  const [busy, setBusy] = useState<string | null>(null);
  const [meldungen, setMeldungen] = useState<Meldung[]>([]);
  const [trennt, setTrennt] = useState<Verbindung | null>(null);

  async function run(id: string, work: () => Promise<void>) {
    setBusy(id);
    setMeldungen([]);
    try {
      await work();
      await router.invalidate();
    } catch (e) {
      setMeldungen([{ tone: "danger", text: errorMessage(e) }]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <ConfirmDialog
        open={trennt !== null}
        title="Vivid-Verbindung trennen?"
        confirmLabel="Trennen"
        danger
        onConfirm={() => {
          if (!trennt) return;
          const { id } = trennt;
          void run(`x-${id}`, () => disconnect({ data: id }).then(() => undefined));
        }}
        onClose={() => setTrennt(null)}
      >
        <p>
          Haben löscht den gespeicherten API-Schlüssel; in Vivid gilt er weiter, bis du ihn dort löschst. Die abgerufenen Umsätze bleiben erhalten. Neu
          eintragen kannst du ihn unter Einstellungen › Bank.
        </p>
      </ConfirmDialog>

      {vivid.connections.map((c) => (
        <div key={c.id} className="history-row" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: "1 1 260px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600 }}>Vivid Business</span>
              <VividStatus status={c.status} />
              <span className="small muted">API</span>
            </div>
            <span className="small muted">{c.accounts.map(kontoName).join(" · ") || "Keine Konten"}</span>
            <span className="small muted">{c.lastSyncAt ? `Zuletzt abgerufen ${formatDateTime(c.lastSyncAt)}` : "Noch nicht abgerufen"}</span>
            {c.lastError && <span className="field-error">{c.lastError}</span>}
          </div>
          <div className="actions">
            <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => setTrennt(c)}>
              Trennen
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={() => void run(c.id, async () => setMeldungen(meldungenAus(await sync({ data: c.id }))))}
            >
              {busy === c.id ? "Rufe ab …" : "Jetzt abrufen"}
            </button>
          </div>
        </div>
      ))}

      <MeldungsListe meldungen={meldungen} />
    </>
  );
}
