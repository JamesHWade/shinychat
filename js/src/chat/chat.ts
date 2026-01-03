import { LitElement, html } from "lit"
import { unsafeHTML } from "lit-html/directives/unsafe-html.js"
import { property, state } from "lit/decorators.js"

// Web Speech API type declarations
interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  length: number
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

import {
  LightElement,
  createElement,
  renderDependencies,
  showShinyClientMessage,
} from "../utils/_utils"

import { ShinyToolRequest, ShinyToolResult } from "./chat-tools"
import { showExternalLinkConfirmation } from "./chat-external-link"

import type { HtmlDep } from "../utils/_utils"

type ContentType = "markdown" | "html" | "text" | "semi-markdown"

type MessageAttrs = {
  content: string
  data_role: "user" | "assistant"
  chunk_type: "message_start" | "message_end" | null
  content_type: ContentType
  icon?: string
  operation: "append" | null
}

type Message = Omit<MessageAttrs, "data_role"> & {
  role: MessageAttrs["data_role"]
}

type ShinyChatMessage = {
  id: string
  handler: string
  // Message keys will create custom element attributes, but html_deps are handled
  // separately
  obj: (Message & { html_deps?: HtmlDep[] }) | null
}

type UpdateUserInput = {
  value?: string
  placeholder?: string
  submit?: false
  focus?: false
}

type AudioInputData = {
  audio: string // base64 encoded audio
  format: string // e.g., "audio/webm", "audio/wav"
  duration: number // duration in seconds
  size: number // size in bytes
}

// https://github.com/microsoft/TypeScript/issues/28357#issuecomment-748550734
declare global {
  interface GlobalEventHandlersEventMap {
    "shiny-chat-input-sent": CustomEvent<Message>
    "shiny-chat-append-message": CustomEvent<Message>
    "shiny-chat-append-message-chunk": CustomEvent<Message>
    "shiny-chat-clear-messages": CustomEvent
    "shiny-chat-update-user-input": CustomEvent<UpdateUserInput>
    "shiny-chat-remove-loading-message": CustomEvent
    "shiny-chat-audio-input": CustomEvent<AudioInputData>
  }
}

const CHAT_MESSAGE_TAG = "shiny-chat-message"
const CHAT_USER_MESSAGE_TAG = "shiny-user-message"
const CHAT_MESSAGES_TAG = "shiny-chat-messages"
const CHAT_INPUT_TAG = "shiny-chat-input"
const CHAT_CONTAINER_TAG = "shiny-chat-container"
const CHAT_TOOL_REQUEST_TAG = "shiny-tool-request"
const CHAT_TOOL_RESULT_TAG = "shiny-tool-result"

const ICONS = {
  robot:
    '<svg fill="currentColor" class="bi bi-robot" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M6 12.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5M3 8.062C3 6.76 4.235 5.765 5.53 5.886a26.6 26.6 0 0 0 4.94 0C11.765 5.765 13 6.76 13 8.062v1.157a.93.93 0 0 1-.765.935c-.845.147-2.34.346-4.235.346s-3.39-.2-4.235-.346A.93.93 0 0 1 3 9.219zm4.542-.827a.25.25 0 0 0-.217.068l-.92.9a25 25 0 0 1-1.871-.183.25.25 0 0 0-.068.495c.55.076 1.232.149 2.02.193a.25.25 0 0 0 .189-.071l.754-.736.847 1.71a.25.25 0 0 0 .404.062l.932-.97a25 25 0 0 0 1.922-.188.25.25 0 0 0-.068-.495c-.538.074-1.207.145-1.98.189a.25.25 0 0 0-.166.076l-.754.785-.842-1.7a.25.25 0 0 0-.182-.135"/><path d="M8.5 1.866a1 1 0 1 0-1 0V3h-2A4.5 4.5 0 0 0 1 7.5V8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1v-.5A4.5 4.5 0 0 0 10.5 3h-2zM14 7.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.5A3.5 3.5 0 0 1 5.5 4h5A3.5 3.5 0 0 1 14 7.5"/></svg>',
  // https://github.com/n3r4zzurr0/svg-spinners/blob/main/svg-css/3-dots-fade.svg
  dots_fade:
    '<svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><style>.spinner_S1WN{animation:spinner_MGfb .8s linear infinite;animation-delay:-.8s}.spinner_Km9P{animation-delay:-.65s}.spinner_JApP{animation-delay:-.5s}@keyframes spinner_MGfb{93.75%,100%{opacity:.2}}</style><circle class="spinner_S1WN" cx="4" cy="12" r="3"/><circle class="spinner_S1WN spinner_Km9P" cx="12" cy="12" r="3"/><circle class="spinner_S1WN spinner_JApP" cx="20" cy="12" r="3"/></svg>',
  // Bootstrap microphone icon
  microphone:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-mic" viewBox="0 0 16 16"><path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5"/><path d="M10 8a2 2 0 1 1-4 0V3a2 2 0 1 1 4 0zM8 0a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V3a3 3 0 0 0-3-3"/></svg>',
  // Bootstrap stop-circle icon for stopping recording
  stop_circle:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-stop-circle-fill" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M6.5 5A1.5 1.5 0 0 0 5 6.5v3A1.5 1.5 0 0 0 6.5 11h3A1.5 1.5 0 0 0 11 9.5v-3A1.5 1.5 0 0 0 9.5 5z"/></svg>',
}

class ChatMessage extends LightElement {
  @property() content = "..."
  @property({ attribute: "content-type" }) contentType: ContentType = "markdown"
  @property({ type: Boolean, reflect: true }) streaming = false
  @property() icon = ""
  @property({ attribute: "data-role" }) role: "user" | "assistant" = "assistant"

  render() {
    const icon = this.#messageIcon()

    return html`
      ${icon}
      <shiny-markdown-stream
        content=${this.content}
        content-type=${this.contentType}
        ?streaming=${this.streaming}
        ?auto-scroll=${this.role === "assistant"}
        .onContentChange=${this.#onContentChange.bind(this)}
        .onStreamEnd=${this.#makeSuggestionsAccessible.bind(this)}
      ></shiny-markdown-stream>
    `
  }

  #messageIcon() {
    const icon = this.#getIcon()
    return icon
      ? html`<div class="message-icon">${unsafeHTML(icon)}</div>`
      : null
  }

  #getIcon() {
    if (this.role !== "assistant") {
      return this.icon
    }

    // Show dots until we have content (for assistant messages only)
    const isEmpty = this.content.trim().length === 0
    return isEmpty ? ICONS.dots_fade : this.icon || ICONS.robot
  }

  #onContentChange(): void {
    if (!this.streaming) this.#makeSuggestionsAccessible()
  }

  #makeSuggestionsAccessible(): void {
    this.querySelectorAll(".suggestion,[data-suggestion]").forEach((el) => {
      if (!(el instanceof HTMLElement)) return
      if (el.hasAttribute("tabindex")) return

      el.setAttribute("tabindex", "0")
      el.setAttribute("role", "button")

      const suggestion = el.dataset.suggestion || el.textContent
      el.setAttribute("aria-label", `Use chat suggestion: ${suggestion}`)
    })
  }
}

class ChatUserMessage extends ChatMessage {
  constructor() {
    super()
    this.role = "user" // Always set role to user for this subclass
    this.contentType = "semi-markdown" // User messages are always semi-markdown
  }
}

class ChatMessages extends LightElement {
  render() {
    return html``
  }
}

interface ChatInputSetInputOptions {
  submit?: boolean
  focus?: boolean
}

class ChatInput extends LightElement {
  @property() placeholder = "Enter a message..."
  // disabled is reflected manually because `reflect: true` doesn't work with LightElement
  @property({ type: Boolean })
  get disabled() {
    return this._disabled
  }

  set disabled(value: boolean) {
    const oldValue = this._disabled
    if (value === oldValue) {
      return
    }

    this._disabled = value
    if (value) {
      this.setAttribute("disabled", "")
    } else {
      this.removeAttribute("disabled")
    }

    this.requestUpdate("disabled", oldValue)
    this.#onInput()
  }

  private _disabled = false
  private _isComposing = false
  inputVisibleObserver?: IntersectionObserver

  // Audio recording state
  // audio-input accepts: "transcribe" (use Web Speech API), "raw" (send audio blob), or empty/false
  @property({ attribute: "audio-input" }) audioInputMode: string = ""
  @state() private _isRecording = false
  @state() private _recordingDuration = 0
  private _mediaRecorder: MediaRecorder | null = null
  private _audioChunks: Blob[] = []
  private _recordingStartTime = 0
  private _recordingTimer: number | null = null
  private _speechRecognition: SpeechRecognition | null = null
  private _finalTranscript: string = "" // Accumulated final results
  @state() private _transcribedText: string = "" // Display text (finals + interim)

  connectedCallback(): void {
    super.connectedCallback()

    this.inputVisibleObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) this.#updateHeight()
      })
    })

    this.inputVisibleObserver.observe(this)
    this.addEventListener("compositionstart", this.#onCompositionStart)
    this.addEventListener("compositionend", this.#onCompositionEnd)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.inputVisibleObserver?.disconnect()
    this.inputVisibleObserver = undefined
    this.removeEventListener("compositionstart", this.#onCompositionStart)
    this.removeEventListener("compositionend", this.#onCompositionEnd)
    this.#stopRecording(true) // Cancel any ongoing recording/transcription
  }

  attributeChangedCallback(
    name: string,
    _old: string | null,
    value: string | null,
  ) {
    super.attributeChangedCallback(name, _old, value)
    if (name === "disabled") {
      this.disabled = value !== null
    }
  }

  private get textarea(): HTMLTextAreaElement {
    return this.querySelector("textarea") as HTMLTextAreaElement
  }

  private get value(): string {
    return this.textarea.value
  }

  private get valueIsEmpty(): boolean {
    return this.value.trim().length === 0
  }

  private get button(): HTMLButtonElement {
    return this.querySelector(".shiny-chat-btn-send") as HTMLButtonElement
  }

  private get audioInputEnabled(): boolean {
    return this.audioInputMode === "transcribe" || this.audioInputMode === "raw"
  }

  private get isTranscribeMode(): boolean {
    return this.audioInputMode === "transcribe"
  }

  render() {
    const sendIcon =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-arrow-up-circle-fill" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 0 0 8a8 8 0 0 0 16 0m-7.5 3.5a.5.5 0 0 1-1 0V5.707L5.354 7.854a.5.5 0 1 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 5.707z"/></svg>'

    // Recording indicator content depends on mode
    const recordingContent = this._isRecording
      ? this.isTranscribeMode
        ? html`
            <span class="recording-indicator transcribing">
              ${unsafeHTML(ICONS.stop_circle)}
              <span class="transcribed-text"
                >${this._transcribedText || "Listening..."}</span
              >
            </span>
          `
        : html`
            <span class="recording-indicator">
              ${unsafeHTML(ICONS.stop_circle)}
              <span class="recording-time"
                >${this.#formatDuration(this._recordingDuration)}</span
              >
            </span>
          `
      : unsafeHTML(ICONS.microphone)

    const micButton = this.audioInputEnabled
      ? html`
          <button
            type="button"
            class="shiny-chat-btn-mic ${this._isRecording ? "recording" : ""}"
            title="${this._isRecording ? "Stop recording" : "Record audio"}"
            aria-label="${this._isRecording
              ? "Stop recording"
              : "Record audio"}"
            @click=${this.#toggleRecording}
            ?disabled=${this.disabled}
          >
            ${recordingContent}
          </button>
        `
      : null

    return html`
      <textarea
        id="${this.id}"
        class="form-control"
        rows="1"
        placeholder="${this.placeholder}"
        @keydown=${this.#onKeyDown}
        @input=${this.#onInput}
        data-shiny-no-bind-input
      ></textarea>
      ${micButton}
      <button
        type="button"
        class="shiny-chat-btn-send"
        title="Send message"
        aria-label="Send message"
        @click=${this.#sendInput}
      >
        ${unsafeHTML(sendIcon)}
      </button>
    `
  }

  // Pressing enter sends the message (if not empty)
  #onKeyDown(e: KeyboardEvent): void {
    const isEnter = e.code === "Enter" && !e.shiftKey
    if (isEnter && !this._isComposing && !this.valueIsEmpty) {
      e.preventDefault()
      this.#sendInput()
    }
  }

  #onInput(): void {
    this.#updateHeight()
    this.button.disabled = this.disabled ? true : this.value.trim().length === 0
  }

  #onCompositionStart(): void {
    this._isComposing = true
  }

  #onCompositionEnd(): void {
    this._isComposing = false
  }

  // Determine whether the button should be enabled/disabled on first render
  protected firstUpdated(): void {
    this.#onInput()
  }

  #sendInput(focus = true): void {
    if (this.valueIsEmpty) return
    if (this.disabled) return

    window.Shiny.setInputValue!(this.id, this.value, { priority: "event" })

    // Emit event so parent element knows to insert the message
    const sentEvent = new CustomEvent("shiny-chat-input-sent", {
      detail: { content: this.value, role: "user" },
      bubbles: true,
      composed: true,
    })
    this.dispatchEvent(sentEvent)

    this.setInputValue("")
    this.disabled = true

    if (focus) this.textarea.focus()
  }

  #updateHeight(): void {
    const el = this.textarea
    if (el.scrollHeight == 0) {
      return
    }
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }

  setInputValue(
    value: string,
    { submit = false, focus = false }: ChatInputSetInputOptions = {},
  ): void {
    // Store previous value to restore post-submit (if submitting)
    const oldValue = this.textarea.value

    this.textarea.value = value

    // Simulate an input event (to trigger the textarea autoresize)
    const inputEvent = new Event("input", { bubbles: true, cancelable: true })
    this.textarea.dispatchEvent(inputEvent)

    if (submit) {
      this.#sendInput(false)
      if (oldValue) this.setInputValue(oldValue)
    }

    if (focus) {
      this.textarea.focus()
    }
  }

  // Audio recording methods
  #formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  #toggleRecording(): void {
    if (this._isRecording) {
      this.#stopRecording(false)
    } else {
      if (this.isTranscribeMode) {
        this.#startTranscription()
      } else {
        this.#startRecording()
      }
    }
  }

  // Transcribe mode: Use Web Speech API
  #startTranscription(): void {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.warn(
        "Speech recognition not supported in this browser. Falling back to raw audio mode.",
      )
      this.#startRecording()
      return
    }

    try {
      this._speechRecognition = new SpeechRecognition()
      this._speechRecognition.continuous = true
      this._speechRecognition.interimResults = true
      this._speechRecognition.lang = navigator.language || "en-US"

      this._finalTranscript = ""
      this._transcribedText = ""

      this._speechRecognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = ""

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (!result || !result[0]) continue
          const transcript = result[0].transcript
          if (result.isFinal) {
            // Add final results to accumulated finals
            this._finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }

        // Display: accumulated finals + current interim (interim replaces each time)
        this._transcribedText = (
          this._finalTranscript + interimTranscript
        ).trim()
      }

      this._speechRecognition.onerror = (
        event: SpeechRecognitionErrorEvent,
      ) => {
        const errorMessages: Record<string, string> = {
          network:
            "Network error: Speech recognition requires internet access. Try using audio_input='raw' for offline recording.",
          "not-allowed":
            "Microphone access denied. Please allow microphone access in your browser.",
          "no-speech": "No speech detected. Please try again.",
          aborted: "Speech recognition was aborted.",
        }
        const message =
          errorMessages[event.error] ||
          `Speech recognition error: ${event.error}`
        console.warn(message)
        this.#stopRecording(true)
      }

      this._speechRecognition.onend = () => {
        // Recognition ended (could be due to silence or user stop)
        if (this._isRecording) {
          // If we're still in recording state, user didn't manually stop
          // Auto-restart to keep listening (browser may stop after silence)
          this._speechRecognition?.start()
        }
      }

      this._speechRecognition.start()
      this._isRecording = true
      this._recordingStartTime = Date.now()
    } catch (err) {
      console.warn("Failed to start speech recognition:", err)
    }
  }

  // Raw mode: Use MediaRecorder
  async #startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Prefer webm/opus for broad compatibility, fall back to wav
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/wav"

      this._mediaRecorder = new MediaRecorder(stream, { mimeType })
      this._audioChunks = []

      this._mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this._audioChunks.push(event.data)
        }
      }

      this._mediaRecorder.onstop = () => {
        // Stop all tracks to release the microphone
        stream.getTracks().forEach((track) => track.stop())
      }

      this._mediaRecorder.start()
      this._isRecording = true
      this._recordingStartTime = Date.now()
      this._recordingDuration = 0

      // Update duration every second
      this._recordingTimer = window.setInterval(() => {
        this._recordingDuration = Math.floor(
          (Date.now() - this._recordingStartTime) / 1000,
        )
      }, 1000)
    } catch (err) {
      console.warn("Failed to start audio recording:", err)
    }
  }

  #stopRecording(cancel: boolean): void {
    // Handle transcription mode
    if (this._speechRecognition) {
      this._speechRecognition.onend = null // Prevent auto-restart
      this._speechRecognition.stop()
      this._speechRecognition = null

      if (!cancel && this._transcribedText.trim()) {
        // Insert transcribed text and submit
        this.setInputValue(this._transcribedText.trim(), {
          submit: true,
          focus: true,
        })
      }

      this._isRecording = false
      this._transcribedText = ""
      return
    }

    // Handle raw audio mode
    if (!this._mediaRecorder || !this._isRecording) return

    // Clear the timer
    if (this._recordingTimer !== null) {
      clearInterval(this._recordingTimer)
      this._recordingTimer = null
    }

    const duration = (Date.now() - this._recordingStartTime) / 1000

    if (cancel) {
      // Just stop without processing
      this._mediaRecorder.stop()
      this._isRecording = false
      this._audioChunks = []
      return
    }

    // Set up handler for when recording data is ready
    this._mediaRecorder.onstop = () => {
      // Stop all tracks to release the microphone
      this._mediaRecorder?.stream.getTracks().forEach((track) => track.stop())

      if (this._audioChunks.length > 0) {
        const mimeType = this._mediaRecorder?.mimeType || "audio/webm"
        const audioBlob = new Blob(this._audioChunks, { type: mimeType })
        this.#sendAudioData(audioBlob, mimeType, duration)
      }

      this._audioChunks = []
    }

    this._mediaRecorder.stop()
    this._isRecording = false
  }

  #sendAudioData(blob: Blob, format: string, duration: number): void {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      const base64 = result.split(",")[1] || "" // Remove data URL prefix

      const audioData: AudioInputData = {
        audio: base64,
        format: format,
        duration: duration,
        size: blob.size,
      }

      // Send to Shiny
      if (!window.Shiny?.setInputValue) {
        console.warn("Shiny not available, cannot send audio input")
        return
      }
      window.Shiny.setInputValue(`${this.id}_audio`, audioData, {
        priority: "event",
      })

      // Emit event for parent component
      const audioEvent = new CustomEvent("shiny-chat-audio-input", {
        detail: audioData,
        bubbles: true,
        composed: true,
      })
      this.dispatchEvent(audioEvent)
    }

    reader.readAsDataURL(blob)
  }
}

class ChatContainer extends LightElement {
  @property({ attribute: "icon-assistant" }) iconAssistant = ""
  inputSentinelObserver?: IntersectionObserver
  _attachEventListenersOnReconnect = false
  _boundOnExternalLinkClick!: (e: MouseEvent) => void

  private get input(): ChatInput {
    return this.querySelector(CHAT_INPUT_TAG) as ChatInput
  }

  private get messages(): ChatMessages {
    return this.querySelector(CHAT_MESSAGES_TAG) as ChatMessages
  }

  private get lastMessage(): ChatMessage | null {
    const last = this.messages.lastElementChild
    return last ? (last as ChatMessage) : null
  }

  render() {
    return html``
  }

  connectedCallback(): void {
    super.connectedCallback()

    // We use a sentinel element that we place just above the shiny-chat-input. When it
    // moves off-screen we know that the text area input is now floating, add shadow.
    let sentinel = this.querySelector<HTMLElement>("div")
    if (!sentinel) {
      sentinel = createElement("div", {
        style: "width: 100%; height: 0;",
      }) as HTMLElement
      this.input.insertAdjacentElement("afterend", sentinel)
    }

    this.inputSentinelObserver = new IntersectionObserver(
      (entries) => {
        const inputTextarea = this.input.querySelector("textarea")
        if (!inputTextarea) return
        const addShadow = entries[0]?.intersectionRatio === 0
        inputTextarea.classList.toggle("shadow", addShadow)
      },
      {
        threshold: [0, 1],
        rootMargin: "0px",
      },
    )

    this.inputSentinelObserver.observe(sentinel)
    this._boundOnExternalLinkClick = this.#onExternalLinkClick.bind(this)

    if (this._attachEventListenersOnReconnect) {
      this.#addEventListeners()
    }
  }

  firstUpdated(): void {
    // Don't attach event listeners until child elements are rendered
    if (!this.messages) return
    this.#addEventListeners()
  }

  #addEventListeners(): void {
    this._attachEventListenersOnReconnect = true
    this.addEventListener("shiny-chat-input-sent", this.#onInputSent)
    this.addEventListener("shiny-chat-append-message", this.#onAppend)
    this.addEventListener(
      "shiny-chat-append-message-chunk",
      this.#onAppendChunk,
    )
    this.addEventListener("shiny-chat-clear-messages", this.#onClear)
    this.addEventListener(
      "shiny-chat-update-user-input",
      this.#onUpdateUserInput,
    )
    this.addEventListener(
      "shiny-chat-remove-loading-message",
      this.#onRemoveLoadingMessage,
    )
    this.addEventListener("click", this.#onInputSuggestionClick)
    this.addEventListener("keydown", this.#onInputSuggestionKeydown)
    // Add external link handler to the window so that it's easier for users to disable
    window.addEventListener("click", this._boundOnExternalLinkClick)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this._attachEventListenersOnReconnect = true

    this.inputSentinelObserver?.disconnect()
    this.inputSentinelObserver = undefined

    this.removeEventListener("shiny-chat-input-sent", this.#onInputSent)
    this.removeEventListener("shiny-chat-append-message", this.#onAppend)
    this.removeEventListener(
      "shiny-chat-append-message-chunk",
      this.#onAppendChunk,
    )
    this.removeEventListener("shiny-chat-clear-messages", this.#onClear)
    this.removeEventListener(
      "shiny-chat-update-user-input",
      this.#onUpdateUserInput,
    )
    this.removeEventListener(
      "shiny-chat-remove-loading-message",
      this.#onRemoveLoadingMessage,
    )
    this.removeEventListener("click", this.#onInputSuggestionClick)
    this.removeEventListener("keydown", this.#onInputSuggestionKeydown)
    window.removeEventListener("click", this._boundOnExternalLinkClick)
  }

  // When user submits input, append it to the chat, and add a loading message
  #onInputSent(event: CustomEvent<Message>): void {
    this.#appendMessage(event.detail)
    this.#addLoadingMessage()
  }

  // Handle an append message event from server
  #onAppend(event: CustomEvent<Message>): void {
    this.#appendMessage(event.detail)
  }

  #initMessage(): void {
    this.#removeLoadingMessage()
    if (!this.input.disabled) {
      this.input.disabled = true
    }
  }

  #appendMessage(message: Message, finalize = true): void {
    this.#initMessage()

    const TAG_NAME = CHAT_MESSAGE_TAG

    // Remap role to data_role for the custom element attribute
    const { role, ...restMessage } = message

    if (role === "assistant" && this.iconAssistant) {
      restMessage.icon = message.icon || this.iconAssistant
    }

    const messageAttrs: MessageAttrs = { data_role: role, ...restMessage }

    const msg = createElement(TAG_NAME, messageAttrs)
    this.messages.appendChild(msg)

    if (finalize) {
      this.#finalizeMessage()
    }
  }

  // Loading message is just an empty message
  #addLoadingMessage(): void {
    const loading_message = {
      content: "",
      role: "assistant",
    }
    const message = createElement(CHAT_MESSAGE_TAG, loading_message)
    this.messages.appendChild(message)
  }

  #removeLoadingMessage(): void {
    const content = this.lastMessage?.content
    if (!content) this.lastMessage?.remove()
  }

  #onAppendChunk(event: CustomEvent<Message>): void {
    this.#appendMessageChunk(event.detail)
  }

  #appendMessageChunk(message: Message): void {
    if (message.chunk_type === "message_start") {
      this.#appendMessage(message, false)
    }

    const lastMessage = this.lastMessage
    if (!lastMessage) throw new Error("No messages found in the chat output")

    if (message.chunk_type === "message_start") {
      lastMessage.setAttribute("streaming", "")
      return
    }

    const content =
      message.operation === "append"
        ? lastMessage.getAttribute("content") + message.content
        : message.content

    lastMessage.setAttribute("content", content)

    if (message.chunk_type === "message_end") {
      this.lastMessage?.removeAttribute("streaming")
      this.#finalizeMessage()
    }
  }

  #onClear(): void {
    this.messages.innerHTML = ""
  }

  #onUpdateUserInput(event: CustomEvent<UpdateUserInput>): void {
    const { value, placeholder, submit, focus } = event.detail
    if (value !== undefined) {
      this.input.setInputValue(value, { submit, focus })
    }
    if (placeholder !== undefined) {
      this.input.placeholder = placeholder
    }
  }

  #onInputSuggestionClick(e: MouseEvent): void {
    this.#onInputSuggestionEvent(e)
  }

  #onInputSuggestionKeydown(e: KeyboardEvent): void {
    const isEnterOrSpace = e.key === "Enter" || e.key === " "
    if (!isEnterOrSpace) return

    this.#onInputSuggestionEvent(e)
  }

  #onInputSuggestionEvent(e: MouseEvent | KeyboardEvent): void {
    const { suggestion, submit } = this.#getSuggestion(e.target)
    if (!suggestion) return

    e.preventDefault()
    // Cmd/Ctrl + (event) = force submitting
    // Alt/Opt  + (event) = force setting without submitting
    const shouldSubmit =
      e.metaKey || e.ctrlKey ? true : e.altKey ? false : submit

    this.input.setInputValue(suggestion, {
      submit: shouldSubmit,
      focus: !shouldSubmit,
    })
  }

  #getSuggestion(x: EventTarget | null): {
    suggestion?: string
    submit?: boolean
  } {
    if (!(x instanceof HTMLElement)) return {}

    const el = x.closest(".suggestion, [data-suggestion]")
    if (!(el instanceof HTMLElement)) return {}

    const isSuggestion =
      el.classList.contains("suggestion") || el.dataset.suggestion !== undefined
    if (!isSuggestion) return {}

    const suggestion = el.dataset.suggestion || el.textContent

    return {
      suggestion: suggestion || undefined,
      submit:
        el.classList.contains("submit") ||
        el.dataset.suggestionSubmit === "" ||
        el.dataset.suggestionSubmit === "true",
    }
  }

  #onRemoveLoadingMessage(): void {
    this.#removeLoadingMessage()
    this.#finalizeMessage()
  }

  #finalizeMessage(): void {
    this.input.disabled = false
  }

  #onExternalLinkClick(e: MouseEvent): void {
    // Find if the clicked element or any of its parents is an external link
    const target = e.target as HTMLElement
    if (!this.contains(target)) return

    const linkEl = target.closest(
      "a[data-external-link]",
    ) as HTMLAnchorElement | null

    if (!linkEl || !linkEl.href) return

    // Prevent the default link behavior
    e.preventDefault()

    // Show confirmation dialog and open the link if confirmed
    showExternalLinkConfirmation(linkEl.href)
      .then((confirmed) => {
        if (confirmed) {
          window.open(linkEl.href, "_blank", "noopener,noreferrer")
        }
      })
      .catch(() => {
        // If dialog fails for any reason, fall back to opening the link directly
        window.open(linkEl.href, "_blank", "noopener,noreferrer")
      })
  }
}

// ------- Register custom elements and shiny bindings ---------

const chatCustomElements = [
  { tag: CHAT_MESSAGE_TAG, component: ChatMessage },
  { tag: CHAT_USER_MESSAGE_TAG, component: ChatUserMessage },
  { tag: CHAT_MESSAGES_TAG, component: ChatMessages },
  { tag: CHAT_INPUT_TAG, component: ChatInput },
  { tag: CHAT_CONTAINER_TAG, component: ChatContainer },
  { tag: CHAT_TOOL_REQUEST_TAG, component: ShinyToolRequest },
  { tag: CHAT_TOOL_RESULT_TAG, component: ShinyToolResult },
]

chatCustomElements.forEach(({ tag, component }) => {
  if (!customElements.get(tag)) {
    customElements.define(tag, component)
  }
})

window.Shiny?.addCustomMessageHandler(
  "shinyChatMessage",
  async function (message: ShinyChatMessage) {
    if (message.obj?.html_deps) {
      await renderDependencies(message.obj.html_deps)
    }

    const evt = new CustomEvent(message.handler, {
      detail: message.obj,
    })

    const el = document.getElementById(message.id)

    if (!el) {
      showShinyClientMessage({
        status: "error",
        message: `Unable to handle Chat() message since element with id
          ${message.id} wasn't found. Do you need to call .ui() (Express) or need a
          chat_ui('${message.id}') in the UI (Core)?
        `,
      })
      return
    }

    el.dispatchEvent(evt)
  },
)

export { CHAT_CONTAINER_TAG }
