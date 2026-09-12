import { useRef, useState } from "react";
import { useStore } from "../../data/store";
import type { CrMode, Unit } from "../../domain/types";
import { formatInputPercent, parseGermanNumber, percent } from "../format";
import { Card, Field } from "../components/primitives";

const CR_MODES: Array<{ value: CrMode; label: string; hint: string }> = [
  { value: "manual", label: "Manuelle Annahme", hint: "Die unten gesetzte Conversion Rate gilt für alle Wochen." },
  { value: "rolling4", label: "Rolling 4 Wochen", hint: "Gemessene CR der letzten vier abgeschlossenen Wochen." },
  { value: "rolling8", label: "Rolling 8 Wochen", hint: "Ruhiger, reagiert langsamer auf Ausreisser." },
  { value: "rolling12", label: "Rolling 12 Wochen", hint: "Stabilster Wert, bildet kurzfristige Änderungen spät ab." }
];

export function SettingsView({ onNotify }: { onNotify: (message: string) => void }) {
  const {
    state,
    setAssumptions,
    setCrMode,
    setHorizon,
    upsertUnit,
    addPerson,
    removeUnit,
    exportJson,
    importJson,
    loadDemoData,
    resetAll
  } = useStore();
  const [newPerson, setNewPerson] = useState("");
  const [newPersonParent, setNewPersonParent] = useState(
    state.units.find((u) => u.kind === "location")?.id ?? "gesamt"
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const assumptions = state.settings.assumptions;

  const percentField = (
    label: string,
    key: "crOfferToOrder" | "stornoRate" | "handoverRate",
    hint: string
  ) => (
    <Field label={label} hint={hint}>
      <input
        className="input numeric"
        inputMode="decimal"
        defaultValue={formatInputPercent(assumptions[key])}
        onBlur={(event) => {
          const value = parseGermanNumber(event.target.value) / 100;
          setAssumptions({ [key]: Math.max(0, Math.min(1, value)) } as never);
          event.target.value = formatInputPercent(Math.max(0, Math.min(1, value)));
        }}
      />
    </Field>
  );

  const download = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `forecast-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onNotify("Datensatz exportiert.");
  };

  const unitRow = (unit: Unit, depth: number) => (
    <div className="list-row" key={unit.id}>
      <div style={{ paddingLeft: depth * 18 }}>
        <strong>{unit.name}</strong>
        <div className="sub">
          {unit.kind === "group" ? "Gruppe" : unit.kind === "location" ? "Standort" : "Mitarbeiter"}
          {unit.entryMode === "direct" ? " · Werte werden hier erfasst" : " · Summe der Untereinheiten"}
        </div>
      </div>
      <div className="row">
        <select
          className="select"
          value={unit.entryMode}
          aria-label={`Erfassungsart ${unit.name}`}
          onChange={(event) =>
            upsertUnit({ ...unit, entryMode: event.target.value as Unit["entryMode"] })
          }
        >
          <option value="direct">Direkt erfassen</option>
          <option value="rollup">Aufsummieren</option>
        </select>
        <label className="row" style={{ fontSize: 13, gap: 6 }}>
          <input
            type="checkbox"
            checked={unit.active}
            onChange={(event) => upsertUnit({ ...unit, active: event.target.checked })}
          />
          aktiv
        </label>
        {unit.kind === "person" && (
          <button type="button" className="btn danger" onClick={() => removeUnit(unit.id)}>
            Entfernen
          </button>
        )}
      </div>
    </div>
  );

  const renderTree = (parentId: string | null, depth = 0): JSX.Element[] =>
    state.units
      .filter((u) => u.parentId === parentId)
      .flatMap((unit) => [unitRow(unit, depth), ...renderTree(unit.id, depth + 1)]);

  return (
    <>
      <Card
        title="Forecast-Annahmen"
        subtitle="Diese Werte steuern jede Berechnung in der Anwendung"
      >
        <div className="settings-grid">
          {percentField("Conversion Rate", "crOfferToOrder", "Angebote versendet → Auftragseingang vor Storno")}
          {percentField("Stornoquote", "stornoRate", "Anteil, der nach Auftragseingang storniert wird")}
          {percentField("Handover-Quote", "handoverRate", "Anteil baubarer Aufträge")}
          <Field label="Average Order Value" hint="Für die Umrechnung zwischen Volumen und Stückzahl">
            <input
              className="input numeric"
              inputMode="decimal"
              defaultValue={assumptions.aov.toLocaleString("de-DE")}
              onBlur={(event) => {
                const value = parseGermanNumber(event.target.value);
                setAssumptions({ aov: Math.max(0, value) });
                event.target.value = Math.max(0, value).toLocaleString("de-DE");
              }}
            />
          </Field>
          <Field
            label="Cycle Time in Tagen"
            hint={`Versatz von ${Math.round(assumptions.cycleDays / 7)} Wochen zwischen Angebot und Auftrag`}
          >
            <input
              className="input numeric"
              inputMode="numeric"
              defaultValue={String(assumptions.cycleDays)}
              onBlur={(event) => {
                const value = Math.max(0, Math.round(parseGermanNumber(event.target.value)));
                setAssumptions({ cycleDays: value });
                event.target.value = String(value);
              }}
            />
          </Field>
        </div>

        <div className="divider" />

        <Field
          label="Quelle der Forecast-Conversion-Rate"
          hint={CR_MODES.find((m) => m.value === state.settings.crMode)?.hint}
        >
          <select
            className="select"
            value={state.settings.crMode}
            onChange={(event) => setCrMode(event.target.value as CrMode)}
          >
            {CR_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="field-hint" style={{ marginTop: 12 }}>
          Netto-Conversion inklusive Storno: {percent(assumptions.crOfferToOrder * (1 - assumptions.stornoRate))}.
          Reicht die Historie für den Rolling-Wert nicht aus, greift automatisch die manuelle Annahme.
        </p>
      </Card>

      <Card title="Planungshorizont" subtitle="Welche Wochen in Tabellen und Diagrammen erscheinen">
        <div className="settings-grid">
          <Field label="Erste Woche">
            <input
              className="input"
              type="week"
              value={state.settings.horizonStart}
              onChange={(event) => event.target.value && setHorizon({ horizonStart: event.target.value })}
            />
          </Field>
          <Field label="Letzte Woche">
            <input
              className="input"
              type="week"
              value={state.settings.horizonEnd}
              onChange={(event) => event.target.value && setHorizon({ horizonEnd: event.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Struktur"
        subtitle="Blätter mit direkter Erfassung werden gepflegt, alle übrigen Ebenen summieren sich daraus auf"
      >
        <div className="list-rows">{renderTree(null)}</div>
        <div className="divider" />
        <div className="row">
          <input
            className="input"
            placeholder="Name des Mitarbeiters"
            value={newPerson}
            onChange={(event) => setNewPerson(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && newPerson.trim()) {
                addPerson(newPerson, newPersonParent);
                setNewPerson("");
              }
            }}
          />
          <select
            className="select"
            value={newPersonParent}
            aria-label="Zugehörige Einheit"
            onChange={(event) => setNewPersonParent(event.target.value)}
          >
            {state.units
              .filter((u) => u.kind !== "person")
              .map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={!newPerson.trim()}
            onClick={() => {
              addPerson(newPerson, newPersonParent);
              setNewPerson("");
              onNotify("Mitarbeiter angelegt.");
            }}
          >
            Hinzufügen
          </button>
        </div>
      </Card>

      <Card
        title="Daten"
        subtitle="Gespeichert wird lokal im Browser. Export und Import ermöglichen Sicherung und Gerätewechsel."
      >
        <div className="row">
          <button type="button" className="btn" onClick={download}>
            Als JSON exportieren
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            JSON importieren
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const result = importJson(await file.text());
              onNotify(result.message);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              loadDemoData();
              onNotify("Beispieldaten geladen – alle Ansichten sind jetzt gefüllt.");
            }}
          >
            Beispieldaten laden
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (confirm("Alle erfassten Werte, Snapshots und Einstellungen löschen?")) {
                resetAll();
                onNotify("Anwendung zurückgesetzt.");
              }
            }}
          >
            Alles zurücksetzen
          </button>
        </div>
        <p className="field-hint" style={{ marginTop: 12 }}>
          Beispieldaten überschreiben alle erfassten Wochenwerte. Die Struktur und die Annahmen bleiben erhalten.
        </p>
      </Card>
    </>
  );
}
