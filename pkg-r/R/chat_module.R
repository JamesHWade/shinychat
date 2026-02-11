#' Serve a Shiny module as an interactive chat tool
#'
#' @description
#' `chat_tool_module()` registers a Shiny module as an [ellmer::tool()] that can
#' be called by an LLM during a chat conversation. When the LLM invokes the
#' tool, the module's UI is rendered directly in the chat as fully interactive
#' content — inputs, outputs, and all — connected to the module's server
#' function running in the current Shiny session.
#'
#' This allows you to build chat applications where the LLM can summon rich,
#' interactive UI components on demand: data visualizations the user can
#' interact with, forms that write back to session state, tables with
#' filtering, and more.
#'
#' @section How it works:
#'
#' When the LLM decides to call the tool:
#' 1. A unique namespaced ID is generated for the module instance.
#' 2. The module server function is called, connecting it to the Shiny session.
#' 3. The module UI is rendered and returned as the tool result.
#' 4. shinychat inserts the HTML into the chat and calls
#'    `Shiny.initializeInputs()` + `Shiny.bindAll()`, making the module fully
#'    interactive.
#'
#' Because the module server runs in the current session, it has full access to
#' shared reactive values, other session state, and can communicate with other
#' modules.
#'
#' @param module_ui A Shiny module UI function. Must accept `id` as its first
#'   argument and return Shiny UI (tags).
#' @param module_server A Shiny module server function. Must accept `id` as its
#'   first argument.
#' @param name The tool name that the LLM sees. Should be a short,
#'   descriptive identifier (e.g., `"scatter_plot"`, `"data_filter"`).
#' @param description A description of what this module does, used by the LLM
#'   to decide when to call the tool.
#' @param arguments A named list of [ellmer] type definitions for parameters
#'   the LLM should provide when calling the tool. These are passed to
#'   `module_server` as additional arguments after `id`. Defaults to an empty
#'   list (no LLM-provided arguments).
#' @param ... Additional arguments passed to `module_server` after `id` (and
#'   after any LLM-provided arguments from `arguments`). Use this to pass
#'   shared reactive values, datasets, or other session state.
#' @param title A display title for the tool result card shown in the chat.
#'   Defaults to `name`.
#' @param open Whether the tool result card should be expanded by default.
#'   Defaults to `TRUE`.
#'
#' @returns An [ellmer::tool()] object suitable for passing to a chat client's
#'   `tools` argument.
#'
#' @examplesIf interactive()
#' library(shiny)
#' library(bslib)
#' library(shinychat)
#' library(ellmer)
#'
#' # Define a simple module
#' hist_ui <- function(id) {
#'   ns <- NS(id)
#'   plotOutput(ns("plot"), height = "250px")
#' }
#'
#' hist_server <- function(id, n_bins) {
#'   moduleServer(id, function(input, output, session) {
#'     output$plot <- renderPlot({
#'       hist(faithful$eruptions, breaks = n_bins)
#'     })
#'   })
#' }
#'
#' # Register as a chat tool
#' hist_tool <- chat_tool_module(
#'   module_ui = hist_ui,
#'   module_server = hist_server,
#'   name = "histogram",
#'   description = "Show a histogram of Old Faithful eruption times.",
#'   arguments = list(
#'     n_bins = ellmer::type_integer("Number of bins for the histogram")
#'   )
#' )
#'
#' ui <- page_fillable(
#'   chat_ui("chat", fill = TRUE)
#' )
#'
#' server <- function(input, output, session) {
#'   chat <- chat_openai(
#'     system_prompt = "Help the user explore data. Use tools when appropriate.",
#'     tools = list(hist_tool)
#'   )
#'
#'   observeEvent(input$chat_user_input, {
#'     stream <- chat$stream_async(input$chat_user_input)
#'     chat_append("chat", stream)
#'   })
#' }
#'
#' shinyApp(ui, server)
#'
#' @seealso [chat_append_module()] for programmatically inserting modules
#'   without LLM involvement.
#' @export
chat_tool_module <- function(
  module_ui,
  module_server,
  name,
  description,
  arguments = list(),
  ...,
  title = name,
  open = TRUE
) {
  if (!is.function(module_ui)) {
    cli::cli_abort("{.arg module_ui} must be a function.")
  }
  if (!is.function(module_server)) {
    cli::cli_abort("{.arg module_server} must be a function.")
  }
  if (!is.character(name) || length(name) != 1 || !nzchar(name)) {
    cli::cli_abort("{.arg name} must be a non-empty string.")
  }
  if (!is.character(description) || length(description) != 1) {
    cli::cli_abort("{.arg description} must be a string.")
  }

  extra_args <- rlang::list2(...)
  counter <- 0L

  tool_fn <- function() {
    "tool_fn placeholder - replaced below"
  }

  # Build the actual tool function body dynamically so that its formals
  # match the `arguments` list (ellmer inspects formals to map LLM args).
  llm_arg_names <- names(arguments) %||% character(0)
  tool_fn_formals <- rlang::set_names(
    rep(list(rlang::missing_arg()), length(llm_arg_names)),
    llm_arg_names
  )
  formals(tool_fn) <- tool_fn_formals

  body(tool_fn) <- rlang::expr({
    session <- shiny::getDefaultReactiveDomain()
    if (is.null(session)) {
      cli::cli_abort(
        "chat_tool_module tools must be called within an active Shiny session."
      )
    }

    counter <<- counter + 1L
    mod_id <- paste0("chatmod_", !!name, "_", counter)

    # Collect LLM-provided arguments
    llm_args <- rlang::env_get_list(
      rlang::current_env(),
      nms = !!llm_arg_names,
      default = NULL
    )
    llm_args <- drop_nulls(llm_args)

    # Call the module server with: id, ...llm_args, ...extra_args
    server_args <- c(list(mod_id), llm_args, extra_args)
    do.call(module_server, server_args)

    # Track the module instance for cleanup
    chat_modules_register(session, mod_id)

    # Generate the module UI
    ui <- htmltools::div(
      id = paste0(mod_id, "-container"),
      class = "chat-embedded-module",
      module_ui(mod_id)
    )

    ellmer::ContentToolResult(
      value = paste0("Module '", !!name, "' rendered successfully."),
      extra = list(
        display = list(
          html = ui,
          title = !!title,
          open = !!open
        )
      )
    )
  })
  environment(tool_fn) <- rlang::current_env()

  ellmer::tool(
    .fun = tool_fn,
    name = name,
    description = description,
    arguments = arguments
  )
}


#' Append a Shiny module to a chat as an interactive message
#'
#' @description
#' `chat_append_module()` programmatically inserts a Shiny module into the chat
#' as an interactive assistant message. Unlike [chat_tool_module()], this does
#' not involve the LLM — the developer controls when and which modules appear.
#'
#' The module is fully interactive: its server function runs in the current
#' session, and its UI is rendered with Shiny input/output bindings active.
#'
#' @param id The ID of the [chat_ui()] element to append to.
#' @param module_ui A Shiny module UI function. Must accept `id` as its first
#'   argument.
#' @param module_server A Shiny module server function. Must accept `id` as
#'   its first argument.
#' @param ... Additional arguments passed to `module_server` after `id`.
#' @param mod_id A unique ID for this module instance. If `NULL` (the
#'   default), one is generated automatically.
#' @param role The role of the message, either `"assistant"` or `"user"`.
#'   Defaults to `"assistant"`.
#' @param icon An optional icon to display next to the message.
#' @param session The Shiny session object.
#'
#' @returns The module ID (`mod_id`) that was used, returned invisibly.
#'
#' @examplesIf interactive()
#' library(shiny)
#' library(bslib)
#' library(shinychat)
#'
#' counter_ui <- function(id) {
#'   ns <- NS(id)
#'   tagList(
#'     actionButton(ns("btn"), "Click me"),
#'     textOutput(ns("count"))
#'   )
#' }
#'
#' counter_server <- function(id) {
#'   moduleServer(id, function(input, output, session) {
#'     n <- reactiveVal(0)
#'     observeEvent(input$btn, n(n() + 1))
#'     output$count <- renderText(paste("Clicked:", n()))
#'   })
#' }
#'
#' ui <- page_fillable(
#'   chat_ui("chat", fill = TRUE)
#' )
#'
#' server <- function(input, output, session) {
#'   observeEvent(input$chat_user_input, {
#'     # Insert an interactive counter module in response to any message
#'     chat_append_module(
#'       "chat",
#'       module_ui = counter_ui,
#'       module_server = counter_server
#'     )
#'   })
#' }
#'
#' shinyApp(ui, server)
#'
#' @seealso [chat_tool_module()] for LLM-driven module insertion via the tool
#'   calling system.
#' @export
chat_append_module <- function(
  id,
  module_ui,
  module_server,
  ...,
  mod_id = NULL,
  role = c("assistant", "user"),
  icon = NULL,
  session = shiny::getDefaultReactiveDomain()
) {
  check_active_session(session)
  role <- match.arg(role)

  if (!is.function(module_ui)) {
    cli::cli_abort("{.arg module_ui} must be a function.")
  }
  if (!is.function(module_server)) {
    cli::cli_abort("{.arg module_server} must be a function.")
  }

  if (is.null(mod_id)) {
    mod_id <- paste0(
      "chatmod_", id, "_",
      as.integer(Sys.time()), "_",
      sample.int(1e4, 1)
    )
  }

  # Initialize the module server
  module_server(mod_id, ...)

  # Track for cleanup
  chat_modules_register(session, mod_id)

  # Generate and append the module UI
  ui <- htmltools::div(
    id = paste0(mod_id, "-container"),
    class = "chat-embedded-module",
    module_ui(mod_id)
  )

  chat_append(id, ui, role = role, icon = icon, session = session)

  invisible(mod_id)
}


# -- Module instance tracking for cleanup --

# Key in session$userData for storing active module IDs
CHAT_MODULES_KEY <- "shinychat_modules"

chat_modules_register <- function(session, mod_id) {
  if (is.null(session$userData[[CHAT_MODULES_KEY]])) {
    session$userData[[CHAT_MODULES_KEY]] <- fastmap::fastmap()
  }
  session$userData[[CHAT_MODULES_KEY]]$set(mod_id, TRUE)
}

chat_modules_list <- function(session) {
  registry <- session$userData[[CHAT_MODULES_KEY]]
  if (is.null(registry)) {
    return(character(0))
  }
  registry$keys()
}

chat_modules_remove <- function(session, mod_id) {
  registry <- session$userData[[CHAT_MODULES_KEY]]
  if (!is.null(registry)) {
    registry$remove(mod_id)
  }
}

chat_modules_clear <- function(session) {
  registry <- session$userData[[CHAT_MODULES_KEY]]
  if (!is.null(registry)) {
    registry$reset()
  }
}
