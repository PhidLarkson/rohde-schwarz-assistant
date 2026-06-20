import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define paths
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const MOTION_DIR = path.join(PUBLIC_DIR, 'gltf/motion');
const OUTPUT_FILE = path.resolve(__dirname, '../src/animation-manifest.json');

// Categories to scan
const categories = ['idle', 'dance', 'expression', 'locomotion'];

const manifest = {};

console.log('🎬 Generating animation manifest...');

categories.forEach(category => {
    const dirPath = path.join(MOTION_DIR, category);
    if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath)
            .filter(file => file.endsWith('.glb'))
            .map(file => `/gltf/motion/${category}/${file}`);

        manifest[category] = files;
        console.log(`   📂 ${category}: found ${files.length} clips`);
    } else {
        console.warn(`   ⚠️ Directory not found: ${dirPath}`);
        manifest[category] = [];
    }
});

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
console.log(`✅ Manifest written to ${OUTPUT_FILE}`);
