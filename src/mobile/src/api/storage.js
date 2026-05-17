import * as SecureStore from 'expo-secure-store'

// Wrapper thay thế @react-native-async-storage/async-storage bằng expo-secure-store
// expo-secure-store có sẵn trong Expo Go, không bị lỗi "Native module is null"
export const storage = {
  getItem:     (key)        => SecureStore.getItemAsync(key),
  setItem:     (key, value) => SecureStore.setItemAsync(key, String(value)),
  removeItem:  (key)        => SecureStore.deleteItemAsync(key),
  multiRemove: (keys)       => Promise.all(keys.map(k => SecureStore.deleteItemAsync(k))),
}
