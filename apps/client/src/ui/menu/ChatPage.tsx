import { Container, Image, Input, Text } from '@react-three/uikit'
import { useEffect, useState } from 'react'
import { L } from '../../i18n'
import type { ChatEntry } from '../../net/session'
import type { WorldEngine } from '../../world/engine'
import { iconTexture } from '../iconTextures'
import { playUiClick } from '../clickSound'
import { safeText } from './menuFont'

interface Props {
  engine: WorldEngine
  vr: boolean
  openKeyboard: (req: { title: string; initial?: string; maxLength?: number; onDone: (text: string | null) => void }) => void
}

const label = (text: string, size: number, color: string) => (
  <Text fontSize={size} fontWeight="bold" color={color} wordBreak="break-all" whiteSpace="pre-line">{safeText(text)}</Text>
)

export const ChatPage: React.FC<Props> = ({ engine, vr, openKeyboard }) => {
  const [messages, setMessages] = useState<ChatEntry[]>(() => [...engine.session.chatLog])
  const [draft, setDraft] = useState('')
  useEffect(() => {
    setMessages([...engine.session.chatLog])
    return engine.session.chatEv.on(() => setMessages([...engine.session.chatLog]))
  }, [engine])
  useEffect(() => {
    engine.session.setTyping(draft.trim().length > 0)
    return () => engine.session.setTyping(false)
  }, [engine, draft])
  const send = (value = draft) => {
    const text = value.trim()
    if (!text) return
    engine.session.sendChat(text)
    setDraft('')
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || !(e.target instanceof HTMLInputElement)) return
      e.preventDefault()
      e.stopPropagation()
      send()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  return (
    <Container width="100%" height="100%" flexDirection="column" gap={10}>
      <Container flexShrink={0} height={38} flexDirection="row" alignItems="center" paddingX={13} borderRadius={11} backgroundColor="#151a13" gap={9}>
        <Container width={8} height={8} borderRadius={4} backgroundColor="#a2d23f" />
        {label(L('このインスタンス', 'This instance'), 15, '#f1f4ee')}
        <Container flexGrow={1} />
        {label(`${engine.session.verifiedMembers().length + 1}`, 12, '#a8b3a2')}
      </Container>
      <Container width="100%" flexGrow={1} flexShrink={1} flexDirection="column" overflow="scroll" scrollbarColor="#30392c" scrollbarWidth={7} paddingX={12} paddingY={12} gap={12} borderRadius={12} backgroundColor="#0a0d09">
        {messages.length === 0 && <Container width="100%" flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column" gap={8}>
          {label(L('まだメッセージはありません', 'No messages yet'), 16, '#dce6d5')}
          {label(L('このインスタンスの会話を始めましょう', 'Start a conversation in this instance'), 12, '#a8b3a2')}
        </Container>}
        {messages.slice(-60).map((message) => (
          <Container key={message.id} width="100%" flexDirection="column" alignItems={message.self ? 'flex-end' : 'flex-start'} gap={3}>
            {!message.self && label(message.name, 11, '#a8b3a2')}
            <Container maxWidth="76%" paddingX={13} paddingY={9} borderRadius={16} backgroundColor={message.self ? '#405c1b' : '#1d231a'}>
              {label(message.text, 15, '#f1f4ee')}
            </Container>
            {label(new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 10, '#899783')}
          </Container>
        ))}
      </Container>
      <Container flexShrink={0} height={50} flexDirection="row" alignItems="center" gap={8}>
        <Container height={44} flexGrow={1} flexShrink={1} flexDirection="row" alignItems="center" paddingX={14} borderRadius={22} borderWidth={1} borderColor="#30392c" backgroundColor="#151a13">
          <Input width="100%" value={draft} onValueChange={(value: string) => setDraft(value.slice(0, 300))} placeholder={safeText(L('メッセージを入力', 'Message'))} fontSize={15} fontWeight="bold" color="#f1f4ee" />
        </Container>
        {vr && <Container width={42} height={42} borderRadius={21} backgroundColor="#1d231a" alignItems="center" justifyContent="center" cursor="pointer" onClick={() => { playUiClick(); openKeyboard({ title: L('メッセージ', 'Message'), initial: draft, maxLength: 300, onDone: (text) => { if (text !== null) send(text) } }) }}>
          <Image src={iconTexture('keyboard', '#f1f4ee')} width={23} height={23} keepAspectRatio={false} />
        </Container>}
        <Container width={64} height={42} borderRadius={21} backgroundColor={draft.trim() ? '#5b8010' : '#2a3524'} alignItems="center" justifyContent="center" cursor="pointer" onClick={() => { playUiClick(); send() }}>
          {label(L('送信', 'Send'), 14, '#ffffff')}
        </Container>
      </Container>
    </Container>
  )
}
