import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const distDir = path.resolve('dist');
const zipFile = path.resolve('dist.zip');

if (!fs.existsSync(distDir)) {
  console.error('dist directory does not exist! Run npm run build first.');
  process.exit(1);
}

if (fs.existsSync(zipFile)) {
  try { fs.unlinkSync(zipFile); } catch (e) {}
}

const zip = new AdmZip();

function addFilesRecursively(dir, baseDir) {
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    const rel = path.relative(baseDir, full).replace(/\\/g, '/');
    if (stat.isDirectory()) {
      addFilesRecursively(full, baseDir);
    } else {
      zip.addFile(rel, fs.readFileSync(full));
    }
  }
}

console.log('Packaging dist/ contents directly into dist.zip root...');
addFilesRecursively(distDir, distDir);
zip.writeZip(zipFile);

const sizeMB = (fs.statSync(zipFile).size / (1024 * 1024)).toFixed(2);
console.log(`Successfully created dist.zip (${sizeMB} MB) for AWS Amplify deployment.`);
