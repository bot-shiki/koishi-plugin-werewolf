import { Context, Dict, Fragment, h, Random, z } from 'koishi'
import { Corridor, Game, Player } from 'koishi-plugin-lobby'
import { Character, Identity, logger, Preset, t, Weather } from './utils'
import IkuAction from './action/iku'
import YukariAction from './action/yukari'
import RemiliaAction from './action/remilia'
import MamizouAction from './action/mamizou'
import DoremyAction from './action/doremy'
import NingenAction from './action/ningen'
import SageAction from './action/sage'
import ExileAction from './action/exile'
import DeathAction from './action/death'

export type CountdownTag = never
  | 'init' | 'confirm' | 'death' | 'ningen' | 'speech'
  | 'vote' | 'last-words' | 'show-kill' | 'sage-order' | 'sage-transfer'

export type Phase = 'init' | 'Vote' | 'Day' | 'Night'

export class WerewolfGame extends Game<WerewolfGame.Options> {
  dayCount = 0
  weather: Weather = null
  seats: Character[]
  chars: Map<Player, Character>
  winner: Identity.Winner
  iku = new IkuAction(this)
  sage = new SageAction(this)
  exile = new ExileAction(this)
  death = new DeathAction(this)
  ningen = new NingenAction(this)
  remilia = new RemiliaAction(this)
  mamizou = new MamizouAction(this)
  yukari = new YukariAction(this)
  doremy = new DoremyAction(this)

  getChar(identity: Identity) {
    return this.seats.find(c => c.identity === identity)
  }

  async validate() {
    if (this.room.size < 6 || this.room.size > 16) {
      throw new Error('lobby.game.th-werewolf.invalid-size')
    }
  }

  leave(player: Player) {
    const char = this.chars.get(player)
    if (char.isOut) return
    char.isOut = true
    char.killer = 'offline'
    this.check()
  }

  async init() {
    const [ningenCount, youkaiCount, ...extra] = Random.pick(Preset.default[this.room.size])
    const identities = [
      Random.pick<Identity>(Identity.Ningen.Normal, ningenCount),
      Random.pick<Identity>(Identity.Youkai.Normal, youkaiCount),
      ...extra.map(([count, ...options]) => {
        if (!this.options.weather) {
          options = options.filter(i => i !== 'iku')
        }
        return Random.pick<Identity>(options, count)
      }),
    ].flat()

    const parties: Dict<Identity[]> = { ningen: [], youkai: [], neutral: [] }
    for (const identity of identities) {
      const party = Identity.getParty(identity)
      parties[party].push(identity)
    }
    const output: h[] = [t('init.parties')]
    for (const party in parties) {
      if (!parties[party].length) continue
      const elements: Fragment = []
      parties[party].forEach((identity, index) => {
        if (index) elements.push(', ')
        elements.push(t(`character.${identity}.name`))
      })
      output.push(h('p', [t(`party.${party}`), ': ', ...elements]))
    }

    this.seats = []
    this.chars = new Map()
    await this.room.broadcast(output)
    const players = Object.values(this.room.players)
    await Promise.all(players.map(async (player, index) => {
      const identity = identities[index]
      const char = new Character(this, player, identity)
      logger.debug('init %s [%s]', char, char.party)
      this.chars.set(player, char)
      this.seats.push(char)
      const output = [
        t('init.character', [t(`character.${identity}.name`)]),
        t('init.party', [t(`party.${char.party}`)]),
      ]
      if (char.isExpert) {
        output.push(t(`character.${identity}.skill`))
      }
      await player.send(output.map(el => h('p', el)))
      await player.pause(60000, null, true)
    }))
    this.seats = Random.shuffle(this.seats)
  }

  async start() {
    this.room.allowSpeech = false

    try {
      await this.init()
      while (true) {
        await this.dayAction()
        await this.iku.action()
        await this.remilia.action()
        await this.mamizou.action()
        await this.ningen.action()
        await this.yukari.action()
        await this.doremy.action()
        await this.sage.action()
        await this.nightAction()
        await this.death.action()
        await this.exile.action()
        await this.death.action()
      }
    } catch (e) {
      if (!this.winner) throw e
    }

    await this.announce()
  }

  isNingenWinner() {
    const alive = this.seats.filter(c => !c.isDead || c.identity === 'utsuho' && c.killer === 'vote')
    if (this.room.size <= 7) {
      return alive.every(c => c.party === 'ningen')
    } else {
      return alive.every(c => c.party !== 'youkai' || c.isExpert)
        || alive.every(c => c.party !== 'youkai' || !c.isExpert)
    }
  }

  check() {
    const alive = this.seats.filter(c => !c.isOut)
    if (alive.length === 0) {
      const parsee = this.getChar('parsee')
      if (parsee && !parsee.isDead) {
        parsee.killer = null
        this.winner = 'parsee'
      } else {
        this.winner = 'draw'
      }
    } else if (alive.length === 1 && alive[0].identity === 'parsee') {
      this.winner = 'parsee'
    } else if (alive.every(c => c.nightmare || c.identity === 'doremy')) {
      alive.forEach((char) => {
        if (char.identity !== 'doremy') {
          char.killer = 'doremy'
        }
      })
      this.winner = 'doremy'
    } else if (alive.every(c => c.party !== 'ningen')) {
      this.winner = 'youkai'
    } else if (this.isNingenWinner()) {
      this.winner = 'ningen'
    }
    if (this.winner) throw new Error('game over')
  }

  private async announce() {
    logger.debug('winner:', this.winner)

    if (this.winner === 'draw') {
      await this.room.broadcast(t('winner.draw'))
    } else if (this.winner === 'ningen' || this.winner === 'youkai') {
      await this.room.broadcast(t('winner.party', [
        t(`party.${this.winner}`),
        this.seats.filter(c => c.party === this.winner).map(c => c.player.name).join(', '),
      ]))
    } else {
      await this.room.broadcast(t('winner.single', [
        t(`character.${this.winner}`),
        this.getChar(this.winner).player.name,
      ]))
    }

    const output = this.seats.map((char) => {
      const content: Fragment = [char.player.name, '  ']
      if (!char.killer) {
        content.push(t('killer.survive'))
      } else if (Identity.Expert.includes(char.killer as Identity)) {
        content.push(t(`character.${char.killer}.name`))
      } else {
        content.push(t(`killer.${char.killer}`))
      }
      return h('p', content)
    })
    output.unshift(t('killer.header'))
    await this.room.broadcast(output)
  }

  private async dayAction() {
    this.dayCount += 1
    logger.debug('day %s', this.dayCount)
    await this.room.broadcast(t('general.day', [this.dayCount]))
  }

  async nightAction() {
    const deaths = this.seats.filter(c => c.killer && !c.isDead)
    if (deaths.length) {
      await this.room.broadcast(t('general.night-death', [this.dayCount, deaths.map(c => c.player.name).join(', ')]))
    } else {
      await this.room.broadcast(t('general.night-peace', [this.dayCount]))
    }
  }
}

export namespace WerewolfGame {
  export interface Options {
    sage?: boolean
    weather?: boolean
    timeout?: Dict<number>
  }
}

class RPSCorridor extends Corridor {
  factory = WerewolfGame

  constructor(ctx: Context, public config: RPSCorridor.Config) {
    super(ctx, 'th-werewolf')
    ctx.i18n.define('zh-CN', require('./locales/zh-CN'))
    this.cmd.option('weather', '-W, --no-weather', { fallback: true })
  }
}

namespace RPSCorridor {
  export interface Config {}

  export const Config: z<Config> = z.object({
  })
}

export default RPSCorridor
