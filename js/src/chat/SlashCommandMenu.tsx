import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  memo,
} from "react"
import { createPortal } from "react-dom"
import type { SlashCommandDef } from "./slash-commands"
import { filterCommands } from "./slash-commands"

export interface SlashCommandMenuHandle {
  moveUp(): void
  moveDown(): void
  selectActive(): boolean
}

interface SlashCommandMenuProps {
  commands: SlashCommandDef[]
  query: string
  anchorEl: HTMLElement | null
  onSelect: (cmd: SlashCommandDef) => void
  onDismiss: () => void
}

export const SlashCommandMenu = memo(
  forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(
    function SlashCommandMenu(
      { commands, query, anchorEl, onSelect, onDismiss },
      ref,
    ) {
      const [activeIndex, setActiveIndex] = useState(0)
      const [position, setPosition] = useState<{
        bottom: number
        left: number
        width: number
      } | null>(null)
      const menuRef = useRef<HTMLDivElement>(null)
      const itemRefs = useRef<(HTMLDivElement | null)[]>([])

      const filtered = filterCommands(commands, query)

      // Reset active index when query changes
      useEffect(() => {
        setActiveIndex(0)
      }, [query])

      // Position the menu above the anchor element
      useLayoutEffect(() => {
        if (!anchorEl || filtered.length === 0) {
          setPosition(null)
          return
        }

        function updatePosition(): void {
          if (!anchorEl) return
          const rect = anchorEl.getBoundingClientRect()
          setPosition({
            bottom: window.innerHeight - rect.top + 4,
            left: rect.left,
            width: Math.min(rect.width, 480),
          })
        }

        updatePosition()

        window.addEventListener("resize", updatePosition)
        window.addEventListener("scroll", updatePosition, true)
        return () => {
          window.removeEventListener("resize", updatePosition)
          window.removeEventListener("scroll", updatePosition, true)
        }
      }, [anchorEl, filtered.length])

      // Scroll active item into view
      useEffect(() => {
        itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" })
      }, [activeIndex])

      // Close on outside click
      useEffect(() => {
        function handleClick(e: MouseEvent): void {
          if (
            menuRef.current &&
            !menuRef.current.contains(e.target as Node) &&
            anchorEl &&
            !anchorEl.contains(e.target as Node)
          ) {
            onDismiss()
          }
        }
        const timer = setTimeout(
          () => document.addEventListener("mousedown", handleClick),
          0,
        )
        return () => {
          clearTimeout(timer)
          document.removeEventListener("mousedown", handleClick)
        }
      }, [anchorEl, onDismiss])

      const handleSelect = useCallback(
        (cmd: SlashCommandDef): void => {
          onSelect(cmd)
        },
        [onSelect],
      )

      useImperativeHandle(
        ref,
        () => ({
          moveUp(): void {
            setActiveIndex((prev) =>
              prev <= 0 ? filtered.length - 1 : prev - 1,
            )
          },
          moveDown(): void {
            setActiveIndex((prev) =>
              prev >= filtered.length - 1 ? 0 : prev + 1,
            )
          },
          selectActive(): boolean {
            const cmd = filtered[activeIndex]
            if (cmd) {
              handleSelect(cmd)
              return true
            }
            return false
          },
        }),
        [filtered, activeIndex, handleSelect],
      )

      if (filtered.length === 0 || !position) return null

      const menu = (
        <div
          ref={menuRef}
          className="shiny-chat-slash-menu"
          role="listbox"
          style={{
            position: "fixed",
            bottom: `${position.bottom}px`,
            left: `${position.left}px`,
            width: `${position.width}px`,
          }}
        >
          {filtered.map((cmd, i) => (
            <div
              key={cmd.name}
              ref={(el) => {
                itemRefs.current[i] = el
              }}
              className="shiny-chat-slash-item"
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => handleSelect(cmd)}
            >
              <span className="slash-item-name">{cmd.name}</span>
              <span className="slash-item-desc">{cmd.description}</span>
            </div>
          ))}
        </div>
      )

      return createPortal(menu, document.body)
    },
  ),
)
