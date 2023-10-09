import { h, Random } from 'koishi'
import { WerewolfGame } from '..'
import { Character, Identity, logger, t } from '../utils'
import { Player } from 'koishi-plugin-lobby'

export abstract class Action {
  constructor(public game: WerewolfGame) {}
}

export abstract class ExpertAction extends Action {
  abstract identity: Identity.Expert

  protected character: Character
  protected player: Player

  async action() {
    this.character = this.game.getChar(this.identity)
    if (!this.character) return
    this.player = this.character.player
    logger.debug('%s action', this.identity)
    const others = this.game.room.filter(player => player !== this.player)
    await Promise.all([
      others.broadcast(t('general.expert-action', [t(`character.${this.identity}.name`)])),
      (async () => {
        if (this.character.isDead) {
          return this.player.pause(10000, t('general.expert-dead'))
        }
        return this.callback()
      })(),
    ])
  }

  protected retsujitsu() {
    if (this.game.weather !== 'retsujitsu') return
    const result = Random.bool(0.5)
    if (result) logger.debug('weather retsujitsu take effect')
    return result
  }

  abstract callback(): Promise<any>
}

export abstract class VoteAction extends Action {
  protected async vote(round: number, voters: Character[], candidates: Character[], hint: h, force = false) {
    this.game.seats.forEach((char) => {
      char.votes = 0
      char.taifuu = false
      char.target = null
    })

    await Promise.all(voters.map(async (char) => {
      await char.player.send(hint)
      let target = await char.select((c) => ({
        disabled: !candidates.includes(c),
      }), 60000, !force)
      if (!target) {
        if (!force) return
        target = char
      }
      char.taifuu = this.game.weather === 'taifuu' && Random.bool(0.5)
      if (char.taifuu) return
      char.target = target
      target.votes += char.isSage && this.game.weather !== 'tenkiame' ? 1.5 : 1
    }))

    const output = [t('vote.round', [round])]
    if (this.game.weather === 'kousa') {
      for (const char of candidates) {
        output.push(t('vote.candidate', [char.player.name, char.votes]))
      }
    } else {
      for (const char of voters) {
        const type = char.taifuu ? 'taifuu' : char.target ? 'voter-1' : 'voter-2'
        output.push(t('vote.' + type, [char.player.name, char.target?.player.name]))
      }
    }
    await this.game.room.broadcast(output.map(el => h('p', el)))

    const max = Math.max(...candidates.map(c => c.votes))
    return candidates.filter(c => c.votes === max)
  }
}
