import { memo, useRef, useCallback } from "react"
import type { ChatMessageData } from "./state"
import { MarkdownContent } from "../markdown/MarkdownContent"
import { robot, dots_fade } from "../utils/icons"
import { chatTagToComponentMap } from "./chatTagToComponentMap"
import { MessageActions } from "./MessageActions"

interface ChatMessageProps {
  message: ChatMessageData
  iconAssistant?: string
  messageActions?: string
  messageIndex: number
  chatId: string
}

export const ChatMessage = memo(function ChatMessage({
  message,
  iconAssistant,
  messageActions,
  messageIndex,
  chatId,
}: ChatMessageProps) {
  const isUser = message.role === "user"
  const isEmpty = message.content.trim() === ""
  const contentRef = useRef<HTMLDivElement>(null)

  let iconHtml: string | undefined
  if (isUser) {
    iconHtml = message.icon || undefined
  } else {
    iconHtml = isEmpty ? dots_fade : (message.icon ?? iconAssistant ?? robot)
  }

  const roleClass = isUser ? "shiny-chat-user-message" : "shiny-chat-message"
  const contentTypeClass =
    message.contentType === "text" ? " content-type-text" : ""

  const getTextContent = useCallback((): string => {
    const el = contentRef.current
    if (!el) return message.content

    // Clone and remove tool elements to exclude from copied text
    const clone = el.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll("shiny-tool-request, shiny-tool-result")
      .forEach((toolEl) => toolEl.remove())

    return clone.textContent?.trim() || message.content
  }, [message.content])

  const showActions =
    !isUser && !message.streaming && !isEmpty && !!messageActions

  return (
    <div className={roleClass + contentTypeClass}>
      {iconHtml && (
        <div
          className="message-icon"
          // Safe: iconHtml is from hardcoded SVG constants (utils/icons.ts)
          // or the server-provided icon-assistant attribute (same pattern as PR 181)
          dangerouslySetInnerHTML={{ __html: iconHtml }}
        />
      )}
      <div className="message-content-wrapper">
        <div className="shiny-chat-message-content" ref={contentRef}>
          <MarkdownContent
            content={message.content}
            contentType={message.contentType}
            role={message.role}
            streaming={message.streaming}
            tagToComponentMap={chatTagToComponentMap}
          />
        </div>
        {showActions && (
          <MessageActions
            messageActions={messageActions}
            messageIndex={messageIndex}
            content={message.content}
            chatId={chatId}
            getTextContent={getTextContent}
          />
        )}
      </div>
    </div>
  )
})
