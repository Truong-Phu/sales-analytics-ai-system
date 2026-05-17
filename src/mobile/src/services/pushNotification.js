import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import api from '../api/axios'

// Cấu hình handler khi app đang foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
})

/**
 * Xin quyền và lấy Expo Push Token, sau đó gửi lên backend.
 * Trả về token string hoặc null nếu không được cấp quyền / không phải thiết bị thật.
 */
export async function registerForPushNotifications() {
  if (!Device.isDevice) {
    console.warn('[Push] Phải chạy trên thiết bị thật để lấy push token')
    return null
  }

  // Kiểm tra quyền hiện tại
  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  // Nếu chưa cấp quyền → xin quyền
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.warn('[Push] Người dùng từ chối quyền nhận thông báo')
    return null
  }

  // Android cần notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'SalesAnalytics',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366F1',
    })
  }

  // Lấy Expo push token (projectId lấy từ app.json nếu có, hoặc dùng experienceId)
  const tokenData = await Notifications.getExpoPushTokenAsync()
  const token = tokenData.data

  // Gửi token lên backend để lưu vào bảng push_tokens
  try {
    await api.post('/api/notifications/push-token', {
      expoToken:  token,
      deviceName: Device.deviceName ?? 'Unknown',
      platform:   Platform.OS,
    })
    console.log('[Push] Token đã đăng ký:', token)
  } catch (err) {
    // Không crash app nếu backend chưa ready
    console.warn('[Push] Không thể lưu token lên server:', err.message)
  }

  return token
}

/**
 * Gắn listener cho notification khi app đang mở (foreground).
 * Trả về subscription để có thể remove khi unmount.
 */
export function addForegroundListener(callback) {
  return Notifications.addNotificationReceivedListener(callback)
}

/**
 * Gắn listener khi người dùng tap vào notification (bất kỳ trạng thái app nào).
 * callback nhận object { notification, actionIdentifier }
 */
export function addResponseListener(callback) {
  return Notifications.addNotificationResponseReceivedListener(callback)
}

/**
 * Xóa một subscription (kết quả từ addForegroundListener / addResponseListener).
 */
export function removeListener(subscription) {
  Notifications.removeNotificationSubscription(subscription)
}

/**
 * Lấy badge count hiện tại.
 */
export async function getBadgeCount() {
  return await Notifications.getBadgeCountAsync()
}

/**
 * Đặt badge count (iOS).
 */
export async function setBadgeCount(count) {
  await Notifications.setBadgeCountAsync(count)
}

/**
 * Xóa toàn bộ notification trong notification tray.
 */
export async function clearAllNotifications() {
  await Notifications.dismissAllNotificationsAsync()
  await Notifications.setBadgeCountAsync(0)
}
