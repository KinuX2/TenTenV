// 設定（[198][199][200][203]・18.1）。項目はワールドの中のメニュー（画面・VR）と共通（ui/menu/settingsItems.tsx）
import { DomItems } from './menu/DomItems'
import { SettingsItems } from './menu/settingsItems'

export const SettingsPanel: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <SettingsItems
    render={([tabs, ...items]) => (
      <div className="col">
        <DomItems items={[tabs]} />
        <div className={compact ? 'col' : 'card col'}>
          <DomItems items={items} />
        </div>
      </div>
    )}
  />
)
