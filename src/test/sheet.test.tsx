import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Cell, Sheet } from "@/components/sheet";

function Grid({ onCommit = () => {} }: { onCommit?: (v: string) => void }) {
  return (
    <Sheet>
      <tbody>
        <tr><td className="c"><Cell label="A1" value="10" onCommit={onCommit} /></td><td className="c"><Cell label="B1" value="20" onCommit={onCommit} /></td></tr>
        <tr><td className="c"><Cell label="A2" value="30" onCommit={onCommit} /></td><td className="c"><Cell label="B2" value="" disabled onCommit={onCommit} /></td></tr>
        <tr><td className="c"><Cell label="A3" value="" onCommit={onCommit} /></td><td className="c"><Cell label="B3" value="" onCommit={onCommit} /></td></tr>
      </tbody>
    </Sheet>
  );
}

describe("spreadsheet cells", () => {
  it("Enter and ↓ move down the same column, ↑ moves up", () => {
    render(<Grid />);
    const a1 = screen.getByLabelText("A1");
    a1.focus();
    fireEvent.keyDown(a1, { key: "Enter" });
    expect(document.activeElement).toBe(screen.getByLabelText("A2"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByLabelText("A3"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByLabelText("A2"));
  });
  it("skips disabled cells going down, and → at the end of the text moves right", () => {
    render(<Grid />);
    const b1 = screen.getByLabelText("B1") as HTMLInputElement;
    b1.focus();
    fireEvent.keyDown(b1, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByLabelText("B3"));
    const a1 = screen.getByLabelText("A1") as HTMLInputElement;
    a1.focus();
    a1.setSelectionRange(2, 2);
    fireEvent.keyDown(a1, { key: "ArrowRight" });
    expect(document.activeElement).toBe(b1);
  });
  it("saves only when the value changed, on leaving the cell", () => {
    const onCommit = vi.fn();
    render(<Grid onCommit={onCommit} />);
    const a1 = screen.getByLabelText("A1");
    fireEvent.blur(a1);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(a1, { target: { value: "15" } });
    fireEvent.blur(a1);
    expect(onCommit).toHaveBeenCalledWith("15");
  });
});
