import { ExpertAction } from '.'
import { Identity, logger, t } from '../utils'

export default class RemiliaAction extends ExpertAction {
  identity: Identity.Expert = 'remilia'

  async callback() {
    const output = [t('character.remilia.action')]
    if (this.game.weather === 'baiu') {
      output.push(t('character.remilia.action-baiu'))
    }
    await this.player.send(output.join(''))
    const target = await this.character.select(c => ({
      disabled: (c.isDead && this.game.weather !== 'baiu') || c.isKnown || c.isWellKnown,
      labels: [
        ...c.isWellKnown ? [t(`character.${c.identity}.name`)] : [],
        ...c.isWellKnown || c.isKnown ? [c.isNingen ? t(`party.ningen`) : t(`party.youkai`)] : [],
      ],
    }), 60000, true)
    if (!target) return this.player.send(t('character.remilia.cancel'))
    if (this.retsujitsu()) return this.player.send(t('weather.retsujitsu.hint'))
    target.isKnown = true
    const party = target.party === 'neutral' ? 'neutral' : target.isNingen ? 'ningen' : 'youkai'
    logger.debug('remilia target: %s [%s]', target, party)
    await this.player.send(t('character.remilia.success', [target.player.name, t(`party.${party}`)]))
  }
}
