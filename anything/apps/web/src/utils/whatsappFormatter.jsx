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