import { Dict, Fragment, h, Logger } from 'koishi'
import { Player } from 'koishi-plugin-lobby'
import { WerewolfGame } from '.'

export const logger = new Logger('werewolf')

export const t = (path: string, param?: any) => h.i18n('lobby.game.th-werewolf.' + path, param)

export type Weather = typeof Weather[number]
export const Weather = [
  'kaisei', 'kirisame', 'donten', 'souten', 'hyou',
  'hanagumori', 'noumu', 'yuki', 'tenkiame', 'utoame',
  'fuuu', 'seiran', 'kawagiri', 'taifuu', 'nagi',
  'diamond-dust', 'kousa', 'retsujitsu', 'baiu', 'kyokkou',
] as const

export type Identity = Identity.Neutral | Identity.Youkai | Identity.Ningen

interface Party extends Array<Identity> {
  Normal: Identity[]
  Expert: Identity[]
}

export namespace Identity {
  export const Neutral: Identity[] = ['doremy', 'parsee']
  export type Neutral = 'doremy' | 'parsee'

  export const Youkai = [] as unknown as Party
  export type Youkai = Youkai.Normal | Youkai.Expert
  Youkai.push(...Youkai.Expert = ['yukari', 'utsuho', 'remilia', 'yuuka', 'mamizou', 'iku'])
  Youkai.push(...Youkai.Normal = ['kagerou', 'rumia', 'mystia', 'wriggle', 'wakasagihime', 'sekibanki', 'kyouko', 'tewi', 'chen', 'nazrin', 'kogasa'])

  export namespace Youkai {
    export type Expert = 'yukari' | 'utsuho' | 'remilia' | 'yuuka' | 'mamizou' | 'iku'
    export type Normal = 'kagerou' | 'rumia' | 'mystia' | 'wriggle' | 'wakasagihime' | 'sekibanki' | 'kyouko' | 'tewi' | 'chen' | 'nazrin' | 'kogasa'
  }

  export const Ningen = [] as unknown as Party
  export type Ningen = Ningen.Normal | Ningen.Expert
  Ningen.push(...Ningen.Expert = ['reimu', 'rinnosuke'])
  Ningen.push(...Ningen.Normal = ['marisa', 'sanae', 'sumireko', 'kosuzu', 'renko', 'merry', 'akyuu', 'youmu', 'mokou'])

  export namespace Ningen {
    export type Expert = 'reimu' | 'rinnosuke'
    export type Normal = 'marisa' | 'sanae' | 'sumireko' | 'kosuzu' | 'renko' | 'merry' | 'akyuu' | 'youmu' | 'mokou'
  }

  export const Expert: Identity[] = [...Neutral, ...Youkai.Expert, ...Ningen.Expert]
  export type Expert = Neutral | Youkai.Expert | Ningen.Expert

  export type Revenger = 'reimu' | 'yuuka'
  export type Winner = 'ningen' | 'youkai' | 'draw' | Neutral
  export type Killer = Revenger | Neutral | 'yukari' | 'ningen' | 'vote' | 'offline'

  export type Action = Expert
    | 'night' | 'vote' | 'show-kill' | 'ningen' | 'chat'
    | 'last-words' | 'sage' | 'transfer' | 'weather'

  export function getParty(identity: Identity) {
    if (Neutral.includes(identity)) return 'neutral'
    if (Youkai.includes(identity)) return 'youkai'
    if (Ningen.includes(identity)) return 'ningen'
  }
}

export type Preset = [number, number, ...[number, ...Identity.Expert[]][]]
export const Preset: Dict<Preset[][]> = require('./preset')

export interface SelectItem {
  disabled: boolean
  labels?: h[]
}

export class Character {
  party: 'ningen' | 'youkai' | 'neutral'
  /** 是贤者 */
  isSage: boolean
  /** 角色死因 */
  killer: Identity.Killer
  /** 苍天的替死者 */
  scapegoat: Character
  /** 目标角色 */
  target: Character
  /** 台风 */
  taifuu: boolean
  /** 得票数 */
  votes: number
  /** 选定目标的时间 */
  voteTime: number
  /** remilia 知晓阵营 */
  isKnown: boolean
  /** 全员知晓身份 */
  isWellKnown: boolean
  /** 无法被替死或发动复仇 */
  isScapegoat: boolean
  /** doremy 噩梦状态 */
  nightmare: boolean
  /** 是否出局 (含 utsuho 被投死) */
  isOut: boolean

  constructor(public game: WerewolfGame, public player: Player, public identity: Identity) {
    this.party = Identity.getParty(identity)
  }

  /** 有特殊技能 */
  get isExpert() {
    return Identity.Expert.includes(this.identity)
  }

  get isRevenger() {
    return ['reimu', 'yuuka'].includes(this.identity)
  }

  get isDead() {
    return this.isOut && (this.identity !== 'utsuho' || this.killer !== 'vote')
  }

  get isDying() {
    return this.killer && !this.isOut
  }

  /** 是否被视为人类 */
  get isNingen() {
    return this.party === 'ningen' && this.identity !== 'rinnosuke'
  }

  /** 能在投票前发言 */
  get canSpeak() {
    return !this.killer || this.identity === 'utsuho' && this.killer === 'vote'
  }

  render(result: SelectItem) {
    const i = this.game.seats.indexOf(this)
    const output: Fragment = [`[${result.disabled ? ' ' : i + 1}] ${this.player.name}`]
    const labels: h[] = []
    if (result.labels) labels.push(...result.labels)
    if (this.killer === 'offline') {
      labels.push(t('general.offline'))
    } else if (this.isOut) {
      labels.push(t('general.is-dead'))
    }
    if (labels.length) {
      output[0] += ' ('
      labels.forEach((label, i) => {
        if (i) output.push(', ')
        output.push(label)
      })
      output.push(')')
    }
    return h('p', output)
  }

  async select(predicate: (character: Character) => SelectItem, timeout: number, optional: boolean) {
    const choices = optional ? ['.', '。'] : []
    const output = this.game.seats.map((c, i) => {
      const result = predicate(c)
      if (!result.disabled) choices.push(String(i + 1))
      return c.render(result)
    })
    await this.player.send(output)
    const result = await this.player.select(choices, timeout)
    return this.game.seats[+result - 1]
  }

  toString() {
    return `${this.identity} (${this.player.name})`
  }
}

export function rotate<T>(source: readonly T[], offset = 0) {
  const result = source.slice()
  if (!offset) return result
  if (offset < 0) {
    result.unshift(...result.splice(offset, Infinity))
  } else {
    result.push(...result.splice(0, offset))
  }
  return result
}
