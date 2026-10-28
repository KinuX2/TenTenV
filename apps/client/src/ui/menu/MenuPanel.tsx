// ワールドの中のメニュー（uikit）。画面でも VR でも、この同じ部品をそのまま描く
// 違うのは置き場所だけ（画面: カメラの前いっぱい、VR: 目の前の空間）。中身は ui/menu/pages.tsx の項目
import { Container, Image, Input, Text } from '@react-three/uikit'
import { useState, type ReactNode } from 'react'
import { L } from '../../i18n'
import { useApp } from '../../state/app'
import type { WorldEngine } from '../../world/engine'
import { useDialogs } from '../bridge'
import { faceTexture, handTexture, iconTexture } from '../iconTextures'
import { useMenu, type MenuPage } from '../menuBus'
import { kanaConvert } from '../vr/kana'
import { safeText } from './menuFont'
import type { MenuButton, MenuIcon, MenuItem } from './model'
import { MENU_PAGES, useMenuTabs } from './pages'
import { ChatPage } from './ChatPage'
import { playUiClick } from '../clickSound'

const C = {
  panel: '#0d100c',
  side: '#050705',
  card: '#151a13',
  btn: '#1d231a',
  hover: '#2a3524',
  active: '#405c1b',
  danger: '#723b45',
  primary: '#5b8010',
  text: '#f1f4ee',
  sub: '#a8b3a2',
  line: '#30392c',
  accent: '#a2d23f',
  inset: '#0a0d09',
}

// 横長の板。画面内での表示倍率は WorldMenu で決める。
export const PANEL_W = 762
export const PANEL_H = 520
const BODY_PAD = 18
const BIG_GAP = 8
/** 大きなボタン・タイルは 4 列。10 はスクロールバーの分。 */
const BIG_W = Math.floor((PANEL_W - BODY_PAD * 2 - 10 - BIG_GAP * 3) / 4)
const soundClick = (onClick: () => void) => () => { playUiClick(); onClick() }

// ---------------------------------------------------------------- 小さな部品

/** 図柄（線画のアイコン・表情・手はテクスチャにして出す。uikit の Svg は線を描かないため） */
const IconView: React.FC<{ icon: MenuIcon; size: number }> = ({ icon, size }) => {
  if ('image' in icon && icon.image) return <Image src={icon.image} width={size} height={size} objectFit="cover" borderRadius={6} keepAspectRatio={false} flexShrink={0} />
  const tex =
    'icon' in icon
      ? iconTexture(icon.icon, C.text)
      : 'face' in icon
        ? faceTexture(icon.face, C.text)
        : 'hand' in icon
          ? handTexture(icon.hand, C.text)
          : iconTexture(icon.fallback ?? 'user', C.text)
  return <Image src={tex} width={size} height={size} keepAspectRatio={false} flexShrink={0} />
}

const T: React.FC<{
  children: string
  size?: number
  color?: string
  bold?: boolean
  grow?: boolean
  center?: boolean
  pre?: boolean
}> = ({ children, size = 15, color = C.text, grow, center, pre }) => (
  <Text fontSize={size} color={color} fontWeight="bold" flexGrow={grow ? 1 : 0} flexShrink={1} textAlign={center ? 'center' : 'left'} whiteSpace={pre ? 'pre-line' : 'normal'} wordBreak="break-all">
    {safeText(children)}
  </Text>
)

/** ボタン。kind: big（図柄が上）、small（横並び）、tab（左の列） */
const Btn: React.FC<{ b: MenuButton; kind: 'big' | 'small' | 'tab' }> = ({ b, kind }) => {
  const bg = b.danger ? C.danger : b.on ? C.active : b.primary ? C.primary : C.btn
  if (kind === 'big')
    return (
      <Container
        width={BIG_W}
        height={110}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap={7}
        paddingX={6}
        borderRadius={14}
        backgroundColor={bg}
        borderWidth={1}
        borderColor={b.on ? C.accent : b.danger ? '#a45b62' : C.line}
        hover={{ backgroundColor: b.on || b.danger ? bg : C.hover }}
        cursor="pointer"
        onClick={soundClick(b.onClick)}
      >
        {b.icon && <Container width={48} height={48} borderRadius={13} backgroundColor={b.on ? C.active : C.inset} alignItems="center" justifyContent="center"><IconView icon={b.icon} size={31} /></Container>}
        <T size={14} center bold>
          {b.label}
        </T>
      </Container>
    )
  if (kind === 'tab')
    return (
      <Container
        height={38}
        flexDirection="row"
        alignItems="center"
        gap={9}
        paddingX={11}
        borderRadius={10}
        backgroundColor={b.on ? C.btn : C.side}
        borderWidth={1}
        borderColor={b.on ? C.line : C.side}
        hover={{ backgroundColor: C.hover }}
        cursor="pointer"
        onClick={soundClick(b.onClick)}
      >
        {b.on && <Container width={3} height={20} borderRadius={2} backgroundColor={C.accent} />}
        {b.icon && <IconView icon={b.icon} size={20} />}
        <T size={14} color={b.on ? C.text : C.sub} bold={b.on}>
          {b.label}
        </T>
      </Container>
    )
  return (
    <Container
      height={42}
      flexDirection="row"
      alignItems="center"
      gap={6}
      paddingX={b.iconOnly ? 4 : 12}
      borderRadius={9}
      backgroundColor={bg}
      borderWidth={1}
      borderColor={b.on ? C.accent : b.danger ? '#a45b62' : C.line}
      hover={{ backgroundColor: b.on || b.danger ? bg : C.hover }}
      cursor="pointer"
      onClick={soundClick(b.onClick)}
    >
      {b.icon && <IconView icon={b.icon} size={b.iconOnly ? 32 : 20} />}
      {!b.iconOnly && <T size={15}>{b.label}</T>}
    </Container>
  )
}

const FooterTab: React.FC<{ tab: { id: string; label: string; icon: MenuIcon }; active: boolean }> = ({ tab, active }) => (
  <Container flexGrow={1} flexShrink={1} flexBasis={0} minWidth={0} height={42} flexDirection="row" alignItems="center" justifyContent="center" gap={5} borderRadius={9} backgroundColor={active ? C.active : C.btn} borderWidth={1} borderColor={active ? C.accent : C.line} hover={{ backgroundColor: active ? C.active : C.hover }} cursor="pointer" onClick={soundClick(() => useMenu.getState().setPage(tab.id as MenuPage))}>
    <IconView icon={tab.icon} size={17} />
    <T size={12} center>{tab.id === 'notifications' ? L('通知', 'Alerts') : tab.label}</T>
  </Container>
)

const Row: React.FC<{ children: ReactNode }> = ({ children }) => (
  <Container flexDirection="row" flexWrap="wrap" gap={6} alignItems="center">
    {children}
  </Container>
)

/** 範囲の値: 帯と - / + で変える（画面でも VR でも同じ操作） */
const Stepper: React.FC<{
  label: string
  value: number
  min: number
  max: number
  step: number
  singleStep?: boolean
  format?: (v: number) => string
  onChange: (v: number) => void
}> = ({ label, value, min, max, step, singleStep, format, onChange }) => {
  const s = singleStep ? step : step * Math.max(1, Math.round((max - min) / step / 20))
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min))
  const ratio = (value - min) / (max - min || 1)
  return (
    <Container flexDirection="row" alignItems="center" gap={8}>
      <Container flexGrow={1} flexShrink={1} flexBasis={0}>
        <T size={15}>{label}</T>
      </Container>
      <Btn kind="small" b={{ label: '-', onClick: () => onChange(clamp(value - s)) }} />
      <Container width={90} height={10} borderRadius={5} backgroundColor={C.btn}>
        <Container width={`${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`} height={10} borderRadius={5} backgroundColor={C.accent} />
      </Container>
      <Btn kind="small" b={{ label: '+', onClick: () => onChange(clamp(value + s)) }} />
      <Container width={66}>
        <T size={14} color={C.sub}>
          {format ? format(value) : String(Math.round(value * 100) / 100)}
        </T>
      </Container>
    </Container>
  )
}

/** 文字の入力欄。キーボード（実物）で打てるほか、仮想キーボードも開ける */
const InputRow: React.FC<{
  it: Extract<MenuItem, { t: 'input' }>
  openKeyboard: (k: KeyboardReq) => void
}> = ({ it, openKeyboard }) => {
  const [v, setV] = useState(it.value)
  return (
    <Container flexDirection="column" gap={6}>
      <T size={14} color={C.sub}>
        {it.label}
      </T>
      <Container width="100%" flexDirection="row" gap={6} alignItems="center">
        <Container flexGrow={1} flexShrink={1} minWidth={0} height={42} paddingX={10} borderRadius={9} backgroundColor={C.inset} borderWidth={1} borderColor={C.line} alignItems="center" flexDirection="row">
          <Input value={v} onValueChange={setV} placeholder={safeText(it.placeholder ?? '')} fontSize={16} fontWeight="bold" color={C.text} width="100%" />
        </Container>
        <Container width={44} height={42} flexShrink={0} alignItems="center" justifyContent="center" borderRadius={9} backgroundColor={C.btn} borderWidth={1} borderColor={C.line} hover={{ backgroundColor: C.hover }} cursor="pointer" onClick={soundClick(() => openKeyboard({ title: it.label, initial: v, onDone: (t) => t !== null && (setV(t), it.onSubmit(t)) }))}>
          <IconView icon={{ icon: 'keyboard' }} size={22} />
        </Container>
        <Container width={68} height={42} flexShrink={0} alignItems="center" justifyContent="center" borderRadius={9} backgroundColor={C.primary} borderWidth={1} borderColor={C.line} hover={{ backgroundColor: C.active }} cursor="pointer" onClick={soundClick(() => it.onSubmit(v))}>
          <T size={15}>{L('決定', 'OK')}</T>
        </Container>
      </Container>
    </Container>
  )
}

const DropdownRow: React.FC<{ it: Extract<MenuItem, { t: 'dropdown' }> }> = ({ it }) => {
  const [open, setOpen] = useState(false)
  const selected = it.options.find((option) => option.v === it.value)?.label ?? L('利用できないマイク', 'Unavailable microphone')
  return (
    <Container width="100%" maxWidth={600} flexDirection="column" gap={6}>
      <T size={14} color={C.sub}>{it.label}</T>
      <Container height={42} flexDirection="row" alignItems="center" gap={8} paddingX={12} borderRadius={9} backgroundColor={C.btn} borderWidth={1} borderColor={open ? C.accent : C.line} hover={{ backgroundColor: C.hover }} cursor="pointer" onClick={soundClick(() => setOpen(!open))}>
        <Container flexGrow={1} flexShrink={1} minWidth={0}><T size={14}>{selected}</T></Container>
        <IconView icon={{ icon: open ? 'chevronUp' : 'chevronDown' }} size={18} />
      </Container>
      {open && <Container maxHeight={210} overflow="scroll" scrollbarColor={C.line} scrollbarWidth={7} flexDirection="column" gap={4} padding={5} borderRadius={9} backgroundColor={C.inset} borderWidth={1} borderColor={C.line}>
        {it.options.map((option) => (
          <Container key={option.v} width="100%" minHeight={38} flexShrink={0} flexDirection="row" alignItems="center" gap={7} paddingX={10} borderRadius={7} backgroundColor={option.v === it.value ? C.active : C.btn} hover={{ backgroundColor: C.hover }} cursor="pointer" onClick={soundClick(() => { it.onChange(option.v); setOpen(false) })}>
            <Container flexGrow={1} flexShrink={1} minWidth={0}><T size={13}>{option.label}</T></Container>
            {option.v === it.value && <IconView icon={{ icon: 'check' }} size={16} />}
          </Container>
        ))}
      </Container>}
    </Container>
  )
}

// ---------------------------------------------------------------- 項目

const Items: React.FC<{
  items: MenuItem[]
  openKeyboard: (k: KeyboardReq) => void
}> = ({ items, openKeyboard }) => (
  <>
    {items.map((it, i) => (
      // 項目は縮めない（スクロールの中で縮むと、折り返した行が重なる）
      <Container key={it.t === 'card' ? it.key : i} flexShrink={0} flexDirection="column">
        <Item it={it} openKeyboard={openKeyboard} />
      </Container>
    ))}
  </>
)

const Item: React.FC<{
  it: MenuItem
  openKeyboard: (k: KeyboardReq) => void
}> = ({ it, openKeyboard }) => {
  switch (it.t) {
    case 'section':
      return (
        <Container marginTop={9} flexDirection="row" alignItems="center" gap={9}>
          <Container width={3} height={20} borderRadius={2} backgroundColor={C.accent} />
          <T size={18} bold>
            {it.title}
          </T>
        </Container>
      )
    case 'note':
      return (
        <T size={it.mono ? 11 : 14} color={C.sub} pre>
          {it.text}
        </T>
      )
    case 'buttons':
      return (
        <Container flexDirection="row" flexWrap="wrap" gap={it.size === 'big' ? BIG_GAP : 6}>
          {it.items.map((b, j) => (
            <Btn key={b.key ?? j} kind={it.size} b={b} />
          ))}
        </Container>
      )
    case 'toggle':
      return (
        <Container flexDirection="row" alignItems="center" gap={10} cursor="pointer" onClick={soundClick(() => it.onChange(!it.value))}>
          <Container flexGrow={1} flexShrink={1} flexDirection="column" gap={2}>
            <T size={15}>{it.label}</T>
            {it.hint && (
              <T size={12} color={C.sub}>
                {it.hint}
              </T>
            )}
          </Container>
          <Container width={54} height={30} borderRadius={15} padding={3} backgroundColor={it.value ? C.active : C.btn} borderWidth={1} borderColor={it.value ? C.accent : C.line} flexDirection="row" justifyContent={it.value ? 'flex-end' : 'flex-start'}>
            <Container width={24} height={24} borderRadius={12} backgroundColor="#ffffff" />
          </Container>
        </Container>
      )
    case 'range':
      return <Stepper label={it.label} value={it.value} min={it.min} max={it.max} step={it.step} singleStep={it.singleStep} format={it.format} onChange={it.onChange} />
    case 'choice':
      return (
        <Container flexDirection="column" gap={6}>
          <T size={14} color={C.sub}>
            {it.label}
          </T>
          <Row>
            {it.options.map((o) => (
              <Btn
                key={o.v}
                kind="small"
                b={{
                  label: o.label,
                  on: o.v === it.value,
                  onClick: () => it.onChange(o.v),
                }}
              />
            ))}
          </Row>
        </Container>
      )
    case 'dropdown':
      return <DropdownRow it={it} />
    case 'tabs':
      return (
        <Row>
          {it.options.map((o) => (
            <Btn
              key={o.v}
              kind="small"
              b={{
                label: o.label,
                on: o.v === it.value,
                onClick: () => it.onChange(o.v),
              }}
            />
          ))}
        </Row>
      )
    case 'tiles':
      return (
        <Container flexDirection="row" flexWrap="wrap" gap={BIG_GAP}>
          {it.items.map((x) => (
            <Container
              key={x.key}
              width={BIG_W}
              flexDirection="column"
              gap={6}
              padding={6}
              borderRadius={12}
              backgroundColor={x.on ? C.active : C.btn}
              borderWidth={1}
              borderColor={x.on ? C.accent : C.line}
              hover={{ backgroundColor: x.on ? C.active : C.hover }}
              cursor="pointer"
              onClick={soundClick(x.onClick)}
            >
              <Container width={BIG_W - 12} height={90} borderRadius={8} backgroundColor={C.inset} alignItems="center" justifyContent="center">
                {x.icon && ('image' in x.icon && x.icon.image ? <Image src={x.icon.image} width={BIG_W - 12} height={90} objectFit="cover" borderRadius={8} keepAspectRatio={false} /> : <IconView icon={x.icon} size={44} />)}
              </Container>
              <T size={15} bold>
                {x.label}
              </T>
              {x.sub && (
                <T size={12} color={x.on ? C.text : C.sub}>
                  {x.sub}
                </T>
              )}
            </Container>
          ))}
        </Container>
      )
    case 'input':
      return <InputRow it={it} openKeyboard={openKeyboard} />
    case 'card':
      return (
        <Container key={it.key} flexDirection="column" gap={9} padding={12} borderRadius={12} backgroundColor={C.card} borderWidth={1} borderColor={C.line} opacity={it.dim ? 0.65 : 1}>
          <Container width="100%" flexDirection="row" gap={10} alignItems="center">
            {it.icon && <IconView icon={it.icon} size={40} />}
            <Container minWidth={0} flexDirection="column" flexGrow={1} flexShrink={1} gap={2}>
              <T size={16}>{it.title}</T>
              {it.sub && (
                <T size={12} color={C.sub}>
                  {it.sub}
                </T>
              )}
            </Container>
          </Container>
          {it.buttons && it.buttons.length > 0 && (
            <Row>
              {it.buttons.map((b, j) => (
                <Btn key={b.key ?? j} kind="small" b={b} />
              ))}
            </Row>
          )}
          {it.range && <Stepper {...it.range} />}
        </Container>
      )
  }
}

// ---------------------------------------------------------------- 仮想キーボード・確認

interface KeyboardReq {
  title: string
  initial?: string
  maxLength?: number
  onDone: (text: string | null) => void
}

const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl-', 'zxcvbnm,.?']

/** 仮想キーボード。かなモードではローマ字をひらがなにする */
const Keyboard: React.FC<{ req: KeyboardReq }> = ({ req }) => {
  const [text, setText] = useState(req.initial ?? '')
  const [pending, setPending] = useState('')
  const [kana, setKana] = useState(true)
  const [shift, setShift] = useState(false)
  const max = req.maxLength ?? 300
  const shown = text + pending
  const type = (ch: string) => {
    if (shown.length >= max) return
    if (!kana || !/[a-z-]/.test(ch)) {
      setText((t) => t + pending + (shift ? ch.toUpperCase() : ch))
      setPending('')
      return
    }
    const r = kanaConvert(pending + ch)
    setText((t) => t + r.done)
    setPending(r.rest)
  }
  const key = (label: string, onClick: () => void, opts: { w?: number; on?: boolean; primary?: boolean } = {}) => (
    <Container
      key={label}
      width={opts.w ?? 50}
      height={50}
      borderRadius={9}
      alignItems="center"
      justifyContent="center"
      backgroundColor={opts.on ? C.active : opts.primary ? C.primary : C.btn}
      borderWidth={1}
      borderColor={opts.on ? C.accent : C.line}
      hover={{ backgroundColor: opts.on || opts.primary ? C.active : C.hover }}
      cursor="pointer"
      onClick={soundClick(onClick)}
    >
      <T size={17}>{label}</T>
    </Container>
  )
  return (
    <Container flexDirection="column" gap={6} alignItems="center">
      <T size={19} bold>
        {req.title}
      </T>
      <Container width="100%" minHeight={44} padding={10} borderRadius={9} backgroundColor={C.inset} borderWidth={1} borderColor={C.line}>
        <T size={17}>{shown || ' '}</T>
      </Container>
      {ROWS.map((row) => (
        <Container key={row} flexDirection="row" gap={5}>
          {[...row].map((ch) => key(shift ? ch.toUpperCase() : ch, () => type(ch)))}
        </Container>
      ))}
      <Container flexDirection="row" gap={5}>
        {key(kana ? 'かな' : 'ABC', () => (setText((t) => t + pending), setPending(''), setKana(!kana)), { w: 76, on: kana })}
        {key('Shift', () => setShift(!shift), { w: 76, on: shift })}
        {key(L('空白', 'Space'), () => type(' '), { w: 120 })}
        {key(L('1 字消す', 'Delete'), () => (pending ? setPending(pending.slice(0, -1)) : setText((t) => [...t].slice(0, -1).join(''))), { w: 84 })}
        {key(L('やめる', 'Cancel'), () => req.onDone(null), { w: 76 })}
        {key(L('決定', 'OK'), () => req.onDone(text + pending), {
          w: 76,
          primary: true,
        })}
      </Container>
    </Container>
  )
}

/** ワールドなどからの確認・入力・ファイル選択の案内（VR のとき、この板に出す） */
const DialogView: React.FC = () => {
  const dlg = useDialogs((d) => d.dialogs[0])
  const close = useDialogs((d) => d.close)
  if (!dlg) return null
  if (dlg.kind === 'prompt')
    return (
      <Keyboard
        req={{
          title: dlg.req.title ?? '',
          initial: dlg.req.initial,
          maxLength: dlg.req.maxLength,
          onDone: (t) => (dlg.resolve(t), close(dlg.id)),
        }}
      />
    )
  const confirm = dlg.kind === 'confirm'
  return (
    <Container flexDirection="column" gap={14} padding={10}>
      <T size={21} bold>
        {confirm ? (dlg.req.title ?? L('確認', 'Confirm')) : L('ファイルの選択', 'Choose a file')}
      </T>
      <T size={16} pre>
        {confirm ? dlg.req.message : L('VR の中ではファイルを選べません。ヘッドセットを外して、画面のダイアログから選んでください', 'Files cannot be chosen inside VR. Take off the headset and use the on-screen dialog.')}
      </T>
      <Row>
        {confirm ? (
          <>
            <Btn
              kind="small"
              b={{
                label: dlg.req.cancelLabel ?? L('キャンセル', 'Cancel'),
                onClick: () => (dlg.resolve(false), close(dlg.id)),
              }}
            />
            <Btn
              kind="small"
              b={{
                label: dlg.req.okLabel ?? 'OK',
                primary: true,
                onClick: () => (dlg.resolve(true), close(dlg.id)),
              }}
            />
          </>
        ) : (
          <Btn kind="small" b={{ label: L('閉じる', 'Close'), onClick: () => close(dlg.id) }} />
        )}
      </Row>
    </Container>
  )
}

// ---------------------------------------------------------------- メニュー全体

export interface MenuPanelProps {
  engine: WorldEngine
  vr: boolean
  close: () => void
  exitVR?: () => void
  /** 確認・入力のダイアログもこの板に出す（VR） */
  showDialogs: boolean
}

/** メニューの板。下部のショートカットと本文から移動する。 */
export const MenuPanel: React.FC<MenuPanelProps> = ({ engine, vr, close, exitVR, showDialogs }) => {
  const page = useMenu((m) => m.page)
  const me = useApp((s) => s.me)
  const tabs = useMenuTabs(engine)
  const dialogs = useDialogs((d) => d.dialogs)
  const notices = useDialogs((d) => d.notices)
  const [kb, setKb] = useState<KeyboardReq | null>(null)
  const current = tabs.some((t) => t.id === page) ? page : 'main'
  const Page = MENU_PAGES[current]
  const dialog = showDialogs && dialogs.length > 0
  const keyboardVisible = !!kb || (dialog && dialogs[0]?.kind === 'prompt')
  const accountBadge = <Container flexDirection="row" alignItems="center" gap={8} paddingX={12} paddingY={8} borderRadius={12} backgroundColor={C.card}>
    <Container width={8} height={8} borderRadius={4} backgroundColor={C.accent} />
    <T size={12}>{me?.displayName ?? L('プレイヤー', 'Player')}</T>
  </Container>
  const body = kb ? (
    <Keyboard req={{ ...kb, onDone: (t) => (setKb(null), kb.onDone(t)) }} />
  ) : dialog ? (
    <DialogView />
  ) : current === 'chat' ? (
    <ChatPage engine={engine} vr={vr} openKeyboard={setKb} />
  ) : (
    <Page key={current} engine={engine} vr={vr} close={close} exitVR={exitVR} render={(items) => <Items items={items} openKeyboard={setKb} />} />
  )
  return (
    <Container width={PANEL_W} height={keyboardVisible ? 460 : PANEL_H} depthTest={false} depthWrite={false} renderOrder={1001} pointerEventsOrder={1000} flexDirection="row" borderRadius={20} backgroundColor={C.panel} borderWidth={1} borderColor={C.line} overflow="hidden">
      <Container flexGrow={1} flexShrink={1} flexDirection="column">
        <Container height={66} flexShrink={0} flexDirection="row" alignItems="center" paddingX={BODY_PAD} backgroundColor={C.panel} borderTopLeftRadius={20} borderTopRightRadius={20} borderBottomWidth={1} borderColor={C.line}>
          {accountBadge}
          <Container flexGrow={1} />
          <Container width={42} height={42} flexShrink={0} alignItems="center" justifyContent="center" borderRadius={9} backgroundColor={C.btn} borderWidth={1} borderColor={C.line} hover={{ backgroundColor: C.hover }} cursor="pointer" onClick={soundClick(close)}>
            <IconView icon={{ icon: 'close' }} size={20} />
          </Container>
        </Container>
        <Container flexGrow={1} flexShrink={1} flexDirection="column" gap={14} padding={BODY_PAD} overflow={current === 'chat' && !kb && !dialog ? 'hidden' : 'scroll'} scrollbarColor={C.line} scrollbarWidth={8} borderBottomLeftRadius={kb || dialog ? 20 : 0} borderBottomRightRadius={kb || dialog ? 20 : 0}>
          {current === 'main' && !kb && !dialog && <Container flexShrink={0} height={72} flexDirection="column" justifyContent="center" gap={5} paddingX={16} borderRadius={12} backgroundColor={C.card} borderWidth={1} borderColor={C.line}>
            <T size={11} color={C.accent}>{L('現在のワールド', 'CURRENT WORLD')}</T>
            <T size={18} bold>{engine.ctx.world.name}</T>
          </Container>}
          {body}
        </Container>
        {!kb && !dialog && <Container height={54} flexShrink={0} flexDirection="row" alignItems="center" justifyContent="center" gap={5} paddingX={8} backgroundColor={C.side} borderBottomLeftRadius={notices.length ? 0 : 20} borderBottomRightRadius={notices.length ? 0 : 20} borderTopWidth={1} borderColor={C.line}>
          {tabs.filter((t) => ['main', 'tools', 'friends', 'chat', 'instance', 'notifications', 'settings'].includes(t.id)).map((t) => <FooterTab key={t.id} tab={t} active={current === t.id || ((current === 'expressions' || current === 'poses') && t.id === 'main') || (current === 'debug' && t.id === 'settings')} />)}
        </Container>}
        {notices.length > 0 && (
          <Container flexShrink={0} padding={10} backgroundColor={C.inset} borderBottomLeftRadius={20} borderBottomRightRadius={20} borderTopWidth={1} borderColor={C.line}>
            <T size={15}>{notices[notices.length - 1].text}</T>
          </Container>
        )}
      </Container>
    </Container>
  )
}
