const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const SIZE = 1024
const OUTPUT = path.join(__dirname, '..', 'build', 'icon.png')

async function generate() {
  const svg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%" stop-color="#1d9bf0"/>
        <stop offset="100%" stop-color="#0f6bbf"/>
      </linearGradient>
    </defs>
    <!-- Background rounded rect -->
    <rect width="${SIZE}" height="${SIZE}" rx="${SIZE * 0.22}" fill="url(#bg)"/>
    <!-- Speech bubble - clean minimalist -->
    <path d="M${SIZE * 0.24} ${SIZE * 0.58}
             C${SIZE * 0.24} ${SIZE * 0.32}
              ${SIZE * 0.36} ${SIZE * 0.2}
              ${SIZE * 0.5} ${SIZE * 0.2}
             C${SIZE * 0.64} ${SIZE * 0.2}
              ${SIZE * 0.76} ${SIZE * 0.32}
              ${SIZE * 0.76} ${SIZE * 0.48}
             C${SIZE * 0.76} ${SIZE * 0.64}
              ${SIZE * 0.64} ${SIZE * 0.76}
              ${SIZE * 0.5} ${SIZE * 0.76}
             C${SIZE * 0.42} ${SIZE * 0.76}
              ${SIZE * 0.34} ${SIZE * 0.72}
              ${SIZE * 0.28} ${SIZE * 0.66}
             L${SIZE * 0.18} ${SIZE * 0.72}
             L${SIZE * 0.22} ${SIZE * 0.62}
             C${SIZE * 0.2} ${SIZE * 0.6}
              ${SIZE * 0.24} ${SIZE * 0.58}"
          fill="white"/>
    <!-- Second overlapping bubble (partial, for "conversation" feel) -->
    <path d="M${SIZE * 0.62} ${SIZE * 0.38}
             C${SIZE * 0.62} ${SIZE * 0.24}
              ${SIZE * 0.72} ${SIZE * 0.14}
              ${SIZE * 0.82} ${SIZE * 0.14}
             C${SIZE * 0.88} ${SIZE * 0.14}
              ${SIZE * 0.93} ${SIZE * 0.18}
              ${SIZE * 0.96} ${SIZE * 0.24}
             L${SIZE * 0.96} ${SIZE * 0.44}
             C${SIZE * 0.96} ${SIZE * 0.52}
              ${SIZE * 0.9} ${SIZE * 0.58}
              ${SIZE * 0.82} ${SIZE * 0.58}
             L${SIZE * 0.76} ${SIZE * 0.54}
             L${SIZE * 0.7} ${SIZE * 0.58}
             C${SIZE * 0.68} ${SIZE * 0.54}
              ${SIZE * 0.64} ${SIZE * 0.48}
              ${SIZE * 0.62} ${SIZE * 0.42}"
          fill="white" opacity="0.3"/>
    <!-- Three dots inside bubble (text lines) -->
    <rect x="${SIZE * 0.36}" y="${SIZE * 0.36}" width="${SIZE * 0.28}" height="${SIZE * 0.04}" rx="${SIZE * 0.02}" fill="url(#bg)" opacity="0.8"/>
    <rect x="${SIZE * 0.36}" y="${SIZE * 0.44}" width="${SIZE * 0.22}" height="${SIZE * 0.04}" rx="${SIZE * 0.02}" fill="url(#bg)" opacity="0.5"/>
    <rect x="${SIZE * 0.36}" y="${SIZE * 0.52}" width="${SIZE * 0.18}" height="${SIZE * 0.04}" rx="${SIZE * 0.02}" fill="url(#bg)" opacity="0.3"/>
  </svg>`

  const outputDir = path.dirname(OUTPUT)
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

  await sharp(Buffer.from(svg)).png().toFile(OUTPUT)
  console.log('✓ icon.png (1024) generated')

  await sharp(Buffer.from(svg)).resize(512, 512).png().toFile(path.join(outputDir, 'icon_512.png'))
  await sharp(Buffer.from(svg)).resize(256, 256).png().toFile(path.join(outputDir, 'icon_256.png'))
  console.log('✓ icon_512.png, icon_256.png generated')
}

generate().catch(console.error)
