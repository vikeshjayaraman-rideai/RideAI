// scripts/deploy_jayfm.js
// Builds and deploys Jay's FM web portal
// Usage: node scripts/deploy_jayfm.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FM_CONFIG = require('./jayFMConfig');

// Firebase config from .env
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || process.env.GOOGLE_MAPS_API_KEY,
  authDomain: `${process.env.FIREBASE_PROJECT_ID || 'rideai-84dff'}.firebaseapp.com`,
  projectId: process.env.FIREBASE_PROJECT_ID || 'rideai-84dff',
  storageBucket: `${process.env.FIREBASE_PROJECT_ID || 'rideai-84dff'}.appspot.com`,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
};

console.log('🎙️ Deploying Jay\'s FM Web Portal...\n');

// 1. Read HTML template
const templatePath = path.join(__dirname, '../public/jayfm/index.html');
const outputDir = path.join(__dirname, '../public/jayfm');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Read template (copy from outputs if not exists)
let html = fs.readFileSync(
  fs.existsSync(templatePath) ? templatePath : path.join(__dirname, 'jayfm_index.html'),
  'utf8'
);

// 2. Inject Firebase config
html = html.replace('__FIREBASE_CONFIG__', JSON.stringify(firebaseConfig));

// 3. Inject FM Schedule
const scheduleForWeb = FM_CONFIG.SCHEDULE.map(s => ({
  id: s.id,
  title: s.title,
  emoji: s.emoji,
  startHour: s.startHour,
  startMin: s.startMin,
  endHour: s.endHour,
  endMin: s.endMin,
}));
html = html.replace('__FM_SCHEDULE__', JSON.stringify(scheduleForWeb));

// 4. Write built HTML
fs.writeFileSync(outputDir + '/index.html', html);
console.log('✅ HTML built:', outputDir + '/index.html');

// 5. Create firebase.json hosting config if not exists
const firebaseJson = path.join(__dirname, '../firebase.json');
if (fs.existsSync(firebaseJson)) {
  const config = JSON.parse(fs.readFileSync(firebaseJson, 'utf8'));
  // Add jayfm hosting if not already there
  if (!config.hosting || !Array.isArray(config.hosting)) {
    config.hosting = [
      config.hosting || { public: 'public', ignore: ['firebase.json', '**/.*'] },
    ];
  }
  // Check if jayfm site already configured
  const hasJayFM = config.hosting.some(h => h.site === 'jayfm');
  if (!hasJayFM) {
    config.hosting.push({
      site: 'jayfm',
      public: 'public/jayfm',
      ignore: ['firebase.json', '**/.*'],
      headers: [{
        source: '**',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }]
      }]
    });
    fs.writeFileSync(firebaseJson, JSON.stringify(config, null, 2));
    console.log('✅ firebase.json updated with jayfm hosting');
  }
}

// 6. Deploy
console.log('\n🚀 Deploying to Firebase Hosting...');
try {
  execSync('firebase deploy --only hosting:jayfm', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  console.log('\n✅ Jay\'s FM deployed!');
  console.log('🌐 URL: https://jayfm.web.app');
} catch (e) {
  console.log('\n⚠️ Deploy failed - try manually:');
  console.log('  firebase deploy --only hosting:jayfm');
}
