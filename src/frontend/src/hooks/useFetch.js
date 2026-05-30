import { useState, useEffect, useCallback, useRef } from 'react'

// Cache toàn phiên — tự xóa khi reload trang, không lưu localStorage
const sessionCache = new Map()

/**
 * Hook fetch dữ liệu với AbortController + session cache.
 *
 * @param {(signal: AbortSignal) => Promise<any>} fetcher - Hàm gọi API, nhận signal để hủy
 * @param {any[]} deps - Dependencies kích hoạt fetch lại (như useEffect deps)
 * @param {{ cacheKey?: string, fallback?: any, skip?: boolean }} options
 *   - cacheKey: nếu có, kết quả được cache theo key trong phiên làm việc
 *   - fallback: dữ liệu dùng khi API lỗi (mock data)
 *   - skip: true thì không gọi API (dùng để chờ điều kiện)
 */
export function useFetch(fetcher, deps = [], options = {}) {
  const { cacheKey, fallback, skip = false } = options
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(!skip)
  const [error,   setError]   = useState(null)
  const abortRef = useRef(null)

  const execute = useCallback(async (invalidate = false) => {
    if (skip) return

    // Trả cache ngay nếu đã có và không force refresh
    if (cacheKey && !invalidate && sessionCache.has(cacheKey)) {
      setData(sessionCache.get(cacheKey))
      setLoading(false)
      return
    }

    // Hủy request trước đó nếu đang chạy (tránh race condition)
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    setLoading(true)
    setError(null)
    try {
      const result = await fetcher(signal)
      if (signal.aborted) return
      if (cacheKey) sessionCache.set(cacheKey, result)
      setData(result)
    } catch (err) {
      // Bỏ qua lỗi do chủ động hủy request — không phải lỗi thật
      if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') return
      setError(err)
      if (fallback !== undefined) setData(fallback)
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    execute()
    return () => abortRef.current?.abort() // cleanup khi unmount
  }, [execute])

  // Gọi lại, bỏ qua cache (dùng cho nút Refresh thủ công)
  const refresh = useCallback(() => execute(true), [execute])

  return { data, loading, error, refresh }
}

/** Xóa cache theo key, hoặc xóa toàn bộ nếu không truyền key */
export function clearFetchCache(key) {
  if (key) sessionCache.delete(key)
  else sessionCache.clear()
}
