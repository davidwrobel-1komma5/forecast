import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberCell, PercentCell } from "./primitives";

describe("NumberCell", () => {
  it("übernimmt eine deutsche Zahleneingabe mit Enter", async () => {
    const onCommit = vi.fn();
    render(<NumberCell value={212000} ariaLabel="Angebotsvolumen" onCommit={onCommit} />);
    const field = screen.getByLabelText("Angebotsvolumen");
    expect((field as HTMLInputElement).value).toBe("212.000");

    await userEvent.clear(field);
    await userEvent.type(field, "1.234.500{Enter}");
    expect(onCommit).toHaveBeenCalledWith(1234500);
  });

  it("verwirft die Eingabe mit Escape", async () => {
    const onCommit = vi.fn();
    render(<NumberCell value={212000} ariaLabel="Angebotsvolumen" onCommit={onCommit} />);
    const field = screen.getByLabelText("Angebotsvolumen");

    await userEvent.clear(field);
    await userEvent.type(field, "999999{Escape}");
    expect(onCommit).not.toHaveBeenCalled();
    expect((field as HTMLInputElement).value).toBe("212.000");
  });

  it("übernimmt beim Verlassen des Feldes", async () => {
    const onCommit = vi.fn();
    render(
      <>
        <NumberCell value={0} ariaLabel="Ziel" onCommit={onCommit} />
        <button type="button">weiter</button>
      </>
    );
    await userEvent.type(screen.getByLabelText("Ziel"), "45000");
    await userEvent.click(screen.getByRole("button", { name: "weiter" }));
    expect(onCommit).toHaveBeenCalledWith(45000);
  });
});

describe("PercentCell", () => {
  it("rechnet die Eingabe in einen Anteil um", async () => {
    const onCommit = vi.fn();
    render(
      <PercentCell
        value={0.269}
        overridden={false}
        ariaLabel="Conversion Rate"
        onCommit={onCommit}
        onReset={vi.fn()}
      />
    );
    const field = screen.getByLabelText("Conversion Rate");
    expect((field as HTMLInputElement).value).toBe("26,9");

    await userEvent.clear(field);
    await userEvent.type(field, "31,5{Enter}");
    expect(onCommit).toHaveBeenCalledWith(0.315);
  });

  it("begrenzt Eingaben auf 0 bis 100 Prozent", async () => {
    const onCommit = vi.fn();
    render(
      <PercentCell value={0.269} overridden={false} ariaLabel="CR" onCommit={onCommit} onReset={vi.fn()} />
    );
    const field = screen.getByLabelText("CR");
    await userEvent.clear(field);
    await userEvent.type(field, "250{Enter}");
    expect(onCommit).toHaveBeenCalledWith(1);
  });

  it("bietet bei eigener Annahme ein Zurücksetzen an", async () => {
    const onReset = vi.fn();
    render(
      <PercentCell value={0.4} overridden ariaLabel="CR" onCommit={vi.fn()} onReset={onReset} />
    );
    await userEvent.click(screen.getByRole("button", { name: /zurücksetzen/i }));
    expect(onReset).toHaveBeenCalled();
  });
});
