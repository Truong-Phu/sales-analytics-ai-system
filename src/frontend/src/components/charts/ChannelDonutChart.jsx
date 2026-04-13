import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

const PALETTE = ['#c4c0ff', '#4ae176', '#adc6ff', '#ffb4ab', '#f59e0b', '#6b7280']

export default function ChannelDonutChart({ channels = [], height = 260 }) {
  // channels: [{name, revenue, pct}]
  const labels  = channels.map(c => c.name)
  const values  = channels.map(c => c.revenue)
  const total   = values.reduce((a, b) => a + b, 0)

  const data = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: PALETTE.slice(0, channels.length),
      borderColor: '#051424',
      borderWidth: 3,
      hoverBorderWidth: 0,
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#c7c4d8',
          font: { family: 'Be Vietnam Pro', size: 12 },
          usePointStyle: true,
          pointStyleWidth: 8,
          padding: 16,
        },
      },
      tooltip: {
        backgroundColor: '#1c2b3c',
        titleColor: '#d4e4fa',
        bodyColor: '#c7c4d8',
        borderColor: '#464555',
        borderWidth: 1,
        callbacks: {
          label: ctx => {
            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0
            return ` ${ctx.label}: ₫${ctx.parsed?.toLocaleString('vi-VN')} (${pct}%)`
          },
        },
      },
    },
  }

  return (
    <div style={{ height }} className="relative">
      <Doughnut data={data} options={options} />
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
           style={{ bottom: '28px' }}>
        <span className="text-xs text-outline">Tổng</span>
        <span className="text-base font-headline font-bold text-on-surface">
          ₫{(total / 1_000_000).toFixed(1)}M
        </span>
      </div>
    </div>
  )
}
