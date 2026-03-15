import { useRef } from "react";
import { EmojiPicker } from "@/components/EmojiPicker";
import { insertAtCursor, wrapSelection } from "@/utils/whatsappFormatter";

const MAX_AD_TEXT_LENGTH = 1500;

export function AdTextEditor({
  label = "Ad Text",
  name = "ad_text",
  value = "",
  onChange,
  placeholder = "Enter your ad copy... Use *bold*, _italic_, ~strikethrough~, or ```code```",
  maxLength = MAX_AD_TEXT_LENGTH,
  className = "",
}) {
  const textareaRef = useRef(null);
  const currentLength = String(value || "").length;

  const handleFormatting = (formatChar) => {
    if (!textareaRef.current) return;

    const { newText, newCursorPos } = wrapSelection(textareaRef.current, formatChar);
    onChange?.(newText);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleEmojiSelect = (emoji) => {
    if (!textareaRef.current) return;

    const { newText, newCursorPos } = insertAtCursor(textareaRef.current, emoji);
    onChange?.(newText);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleAdTextPaste = (event) => {
    const pastedText = String(
      event.clipboardData?.getData("text/plain") ||
        event.clipboardData?.getData("text") ||
        "",
    );

    if (!pastedText) {
      return;
    }

    event.preventDefault();

    const input = event.currentTarget;
    const currentText = String(value || "");
    const selectionStart = Number.isFinite(input.selectionStart) ? input.selectionStart : currentText.length;
    const selectionEnd = Number.isFinite(input.selectionEnd) ? input.selectionEnd : selectionStart;

    const before = currentText.slice(0, selectionStart);
    const after = currentText.slice(selectionEnd);
    const available = Math.max(0, maxLength - (before.length + after.length));

    if (available <= 0) {
      return;
    }

    const nextChunk = pastedText.slice(0, available);
    const nextValue = `${before}${nextChunk}${after}`;
    const nextCursorPos = before.length + nextChunk.length;

    onChange?.(nextValue);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCursorPos, nextCursorPos);
      }
    }, 0);
  };

  return (
    <div
      className={[
        "border border-gray-200 rounded-lg bg-white overflow-hidden hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center justify-between px-4 pt-4 border-b border-gray-100 pb-3">
        <label className="text-xs font-semibold text-gray-700">
          {label}{" "}
          <span
            className={`ml-1 font-normal ${
              currentLength >= 1400 ? "text-red-500" : "text-gray-400"
            }`}
          >
            {currentLength}/{maxLength}
          </span>
        </label>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleFormatting("*")}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
            title="Bold (*text*)"
          >
            <span className="font-bold text-sm">B</span>
          </button>
          <button
            type="button"
            onClick={() => handleFormatting("_")}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
            title="Italic (_text_)"
          >
            <span className="italic text-sm">I</span>
          </button>
          <button
            type="button"
            onClick={() => handleFormatting("~")}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
            title="Strikethrough (~text~)"
          >
            <span className="line-through text-sm">S</span>
          </button>
          <button
            type="button"
            onClick={() => handleFormatting("```")}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg text-gray-600 transition-colors font-mono"
            title="Monospace"
          >
            <span className="text-xs">{"</>"}</span>
          </button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <EmojiPicker onEmojiSelect={handleEmojiSelect} />
        </div>
      </div>

      <textarea
        ref={textareaRef}
        name={name}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        onPaste={handleAdTextPaste}
        rows={4}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none resize-y"
      />
    </div>
  );
}

