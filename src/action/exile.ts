import { VoteAction } from '.'
import { Character, t } from '../utils'

export default class ExileAction extends VoteAction {
  async action() {
    let speakers = await this.game.sage.order()
    speakers = speakers.filter(c => !c.isDead)
    speakers = await this.round(1, speakers)

    if (speakers.length > 1) {
      if (this.game.weather !== 'nagi') {
        speakers = await this.round(2, speakers)
        if (speakers.length > 1) speakers = []
      } else {
        speakers = []
        await this.game.room.broadcast(t('weather.nagi.hint'))
      }
    }

    const [char] = speakers
    if (char) {
      char.killer = 'vote'
      if (char.identity === 'parsee') {
        char.isWellKnown = true
        const chars = this.game.seats.filter(c => c.target === char)
        const players = chars.map(c => c.player.name).join(', ')
        chars.forEach(c => c.killer = 'parsee')
        await this.game.room.broadcast(t('exile.parsee', [char.player.name, players]))
      } else if (char.identity === 'utsuho') {
        char.isWellKnown = true
        char.isOut = true
        await this.game.room.broadcast(t('exile.utsuho', [char.player.name]))
        await this.game.death.lastWords([char])
      } else if (this.game.weather === 'hanagumori') {
        char.isWellKnown = true
        await this.game.room.broadcast(t('exile.hanagumori', [char.player.name, char.identity]))
      } else {
        await this.game.room.broadcast(t('exile.death', [char.player.name]))
      }
    } else {
      await this.game.room.broadcast(t('exile.nobody', [this.game.dayCount]))
    }
  }

  private async round(round: number, speakers: Character[]) {
    const others = this.game.room.filter(p => !speakers.includes(this.game.chars.get(p)))
    if (this.game.weather === 'donten') {
      speakers.forEach(c => c.player.allowSpeech = true)
      await Promise.all([
        others.broadcast(t('exile.douten', [round])),
        ...speakers.map(async (char) => {
          await char.player.send(t('exile.douten-hint'))
          await char.player.select(['.', '。'], 60000)
        }),
      ])
      speakers.forEach(c => c.player.allowSpeech = false)
    } else {
      await this.game.room.broadcast(t('exile.speech', [round]))
      for (const char of speakers) {
        const others = this.game.room.filter(p => p !== char.player)
        await others.broadcast(t('general.speech-action', [char.player.name]))
        char.player.allowSpeech = true
        await char.player.send(t('exile.speech-hint'))
        await char.player.select(['.', '。'], 60000)
        char.player.allowSpeech = false
      }
    }

    await this.game.room.broadcast(t('exile.vote', [round]))
    const voters = this.game.seats.filter(c => !c.isDead)
    return this.vote(round, voters, speakers, t('exile.vote-hint'))
  }
}
