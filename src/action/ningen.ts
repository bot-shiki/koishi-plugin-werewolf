import { Action } from '.'
import { Character, logger, t } from '../utils'

class TargetRecord {
  count = 0
  latest = 0
}

export default class NingenAction extends Action {
  target: Character

  isNingen(character: Character) {
    if (character.party !== 'ningen') return false
    if (character.identity !== 'rinnosuke') return true
    return this.game.seats.filter(c => c.party === 'ningen' && !c.isDead).length <= 1
  }

  async action() {
    const others = this.game.room.filter((player) => {
      const char = this.game.chars.get(player)
      return char.party !== 'ningen'
    })
    const dead = this.game.room.filter((player) => {
      const char = this.game.chars.get(player)
      return char.party === 'ningen' && char.isDead
    })
    logger.debug('ningen action')
    const tasks = [
      others.broadcast(t('general.ningen-action')),
      dead.broadcast(t('ningen.dead')),
    ]
    // TODO
    // const rinnosuke = this.getChar('rinnosuke')
    tasks.push(this.ningen())
    await Promise.all(tasks)
  }

  private async ningen() {
    const choices = ['.', '。']
    this.game.seats.forEach((char) => {
      char.target = null
      char.voteTime = 0
    })
    const ningens = this.game.seats.filter((c, i) => {
      const result = this.isNingen(c)
      if (!c.isOut) choices.push(String(i + 1))
      return result && !c.isOut
    })
    const output = this.game.seats.map((c) => c.render({
      disabled: c.isOut,
      labels: [
        ...c.isNingen ? [t('party.ningen')] : [],
      ],
    }))
    output.unshift(t('ningen.header'))
    output.push(t('ningen.footer'))
    await new Promise<void>((resolve) => {
      const disposables: (() => void)[] = []
      const done = () => {
        disposables.forEach(dispose => dispose())
        resolve()
      }
      const updateTarget = () => {
        const targets = new Set(ningens.map(c => c.target))
        if (targets.size === 1 && !targets.has(null)) done()
      }
      for (const ningen of ningens) {
        ningen.target = null
        ningen.player.allowSpeech = true
        ningen.player.privateSpeech = true
        ningen.player.send(t('ningen.hint'))
        ningen.player.send(output)
        disposables.push(this.game.room.lobby.ctx.middleware(async (session, next) => {
          if (!session.isDirect) return next()
          if (session.userId !== ningen.player.userId || session.platform !== ningen.player.platform) return next()
          const content = session.content?.trim().toUpperCase()
          if (!choices.includes(content)) return next()
          ningen.voteTime = Date.now()
          if (['.', '。'].includes(content)) {
            logger.debug('ningen %s chooses nobody', ningen)
            ningen.target = null
          } else {
            ningen.target = this.game.seats[+content - 1]
            logger.debug('ningen %s chooses %s', ningen, ningen.target)
          }
          for (const { player } of ningens) {
            player.send(ningen.target
              ? t('ningen.update-1', [ningen.player.name, ningen.target.player.name])
              : t('ningen.update-0', [ningen.player.name]))
          }
          updateTarget()
        }, true))
      }
      disposables.push(this.game.room.lobby.ctx.setTimeout(done, 300000))
    })

    const map = new Map<Character, TargetRecord>(this.game.seats.map(c => [c, new TargetRecord()] as const))
    map.set(null, new TargetRecord())

    for (const ningen of ningens) {
      ningen.player.allowSpeech = false
      ningen.player.privateSpeech = false
      if (!ningen.voteTime) continue
      const target = map.get(ningen.target)
      target.count += 1
      target.latest = Math.max(target.latest, ningen.voteTime)
    }

    let final = null
    map.forEach((record, char) => {
      const finalRecord = map.get(final)
      if (record.count < finalRecord.count) return
      if (record.count > finalRecord.count || record.latest > finalRecord.latest) {
        final = char
      }
    })

    this.target = final
    logger.debug('ningen target: %s', final)
    if (this.target && this.target !== this.game.mamizou.target) {
      this.target.killer = 'ningen'
    }
  }
}
