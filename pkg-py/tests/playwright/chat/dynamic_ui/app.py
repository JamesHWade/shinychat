from shiny.express import render
from dowshinychat.express import Chat

chat = Chat(id="chat")


@render.ui
def chat_output():
    return chat.ui(messages=["A starting message"])
