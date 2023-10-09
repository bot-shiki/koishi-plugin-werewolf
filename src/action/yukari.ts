import { h } from 'koishi'
import { ExpertAction } from '.'
import { Identity, logger, t } from '../utils'

export default class YukariAction extends ExpertAction {
  identity: Identity.Expert = 'yukari'
  saveUsed: boolean
  killUsed: boolean

  private async save() {
    const output: h[] = []
    const taiji = this.game.ningen.target
    if (this.saveUsed) {
      logger.debug('yukari save exhausted')
      return this.player.pause(60000, t('character.yukari.save.exhausted'))
    } else if (!taiji) {
      return this.player.pause(60000, t('character.yukari.save.nobody'))
    } else if (taiji === this.character) {
      if (this.game.weather === 'baiu') {
        output.push(t('character.yukari.save.baiu'))
      } else {
        return this.player.pause(60000, t('character.yukari.save.self'))
      }
    } else {
      if (this.game.weather === 'kaisei') {
        return this.player.pause(60000, t('character.yukari.save.kaisei'))
      } else {
        output.push(t('character.yukari.save.normal', [taiji.player.name]))
      }
    }
    const result = await this.player.confirm(60000, output)
    if (!result) {
      logger.debug('yukari save unused')
      return this.player.send(t('character.yukari.save.cancel'))
    }
    if (this.retsujitsu()) return this.player.send(t('weather.retsujitsu.hint'))
    this.game.ningen.target = null
    taiji.killer = null
    this.saveUsed = true
    logger.debug('yukari save used')
    await this.player.send(t('character.yukari.save.success', [taiji.player.name]))
  }

  private async kill() {
    if (this.killUsed) {
      logger.debug('yukari kill exhausted')
      return this.player.pause(60000, t('character.yukari.kill.exhausted'))
    }
    await this.player.send(t('character.yukari.kill.normal'))
    const target = await this.character.select(c => ({
      disabled: c.isDead,
    }), 60000, true)
    logger.debug('yukari target: %s', target)
    if (!target) return this.player.send(t('character.yukari.kill.cancel'))
    if (this.retsujitsu()) return this.player.send(t('weather.retsujitsu.hint'))
    this.killUsed = true
    target.killer = 'yukari'
    logger.debug('yukari kill used')
    await this.player.send(t('character.yukari.kill.success', [target.player.name]))
  }

  async callback() {
    await this.player.send(t('character.yukari.action'))
    await this.save()
    await this.kill()
  }
}
