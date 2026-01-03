import { LitElement, html, nothing } from "lit"
import { unsafeHTML } from "lit-html/directives/unsafe-html.js"
import { property, state } from "lit/decorators.js"
import ClipboardJS from "clipboard"

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
  message_actions?: string
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

type MessageActionEvent = {
  messageIndex: number
  content: string
}

type FeedbackEvent = MessageActionEvent & {
  feedback: "positive" | "negative"
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
    "shiny-chat-message-copy": CustomEvent<MessageActionEvent>
    "shiny-chat-message-feedback": CustomEvent<FeedbackEvent>
    "shiny-chat-message-regenerate": CustomEvent<MessageActionEvent>
    "shiny-chat-message-share": CustomEvent<MessageActionEvent>
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
  // Bootstrap Icons for message actions
  copy: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z"/></svg>',
  check:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0"/></svg>',
  thumbs_up:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8.864.046C7.908-.193 7.02.53 6.956 1.466c-.072 1.051-.23 2.016-.428 2.59-.125.36-.479 1.013-1.04 1.639-.557.623-1.282 1.178-2.131 1.41C2.685 7.288 2 7.87 2 8.72v4.001c0 .845.682 1.464 1.448 1.545 1.07.114 1.564.415 2.068.723l.048.03c.272.165.578.348.97.484.397.136.861.217 1.466.217h3.5c.937 0 1.599-.477 1.934-1.064a1.86 1.86 0 0 0 .254-.912c0-.152-.023-.312-.077-.464.201-.263.38-.578.488-.901.11-.33.172-.762.004-1.149.069-.13.12-.269.159-.403.077-.27.113-.568.113-.857 0-.288-.036-.585-.113-.856a2 2 0 0 0-.138-.362 1.9 1.9 0 0 0 .234-1.734c-.206-.592-.682-1.1-1.2-1.272-.847-.282-1.803-.276-2.516-.211a10 10 0 0 0-.443.05 9.4 9.4 0 0 0-.062-4.509A1.38 1.38 0 0 0 9.125.111zM11.5 14.721H8c-.51 0-.863-.069-1.14-.164-.281-.097-.506-.228-.776-.393l-.04-.024c-.555-.339-1.198-.731-2.49-.868-.333-.036-.554-.29-.554-.55V8.72c0-.254.226-.543.62-.65 1.095-.3 1.977-.996 2.614-1.708.635-.71 1.064-1.475 1.238-1.978.243-.7.407-1.768.482-2.85.025-.362.36-.594.667-.518l.262.066c.16.04.258.143.288.255a8.34 8.34 0 0 1-.145 4.725.5.5 0 0 0 .595.644l.003-.001.014-.003.058-.014a9 9 0 0 1 1.036-.157c.663-.06 1.457-.054 2.11.164.175.058.45.3.57.65.107.308.087.67-.266 1.022l-.353.353.353.354c.043.043.105.141.154.315.048.167.075.37.075.581 0 .212-.027.414-.075.582-.05.174-.111.272-.154.315l-.353.353.353.354c.047.047.109.177.005.488a2.2 2.2 0 0 1-.505.805l-.353.353.353.354c.006.005.041.05.041.17a.9.9 0 0 1-.121.416c-.165.288-.503.56-1.066.56z"/></svg>',
  thumbs_down:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8.864 15.674c-.956.24-1.843-.484-1.908-1.42-.072-1.05-.23-2.015-.428-2.59-.125-.36-.479-1.012-1.04-1.638-.557-.624-1.282-1.179-2.131-1.41C2.685 8.432 2 7.85 2 7V3c0-.845.682-1.464 1.448-1.546 1.07-.113 1.564-.415 2.068-.723l.048-.029c.272-.166.578-.349.97-.484C6.931.08 7.395 0 8 0h3.5c.937 0 1.599.478 1.934 1.064.164.287.254.607.254.913 0 .152-.023.312-.077.464.201.262.38.577.488.9.11.33.172.762.004 1.15.069.13.12.268.159.403.077.27.113.567.113.856s-.036.586-.113.856c-.035.12-.076.237-.138.362.133.356.197.74.197 1.123 0 .614-.163 1.199-.45 1.735a1.42 1.42 0 0 1-.75.652c-.847.183-1.803.276-2.516.211a10 10 0 0 1-.443-.05 9.36 9.36 0 0 1-.062 4.509c-.138.508-.55.848-1.012.964zM11.5 1H8c-.51 0-.863.068-1.14.163-.281.097-.506.229-.776.393l-.04.025c-.555.338-1.198.73-2.49.868-.333.035-.554.29-.554.55V7c0 .255.226.543.62.65 1.095.3 1.977.997 2.614 1.709.635.71 1.064 1.475 1.238 1.977.243.7.407 1.768.482 2.85.025.362.36.595.667.518l.262-.065c.16-.04.258-.144.288-.255a8.34 8.34 0 0 0-.145-4.726.5.5 0 0 1 .595-.643h.003l.014.004.058.013a9 9 0 0 0 1.036.157c.663.06 1.457.054 2.11-.163.175-.059.45-.301.57-.651.107-.308.087-.67-.266-1.021L12.793 7l.353-.354c.043-.042.105-.14.154-.315.048-.167.075-.37.075-.581s-.027-.414-.075-.581c-.05-.174-.111-.273-.154-.315l-.353-.354.353-.354c.047-.047.109-.176.005-.488a2.2 2.2 0 0 0-.505-.804l-.353-.354.353-.354c.006-.005.041-.05.041-.17a.9.9 0 0 0-.121-.415C12.4 1.272 12.063 1 11.5 1"/></svg>',
  regenerate:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466"/></svg>',
  share:
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.5 2.5 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5"/></svg>',
  more: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3"/></svg>',
}

// Valid action names for message action buttons
type MessageAction = "copy" | "feedback" | "regenerate" | "share" | "more"
const ALL_MESSAGE_ACTIONS: MessageAction[] = [
  "copy",
  "feedback",
  "regenerate",
  "share",
  "more",
]

class ChatMessage extends LightElement {
  @property() content = "..."
  @property({ attribute: "content-type" }) contentType: ContentType = "markdown"
  @property({ type: Boolean, reflect: true }) streaming = false
  @property() icon = ""
  @property({ attribute: "data-role" }) role: "user" | "assistant" = "assistant"
  // Comma-separated list of enabled actions, "all", "none", or empty (defaults to none)
  @property({ attribute: "message-actions" }) messageActions = ""

  @state() private _copySuccess = false
  @state() private _feedbackGiven: "positive" | "negative" | null = null
  @state() private _showMoreMenu = false

  private _clipboard: ClipboardJS | null = null

  render() {
    const icon = this.#messageIcon()
    const actions = this.#messageActions()

    return html`
      ${icon}
      <div class="message-content-wrapper">
        <shiny-markdown-stream
          content=${this.content}
          content-type=${this.contentType}
          ?streaming=${this.streaming}
          ?auto-scroll=${this.role === "assistant"}
          .onContentChange=${this.#onContentChange.bind(this)}
          .onStreamEnd=${this.#makeSuggestionsAccessible.bind(this)}
        ></shiny-markdown-stream>
        ${actions}
      </div>
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

  // Check if a specific action is enabled based on messageActions attribute
  #isActionEnabled(action: MessageAction): boolean {
    const actionsAttr = this.messageActions.trim().toLowerCase()
    if (!actionsAttr || actionsAttr === "none") return false
    if (actionsAttr === "all") return true
    const enabledActions = actionsAttr.split(",").map((a) => a.trim())
    return enabledActions.includes(action)
  }

  #messageActions() {
    // Only show actions for assistant messages and when not streaming
    if (this.role !== "assistant" || this.streaming) {
      return nothing
    }

    // Don't show if no content
    if (this.content.trim().length === 0) {
      return nothing
    }

    // Don't show if no actions are enabled
    const hasAnyAction = ALL_MESSAGE_ACTIONS.some((a) =>
      this.#isActionEnabled(a),
    )
    if (!hasAnyAction) {
      return nothing
    }

    const copyIcon = this._copySuccess ? ICONS.check : ICONS.copy
    const copyTitle = this._copySuccess ? "Copied!" : "Copy to clipboard"

    const copyButton = this.#isActionEnabled("copy")
      ? html`
          <button
            type="button"
            class="message-action-btn ${this._copySuccess ? "success" : ""}"
            title=${copyTitle}
            aria-label=${copyTitle}
            data-action="copy"
            @click=${this.#onCopyClick}
          >
            ${unsafeHTML(copyIcon)}
          </button>
        `
      : nothing

    const feedbackButtons = this.#isActionEnabled("feedback")
      ? html`
          <button
            type="button"
            class="message-action-btn ${this._feedbackGiven === "positive"
              ? "active"
              : ""}"
            title="Good response"
            aria-label="Good response"
            data-action="thumbs-up"
            @click=${this.#onThumbsUpClick}
          >
            ${unsafeHTML(ICONS.thumbs_up)}
          </button>
          <button
            type="button"
            class="message-action-btn ${this._feedbackGiven === "negative"
              ? "active"
              : ""}"
            title="Bad response"
            aria-label="Bad response"
            data-action="thumbs-down"
            @click=${this.#onThumbsDownClick}
          >
            ${unsafeHTML(ICONS.thumbs_down)}
          </button>
        `
      : nothing

    const regenerateButton = this.#isActionEnabled("regenerate")
      ? html`
          <button
            type="button"
            class="message-action-btn"
            title="Regenerate response"
            aria-label="Regenerate response"
            data-action="regenerate"
            @click=${this.#onRegenerateClick}
          >
            ${unsafeHTML(ICONS.regenerate)}
          </button>
        `
      : nothing

    const shareButton = this.#isActionEnabled("share")
      ? html`
          <button
            type="button"
            class="message-action-btn"
            title="Share"
            aria-label="Share"
            data-action="share"
            @click=${this.#onShareClick}
          >
            ${unsafeHTML(ICONS.share)}
          </button>
        `
      : nothing

    const moreButton = this.#isActionEnabled("more")
      ? html`
          <div class="message-action-more-wrapper">
            <button
              type="button"
              class="message-action-btn"
              title="More options"
              aria-label="More options"
              aria-expanded=${this._showMoreMenu}
              data-action="more"
              @click=${this.#onMoreClick}
            >
              ${unsafeHTML(ICONS.more)}
            </button>
            ${this._showMoreMenu
              ? html`
                  <div class="message-action-menu" @click=${this.#onMenuClick}>
                    <button
                      type="button"
                      class="message-action-menu-item"
                      data-action="copy-markdown"
                    >
                      Copy as Markdown
                    </button>
                    <button
                      type="button"
                      class="message-action-menu-item"
                      data-action="copy-text"
                    >
                      Copy as plain text
                    </button>
                  </div>
                `
              : nothing}
          </div>
        `
      : nothing

    return html`
      <div class="message-actions">
        ${copyButton} ${feedbackButtons} ${regenerateButton} ${shareButton}
        ${moreButton}
      </div>
    `
  }

  #getMessageIndex(): number {
    const parent = this.parentElement
    if (!parent) return -1
    const messages = Array.from(parent.querySelectorAll(CHAT_MESSAGE_TAG))
    return messages.indexOf(this)
  }

  #getTextContent(): string {
    const stream = this.querySelector("shiny-markdown-stream")
    return stream?.textContent?.trim() || this.content
  }

  #onCopyClick(): void {
    // Use Clipboard API for copy
    const text = this.#getTextContent()
    navigator.clipboard.writeText(text).then(() => {
      this._copySuccess = true
      setTimeout(() => {
        this._copySuccess = false
      }, 2000)

      this.dispatchEvent(
        new CustomEvent("shiny-chat-message-copy", {
          detail: {
            messageIndex: this.#getMessageIndex(),
            content: this.content,
          },
          bubbles: true,
          composed: true,
        }),
      )
    })
  }

  #onThumbsUpClick(): void {
    this._feedbackGiven = this._feedbackGiven === "positive" ? null : "positive"
    if (this._feedbackGiven) {
      this.dispatchEvent(
        new CustomEvent("shiny-chat-message-feedback", {
          detail: {
            messageIndex: this.#getMessageIndex(),
            content: this.content,
            feedback: "positive",
          },
          bubbles: true,
          composed: true,
        }),
      )
    }
  }

  #onThumbsDownClick(): void {
    this._feedbackGiven = this._feedbackGiven === "negative" ? null : "negative"
    if (this._feedbackGiven) {
      this.dispatchEvent(
        new CustomEvent("shiny-chat-message-feedback", {
          detail: {
            messageIndex: this.#getMessageIndex(),
            content: this.content,
            feedback: "negative",
          },
          bubbles: true,
          composed: true,
        }),
      )
    }
  }

  #onRegenerateClick(): void {
    this.dispatchEvent(
      new CustomEvent("shiny-chat-message-regenerate", {
        detail: {
          messageIndex: this.#getMessageIndex(),
          content: this.content,
        },
        bubbles: true,
        composed: true,
      }),
    )
  }

  #onShareClick(): void {
    this.dispatchEvent(
      new CustomEvent("shiny-chat-message-share", {
        detail: {
          messageIndex: this.#getMessageIndex(),
          content: this.content,
        },
        bubbles: true,
        composed: true,
      }),
    )
  }

  #onMoreClick(): void {
    this._showMoreMenu = !this._showMoreMenu

    if (this._showMoreMenu) {
      // Close menu when clicking outside
      const closeMenu = (e: MouseEvent) => {
        if (!this.contains(e.target as Node)) {
          this._showMoreMenu = false
          document.removeEventListener("click", closeMenu)
        }
      }
      // Delay to prevent immediate close
      setTimeout(() => document.addEventListener("click", closeMenu), 0)
    }
  }

  #onMenuClick(e: MouseEvent): void {
    const target = e.target as HTMLElement
    const action = target.dataset.action

    if (action === "copy-markdown") {
      navigator.clipboard.writeText(this.content)
      this._showMoreMenu = false
    } else if (action === "copy-text") {
      const text = this.#getTextContent()
      navigator.clipboard.writeText(text)
      this._showMoreMenu = false
    }
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

  render() {
    const icon =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-arrow-up-circle-fill" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 0 0 8a8 8 0 0 0 16 0m-7.5 3.5a.5.5 0 0 1-1 0V5.707L5.354 7.854a.5.5 0 1 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 5.707z"/></svg>'

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
      <button
        type="button"
        class="shiny-chat-btn-send"
        title="Send message"
        aria-label="Send message"
        @click=${this.#sendInput}
      >
        ${unsafeHTML(icon)}
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
}

class ChatContainer extends LightElement {
  @property({ attribute: "icon-assistant" }) iconAssistant = ""
  @property({ attribute: "message-actions" }) messageActions = ""
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

  // Get base input ID by stripping "_user_input" suffix from the input's ID
  private get baseInputId(): string {
    const inputId = this.input.id
    return inputId.replace(/_user_input$/, "")
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
    // Message action events
    this.addEventListener("shiny-chat-message-copy", this.#onMessageCopy)
    this.addEventListener(
      "shiny-chat-message-feedback",
      this.#onMessageFeedback,
    )
    this.addEventListener(
      "shiny-chat-message-regenerate",
      this.#onMessageRegenerate,
    )
    this.addEventListener("shiny-chat-message-share", this.#onMessageShare)
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
    // Message action events
    this.removeEventListener("shiny-chat-message-copy", this.#onMessageCopy)
    this.removeEventListener(
      "shiny-chat-message-feedback",
      this.#onMessageFeedback,
    )
    this.removeEventListener(
      "shiny-chat-message-regenerate",
      this.#onMessageRegenerate,
    )
    this.removeEventListener("shiny-chat-message-share", this.#onMessageShare)
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

    // Pass message-actions from container to message
    if (this.messageActions) {
      messageAttrs.message_actions = this.messageActions
    }

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

  // Message action event handlers - forward to Shiny inputs
  #onMessageCopy(event: CustomEvent<MessageActionEvent>): void {
    if (!window.Shiny) return
    window.Shiny.setInputValue!(
      `${this.baseInputId}_message_copy`,
      event.detail,
      {
        priority: "event",
      },
    )
  }

  #onMessageFeedback(event: CustomEvent<FeedbackEvent>): void {
    if (!window.Shiny) return
    window.Shiny.setInputValue!(
      `${this.baseInputId}_message_feedback`,
      event.detail,
      { priority: "event" },
    )
  }

  #onMessageRegenerate(event: CustomEvent<MessageActionEvent>): void {
    if (!window.Shiny) return
    window.Shiny.setInputValue!(
      `${this.baseInputId}_message_regenerate`,
      event.detail,
      { priority: "event" },
    )
  }

  #onMessageShare(event: CustomEvent<MessageActionEvent>): void {
    if (!window.Shiny) return
    window.Shiny.setInputValue!(
      `${this.baseInputId}_message_share`,
      event.detail,
      {
        priority: "event",
      },
    )
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
