import { create } from 'zustand'

export interface PortalTarget {
  worldId: string
  instanceId: string
  worldName: string
  access: string
  locked: boolean
}

interface PlacementState {
  target: PortalTarget | null
  valid: boolean
  reason: string
  begin: (target: PortalTarget) => void
  update: (valid: boolean, reason: string) => void
  cancel: () => void
}

export const usePortalPlacement = create<PlacementState>((set) => ({
  target: null,
  valid: false,
  reason: '',
  begin: (target) => set({ target, valid: false, reason: '' }),
  update: (valid, reason) => set((s) => s.valid === valid && s.reason === reason ? s : { valid, reason }),
  cancel: () => set({ target: null, valid: false, reason: '' }),
}))
