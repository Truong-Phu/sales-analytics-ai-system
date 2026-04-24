/** Mock data cho ForecastPage khi AI service chưa kết nối */

function genHistory(days = 60) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - i) * 86_400_000)
    const base = 9_000_000 + Math.sin(i / 7 * Math.PI) * 3_000_000
    return {
      date: d.toISOString().slice(0, 10),
      actual: Math.round(base + (Math.random() - 0.5) * 2_000_000),
    }
  })
}

function genForecast(horizon = 30) {
  return Array.from({ length: horizon }, (_, i) => {
    const d = new Date(Date.now() + (i + 1) * 86_400_000)
    const base = 9_500_000 + Math.sin(i / 7 * Math.PI) * 2_500_000
    const forecast = Math.round(base + (Math.random() - 0.5) * 1_000_000)
    return {
      date:     d.toISOString().slice(0, 10),
      forecast,
      lower:    Math.round(forecast * 0.85),
      upper:    Math.round(forecast * 1.15),
    }
  })
}

export function getMockForecast(horizon = 30) {
  return {
    history:  genHistory(60),
    forecast: genForecast(horizon),
  }
}

export const MOCK_TREND = {
  direction: 'UP',
  growthRate: 0.125,
  ma7: 9_800_000,
}
