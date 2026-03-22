export interface SlashCommandDef {
  name: string
  description: string
  type: "client" | "server"
  client_action?: string
}

export function parseCommandsAttr(attr: string): SlashCommandDef[] {
  if (!attr) return []
  try {
    const parsed = JSON.parse(attr)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (cmd: unknown) =>
        cmd &&
        typeof cmd === "object" &&
        typeof (cmd as SlashCommandDef).name === "string" &&
        typeof (cmd as SlashCommandDef).description === "string",
    ) as SlashCommandDef[]
  } catch {
    return []
  }
}

export function filterCommands(
  commands: SlashCommandDef[],
  query: string,
): SlashCommandDef[] {
  if (!query) return commands
  const lower = query.toLowerCase()
  return commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(lower) ||
      cmd.description.toLowerCase().includes(lower),
  )
}

/**
 * Evaluate whether the slash command menu should be active based on the
 * current textarea value and cursor position.
 *
 * Only triggers when "/" is at the start of input or preceded by whitespace,
 * and the text after "/" contains no spaces (command names are single words).
 */
export function evaluateSlashTrigger(
  value: string,
  cursorPos: number,
): { active: boolean; query: string } {
  const textBeforeCursor = value.slice(0, cursorPos)
  // Match "/" at start of string or after whitespace, followed by word chars
  const match = /(?:^|\s)\/([\w-]*)$/.exec(textBeforeCursor)
  if (!match) return { active: false, query: "" }
  return { active: true, query: match[1] ?? "" }
}
