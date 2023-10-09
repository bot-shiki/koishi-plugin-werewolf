import { h } from 'koishi'
import { ExpertAction } from '.'
import { Character, Identity, logger, t } from '../utils'

export default class MamizouAction extends ExpertAction {
  identity: Identity.Expert = 'mamizou'
  target: Character

  async callback() {
    if (this.game.weather === 'kaisei') {
      this.target = null
      return this.player.pause(60000, t('character.mamizou.action-kaisei'))
    }
    const output: h[] = []
    if (this.game.weather === 'baiu') {
      output.push(t('character.mamizou.action-baiu'))
    } else {
      output.push(t('character.mamizou.action'))
    }
    this.target = await this.character.select(c => ({
      disabled: c.isDead || c === this.target,
      labels: [
        ...c === this.target ? [t('character.mamizou.is-last')] : [],
      ],
    }), 60000, true)
    if (!this.target) return this.player.send(t('character.mamizou.cancel'))
    if (this.retsujitsu()) return this.player.send(t('weather.retsujitsu.hint'))
    logger.debug('mamizou target: %s', this.target.identity)
    await this.player.send(t('character.mamizou.success', [this.target.player.name]))
  }
}
