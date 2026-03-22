import { memo } from "react"
import {
  fileEarmark,
  fileEarmarkPdf,
  fileEarmarkText,
  xSmall,
} from "../utils/icons"

export interface StagedFile {
  id: string
  name: string
  type: string
  objectUrl: string
  data: string // base64, no data-URI prefix
}

interface AttachmentPreviewsProps {
  files: StagedFile[]
  onRemove: (id: string) => void
}

function isImageType(type: string): boolean {
  return type.startsWith("image/")
}

function isPdfType(type: string): boolean {
  return type === "application/pdf"
}

function getFileIcon(type: string): string {
  // All icon strings are hardcoded SVG constants from utils/icons.ts, not user content
  if (isPdfType(type)) return fileEarmarkPdf
  if (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/xml" ||
    type === "application/x-yaml"
  ) {
    return fileEarmarkText
  }
  return fileEarmark
}

function truncateFilename(name: string, maxLen = 20): string {
  if (name.length <= maxLen) return name
  const ext = name.lastIndexOf(".")
  if (ext === -1) return name.slice(0, maxLen - 1) + "\u2026"
  const extStr = name.slice(ext)
  const base = name.slice(0, maxLen - extStr.length - 1)
  return base + "\u2026" + extStr
}

export const AttachmentPreviews = memo(function AttachmentPreviews({
  files,
  onRemove,
}: AttachmentPreviewsProps) {
  if (files.length === 0) return null

  return (
    <div className="shiny-chat-attachment-previews">
      {files.map((file) => (
        <div key={file.id} className="shiny-chat-attachment-preview">
          {isImageType(file.type) ? (
            <img src={file.objectUrl} alt={file.name} />
          ) : (
            <div className="shiny-chat-attachment-file">
              <span
                className="shiny-chat-attachment-file-icon"
                // Safe: getFileIcon returns hardcoded SVG constants from utils/icons.ts
                dangerouslySetInnerHTML={{ __html: getFileIcon(file.type) }}
              />
              <span
                className="shiny-chat-attachment-file-name"
                title={file.name}
              >
                {truncateFilename(file.name)}
              </span>
            </div>
          )}
          <button
            type="button"
            className="shiny-chat-attachment-remove"
            title={`Remove ${file.name}`}
            aria-label={`Remove ${file.name}`}
            onClick={() => onRemove(file.id)}
            // Safe: xSmall is a hardcoded SVG constant from utils/icons.ts
            dangerouslySetInnerHTML={{ __html: xSmall }}
          />
        </div>
      ))}
    </div>
  )
})
