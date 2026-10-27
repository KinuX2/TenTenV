/** VR の基準空間を上げたときの、プレイヤー本体の高度。通常のしゃがみでは有効にしない。 */
export interface PlayspaceLiftState {
  active: boolean
  floorY: number
}

export const updatePlayspaceLift = (
  state: PlayspaceLiftState,
  headY: number,
  standingEyeY: number,
  scale: number,
  bodyY: number,
  grounded: boolean,
): { state: PlayspaceLiftState; targetY: number | null } => {
  const lift = Math.max(0, (headY - standingEyeY) * scale)
  // 開始と終了に差を付け、境界で上下に揺れないようにする。
  const active = state.active ? lift > 0.02 : lift > 0.2
  const floorY = active && !state.active ? bodyY : !state.active && grounded ? bodyY : state.floorY
  return { state: { active, floorY }, targetY: active ? floorY + lift : null }
}

/** 浮いたボディと XR の頭・手を同じ距離だけ動かすための基準位置。 */
export const playspaceOriginY = (bodyY: number, seatedLift: number, state: PlayspaceLiftState, targetY: number | null) =>
  bodyY + seatedLift - (targetY === null ? 0 : targetY - state.floorY)
