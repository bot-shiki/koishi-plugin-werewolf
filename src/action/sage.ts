import { h } from 'koishi'
import { VoteAction } from '.'
import { Character, rotate, t } from '../utils'

export default class SageAction extends VoteAction {
  character: Character

  async action() {
    if (!this.game.options.sage || this.game.dayCount !== 1) return

    let speakers = await this.round(1, this.game.seats)
    if (speakers.length > 1) {
      if (this.game.weather !== 'nagi') {
        speakers = await this.round(2, speakers)
        if (speakers.length > 1) {
          speakers = []
          await this.game.room.broadcast(t('sage.draw', [2]))
        }
      } else {
        speakers = []
        await this.game.room.broadcast(t('weather.nagi.hint'))
        await this.game.room.broadcast(t('sage.draw', [1]))
      }
    }

    this.character = speakers[0]
    if (this.character) {
      this.character.isSage = true
    }
  }

  private async round(round: number, speakers: Character[]) {
    await this.game.room.broadcast(t('sage.speech', [round]))
    const voters: Character[] = []
    const candidates: Character[] = []
    for (const char of this.game.seats) {
      if (char.isDead) continue
      let result: boolean
      if (speakers.includes(char)) {
        const others = this.game.room.filter(p => p !== char.player)
        await others.broadcast(t('general.speech-action', [char.player.name]))
        char.player.allowSpeech = true
        result = await char.player.confirm(60000, t('sage.speech-hint'), true)
        char.player.allowSpeech = false
      }
      if (result) {
        candidates.push(char)
      } else {
        voters.push(char)
      }
    }

    if (!voters.length) {
      await this.game.room.broadcast(t('sage.no-voter'))
      return []
    } else if (!candidates.length) {
      await this.game.room.broadcast(t('sage.no-candidate'))
      return []
    } else if (candidates.length === 1) {
      await this.game.room.broadcast(t('sage.only-candidate', [candidates[0].player.name]))
      return candidates
    }

    await this.game.room.broadcast(t('sage.vote', [round]))
    const result = await this.vote(round, voters, candidates, t('sage.vote-hint'))

    if (result.length === 1) {
      await this.game.room.broadcast(t('sage-result', [result[0].player.name]))
    }

    return result
  }

  async order() {
    if (!this.character || this.game.weather === 'tenkiame') return this.fallbackOrder()
    let target: Character, reverse: boolean
    const deaths = this.game.seats.filter((c) => c.killer && !c.isOut)
    if (deaths.length === 0) {
      target = this.character
      reverse = await this.character.player.confirm(60000, t('sage.order-0'), true)
    } else if (deaths.length === 1) {
      target = deaths[0]
      reverse = await this.character.player.confirm(60000, t('sage.order-1'), true)
    } else {
      await this.character.player.send(h('sage.order-2-1'))
      target = await this.character.select((c) => ({
        disabled: !c.isOut,
      }), 60000, false) || deaths[0]
      reverse = await this.character.player.confirm(60000, t('sage.order-2-2'), true)
    }
    const start = this.game.seats.indexOf(target)
    if (!reverse) {
      return rotate(this.game.seats, start)
    } else {
      return rotate(this.game.seats.slice().reverse(), this.game.seats.length - start)
    }
  }

  private fallbackOrder() {
    const offset = 1 + this.game.seats.findIndex(c => c.killer && !c.isOut)
    return rotate(this.game.seats, offset)
  }

  async transfer() {
    if (!this.character || this.game.weather === 'tenkiame') return
    const others = this.game.room.filter(p => p !== this.character.player)
    await Promise.all([
      others.broadcast(t('sage.transfer')),
      (async () => {
        const { player } = this.character
        await player.send(t('sage.transfer-hint'))
        const target = await this.character.select((c) => ({
          disabled: !!c.killer,
        }), 60000, true)
        if (target) {
          target.isSage = true
          this.character = target
          await this.game.room.broadcast(t('death.transfer-1', [player.name, target.player.name]))
        } else {
          this.character = null
          await this.game.room.broadcast(t('death.transfer-0', [player.name]))
        }
      })(),
    ])
  }
}
