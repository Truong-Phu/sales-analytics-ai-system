import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8 text-center"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span className="icon" style={{ fontSize: 48, color: 'var(--color-error)' }}>
            error_outline
          </span>
          <div>
            <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              Có lỗi xảy ra khi hiển thị trang này
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {this.state.error?.message}
            </p>
          </div>
          <button
            className="lbtn lbtn-secondary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Thử lại
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
