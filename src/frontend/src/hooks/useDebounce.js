import { useState, useEffect } from 'react'

/**
 * Trì hoãn cập nhật value sau khi người dùng ngừng gõ.
 * Dùng để tránh gọi API liên tục khi search.
 */
export function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
