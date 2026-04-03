from dowshinychat.express import Chat
from shiny.express import render

chat = Chat(id="chat")


@render.ui
def chat_output():
    return chat.ui(messages=["A starting message"])
