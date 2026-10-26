// すべての REST API を登録する（一覧は packages/protocol/src/api.ts）
import type { App } from '../app'
import { authRoutes } from './auth'
import { avatarRoutes } from './avatars'
import { instanceRoutes } from './instances'
import { reportRoutes } from './reports'
import { socialRoutes } from './social'
import { storageRoutes } from './storage'
import { userRoutes } from './users'
import { worldRoutes } from './worlds'

export const registerRoutes = (app: App) => {
  authRoutes(app)
  userRoutes(app)
  socialRoutes(app)
  avatarRoutes(app)
  worldRoutes(app)
  instanceRoutes(app)
  storageRoutes(app)
  reportRoutes(app)
}
