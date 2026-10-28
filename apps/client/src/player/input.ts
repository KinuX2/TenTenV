// 入力をまとめる（[7][8][9]）。キーボード・マウス、ゲームパッド、タッチ（仮想スティック）を同じ形にする
// VR のコントローラーは移動の処理（LocalPlayer）が直接読む
import { settings } from '../state/settings'

export interface InputFrame {
  /** 移動（x: 右 +、y: 前 +）。-1〜1 */
  moveX: number
  moveY: number
  /** 視点の回転（ラジアン、このフレームの分） */
  lookYaw: number
  lookPitch: number
  run: boolean
  jump: boolean
  /** 飛ぶ・降りる（飛行モード） */
  up: number
  crouchToggle: boolean
  proneToggle: boolean
  /** 照準の先を押す（クリック・タップ・ボタン） */
  interact: boolean
  /** 押しっぱなし（つかむ・ドラッグ） */
  interactHeld: boolean
  /** 持っている物を使う */
  use: boolean
  /** 「使う」を押している間 */
  useHeld: boolean
  /** つかむ・離す（PC: G） */
  grabToggle: boolean
  /** 持っている物の距離（マウスホイール） */
  holdDistance: number
  menu: boolean
  chat: boolean
  ptt: boolean
  muteToggle: boolean
  /** 画面のタップ位置（-1〜1、タッチで物を押したとき） */
  tap: { x: number; y: number } | null
  /** ジェスチャー（1〜8、0 は戻す） */
  gesture: number | null
  respawn: boolean
  thirdPersonToggle: boolean
}

const empty = (): InputFrame => ({
  moveX: 0, moveY: 0, lookYaw: 0, lookPitch: 0, run: false, jump: false, up: 0,
  crouchToggle: false, proneToggle: false, interact: false, interactHeld: false, use: false, useHeld: false, grabToggle: false,
  holdDistance: 0, menu: false, chat: false, ptt: false, muteToggle: false, tap: null, gesture: null,
  respawn: false, thirdPersonToggle: false,
})

class InputManager {
  private keys = new Set<string>()
  private pressed = new Set<string>()
  private mouseDX = 0
  private mouseDY = 0
  private wheel = 0
  private clicked = false
  private mouseHeld = false
  private rightClicked = false
  private rightMouseHeld = false
  private tap: { x: number; y: number } | null = null
  /** タッチの仮想スティック（-1〜1） */
  stick = { x: 0, y: 0 }
  private touchLook = { x: 0, y: 0 }
  private touchButtons = new Set<string>()
  private touchPressed = new Set<string>()
  private padPrev: boolean[] = []
  /** 入力をワールドに使わない（チャット入力中など） */
  suspended = false
  canvas: HTMLElement | null = null
  private attached = false

  attach(canvas: HTMLElement) {
    this.canvas = canvas
    if (this.attached) return
    this.attached = true
    window.addEventListener('keydown', (e) => {
      if (this.isTyping(e)) return
      if (!this.keys.has(e.code)) this.pressed.add(e.code)
      this.keys.add(e.code)
      if (['Space', 'Tab'].includes(e.code) && document.pointerLockElement) e.preventDefault()
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => {
      this.keys.clear()
      this.rightMouseHeld = false
      this.mouseHeld = false
    })
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas) {
        this.mouseDX += e.movementX
        this.mouseDY += e.movementY
      }
    })
    window.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== this.canvas) return
      if (e.button === 0) {
        this.clicked = true
        this.mouseHeld = true
      }
      if (e.button === 2) {
        this.rightClicked = true
        this.rightMouseHeld = true
      }
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseHeld = false
      if (e.button === 2) this.rightMouseHeld = false
    })
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.canvas) {
        this.mouseHeld = false
        this.rightMouseHeld = false
      }
    })
    window.addEventListener(
      'wheel',
      (e) => {
        if (document.pointerLockElement === this.canvas) this.wheel += Math.sign(e.deltaY)
      },
      { passive: true },
    )
    window.addEventListener('contextmenu', (e) => {
      if (document.pointerLockElement === this.canvas) e.preventDefault()
    })
  }

  private isTyping(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
  }

  /** タッチ操作の UI から呼ぶ */
  touchLookDelta(dx: number, dy: number) {
    this.touchLook.x += dx
    this.touchLook.y += dy
  }
  touchButton(name: string, down: boolean) {
    if (down && !this.touchButtons.has(name)) this.touchPressed.add(name)
    if (down) this.touchButtons.add(name)
    else this.touchButtons.delete(name)
  }
  touchTap(x: number, y: number) {
    this.tap = { x, y }
  }
  requestLock() {
    void this.canvas?.requestPointerLock?.()?.catch?.(() => {})
  }
  locked() {
    return document.pointerLockElement === this.canvas
  }

  /** 1 フレーム分の入力を取り出す（押した瞬間の入力はここで消える） */
  poll(dt: number): InputFrame {
    const f = empty()
    const s = settings()
    const down = (c: string) => this.keys.has(c)
    const hit = (c: string) => this.pressed.has(c)
    if (!this.suspended) {
      f.moveY += (down('KeyW') || down('ArrowUp') ? 1 : 0) - (down('KeyS') || down('ArrowDown') ? 1 : 0)
      f.moveX += (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0)
      f.run = down('ShiftLeft') || down('ShiftRight')
      f.jump = hit('Space')
      f.up = (down('Space') ? 1 : 0) - (down('ControlLeft') ? 1 : 0)
      f.crouchToggle = hit('KeyC')
      f.proneToggle = hit('KeyZ')
      f.grabToggle = hit('KeyG')
      f.use = hit('KeyF') || this.rightClicked
      f.useHeld = down('KeyF') || this.rightMouseHeld
      f.chat = hit('Enter') || hit('KeyT')
      f.ptt = down('KeyV')
      f.muteToggle = hit('KeyM')
      f.respawn = hit('Backquote')
      f.thirdPersonToggle = hit('KeyH')
      for (let i = 0; i <= 8; i++) if (hit(`Digit${i}`) && (down('AltLeft') || down('ShiftLeft'))) f.gesture = i
      const sens = 0.0022 * s.mouseSensitivity
      f.lookYaw -= this.mouseDX * sens
      f.lookPitch -= this.mouseDY * sens * (s.invertY ? -1 : 1)
      f.interact = this.clicked
      f.interactHeld = this.mouseHeld
      f.holdDistance = this.wheel
    }
    // メニューの開閉は、メニューを開いている間（入力を止めている間）も受け付ける
    f.menu = hit('KeyR') || hit('Escape')
    this.mouseDX = this.mouseDY = this.wheel = 0
    this.clicked = false
    this.rightClicked = false
    this.pressed.clear()

    // タッチ
    f.moveX += this.stick.x
    f.moveY += this.stick.y
    f.lookYaw -= this.touchLook.x * 0.005
    f.lookPitch -= this.touchLook.y * 0.005 * (s.invertY ? -1 : 1)
    this.touchLook.x = this.touchLook.y = 0
    const th = (n: string) => this.touchPressed.has(n)
    f.jump ||= th('jump')
    f.crouchToggle ||= th('crouch')
    f.interact ||= th('interact')
    f.use ||= th('use')
    f.useHeld ||= this.touchButtons.has('use')
    f.grabToggle ||= th('grab')
    f.menu ||= th('menu')
    f.muteToggle ||= th('mute')
    f.run ||= Math.hypot(this.stick.x, this.stick.y) > 0.95
    f.up += (this.touchButtons.has('jump') ? 1 : 0) - (this.touchButtons.has('crouch') ? 1 : 0)
    if (this.tap) {
      f.tap = this.tap
      f.interact = true
    }
    this.tap = null
    this.touchPressed.clear()

    // ゲームパッド（[8]、標準の配置）
    const pads = navigator.getGamepads?.() ?? []
    for (const pad of pads) {
      if (!pad || pad.mapping !== 'standard') continue
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85)
      f.moveX += dz(pad.axes[0] ?? 0)
      f.moveY -= dz(pad.axes[1] ?? 0)
      f.lookYaw -= dz(pad.axes[2] ?? 0) * dt * 2.6
      f.lookPitch -= dz(pad.axes[3] ?? 0) * dt * 2.0 * (s.invertY ? -1 : 1)
      const b = (i: number) => !!pad.buttons[i]?.pressed
      const edge = (i: number) => b(i) && !this.padPrev[i]
      f.jump ||= edge(0)
      f.crouchToggle ||= edge(1)
      f.use ||= edge(2)
      f.useHeld ||= b(2)
      f.grabToggle ||= edge(3)
      f.interact ||= edge(7)
      f.interactHeld ||= b(7)
      f.menu ||= edge(9)
      f.chat ||= edge(8)
      f.run ||= b(10)
      f.thirdPersonToggle ||= edge(11)
      f.ptt ||= b(6)
      f.up += (b(0) ? 1 : 0) - (b(1) ? 1 : 0)
      if (edge(12)) f.gesture = 1
      if (edge(13)) f.gesture = 2
      if (edge(14)) f.gesture = 3
      if (edge(15)) f.gesture = 4
      this.padPrev = pad.buttons.map((x) => x.pressed)
    }
    const len = Math.hypot(f.moveX, f.moveY)
    if (len > 1) {
      f.moveX /= len
      f.moveY /= len
    }
    if (this.suspended) {
      f.moveX = f.moveY = 0
      f.jump = false
      f.use = false
      f.useHeld = false
    }
    return f
  }

  /** 左ボタンを押しているか（ペンなど） */
  mouseDown() {
    return this.mouseHeld
  }

  isDown(code: string) {
    return this.keys.has(code)
  }
}

export const input = new InputManager()
