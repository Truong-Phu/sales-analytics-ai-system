const { networkInterfaces } = require('os')
const fs = require('fs')
const path = require('path')

function getLocalIP() {
  const nets = networkInterfaces()
  const candidates = []

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family !== 'IPv4' || net.internal) continue
      // Ưu tiên adapter WiFi thật (bỏ qua VPN, virtual, docker)
      const n = name.toLowerCase()
      if (n.includes('wi-fi') || n.includes('wlan') || n.includes('wireless')) {
        return net.address // WiFi thật → trả về ngay
      }
      if (!n.includes('vethernet') && !n.includes('vmware') &&
          !n.includes('virtualbox') && !n.includes('docker') &&
          !n.includes('vpn') && !n.includes('loopback')) {
        candidates.push(net.address)
      }
    }
  }

  return candidates[0] ?? 'localhost'
}

const ip   = getLocalIP()
const port = process.env.BACKEND_PORT || '5136'
const url  = `http://${ip}:${port}`

// Ghi thẳng vào .env — cập nhật dòng EXPO_PUBLIC_API_URL
const envPath = path.join(__dirname, '.env')
let content   = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''

if (content.match(/^EXPO_PUBLIC_API_URL=.*/m)) {
  content = content.replace(/^EXPO_PUBLIC_API_URL=.*/m, `EXPO_PUBLIC_API_URL=${url}`)
} else {
  content += `\nEXPO_PUBLIC_API_URL=${url}`
}

fs.writeFileSync(envPath, content, 'utf8')

console.log(`✅ IP: ${ip}`)
console.log(`   API URL: ${url}`)
console.log(`   Đã ghi vào .env`)
