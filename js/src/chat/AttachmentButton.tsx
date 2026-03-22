import { useRef, memo } from "react"
import { paperclip } from "../utils/icons"

const ACCEPTED_TYPES = [
  "image/*",
  ".pdf",
  ".txt",
  ".csv",
  ".json",
  ".md",
  ".R",
  ".py",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".html",
  ".css",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".log",
  ".sql",
  ".sh",
  ".r",
].join(",")

export interface AttachmentButtonProps {
  disabled: boolean
  onFilesSelected: (files: File[]) => void
}

export const AttachmentButton = memo(function AttachmentButton({
  disabled,
  onFilesSelected,
}: AttachmentButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleClick(): void {
    fileInputRef.current?.click()
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const files = e.target.files
    if (!files || files.length === 0) return
    onFilesSelected(Array.from(files))
    // Reset so the same file can be selected again
    e.target.value = ""
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        style={{ display: "none" }}
        onChange={handleChange}
        tabIndex={-1}
      />
      <button
        type="button"
        className="shiny-chat-btn-attach"
        title="Attach files"
        aria-label="Attach files"
        disabled={disabled}
        onClick={handleClick}
        // Safe: paperclip is a hardcoded SVG constant from utils/icons.ts, not user content
        dangerouslySetInnerHTML={{ __html: paperclip }}
      />
    </>
  )
})
