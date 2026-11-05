import { memo, useEffect, useRef, useState, type FormEvent } from 'react'
import { PaperPlaneRight } from '@phosphor-icons/react'
import type { MultiplayerChatMessage, MultiplayerSeat } from '@/lib/multiplayer'
import type { MultiplayerLabels } from '@/lib/multiplayerLabels'
import { CHAT_TEXT_LIMIT } from '@/lib/multiplayerView'
import { NotebookPanel } from './Paper'

export interface ChatPanelProps {
  messages: readonly MultiplayerChatMessage[]
  me: MultiplayerSeat
  opponentName: string
  language: string
  labels: MultiplayerLabels['match']['chat']
  disabled: boolean
  /** Resolves true when the message was stored, so the input can be cleared. */
  onSend: (text: string) => Promise<boolean>
}

function messageTime(iso: string, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const time = date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
  return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString(language, { day: 'numeric', month: 'short' })} ${time}`
}

export const ChatPanel = memo(function ChatPanel({ messages, me, opponentName, language, labels, disabled, onSend }: ChatPanelProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const list = useRef<HTMLUListElement>(null)

  // Scroll to the newest message; when it is taller than the notebook page, to where it begins.
  useEffect(() => {
    const element = list.current
    const newest = element?.lastElementChild
    if (!element || !newest) return
    const start = newest.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop - 4
    element.scrollTop = Math.min(element.scrollHeight - element.clientHeight, Math.max(0, start))
  }, [messages.length])

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const value = text.trim()
    if (!value || sending || disabled) return
    setSending(true)
    try {
      if (await onSend(value)) setText('')
    } finally {
      setSending(false)
    }
  }

  return (
    <NotebookPanel title={labels.title} label={labels.title}>
      <ul ref={list} className="bgr-chat__list" aria-live="polite">
        {messages.length === 0 && <li className="bgr-chat__empty">{labels.empty}</li>}
        {messages.map(message => (
          <li key={message.id} className="bgr-bubble" data-own={message.by === me ? '' : undefined}>
            <span className="bgr-bubble__text">{message.text}</span>
            <time dateTime={message.at}>{messageTime(message.at, language)}</time>
          </li>
        ))}
      </ul>
      <form className="bgr-chat__form" onSubmit={submit}>
        <input
          className="bgr-input"
          type="text"
          value={text}
          maxLength={CHAT_TEXT_LIMIT}
          disabled={disabled}
          placeholder={labels.placeholder(opponentName)}
          aria-label={labels.placeholder(opponentName)}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void submit() }
          }}
        />
        <button type="submit" className="bgr-chip" disabled={disabled || sending || !text.trim()}>
          <PaperPlaneRight size={16} weight="fill" aria-hidden="true" />
          {labels.send}
        </button>
      </form>
    </NotebookPanel>
  )
})
