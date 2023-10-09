import { h } from 'koishi'
import { Action } from '.'
import { Character, Identity, t } from '../utils'

export default class DeathAction extends Action {
  async action(speakers: Character[] = []): Promise<void> {
    this.game.check()
    const dying = this.game.seats.filter(c => !c.isDead && c.killer)
    if (!dying.length) return this.lastWords(speakers)

    dying.forEach((char) => {
      char.scapegoat = null
    })

    const revengers = new Map<Character, Character>()
    const others = this.game.room.filter((p) => {
      const char = this.game.chars.get(p)
      return !char || char.isDead
    })
    const tasks = [others.broadcast(this.game.weather === 'souten' ? t('death.souten') : t('death.confirm'))]
    tasks.push(...this.game.seats.filter(c => !c.isDead).map(async (char) => {
      if (char.killer) {
        if (char.killer !== 'yukari' && char.isRevenger) {
          await char.player.send(t('death.revenge-hint'))
          const target = await char.select((c) => ({
            disabled: !!c.killer,
          }), 60000, true)
          if (target) revengers.set(char, target)
        } else {
          await char.player.pause(60000, null, true)
        }
      } else {
        if (this.game.weather !== 'souten') {
          await char.player.pause(60000, null, true)
        } else {
          await char.player.send(t('death.souten-hint'))
          const result = await char.select((c) => ({
            disabled: !c.killer || c.isOut,
          }), 60000, true)
          const target = this.game.seats[+result - 1]
          if (!target) return
          if (!target.scapegoat || this.getDistance(target, char) < this.getDistance(target, target.scapegoat)) {
            target.scapegoat = char
          }
        }
      }
    }))
    await Promise.all(tasks)

    const output = dying.map((char) => {
      if (char.scapegoat) {
        revengers.delete(char)
        char.scapegoat.killer = char.killer
        char.scapegoat.isOut = true
        speakers.push(char.scapegoat)
        char.killer = null
        return t('death.souten-result-1', [char.player.name, char.scapegoat.player.name])
      } else if (revengers.has(char)) {
        char.isOut = true
        char.isWellKnown = true
        speakers.push(char)
        revengers.get(char).killer = char.identity as Identity.Revenger
        return t('death.revenge', [char.player.name, t(`character.${char.identity}.name`)])
      } else if (this.game.weather === 'souten') {
        char.isOut = true
        speakers.push(char)
        return t('death.souten-result-0', [char.player.name])
      } else {
        char.isOut = true
        speakers.push(char)
      }
    }).filter(Boolean)
    await this.game.room.broadcast(output.map(el => h('p', el)))
    return this.action(speakers)
  }

  getDistance(char1: Character, char2: Character) {
    const chars = this.game.seats.filter(c => !c.isDead)
    const index1 = chars.indexOf(char1)
    const index2 = chars.indexOf(char2)
    const dist = Math.abs(index1 - index2)
    return Math.min(dist, chars.length - dist)
  }

  async lastWords(speakers: Character[]) {
    if (this.game.dayCount > 2 || !speakers.length) return

    const others = this.game.room.filter(p => !speakers.includes(this.game.chars.get(p)))
    speakers.forEach(c => c.player.allowSpeech = true)
    await Promise.all([
      others.broadcast(t('death.last-words')),
      ...speakers.map(async (char) => {
        await char.player.send(t('death.last-words-hint'))
        await char.player.select(['.', '。'], 60000)
      }),
    ])
    speakers.forEach(c => c.player.allowSpeech = false)

    if (speakers.some(c => c.isSage)) {
      await this.game.sage.transfer()
    }
  }
}
