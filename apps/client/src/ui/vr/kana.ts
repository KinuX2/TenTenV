// ローマ字をひらがなにする（VR の仮想キーボード用）
const TABLE: Record<string, string> = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ', ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ', za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と', da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ', ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ', pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  wa: 'わ', wo: 'を', nn: 'ん', 'n-': 'ん',
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  sha: 'しゃ', shu: 'しゅ', she: 'しぇ', sho: 'しょ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
  ja: 'じゃ', ju: 'じゅ', je: 'じぇ', jo: 'じょ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
  cha: 'ちゃ', chu: 'ちゅ', che: 'ちぇ', cho: 'ちょ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',
  nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ', hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ', bya: 'びゃ', byu: 'びゅ', byo: 'びょ', pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  mya: 'みゃ', myu: 'みゅ', myo: 'みょ', rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', thi: 'てぃ', dhi: 'でぃ', vu: 'ゔ',
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ', xtu: 'っ', xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ',
  la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ', ltu: 'っ', '-': 'ー',
}

/** 入力中のローマ字から、確定したかなと残りを返す */
export const kanaConvert = (s: string): { done: string; rest: string } => {
  let done = ''
  let rest = s
  for (;;) {
    if (!rest) break
    // 子音が 2 つ続いたら「っ」（n は除く）
    if (rest.length >= 2 && rest[0] === rest[1] && /[bcdfghjklmpqrstvwxyz]/.test(rest[0]) && rest[0] !== 'n') {
      done += 'っ'
      rest = rest.slice(1)
      continue
    }
    // n の次が母音・y・n 以外なら「ん」
    if (rest.length >= 2 && rest[0] === 'n' && !/[aiueoyn-]/.test(rest[1])) {
      done += 'ん'
      rest = rest.slice(1)
      continue
    }
    let hit = false
    for (const len of [3, 2, 1]) {
      const k = rest.slice(0, len)
      if (k.length === len && TABLE[k]) {
        done += TABLE[k]
        rest = rest.slice(len)
        hit = true
        break
      }
    }
    if (hit) continue
    // まだ途中（かなにならない子音だけが残る）
    const could = Object.keys(TABLE).some((k) => k.startsWith(rest))
    if (could) break
    done += rest[0]
    rest = rest.slice(1)
  }
  return { done, rest }
}
