library(shiny)
library(bslib)
library(shinychat)
library(ellmer)

# -- Module 1: Interactive histogram ------------------------------------------

hist_ui <- function(id) {
  ns <- NS(id)
  tagList(
    sliderInput(ns("bins"), "Number of bins:", min = 5, max = 50, value = 25),
    plotOutput(ns("plot"), height = "250px")
  )
}

hist_server <- function(id, dataset) {
  moduleServer(id, function(input, output, session) {
    output$plot <- renderPlot({
      req(input$bins)
      x <- dataset()
      hist(x, breaks = input$bins, col = "#007bc2", border = "white",
           main = "Interactive Histogram", xlab = "Value")
    })
  })
}

# -- Module 2: Summary statistics table ----------------------------------------

summary_ui <- function(id) {
  ns <- NS(id)
  tableOutput(ns("tbl"))
}

summary_server <- function(id, dataset) {
  moduleServer(id, function(input, output, session) {
    output$tbl <- renderTable({
      x <- dataset()
      data.frame(
        Statistic = c("N", "Mean", "SD", "Min", "Median", "Max"),
        Value = c(
          length(x),
          round(mean(x), 2),
          round(sd(x), 2),
          round(min(x), 2),
          round(median(x), 2),
          round(max(x), 2)
        )
      )
    })
  })
}

# -- Module 3: Data sampler (writes back to shared state) ----------------------

sampler_ui <- function(id) {
  ns <- NS(id)
  tagList(
    sliderInput(ns("n"), "Sample size:", min = 10, max = 500, value = 100),
    actionButton(ns("resample"), "Draw new sample", class = "btn-sm btn-primary"),
    textOutput(ns("info"))
  )
}

sampler_server <- function(id, shared) {
  moduleServer(id, function(input, output, session) {
    observeEvent(input$resample, {
      shared$data <- rnorm(input$n)
    })

    output$info <- renderText({
      paste("Current dataset has", length(shared$data), "observations.")
    })
  })
}

# -- App -----------------------------------------------------------------------

ui <- page_sidebar(
  title = "Chat with Shiny Modules",
  sidebar = sidebar(
    width = 300,
    h5("About"),
    p("This app demonstrates serving interactive Shiny modules into a chat."),
    p("The LLM can summon histograms, summary tables, or a data sampler."),
    p("Modules share reactive state — resampling data updates the histogram."),
    hr(),
    p(class = "text-muted", "Try asking: 'Show me a histogram of the data'")
  ),
  chat_ui("chat", fill = TRUE)
)

server <- function(input, output, session) {
  # Shared reactive state accessible to all modules
  shared <- reactiveValues(data = rnorm(100))
  dataset <- reactive(shared$data)

  # Register modules as LLM tools
  hist_tool <- chat_tool_module(
    module_ui = hist_ui,
    module_server = hist_server,
    name = "histogram",
    description = "Show an interactive histogram of the current dataset. The user can adjust the number of bins with a slider.",
    title = "Interactive Histogram",
    dataset = dataset
  )

  summary_tool <- chat_tool_module(
    module_ui = summary_ui,
    module_server = summary_server,
    name = "data_summary",
    description = "Show summary statistics (mean, sd, min, max, etc.) of the current dataset in a table.",
    title = "Summary Statistics",
    dataset = dataset
  )

  sampler_tool <- chat_tool_module(
    module_ui = sampler_ui,
    module_server = sampler_server,
    name = "data_sampler",
    description = "Show a control that lets the user draw a new random sample. This replaces the shared dataset, so other modules (like the histogram) will update automatically.",
    title = "Data Sampler",
    shared = shared
  )

  chat <- chat_openai(
    system_prompt = paste(
      "You are a helpful data exploration assistant.",
      "You have access to tools that display interactive Shiny modules",
      "directly in this chat. The user has a dataset of random normal values.",
      "Use the tools when the user wants to visualize or explore the data.",
      "You can show multiple modules in a single response."
    ),
    tools = list(hist_tool, summary_tool, sampler_tool)
  )

  observeEvent(input$chat_user_input, {
    stream <- chat$stream_async(input$chat_user_input)
    chat_append("chat", stream)
  })
}

shinyApp(ui, server)
