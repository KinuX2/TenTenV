// ワールドから呼ばれる確認・入力・ファイル選択の画面（PC・スマホ）
import { useState } from 'react'
import { L } from '../../i18n'
import { deliverFiles, useDialogs, type Dialog } from '../bridge'
import { Modal } from '../common'

export const Dialogs: React.FC = () => {
  const dlg = useDialogs((d) => d.dialogs[0])
  const close = useDialogs((d) => d.close)
  if (!dlg) return null
  return <DialogView key={dlg.id} dlg={dlg} close={() => close(dlg.id)} />
}

const DialogView: React.FC<{ dlg: Dialog; close: () => void }> = ({ dlg, close }) => {
  const [text, setText] = useState(dlg.kind === 'prompt' ? (dlg.req.initial ?? '') : '')
  if (document.pointerLockElement) document.exitPointerLock()
  if (dlg.kind === 'confirm') {
    const done = (ok: boolean) => {
      dlg.resolve(ok)
      close()
    }
    return (
      <Modal
        title={dlg.req.title ?? L('確認', 'Confirm')}
        onClose={() => done(false)}
        footer={
          <>
            <button className="btn" onClick={() => done(false)}>
              {dlg.req.cancelLabel ?? L('キャンセル', 'Cancel')}
            </button>
            <button className="btn primary" autoFocus onClick={() => done(true)}>
              {dlg.req.okLabel ?? 'OK'}
            </button>
          </>
        }
      >
        <div style={{ whiteSpace: 'pre-wrap' }}>{dlg.req.message}</div>
        <div className="muted small">{L('このワールドからの確認です', 'This request comes from the world')}</div>
      </Modal>
    )
  }
  if (dlg.kind === 'prompt') {
    const done = (v: string | null) => {
      dlg.resolve(v)
      close()
    }
    const Tag = dlg.req.multiline ? 'textarea' : 'input'
    return (
      <Modal
        title={dlg.req.title ?? L('入力', 'Input')}
        onClose={() => done(null)}
        footer={
          <>
            <button className="btn" onClick={() => done(null)}>
              {L('キャンセル', 'Cancel')}
            </button>
            <button className="btn primary" onClick={() => done(text)}>
              OK
            </button>
          </>
        }
      >
        {dlg.req.message && <div>{dlg.req.message}</div>}
        <Tag
          className="input"
          autoFocus
          value={text}
          maxLength={dlg.req.maxLength ?? 500}
          rows={dlg.req.multiline ? 4 : undefined}
          onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setText(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => {
            e.stopPropagation()
            if (e.key === 'Enter' && !dlg.req.multiline && !(e.nativeEvent as KeyboardEvent).isComposing) done(text)
          }}
        />
      </Modal>
    )
  }
  return (
    <Modal title={L('ファイルを選ぶ', 'Choose files')} onClose={() => (deliverFiles(dlg.req, []), close())}>
      <div className="muted">{L('ワールドがファイルを求めています。選んだファイルだけがワールドに渡ります。', 'The world asks for a file. Only the files you choose are given to it.')}</div>
      <input
        type="file"
        accept={dlg.req.accept}
        multiple={dlg.req.multiple}
        onChange={(e) => {
          deliverFiles(dlg.req, [...(e.target.files ?? [])])
          close()
        }}
      />
      {dlg.req.maxBytes && <div className="muted small">{L('上限', 'Max')} {(dlg.req.maxBytes / 1048576).toFixed(0)}MB</div>}
    </Modal>
  )
}
