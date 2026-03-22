import { memo } from "react"
import { ChatMessage } from "./ChatMessage"
import { MessageErrorBoundary } from "./MessageErrorBoundary"
import type { ChatMessageData } from "./state"

export const ChatMessages = memo(function ChatMessages({
  messages,
  iconAssistant,
  messageActions,
  chatId,
}: {
  messages: ChatMessageData[]
  iconAssistant?: string
  messageActions?: string
  chatId: string
}) {
  return (
    <>
      {messages.map((msg, index) => (
        <MessageErrorBoundary key={msg.id}>
          <ChatMessage
            message={msg}
            iconAssistant={iconAssistant}
            messageActions={messageActions}
            messageIndex={index}
            chatId={chatId}
          />
        </MessageErrorBoundary>
      ))}
    </>
  )
})
