import { useState, useCallback, useEffect, useRef, memo } from "react"
import {
  copy,
  check,
  thumbsUp,
  thumbsDown,
  regenerate,
  share,
  moreHorizontal,
} from "../utils/icons"

type MessageAction = "copy" | "feedback" | "regenerate" | "share" | "more"

const ALL_MESSAGE_ACTIONS: MessageAction[] = [
  "copy",
  "feedback",
  "regenerate",
  "share",
  "more",
]

interface MessageActionsProps {
  messageActions: string
  messageIndex: number
  content: string
  chatId: string
  getTextContent: () => string
}

function isActionEnabled(actionsAttr: string, action: MessageAction): boolean {
  const normalized = actionsAttr.trim().toLowerCase()
  if (!normalized || normalized === "none") return false
  if (normalized === "all") return true
  const enabled = normalized.split(",").map((a) => a.trim())
  return enabled.includes(action)
}

/**
 * SECURITY NOTE: All dangerouslySetInnerHTML usage in this component is safe
 * because the SVG icon strings are hardcoded constants from utils/icons.ts,
 * not user-provided or server-provided content. They contain no dynamic data.
 */

function IconButton({
  className,
  title,
  ariaLabel,
  dataAction,
  onClick,
  iconHtml,
  ariaExpanded,
}: {
  className: string
  title: string
  ariaLabel: string
  dataAction: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  iconHtml: string
  ariaExpanded?: boolean
}) {
  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      data-action={dataAction}
      onClick={onClick}
      // Safe: iconHtml is always a hardcoded SVG constant from utils/icons.ts
      dangerouslySetInnerHTML={{ __html: iconHtml }}
    />
  )
}

export const MessageActions = memo(function MessageActions({
  messageActions,
  messageIndex,
  content,
  chatId,
  getTextContent,
}: MessageActionsProps) {
  const [copySuccess, setCopySuccess] = useState(false)
  const [feedbackGiven, setFeedbackGiven] = useState<
    "positive" | "negative" | null
  >(null)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [menuDirection, setMenuDirection] = useState<"above" | "below">("above")
  const moreWrapperRef = useRef<HTMLDivElement>(null)

  const dispatchActionEvent = useCallback(
    (eventName: string, detail: Record<string, unknown>): void => {
      document.dispatchEvent(
        new CustomEvent(eventName, {
          detail: { ...detail, chatId },
          bubbles: true,
          composed: true,
        }),
      )
    },
    [chatId],
  )

  const onCopyClick = useCallback((): void => {
    const text = getTextContent()
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)

        dispatchActionEvent("shiny-chat-message-copy", {
          messageIndex,
          content,
        })
      })
      .catch((err) => {
        console.warn("Failed to copy message to clipboard:", err)
      })
  }, [getTextContent, messageIndex, content, dispatchActionEvent])

  const onThumbsUpClick = useCallback((): void => {
    setFeedbackGiven((prev) => {
      const next = prev === "positive" ? null : "positive"
      if (next) {
        dispatchActionEvent("shiny-chat-message-feedback", {
          messageIndex,
          content,
          feedback: "positive",
        })
      }
      return next
    })
  }, [messageIndex, content, dispatchActionEvent])

  const onThumbsDownClick = useCallback((): void => {
    setFeedbackGiven((prev) => {
      const next = prev === "negative" ? null : "negative"
      if (next) {
        dispatchActionEvent("shiny-chat-message-feedback", {
          messageIndex,
          content,
          feedback: "negative",
        })
      }
      return next
    })
  }, [messageIndex, content, dispatchActionEvent])

  const onRegenerateClick = useCallback((): void => {
    dispatchActionEvent("shiny-chat-message-regenerate", {
      messageIndex,
      content,
    })
  }, [messageIndex, content, dispatchActionEvent])

  const onShareClick = useCallback((): void => {
    dispatchActionEvent("shiny-chat-message-share", {
      messageIndex,
      content,
    })
  }, [messageIndex, content, dispatchActionEvent])

  const onMoreClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      setShowMoreMenu((prev) => {
        if (!prev) {
          const rect = e.currentTarget.getBoundingClientRect()
          const spaceAbove = rect.top
          const menuHeight = 100
          setMenuDirection(spaceAbove >= menuHeight ? "above" : "below")
        }
        return !prev
      })
    },
    [],
  )

  const onMenuItemClick = useCallback(
    (action: string): void => {
      const text = action === "copy-markdown" ? content : getTextContent()
      navigator.clipboard
        .writeText(text)
        .catch((err) => {
          console.warn("Failed to copy to clipboard:", err)
        })
        .finally(() => {
          setShowMoreMenu(false)
        })
    },
    [content, getTextContent],
  )

  // Close more menu on outside click
  useEffect(() => {
    if (!showMoreMenu) return

    const closeMenu = (e: MouseEvent) => {
      if (
        moreWrapperRef.current &&
        !moreWrapperRef.current.contains(e.target as Node)
      ) {
        setShowMoreMenu(false)
      }
    }
    const timer = setTimeout(
      () => document.addEventListener("click", closeMenu),
      0,
    )
    return () => {
      clearTimeout(timer)
      document.removeEventListener("click", closeMenu)
    }
  }, [showMoreMenu])

  const hasAnyAction = ALL_MESSAGE_ACTIONS.some((a) =>
    isActionEnabled(messageActions, a),
  )
  if (!hasAnyAction) return null

  const copyIcon = copySuccess ? check : copy
  const copyTitle = copySuccess ? "Copied!" : "Copy to clipboard"

  return (
    <div className="message-actions">
      {isActionEnabled(messageActions, "copy") && (
        <IconButton
          className={`message-action-btn${copySuccess ? " success" : ""}`}
          title={copyTitle}
          ariaLabel={copyTitle}
          dataAction="copy"
          onClick={onCopyClick}
          iconHtml={copyIcon}
        />
      )}

      {isActionEnabled(messageActions, "feedback") && (
        <>
          <IconButton
            className={`message-action-btn${feedbackGiven === "positive" ? " active" : ""}`}
            title="Good response"
            ariaLabel="Good response"
            dataAction="thumbs-up"
            onClick={onThumbsUpClick}
            iconHtml={thumbsUp}
          />
          <IconButton
            className={`message-action-btn${feedbackGiven === "negative" ? " active" : ""}`}
            title="Bad response"
            ariaLabel="Bad response"
            dataAction="thumbs-down"
            onClick={onThumbsDownClick}
            iconHtml={thumbsDown}
          />
        </>
      )}

      {isActionEnabled(messageActions, "regenerate") && (
        <IconButton
          className="message-action-btn"
          title="Regenerate response"
          ariaLabel="Regenerate response"
          dataAction="regenerate"
          onClick={onRegenerateClick}
          iconHtml={regenerate}
        />
      )}

      {isActionEnabled(messageActions, "share") && (
        <IconButton
          className="message-action-btn"
          title="Share"
          ariaLabel="Share"
          dataAction="share"
          onClick={onShareClick}
          iconHtml={share}
        />
      )}

      {isActionEnabled(messageActions, "more") && (
        <div className="message-action-more-wrapper" ref={moreWrapperRef}>
          <IconButton
            className="message-action-btn"
            title="More options"
            ariaLabel="More options"
            dataAction="more"
            onClick={onMoreClick}
            iconHtml={moreHorizontal}
            ariaExpanded={showMoreMenu}
          />
          {showMoreMenu && (
            <div
              className={`message-action-menu message-action-menu--${menuDirection}`}
            >
              <button
                type="button"
                className="message-action-menu-item"
                onClick={() => onMenuItemClick("copy-markdown")}
              >
                Copy as Markdown
              </button>
              <button
                type="button"
                className="message-action-menu-item"
                onClick={() => onMenuItemClick("copy-text")}
              >
                Copy as plain text
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
