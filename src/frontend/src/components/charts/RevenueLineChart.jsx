import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Filler, Tooltip, Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const COLORS = {
  primary:  '#c4c0ff',
  tertiary: '#4ae176',
  secondary:'#adc6ff',
  error:    '#ffb4ab',
}

/**
 * Line chart doanh thu theo ngày.
 * Props:
 *   labels  – array of date strings
 *   revenue – array of revenue numbers
 *   profit  – array of profit numbers (optional)
 *   height  – chart height px (default 280)
 */
export default function RevenueLineChart({ labels = [], revenue = [], profit = [], height = 280 }) {
  const datasets = [
    {
      label: 'Doanh thu thuần',
      data: revenue,
      borderColor: COLORS.primary,
      backgroundColor: `${COLORS.primary}1a`,
      borderWidth: 2.5,
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 5,
    },
  ]

  if (profit.length) {
    datasets.push({
      label: 'Lợi nhuận gộp',
      data: profit,
      borderColor: COLORS.tertiary,
      backgroundColor: `${COLORS.tertiary}1a`,
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 5,
    })
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: '#c7c4d8',
          font: { family: 'Be Vietnam Pro', size: 12 },
          usePointStyle: true,
          pointStyleWidth: 8,
        },
      },
      tooltip: {
        backgroundColor: '#1c2b3c',
        titleColor: '#d4e4fa',
        bodyColor: '#c7c4d8',
        borderColor: '#464555',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: ctx => ` ${ctx.dataset.label}: ₫${ctx.parsed.y?.toLocaleString('vi-VN')}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: '#ffffff08' },
        ticks: { color: '#918fa1', font: { size: 11 } },
      },
      y: {
        grid: { color: '#ffffff08' },
        ticks: {
          color: '#918fa1',
          font: { size: 11 },
          callback: v => `₫${(v / 1_000_000).toFixed(0)}M`,
        },
        border: { dash: [4, 4] },
      },
    },
  }

  return (
    <div style={{ height }}>
      <Line data={{ labels, datasets }} options={options} />
    </div>
  )
}
