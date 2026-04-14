# dowshinychat 0.4.1

* Replaced custom auto-scroll with `use-stick-to-bottom` library for improved scroll behavior. (#195)

# dowshinychat 0.4.0

* Migrated chat UI from Lit web components to React for improved performance and extensibility.

* Added `audio_input` parameter to `chat_ui()` for voice input. Set to `"transcribe"` to use the browser's Web Speech API for speech-to-text, or `"raw"` to capture audio and send it to the server as a base64-encoded blob (for use with multimodal models like GPT-4o or Gemini).

* Added `message_actions` parameter to `chat_ui()` for displaying action buttons (copy, thumbs up/down, regenerate, share) on assistant messages. Use `message_actions = TRUE` to enable all actions, or pass a character vector like `c("copy", "feedback")` to enable specific actions. Message action events are available as Shiny inputs (e.g., `input$ID_message_feedback`).

* Added `footer` field to `ToolResultDisplay` for displaying custom HTML content below the tool result card body. (#178)

* Tool result cards now support a fullscreen toggle. Set `full_screen = TRUE` in the `display` list (or set `res$full_screen <- NA` in a custom `contents_shinychat()` method) to add a button that expands the card to fill the viewport. Press `Escape`, click the backdrop, or use the close button to exit fullscreen.

* Added `chat_update_slash_commands()` for dynamically updating slash commands at runtime.

* Fixed an issue where user chat messages would display the default assistant icon. (#162)

* Fixed window resize dispatch on tool card collapse/expand. (#180)

* Fixed `full_screen` passthrough for R tool result cards. (#183)

# dowshinychat 0.3.0

## Breaking changes

* `chat_mod_server()` now returns a list of reactives for `last_input` and `last_turn`, as well functions to `update_user_input()`, `append()` and `clear()` the chat. (#130, #143, #145)

## New features

* Added `chat_restore()` which adds Shiny bookmarking hooks to save and restore the `{ellmer}` chat client. (#28, #82)

* Added `update_chat_user_input()` for programmatically updating the user input of a chat UI element. (#78)

* dowshinychat now shows tool call request and results in the UI, and the feature is enabled by default in `chat_app()` and the chat module (`chat_mod_server()`). When using `chat_append()` with `chat_ui()`, set `stream = "content"` when you call the `$stream_async()` method on the `ellmer::Chat` client to ensure tool calls are included in the chat stream output. Learn more in the [tool calling UI article](https://posit-dev.github.io/dowshinychat/r/articles/tool-ui.html). (#52)

* Added `chat_append(icon=...)` and `chat_ui(icon_assistant=...)` for customizing the icon that appears next to assistant responses. (#88)

## Improvements

* `chat_app()` now correctly restores the chat client state when refreshing the app, e.g. by reloading the page. (#71)

* External links in chat messages in `chat_ui()` now open in a new tab by default, with a confirmation dialog. (#120)

## Bug fixes

* The chat input no longer submits incomplete text when the user has activated IME completions (e.g. while typing in Japanese or Chinese). (#85)

## Internal changes

* We consolidated the `<shiny-chat-message>` and `<shiny-user-message>` components into a single `<shiny-chat-message>` component with a `data-role` attribute to indicate whether it's an "assistant" or "user" message. This likely has minimal impact on your apps, other than custom styles. You should update any `shiny-user-message` rules to use `shiny-chat-message[data-role="user"]`. (#101)

* The chat UI's send input button is now identified by the class `.shiny-chat-btn-send`. (@DeepanshKhurana, #138)

# dowshinychat 0.2.0

## New features and improvements

* Added new `output_markdown_stream()` and `markdown_stream()` functions to allow for streaming markdown content to the client. This is useful for showing Generative AI responses in real-time in a Shiny app, outside of a chat interface. (#23)

* Both `chat_ui()` and `output_markdown_stream()` now support arbitrary Shiny UI elements inside of messages. This allows for gathering input from the user (e.g., `selectInput()`), displaying of rich output (e.g., `{htmlwidgets}` like `{plotly}`), and more. (#29)

* Added a new `chat_clear()` function to clear the chat of all messages. (#25)

* Added `chat_app()`, `chat_mod_ui()` and `chat_mod_server()`. `chat_app()` takes an `{ellmer}` chat client and launches a simple Shiny app interface with the chat. `chat_mod_ui()` and `chat_mod_server()` replicate the interface as a Shiny module, for easily adding a simple chat interface connected to a specific `{ellmer}` chat client. (#36)

* The promise returned by `chat_append()` now resolves to the content streamed into the chat. (#49)

## Bug fixes

* `chat_append()`, `chat_append_message()` and `chat_clear()` now all work in Shiny modules without needing to namespace the `id` of the Chat component. (#37)

* `chat_append()` now logs and throws a silent error if the stream errors for any reason. This prevents the app from crashing if the stream is interrupted. You can still use `promises::catch()` to handle the error in your app code if desired. (#46)

# dowshinychat 0.1.1

* Initial CRAN submission.
