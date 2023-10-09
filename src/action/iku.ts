import { h, Random } from 'koishi'
import { ExpertAction } from '.'
import { Identity, logger, t, Weather } from '../utils'

export default class IkuAction extends ExpertAction {
  identity: Identity.Expert = 'iku'
  exhaused: boolean
  predict: Weather

  private isEffective(weather: Weather, dayCount = this.game.dayCount) {
    // kyokkou 固定概率 1/20，不计入天气生成机制
    switch (weather) {
      case 'donten':
      case 'souten':
      case 'hanagumori':
      // case 'noumu':
      // eslint-disable-next-line no-fallthrough
      case 'kawagiri':
      case 'nagi':
      case 'kousa':
        return true
      case 'kaisei':
      case 'taifuu':
      case 'retsujitsu':
      case 'baiu':
        return dayCount > 1
      case 'tenkiame':
        return this.game.options.sage
      default:
        return false
    }
  }

  generate(dayCount = this.game.dayCount) {
    return Random.pick(Weather.filter(w => this.isEffective(w, dayCount)))
  }

  async action() {
    if (!this.game.options.weather) return
    await this.before()
    await super.action()
    await this.after()
  }

  private async before() {
    this.game.weather = this.predict || this.generate()
    logger.debug('weather %s', this.game.weather)
  }

  private async after() {
    if (!this.game.weather) {
      await this.game.room.broadcast(t('general.weather-iku'))
      return
    }

    let weather = this.game.weather
    if (Random.bool(0.05)) {
      weather = 'kyokkou'
    }

    const output = [t('general.weather', [t(`weather.${weather}.name`)])]
    if (weather === 'kyokkou' || this.isEffective(weather)) {
      output.push(t(`weather.${weather}.effect`))
    } else {
      output.push(t(`general.no-effect`))
    }
    await this.game.room.broadcast(output.map(el => h('p', el)))

    if (this.game.weather === 'kawagiri') {
      this.game.seats = Random.shuffle(this.game.seats)
      await this.game.room.broadcast(t('weather.kawagiri.hint', [
        this.game.seats.filter(c => !c.isDead).map(c => c.player.name).join(', '),
      ]))
    }

    await Promise.all(this.game.seats.filter(c => !c.isDead).map(async c => c.player.pause(30000)))
  }

  async callback() {
    this.predict = null
    if (this.exhaused) {
      await this.player.pause(60000, t('character.iku.exhausted'))
      return
    }
    await this.player.send(t('character.iku.action'))
    const result = await this.player.select(['.', '。', '1', '2'], 60000)
    if (result === '1') {
      this.game.weather = null
      this.exhaused = true
    } else {
      this.predict = this.generate(this.game.dayCount + 1)
      await this.player.send(t('character.iku.prediect', [this.predict]))
    }
  }
}
