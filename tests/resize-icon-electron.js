/* 图标缩放：用 Electron nativeImage 高质量降采样（npx electron tests/resize-icon-electron.js） */
const { app, nativeImage } = require('electron');
const fs = require('fs');

app.whenReady().then(() => {
  const src = fs.existsSync('build/icon-source-hi.png')
    ? 'build/icon-source-hi.png'
    : 'build/icon-source.png';
  const img = nativeImage.createFromPath(src);
  if (img.isEmpty()) { console.error('源图读取失败'); app.quit(); return; }
  const resized = img.resize({ width: 256, height: 256, quality: 'best' });
  const png = resized.toPNG();
  fs.writeFileSync('build/icon-source.png', png);
  console.log('缩放完成: build/icon-source.png →', png.length, 'bytes,', JSON.stringify(resized.getSize()));
  app.quit();
});
