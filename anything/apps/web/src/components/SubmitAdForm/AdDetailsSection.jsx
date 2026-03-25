import { useRef } from "react";
import { List } from "lucide-react";
import { MediaUploadSection } from "./MediaUploadSection";
import { EmojiPicker } from "@/components/EmojiPicker";
import { insertAtCursor, toggleBulletList, wrapSelection } from "@/utils/whatsappFormatter";
import { AD_NAME_MAX_LENGTH, AD_TEXT_MAX_LENGTH } from "@/lib/inputLimits";

export function AdDetailsSection({
  formData,
  onChange,
  onAddMedia,
  onRemoveMedia,
  showAlert,
}) {
  const textareaRef = useRef(null);
  const handleFormatting = (formatChar) => {
    if (!textareaRef.current) return;

    const { newText, newCursorPos } = wrapSelection(textareaRef.current, formatChar);
    onChange("ad_text", newText);

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
    onChange("ad_text", newText);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleBulletList = () => {
    if (!textareaRef.current) return;

    const { newText, selectionStart, selectionEnd } = toggleBulletList(textareaRef.current);
    onChange("ad_text", newText);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(selectionStart, selectionEnd);
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
    const currentText = String(formData?.ad_text || "");
    const selectionStart = Number.isFinite(input.selectionStart) ? input.selectionStart : currentText.length;
    const selectionEnd = Number.isFinite(input.selectionEnd) ? input.selectionEnd : selectionStart;

    const before = currentText.slice(0, selectionStart);
    const after = currentText.slice(selectionEnd);
    const available = Math.max(0, AD_TEXT_MAX_LENGTH - (before.length + after.length));

    if (available <= 0) {
      return;
    }

    const nextChunk = pastedText.slice(0, available);
    const nextValue = `${before}${nextChunk}${after}`;
    const nextCursorPos = before.length + nextChunk.length;

    onChange("ad_text", nextValue);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCursorPos, nextCursorPos);
      }
    }, 0);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Ad Details</h3>

      <div className="mb-4">
        <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Ad Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="ad_name"
            required
            value={formData.ad_name}
            onChange={(e) => onChange("ad_name", e.target.value)}
            placeholder="Enter ad name"
            className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
            maxLength={AD_NAME_MAX_LENGTH}
          />
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg bg-white overflow-hidden hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0 mb-4">
        <div className="flex items-center justify-between px-4 pt-4 border-b border-gray-100 pb-3">
          <label className="text-xs font-semibold text-gray-700">
            Ad Text <span className={`ml-1 font-normal ${(formData.ad_text?.length || 0) >= 1400 ? "text-red-500" : "text-gray-400"}`}>{formData.ad_text?.length || 0}/{AD_TEXT_MAX_LENGTH}</span>
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
            <button
              type="button"
              onClick={handleBulletList}
              className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
              title="Bullet list"
            >
              <List size={16} />
            </button>
            <div className="w-px h-6 bg-gray-200 mx-1" />
            <EmojiPicker onEmojiSelect={handleEmojiSelect} />
          </div>
        </div>

        <textarea
          ref={textareaRef}
          name="ad_text"
          value={formData.ad_text}
          onChange={(event) => onChange("ad_text", event.target.value)}
          onPaste={handleAdTextPaste}
          rows={4}
          maxLength={AD_TEXT_MAX_LENGTH}
          placeholder="Enter your ad copy... Use *bold*, _italic_, ~strikethrough~, ```code```, or bullet lists"
          className="w-full px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none resize-y"
        />
      </div>

      <MediaUploadSection
        media={formData.media}
        onAddMedia={onAddMedia}
        onRemoveMedia={onRemoveMedia}
        showAlert={showAlert}
      />
    </div>
  );
}
