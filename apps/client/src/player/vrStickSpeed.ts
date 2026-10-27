/** VR の移動スティックの倒し具合を、通常移動から走行までの速度に変える。 */
export const vrStickSpeed = (magnitude: number, runMultiplier: number): number => {
  const amount = Math.max(0, Math.min(1, magnitude))
  const walk = Math.min(1, amount / 0.25)
  const run = Math.max(0, Math.min(1, (amount - 0.6) / 0.4))
  const smoothRun = run * run * (3 - 2 * run)
  return walk * (1 + (runMultiplier - 1) * smoothRun)
}
