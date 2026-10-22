const fs = require('fs');
const path = require('path');

const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.error(`AndroidManifest.xml not found at ${manifestPath}`);
  process.exit(1);
}

let content = fs.readFileSync(manifestPath, 'utf8');

const permissionsToAdd = [
  '    <uses-permission android:name="android.permission.INTERNET" />',
  '    <uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />'
];

for (const perm of permissionsToAdd) {
  const permNameMatch = perm.match(/android:name="([^"]+)"/);
  if (permNameMatch && !content.includes(permNameMatch[1])) {
    content = content.replace('</manifest>', `${perm}\n</manifest>`);
    console.log(`Added permission: ${permNameMatch[1]}`);
  }
}

const queriesBlock = `    <queries>
        <intent>
            <action android:name="android.speech.RecognitionService" />
        </intent>
    </queries>`;

if (!content.includes('android.speech.RecognitionService')) {
  content = content.replace('</manifest>', `${queriesBlock}\n</manifest>`);
  console.log('Added speech recognition service queries entry.');
}

fs.writeFileSync(manifestPath, content, 'utf8');
console.log('Successfully patched AndroidManifest.xml');
