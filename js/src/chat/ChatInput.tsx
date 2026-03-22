import {
  useState,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  memo,
} from "react"
import { useChatDispatch } from "./context"
import type { ChatTransport } from "../transport/types"
import { arrowUpCircleFill } from "../utils/icons"
import { AudioInput } from "./AudioInput"
import { AttachmentButton } from "./AttachmentButton"
import { AttachmentPreviews, type StagedFile } from "./AttachmentPreviews"
import {
  SlashCommandMenu,
  type SlashCommandMenuHandle,
} from "./SlashCommandMenu"
import { evaluateSlashTrigger, type SlashCommandDef } from "./slash-commands"

export type AudioInputMode = "transcribe" | "raw"

const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB

export interface ChatInputProps {
  transport: ChatTransport
  inputId: string
  disabled: boolean
  hasTopShadow?: boolean
  placeholder: string
  audioInputMode?: AudioInputMode | null
  fileInputEnabled?: boolean
  commands?: SlashCommandDef[]
  onCommandExecute?: (cmd: SlashCommandDef) => void
  onSend?: () => void
}

export interface ChatInputHandle {
  setInputValue(
    value: string,
    options?: { submit?: boolean; focus?: boolean },
  ): void
  focus(): void
  addFiles(files: File[]): void
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data-URI prefix ("data:image/png;base64,")
      const base64 = result.split(",")[1] || ""
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export const ChatInput = memo(
  forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
    {
      transport,
      inputId,
      disabled,
      hasTopShadow = false,
      placeholder,
      audioInputMode,
      fileInputEnabled = false,
      commands = [],
      onCommandExecute,
      onSend,
    },
    ref,
  ) {
    const dispatch = useChatDispatch()

    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const isComposingRef = useRef(false)
    const [hasText, setHasText] = useState(false)
    const [isRecording, setIsRecording] = useState(false)
    const [slashQuery, setSlashQuery] = useState<string | null>(null)
    const slashMenuRef = useRef<SlashCommandMenuHandle>(null)
    const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
    // Ref kept in sync during render so sendInput can read fresh values
    // without being listed as a dependency (same pattern as pendingUrlRef
    // in ChatContainer.tsx)
    const stagedFilesRef = useRef<StagedFile[]>([])
    stagedFilesRef.current = stagedFiles

    function updateHeight(el: HTMLTextAreaElement): void {
      if (el.scrollHeight === 0) return
      el.style.height = "auto"
      el.style.height = `${el.scrollHeight}px`
    }

    const addFiles = useCallback((files: File[]): void => {
      const validFiles = files.filter((f) => {
        if (f.size > MAX_FILE_BYTES) {
          console.warn(
            `File "${f.name}" exceeds ${MAX_FILE_BYTES / (1024 * 1024)} MB limit, skipping.`,
          )
          return false
        }
        return true
      })

      if (validFiles.length === 0) return

      Promise.all(
        validFiles.map(async (file) => {
          const data = await readFileAsBase64(file)
          const staged: StagedFile = {
            id: crypto.randomUUID(),
            name: file.name,
            type: file.type || "application/octet-stream",
            objectUrl: URL.createObjectURL(file),
            data,
          }
          return staged
        }),
      ).then((newFiles) => {
        setStagedFiles((prev) => [...prev, ...newFiles])
      })
    }, [])

    const removeFile = useCallback((id: string): void => {
      setStagedFiles((prev) => {
        const file = prev.find((f) => f.id === id)
        if (file) URL.revokeObjectURL(file.objectUrl)
        return prev.filter((f) => f.id !== id)
      })
    }, [])

    const clearStagedFiles = useCallback((): void => {
      stagedFilesRef.current.forEach((f) => URL.revokeObjectURL(f.objectUrl))
      setStagedFiles([])
    }, [])

    const sendFilesInput = useCallback((): void => {
      const files = stagedFilesRef.current
      if (files.length === 0) return
      const payload = files.map((f) => ({
        name: f.name,
        type: f.type,
        data: f.data,
      }))
      if (window.Shiny?.setInputValue) {
        window.Shiny.setInputValue(`${inputId}_files`, payload, {
          priority: "event",
        })
      }
    }, [inputId])

    const sendInput = useCallback(
      (focusAfter = true): void => {
        const el = textareaRef.current
        if (!el) return
        const content = el.value
        const hasFiles = stagedFilesRef.current.length > 0
        if (content.trim().length === 0 && !hasFiles) return
        if (disabled) return

        dispatch({ type: "INPUT_SENT", content, role: "user" })
        transport.sendInput(inputId, content)
        sendFilesInput()
        onSend?.()

        // Clear the DOM element directly (textarea is fully uncontrolled)
        el.value = ""
        setHasText(false)
        updateHeight(el)
        clearStagedFiles()

        if (focusAfter) el.focus()
      },
      [
        disabled,
        dispatch,
        transport,
        inputId,
        onSend,
        sendFilesInput,
        clearStagedFiles,
      ],
    )

    const handleCommandSelect = useCallback(
      (cmd: SlashCommandDef): void => {
        const el = textareaRef.current
        if (!el) return
        el.value = ""
        updateHeight(el)
        setHasText(false)
        setSlashQuery(null)
        onCommandExecute?.(cmd)
        el.focus()
      },
      [onCommandExecute],
    )

    const onKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
        // When slash menu is open, intercept navigation keys
        if (slashQuery !== null && slashMenuRef.current) {
          if (e.key === "ArrowUp") {
            e.preventDefault()
            slashMenuRef.current.moveUp()
            return
          }
          if (e.key === "ArrowDown") {
            e.preventDefault()
            slashMenuRef.current.moveDown()
            return
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            slashMenuRef.current.selectActive()
            return
          }
          if (e.key === "Escape") {
            setSlashQuery(null)
            return
          }
        }

        const isEnter = e.code === "Enter" && !e.shiftKey
        const el = textareaRef.current
        if (!el) return
        const hasFiles = stagedFilesRef.current.length > 0
        if (
          isEnter &&
          !isComposingRef.current &&
          (el.value.trim().length > 0 || hasFiles)
        ) {
          e.preventDefault()
          sendInput()
        }
      },
      [sendInput, slashQuery],
    )

    const onInput = useCallback((): void => {
      const el = textareaRef.current
      if (!el) return
      updateHeight(el)
      setHasText(el.value.trim().length > 0)

      // Evaluate slash command trigger
      if (commands.length > 0) {
        const { active, query } = evaluateSlashTrigger(
          el.value,
          el.selectionStart,
        )
        setSlashQuery(active ? query : null)
      }
    }, [commands.length])

    const onCompositionStart = useCallback((): void => {
      isComposingRef.current = true
    }, [])

    const onCompositionEnd = useCallback((): void => {
      isComposingRef.current = false
    }, [])

    const onPaste = useCallback(
      (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
        if (!fileInputEnabled) return
        const items = e.clipboardData?.items
        if (!items) return

        const files: File[] = []
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item && item.kind === "file") {
            const file = item.getAsFile()
            if (file) files.push(file)
          }
        }

        if (files.length > 0) {
          e.preventDefault()
          addFiles(files)
        }
      },
      [fileInputEnabled, addFiles],
    )

    useImperativeHandle(
      ref,
      () => ({
        setInputValue(
          newValue: string,
          {
            submit = false,
            focus = false,
          }: { submit?: boolean; focus?: boolean } = {},
        ): void {
          const el = textareaRef.current
          if (!el) return

          const oldValue = el.value
          el.value = newValue
          setHasText(newValue.trim().length > 0)
          updateHeight(el)

          if (submit) {
            // Server-triggered submit still respects the disabled guard
            // (we only skip sendInput() to avoid its focus/clear side-effects).
            if (!disabled) {
              const submitContent = el.value
              if (submitContent.trim().length > 0) {
                dispatch({
                  type: "INPUT_SENT",
                  content: submitContent,
                  role: "user",
                })
                transport.sendInput(inputId, submitContent)
                onSend?.()
              }
            }
            // Always restore old value (the submitted value was temporary)
            el.value = oldValue
            setHasText(oldValue.trim().length > 0)
            updateHeight(el)
          }

          if (focus) {
            el.focus()
          }
        },
        focus(): void {
          textareaRef.current?.focus()
        },
        addFiles,
      }),
      [disabled, dispatch, transport, inputId, onSend, addFiles],
    )

    const handleTranscription = useCallback(
      (text: string): void => {
        const el = textareaRef.current
        if (!el) return
        // Set the transcribed text, submit, then restore
        const oldValue = el.value
        el.value = text
        setHasText(true)
        sendInput(true)
        el.value = oldValue
        setHasText(oldValue.trim().length > 0)
        updateHeight(el)
      },
      [sendInput],
    )

    const sendButtonDisabled =
      disabled || (!hasText && stagedFiles.length === 0)

    return (
      <>
        {slashQuery !== null && commands.length > 0 && (
          <SlashCommandMenu
            ref={slashMenuRef}
            commands={commands}
            query={slashQuery}
            anchorEl={textareaRef.current}
            onSelect={handleCommandSelect}
            onDismiss={() => setSlashQuery(null)}
          />
        )}
        <AttachmentPreviews files={stagedFiles} onRemove={removeFile} />
        <textarea
          ref={textareaRef}
          id={inputId}
          className={hasTopShadow ? "form-control shadow" : "form-control"}
          rows={1}
          placeholder={isRecording ? "" : placeholder}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          onInput={onInput}
          onPaste={onPaste}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          aria-label="Chat message"
          data-shiny-no-bind-input
        />
        {fileInputEnabled && (
          <AttachmentButton disabled={disabled} onFilesSelected={addFiles} />
        )}
        {audioInputMode && (
          <AudioInput
            mode={audioInputMode}
            inputId={inputId}
            disabled={disabled}
            onTranscription={handleTranscription}
            onRecordingChange={setIsRecording}
          />
        )}
        <button
          type="button"
          className="shiny-chat-btn-send"
          title="Send message"
          aria-label="Send message"
          disabled={sendButtonDisabled}
          onClick={() => sendInput()}
          // Safe: arrowUpCircleFill is a hardcoded SVG constant from utils/icons.ts
          dangerouslySetInnerHTML={{ __html: arrowUpCircleFill }}
        />
      </>
    )
  }),
)
