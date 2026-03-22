import { useState, useRef, useCallback, useEffect, memo } from "react"
import { microphone, stopCircle } from "../utils/icons"

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

type AudioInputMode = "transcribe" | "raw"

interface AudioInputData {
  audio: string
  format: string
  duration: number
  size: number
}

export interface AudioInputProps {
  mode: AudioInputMode
  inputId: string
  disabled: boolean
  onTranscription?: (text: string) => void
  onRecordingChange?: (recording: boolean) => void
}

// Note: dangerouslySetInnerHTML usage below is safe because the icon SVG strings
// are hardcoded constants defined in utils/icons.ts, not user-provided content.

export const AudioInput = memo(function AudioInput({
  mode,
  inputId,
  disabled,
  onTranscription,
  onRecordingChange,
}: AudioInputProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [transcribedText, setTranscribedText] = useState("")

  useEffect(() => {
    onRecordingChange?.(isRecording)
  }, [isRecording, onRecordingChange])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingStartTimeRef = useRef(0)
  const recordingTimerRef = useRef<number | null>(null)
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null)
  const finalTranscriptRef = useRef("")

  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }, [])

  const sendAudioData = useCallback(
    (blob: Blob, format: string, duration: number): void => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        const base64 = result.split(",")[1] || ""

        const audioData: AudioInputData = {
          audio: base64,
          format,
          duration,
          size: blob.size,
        }

        if (window.Shiny?.setInputValue) {
          window.Shiny.setInputValue(`${inputId}_audio`, audioData, {
            priority: "event",
          })
        }
      }
      reader.readAsDataURL(blob)
    },
    [inputId],
  )

  const stopRecording = useCallback(
    (cancel: boolean): void => {
      // Handle transcription mode
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.onend = null
        speechRecognitionRef.current.stop()
        speechRecognitionRef.current = null

        if (!cancel) {
          const text = finalTranscriptRef.current.trim()
          if (text) {
            onTranscription?.(text)
          }
        }

        setIsRecording(false)
        setTranscribedText("")
        finalTranscriptRef.current = ""
        return
      }

      // Handle raw audio mode
      const recorder = mediaRecorderRef.current
      if (!recorder || !isRecording) return

      if (recordingTimerRef.current !== null) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }

      const duration = (Date.now() - recordingStartTimeRef.current) / 1000

      if (cancel) {
        recorder.stop()
        setIsRecording(false)
        audioChunksRef.current = []
        return
      }

      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((track) => track.stop())

        if (audioChunksRef.current.length > 0) {
          const mimeType = recorder.mimeType || "audio/webm"
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mimeType,
          })
          sendAudioData(audioBlob, mimeType, duration)
        }
        audioChunksRef.current = []
      }

      recorder.stop()
      setIsRecording(false)
    },
    [isRecording, onTranscription, sendAudioData],
  )

  const startTranscription = useCallback((): void => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      console.warn("Speech recognition not supported in this browser.")
      return
    }

    try {
      const recognition = new SpeechRecognitionCtor()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = navigator.language || "en-US"

      finalTranscriptRef.current = ""
      setTranscribedText("")

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = ""

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (!result?.[0]) continue
          const transcript = result[0].transcript
          if (result.isFinal) {
            finalTranscriptRef.current += transcript
          } else {
            interimTranscript += transcript
          }
        }

        setTranscribedText(
          (finalTranscriptRef.current + interimTranscript).trim(),
        )
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        const errorMessages: Record<string, string> = {
          network:
            "Network error: Speech recognition requires internet access.",
          "not-allowed":
            "Microphone access denied. Please allow microphone access.",
          "no-speech": "No speech detected. Please try again.",
          aborted: "Speech recognition was aborted.",
        }
        console.warn(
          errorMessages[event.error] ||
            `Speech recognition error: ${event.error}`,
        )
        stopRecording(true)
      }

      recognition.onend = () => {
        // Auto-restart if still recording (browser may stop after silence)
        if (speechRecognitionRef.current) {
          speechRecognitionRef.current.start()
        }
      }

      speechRecognitionRef.current = recognition
      recognition.start()
      setIsRecording(true)
      recordingStartTimeRef.current = Date.now()
    } catch (err) {
      console.warn("Failed to start speech recognition:", err)
    }
  }, [stopRecording])

  const startRawRecording = useCallback(async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/wav"

      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
      recordingStartTimeRef.current = Date.now()
      setRecordingDuration(0)

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingDuration(
          Math.floor((Date.now() - recordingStartTimeRef.current) / 1000),
        )
      }, 1000)
    } catch (err) {
      console.warn("Failed to start audio recording:", err)
    }
  }, [])

  const toggleRecording = useCallback((): void => {
    if (isRecording) {
      stopRecording(false)
    } else {
      if (mode === "transcribe") {
        startTranscription()
      } else {
        startRawRecording()
      }
    }
  }, [isRecording, mode, stopRecording, startTranscription, startRawRecording])

  // Safe: all SVG icon strings (stopCircle, microphone) are hardcoded
  // constants from utils/icons.ts, not user-provided content.
  const buttonIcon = isRecording ? stopCircle : microphone

  // Transcribing indicator rendered as a sibling so it can be positioned
  // relative to .shiny-chat-input instead of the absolutely-positioned button
  const transcribingIndicator =
    isRecording && mode === "transcribe" ? (
      <span className="recording-indicator transcribing">
        <span className="transcribed-text">
          {transcribedText || "Listening..."}
        </span>
      </span>
    ) : isRecording && mode === "raw" ? (
      <span className="recording-indicator raw">
        <span className="recording-time">
          {formatDuration(recordingDuration)}
        </span>
      </span>
    ) : null

  return (
    <>
      {transcribingIndicator}
      <button
        type="button"
        className={`shiny-chat-btn-mic${isRecording ? " recording" : ""}`}
        title={isRecording ? "Stop recording" : "Record audio"}
        aria-label={isRecording ? "Stop recording" : "Record audio"}
        onClick={toggleRecording}
        disabled={disabled}
        dangerouslySetInnerHTML={{ __html: buttonIcon }}
      />
    </>
  )
})
