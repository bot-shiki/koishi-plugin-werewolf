import { ExpertAction } from '.'
import { Identity, logger, t } from '../utils'

export default class DoremyAction extends ExpertAction {
  identity: Identity.Expert = 'doremy'

  async callback() {
    const identities: Identity[] = []
    await this.player.send(t('doremy-action'))
    await this.player.prompt((session, next, done) => {
      const content = session.content.trim()
      if (content === 'Q') return done()
      // FIXME
      if (/^\d+$/.test(content)) {
        identities.push(content as Identity)
        next()
      } else {
        return next()
      }
    }, this.game.options.timeout.doremy)
    logger.debug('doremy identities: %o', identities)
    const nightmares = identities.map(i => this.game.getChar(i))
    nightmares.forEach(c => c.nightmare = true)
    if (nightmares.length) {
      // TODO retsujitsu
      // await this.askAll(nightmares, 'confirm-nightmare')
    }
  }
}
