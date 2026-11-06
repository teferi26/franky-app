'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase-client'
import { Send, Loader2 } from 'lucide-react'
import { Button } from "@/components/ui/button";

type Message = {
  id: string
  content: string
  created_at: string
  sender_id: string
  sender?: { full_name: string | null; avatar_url: string | null }
}

export default function EventGroupChat({
  eventId,
  userId,
}: {
  eventId: string
  userId: string
}) {
  const supabase = createClient()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Join event chat and get conversation id
  const joinChat = useCallback(async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('join_event_chat', {
        p_event_id: eventId,
        p_user_id: userId,
      })
      if (rpcError) throw rpcError
      setConversationId(data as string)
    } catch (err: unknown) {
      console.error('[event-group-chat] join_event_chat error:', err)
      const e = err as { message?: string; hint?: string; details?: string; code?: string } | null
      const msg =
        e?.message || e?.hint || e?.details || e?.code || 'Error al unirse al chat'
      setError(msg)
    }
  }, [eventId, userId, supabase])

  // Load existing messages for this conversation
  const loadMessages = useCallback(async (convId: string) => {
    const { data, error: fetchErr } = await supabase
      .from('messages')
      .select('id, content, created_at, sender_id, sender:profiles!messages_sender_id_fkey(full_name, avatar_url)')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(100)

    if (fetchErr) { setError(fetchErr.message); return }
    setMessages((data as unknown as Message[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    joinChat()
  }, [joinChat])

  useEffect(() => {
    if (!conversationId) return
    loadMessages(conversationId)

    // Realtime subscription for new messages
    const channel = supabase
      .channel(`event-chat:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          // Fetch sender profile for the new message
          const newMsg = payload.new as Message
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('id', newMsg.sender_id)
            .single()
          setMessages((prev) => [...prev, { ...newMsg, sender: profile ?? undefined }])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId, loadMessages, supabase])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!text.trim() || !conversationId || sending) return
    setSending(true)
    const content = text.trim()
    setText('')
    const { error: sendErr } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: userId,
      content,
    })
    if (sendErr) {
      setText(content) // restore on error
      setError(sendErr.message)
    }
    setSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (error) {
    return (
      <div className="p-6 text-center text-sm font-medium text-error">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '400px' }}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-violet" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-text-muted">
            Sé el primero en escribir algo 👋
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === userId
            const name = msg.sender?.full_name ?? 'Usuario'
            const initials = name.charAt(0).toUpperCase()
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                {!isMe && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-bg-secondary text-xs font-bold text-text-secondary">
                    {msg.sender?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={msg.sender.avatar_url} alt={name} className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                )}
                <div className={`max-w-[72%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                  {!isMe && (
                    <p className="text-[10px] text-text-muted px-1">{name}</p>
                  )}
                  <div
                    className={`break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      isMe
                        ? 'rounded-br-sm bg-text-primary text-bg-primary'
                        : 'rounded-bl-sm border border-border bg-bg-secondary text-text-primary'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <p className="text-[10px] text-text-muted px-1">
                    {new Date(msg.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 border-t border-border-light p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un mensaje..."
          rows={1}
          className="max-h-28 flex-1 resize-none overflow-y-auto rounded-xl border border-border bg-bg-primary px-3.5 py-2.5 text-sm text-text-primary transition-[border-color,box-shadow] duration-200 placeholder:text-text-muted hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15"
          style={{ minHeight: '40px' }}
        />
        <Button
          size="icon"
          onClick={sendMessage}
          loading={sending}
          disabled={!text.trim()}
          className="shrink-0"
          aria-label="Enviar mensaje"
        >
          {!sending && <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
        </Button>
      </div>
    </div>
  )
}
