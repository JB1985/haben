import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { defaultFetchFrom, fetchFromForConnect } from "../lib/bank-connect.ts";
import { errorMessage, formatDate } from "../lib/format.ts";
import { useSubmitCheck } from "../lib/use-submit-check.ts";
import { connectVivid, type getVividSettings } from "../server/functions/vivid.ts";
import { today as todayInGermany } from "../server/today.ts";
import { Field } from "./Field.tsx";
import { type Ergebnis, type Meldung, MeldungsListe, meldungenAus, VividZeilen } from "./VividAbruf.tsx";

const VIVID_ANLEITUNG = "https://github.com/firsttris/haben/blob/main/docs/installation-anbindungen.md#kontoabruf-über-vivid";

function VerbindenForm({ onErgebnis }: { onErgebnis: (e: Ergebnis) => Promise<void> }) {
  const connect = useServerFn(connectVivid);
  const today = todayInGermany();
  const [apiKey, setApiKey] = useState("");
  const [fetchFrom, setFetchFrom] = useState(defaultFetchFrom(today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    form,
    error: fehler,
    check,
  } = useSubmitCheck({
    apiKey: apiKey.trim() ? null : "Der API-Schlüssel fehlt.",
    fetchFrom: fetchFrom > today ? `Wähle einen Tag bis ${formatDate(today)} oder lass das Feld leer.` : null,
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !check()) return;
    setBusy(true);
    setError(null);
    try {
      await onErgebnis(await connect({ data: { apiKey: apiKey.trim(), fetchFrom: fetchFromForConnect(fetchFrom, today) } }));
      setApiKey("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="stack" style={{ gap: 12 }} aria-label="Vivid verbinden" noValidate>
      <Field
        label="API-Schlüssel"
        error={fehler("apiKey")}
        hint={
          <>
            In Vivid Business unter API › Add API token, mit den Rechten accounts:read und transactions:read. Haben speichert ihn verschlüsselt.{" "}
            <a href={VIVID_ANLEITUNG} target="_blank" rel="noreferrer">
              Anleitung
            </a>
          </>
        }
      >
        {(control) => (
          <input
            {...control}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="vivid_sk_v1_…"
            autoComplete="off"
            spellCheck={false}
            required
          />
        )}
      </Field>
      <Field
        label="Umsätze abrufen ab"
        error={fehler("fetchFrom")}
        hint="Gilt für Konten, die noch nie abgerufen wurden. Vivid gibt nur die letzten 90 Tage heraus; ältere Umsätze importierst du per Datei."
      >
        {(control) => <input {...control} type="date" value={fetchFrom} max={today} onChange={(e) => setFetchFrom(e.target.value)} />}
      </Field>
      {error && (
        <div className="banner banner-danger" role="alert">
          {error}
        </div>
      )}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Verbinde …" : "Verbinden"}
        </button>
      </div>
    </form>
  );
}

/** Vivid Business unter Einstellungen › Bank (#1393): API-Schlüssel eintragen, Stand der Verbindung, Abruf und Trennen */
export function VividCard({ data }: { data: Awaited<ReturnType<typeof getVividSettings>> }) {
  const router = useRouter();
  const [meldungen, setMeldungen] = useState<Meldung[]>([]);
  return (
    <section className="card" aria-labelledby="vivid-heading">
      <h2 id="vivid-heading">Vivid Business</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Haben holt die Umsätze der Konten bei Vivid Business über deren API und ordnet die Konten über die IBAN zu. Ohne API-Schlüssel geht Vivid wie jede
        andere Bank über Enable Banking.
      </p>
      <VividZeilen vivid={data} />
      <VerbindenForm
        onErgebnis={async (e) => {
          setMeldungen(meldungenAus(e));
          await router.invalidate();
        }}
      />
      <MeldungsListe meldungen={meldungen} />
    </section>
  );
}
