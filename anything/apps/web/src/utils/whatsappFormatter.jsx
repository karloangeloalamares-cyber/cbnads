export function parseWhatsAppFormatting(text) {
  if (!text) return text;

  const lines = text.split("\n");

  return lines.map((line, lineIndex) => {
    const patterns = [
      { regex: /\*\*([^*]+)\*\*/g, tag: "strong" },
      { regex: /\*([^*]+)\*/g, tag: "strong" },
      { regex: /_([^_]+)_/g, tag: "em" },
      { regex: /~([^~]+)~/g, tag: "s" },
      { regex: /```([^`]+)```/g, tag: "code" },
    ];

    const matches = [];

    patterns.forEach(({ regex, tag }) => {
      const pattern = new RegExp(regex);
      let match;

      while ((match = pattern.exec(line)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[1],
          tag,
        });
      }
    });

    matches.sort((a, b) => a.start - b.start);

    if (matches.length === 0) {
      return (
        <span key={lineIndex}>
          {line}
          {lineIndex < lines.length - 1 ? <br /> : null}
        </span>
      );
    }

    const elements = [];
    let lastEnd = 0;

    matches.forEach((match, index) => {
      if (match.start < lastEnd) return;

      if (match.start > lastEnd) {
        elements.push(line.substring(lastEnd, match.start));
      }

      const Tag = match.tag;
      elements.push(
        <Tag
          key={`${lineIndex}-${index}`}
          className={match.tag === "code" ? "bg-gray-100 px-1 rounded font-mono text-xs" : ""}
        >
          {match.text}
        </Tag>,
      );

      lastEnd = match.end;
    });

    if (lastEnd < line.length) {
      elements.push(line.substring(lastEnd));
    }

    return (
      <span key={lineIndex}>
        {elements}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </span>
    );
  });
}

export function insertAtCursor(textarea, textToInsert) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const before = text.substring(0, start);
  const after = text.substring(end, text.length);
  const newText = before + textToInsert + after;

  return {
    newText,
    newCursorPos: start + textToInsert.length,
  };
}

export function toggleBulletList(textarea) {
  const start = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : 0;
  const end = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : start;
  const text = textarea.value;

  const lineStart = start > 0 ? text.lastIndexOf("\n", start - 1) + 1 : 0;
  const nextLineBreak = text.indexOf("\n", end);
  const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;
  const selectedBlock = text.slice(lineStart, lineEnd);
  const lines = selectedBlock.split("\n");
  const bulletPattern = /^(\s*)• /;
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const shouldRemoveBullets =
    nonEmptyLines.length > 0 && nonEmptyLines.every((line) => bulletPattern.test(line));

  const updatedLines = lines.map((line) => {
    if (!line.trim()) {
      if (lines.length === 1) {
        return shouldRemoveBullets ? line : "• ";
      }
      return line;
    }

    if (shouldRemoveBullets) {
      return line.replace(bulletPattern, "$1");
    }

    const indentation = line.match(/^\s*/)?.[0] || "";
    return `${indentation}• ${line.slice(indentation.length)}`;
  });

  const updatedBlock = updatedLines.join("\n");
  const newText = `${text.slice(0, lineStart)}${updatedBlock}${text.slice(lineEnd)}`;

  if (start === end && lines.length === 1) {
    const delta = updatedLines[0].length - lines[0].length;
    const nextCursorPos = Math.max(lineStart, start + delta);
    return {
      newText,
      selectionStart: nextCursorPos,
      selectionEnd: nextCursorPos,
    };
  }

  return {
    newText,
    selectionStart: lineStart,
    selectionEnd: lineStart + updatedBlock.length,
  };
}

export function wrapSelection(textarea, wrapChar) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selectedText = text.substring(start, end);

  if (!selectedText) {
    return insertAtCursor(textarea, `${wrapChar}${wrapChar}`);
  }

  const before = text.substring(0, start);
  const after = text.substring(end, text.length);
  const newText = before + wrapChar + selectedText + wrapChar + after;

  return {
    newText,
    newCursorPos: end + wrapChar.length * 2,
  };
}
