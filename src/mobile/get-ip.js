const { networkInterfaces } = require('os')
const fs = require('fs')
const path = require('path')

function getLocalIP() {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Lấy IPv4, không phải loopback (127.x.x.x)
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}

const ip = getLocalIP()
const port = process.env.BACKEND_PORT || '5136'
const apiUrl = `http://${ip}:${port}`

// Ghi vào .env.local (override .env, không commit)
const envContent = `EXPO_PUBLIC_API_URL=${apiUrl}\nEXPO_PUBLIC_IP=${ip}\n`
fs.writeFileSync(path.join(__dirname, '.env.local'), envContent)

console.log(`✅ API URL đã được cập nhật: ${apiUrl}`)
console.log(`   File: .env.local`)
