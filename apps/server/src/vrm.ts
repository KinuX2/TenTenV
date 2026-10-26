// VRM（glTF バイナリ）の簡単な検査と、利用条件（meta）の取り出し
import type { AvatarLicense } from '@tentenv/protocol'

const GLB_MAGIC = 0x46546c67 // "glTF"
const CHUNK_JSON = 0x4e4f534a // "JSON"

export class VrmError extends Error {}

const s = (v: unknown, max = 500): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const b = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const url = (v: unknown) => {
  const x = s(v, 1000)
  return x && /^https?:\/\//i.test(x) ? x : null
}

/** glTF バイナリの JSON 部分を読む */
export const readGlbJson = (buf: Uint8Array): Record<string, unknown> => {
  if (buf.length < 20) throw new VrmError('ファイルが短すぎます')
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (v.getUint32(0, true) !== GLB_MAGIC) throw new VrmError('glTF バイナリ（.vrm / .glb）ではありません')
  if (v.getUint32(4, true) !== 2) throw new VrmError('glTF 2.0 ではありません')
  const total = v.getUint32(8, true)
  if (total > buf.length || total < 20) throw new VrmError('ファイルが壊れています')
  const jsonLen = v.getUint32(12, true)
  if (v.getUint32(16, true) !== CHUNK_JSON || jsonLen > total - 20 || jsonLen > 64 * 1024 * 1024) throw new VrmError('ファイルが壊れています（JSON チャンク）')
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)))
  } catch {
    throw new VrmError('ファイルが壊れています（JSON を読めません）')
  }
  if (!json || typeof json !== 'object') throw new VrmError('ファイルが壊れています')
  return json as Record<string, unknown>
}

const CC_URLS: Record<string, string> = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  CC_BY: 'https://creativecommons.org/licenses/by/4.0/',
  CC_BY_NC: 'https://creativecommons.org/licenses/by-nc/4.0/',
  CC_BY_SA: 'https://creativecommons.org/licenses/by-sa/4.0/',
  CC_BY_NC_SA: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  CC_BY_ND: 'https://creativecommons.org/licenses/by-nd/4.0/',
  CC_BY_NC_ND: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
}

const allow0 = (v: unknown) => (v === 'Allow' ? true : v === 'Disallow' ? false : null)

/** VRM 1.0（VRMC_vrm.meta） */
const license1 = (m: Record<string, unknown>): AvatarLicense => ({
  title: s(m.name, 200) ?? '',
  authors: Array.isArray(m.authors) ? m.authors.map((a) => s(a, 200)).filter((a): a is string => !!a).slice(0, 20) : [],
  version: s(m.version, 100),
  licenseUrl: url(m.licenseUrl),
  avatarPermission: s(m.avatarPermission, 64),
  commercialUsage: s(m.commercialUsage, 64),
  allowRedistribution: b(m.allowRedistribution),
  modification: s(m.modification, 64),
  allowExcessivelyViolentUsage: b(m.allowExcessivelyViolentUsage),
  allowExcessivelySexualUsage: b(m.allowExcessivelySexualUsage),
  allowPoliticalOrReligiousUsage: b(m.allowPoliticalOrReligiousUsage),
  allowAntisocialOrHateUsage: b(m.allowAntisocialOrHateUsage),
  creditNotation: s(m.creditNotation, 64),
  otherLicenseUrl: url(m.otherLicenseUrl),
})

/** VRM 0.x（VRM.meta）を 1.0 の項目に読み替える */
const license0 = (m: Record<string, unknown>): AvatarLicense => {
  const lic = s(m.licenseName, 64)
  const perm = s(m.allowedUserName, 64)
  const commercial = allow0(m.commercialUssageName)
  return {
    title: s(m.title, 200) ?? '',
    authors: s(m.author, 200) ? [s(m.author, 200)!] : [],
    version: s(m.version, 100),
    licenseUrl: lic && CC_URLS[lic] ? CC_URLS[lic] : lic === 'Other' ? url(m.otherLicenseUrl) : null,
    avatarPermission: perm === 'OnlyAuthor' ? 'onlyAuthor' : perm === 'ExplicitlyLicensedPerson' ? 'onlySeparatelyLicensedPerson' : perm === 'Everyone' ? 'everyone' : null,
    commercialUsage: commercial === null ? null : commercial ? 'personalProfit' : 'personalNonProfit',
    allowRedistribution: lic ? lic !== 'Redistribution_Prohibited' : null,
    modification: lic && /_ND$/.test(lic) ? 'prohibited' : null,
    allowExcessivelyViolentUsage: allow0(m.violentUssageName),
    allowExcessivelySexualUsage: allow0(m.sexualUssageName),
    allowPoliticalOrReligiousUsage: null,
    allowAntisocialOrHateUsage: null,
    creditNotation: lic && lic.startsWith('CC_BY') ? 'required' : null,
    otherLicenseUrl: url(m.otherPermissionUrl) ?? url(m.otherLicenseUrl),
  }
}

export interface VrmCheck {
  vrmVersion: '0' | '1'
  license: AvatarLicense | null
}

/** VRM として受け付けられるか確かめる。だめなら VrmError */
export const inspectVrm = (buf: Uint8Array): VrmCheck => {
  const json = readGlbJson(buf)
  const ext = (json.extensions ?? {}) as Record<string, unknown>
  const v1 = ext.VRMC_vrm as Record<string, unknown> | undefined
  const v0 = ext.VRM as Record<string, unknown> | undefined
  if (v1 && typeof v1 === 'object') {
    const meta = v1.meta && typeof v1.meta === 'object' ? license1(v1.meta as Record<string, unknown>) : null
    return { vrmVersion: '1', license: meta }
  }
  if (v0 && typeof v0 === 'object') {
    const meta = v0.meta && typeof v0.meta === 'object' ? license0(v0.meta as Record<string, unknown>) : null
    return { vrmVersion: '0', license: meta }
  }
  throw new VrmError('VRM ではありません（VRM / VRMC_vrm 拡張がありません）')
}

/** 画像の種類を先頭のバイトから判定する（png / jpeg / webp / gif 以外は null） */
export const imageType = (buf: Uint8Array): { ext: string; type: string } | null => {
  if (buf.length < 12) return null
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: 'png', type: 'image/png' }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' }
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return { ext: 'webp', type: 'image/webp' }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return { ext: 'gif', type: 'image/gif' }
  return null
}
