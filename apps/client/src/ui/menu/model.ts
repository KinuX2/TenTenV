// メニューの中身の定義（タブ・項目）。ワールドの中のメニューは、画面でも VR でもこの定義をひとつの部品で描く
// 各ページは「項目の配列」を返すだけにし、ワールドの中では ui/menu/MenuPanel.tsx（uikit）が画面でも VR でも同じに描く
// （ホーム画面の設定だけは 3D の外なので ui/menu/DomItems.tsx で描く）

/** 項目に添える図柄 */
export type MenuIcon = { icon: string } | { face: string } | { hand: string } | { image: string | null; fallback?: string }

export interface MenuButton {
  key?: string
  label: string
  icon?: MenuIcon
  /** 押されている（選ばれている）状態 */
  on?: boolean
  danger?: boolean
  primary?: boolean
  /** 文字を出さず図柄だけ。label は説明に使う */
  iconOnly?: boolean
  onClick: () => void
}

export interface Option<T extends string = string> {
  v: T
  label: string
}

export type MenuItem =
  /** 見出し */
  | { t: 'section'; title: string }
  /** 説明の文 */
  | { t: 'note'; text: string; mono?: boolean }
  /** ボタンの並び。big は図柄つきの大きなボタン（4 列）、small は小さなボタン（折り返し） */
  | { t: 'buttons'; size: 'big' | 'small'; items: MenuButton[] }
  | { t: 'toggle'; label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }
  | { t: 'range'; label: string; value: number; min: number; max: number; step: number; singleStep?: boolean; format?: (v: number) => string; onChange: (v: number) => void }
  | { t: 'choice'; label: string; value: string; options: Option[]; onChange: (v: string) => void }
  /** 長い選択肢を一つの欄にまとめる */
  | { t: 'dropdown'; label: string; value: string; options: Option[]; onChange: (v: string) => void }
  /** ページの中の小さなタブ（設定の分類など） */
  | { t: 'tabs'; value: string; options: Option[]; onChange: (v: string) => void }
  /** 画像つきの選択肢（アバター・ワールド） */
  | { t: 'tiles'; items: { key: string; label: string; sub?: string; icon?: MenuIcon; on?: boolean; onClick: () => void }[] }
  /** 文字の入力。VR では仮想キーボードを開く */
  | { t: 'input'; label: string; value: string; placeholder?: string; numeric?: boolean; onSubmit: (v: string) => void }
  /** 人・通知などのまとまり: 名前と補足、ボタン、音量など */
  | { t: 'card'; key: string; title: string; sub?: string; icon?: MenuIcon; dim?: boolean; buttons?: MenuButton[]; range?: { label: string; value: number; min: number; max: number; step: number; format?: (v: number) => string; onChange: (v: number) => void } }

export interface MenuTab {
  id: string
  label: string
  icon: MenuIcon
}

export const pct = (v: number) => `${Math.round(v * 100)}%`
