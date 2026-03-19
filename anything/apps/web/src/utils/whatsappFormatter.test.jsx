import { describe, expect, it } from "vitest";
import { toggleBulletList } from "./whatsappFormatter";

describe("whatsappFormatter", () => {
  it("adds a bullet to the current line when nothing is selected", () => {
    const textarea = {
      value: "Testing Credit Application",
      selectionStart: "Testing Credit Application".length,
      selectionEnd: "Testing Credit Application".length,
    };

    const result = toggleBulletList(textarea);

    expect(result.newText).toBe("• Testing Credit Application");
    expect(result.selectionStart).toBe("• Testing Credit Application".length);
    expect(result.selectionEnd).toBe("• Testing Credit Application".length);
  });

  it("adds bullets to every selected line", () => {
    const textarea = {
      value: "First line\nSecond line",
      selectionStart: 0,
      selectionEnd: "First line\nSecond line".length,
    };

    const result = toggleBulletList(textarea);

    expect(result.newText).toBe("• First line\n• Second line");
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe("• First line\n• Second line".length);
  });

  it("removes bullets when all selected lines are already bulleted", () => {
    const textarea = {
      value: "• First line\n• Second line",
      selectionStart: 0,
      selectionEnd: "• First line\n• Second line".length,
    };

    const result = toggleBulletList(textarea);

    expect(result.newText).toBe("First line\nSecond line");
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe("First line\nSecond line".length);
  });
});
