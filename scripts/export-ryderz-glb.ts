import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import {
  RYDER_GLB_SLUG,
  RYDER_ORDER,
  RYDERZ,
  ryderGlbFilename,
  type RyderId,
} from '../lib/ryderz-raid/config';
import { exportAllRyderzGlb, exportRyderGlb } from '../lib/ryderz-raid/exportGlb';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public/assets/those-ryderz/models');

function toBuffer(buffer: ArrayBuffer) {
  return Buffer.from(buffer);
}

async function exportOne(id: RyderId) {
  const buffer = toBuffer(await exportRyderGlb(id));
  const filename = ryderGlbFilename(id);
  await writeFile(path.join(outDir, filename), buffer);
  return { id, filename, bytes: buffer.byteLength, name: RYDERZ[id].name, buffer };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const files = [];
  for (const id of RYDER_ORDER) {
    files.push(await exportOne(id));
  }

  const pack = toBuffer(await exportAllRyderzGlb());
  await writeFile(path.join(outDir, 'those-ryderz.glb'), pack);

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.filename, file.buffer);
  }
  zip.file('those-ryderz.glb', pack);
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await writeFile(path.join(outDir, 'those-ryderz-glb.zip'), zipBuffer);

  const manifest = {
    format: 'model/gltf-binary',
    generated: new Date().toISOString(),
    figures: files.map(({ buffer: _buffer, ...file }) => ({
      ...file,
      slug: RYDER_GLB_SLUG[file.id],
      href: `/assets/those-ryderz/models/${file.filename}`,
    })),
    pack: {
      href: '/assets/those-ryderz/models/those-ryderz.glb',
      bytes: pack.byteLength,
    },
    zip: {
      href: '/assets/those-ryderz/models/those-ryderz-glb.zip',
      bytes: zipBuffer.byteLength,
    },
  };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
