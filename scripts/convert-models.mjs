#!/usr/bin/env node
/**
 * OBJ/MTL → 圧縮済み GLB 変換スクリプト
 *
 * 手順:
 *   1. ルート直下の tester_mx.obj / tester_he.obj の mtllib 行を
 *      同梱 .mtl への相対参照に書き換えた一時 OBJ を作成(元ファイルは不変)。
 *   2. obj2gltf で OBJ+MTL → GLB 変換(マテリアル色を GLB に焼き込む)。
 *   3. @gltf-transform で dedup → weld → simplify(meshoptimizer) →
 *      reorder → EXT_meshopt_compression 圧縮。
 *   4. public/models/tester_mx.glb / tester_he.glb に出力し、バイト数と三角形数を表示。
 *
 * 環境変数(省略可):
 *   SIMPLIFY_RATIO  … 頂点保持比率(0-1)。省略時は各モデルの目標三角形数から自動算出。
 *   SIMPLIFY_ERROR  … 許容誤差(メッシュ半径に対する割合)。既定 0.0005 (0.05%)。
 *   TARGET_TRIANGLES… 目標三角形数。既定 45000。
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import obj2gltf from 'obj2gltf';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, weld, simplify, reorder, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const TARGET_TRIANGLES = Number(process.env.TARGET_TRIANGLES ?? 45000);
const SIMPLIFY_RATIO = process.env.SIMPLIFY_RATIO !== undefined ? Number(process.env.SIMPLIFY_RATIO) : undefined;
const SIMPLIFY_ERROR = process.env.SIMPLIFY_ERROR !== undefined ? Number(process.env.SIMPLIFY_ERROR) : 0.0005;

const MODELS = [
  { name: 'tester_mx', obj: 'tester_mx.obj', mtl: 'tester_mx.mtl', out: 'public/models/tester_mx.glb' },
  { name: 'tester_he', obj: 'tester_he.obj', mtl: 'tester_he.mtl', out: 'public/models/tester_he.glb' },
];

/** mtllib 行を相対参照に書き換えた一時 OBJ を作成し、そのパスを返す */
function rewriteMtllib(objPath, mtlName) {
  const content = readFileSync(objPath, 'utf8');
  const rewritten = content
    .split(/\r?\n/)
    .map((line) => (/^mtllib\s+/.test(line) ? `mtllib ${mtlName}` : line))
    .join('\n');
  const tmpPath = join(root, `.tmp_${mtlName.replace(/\.mtl$/, '')}.obj`);
  writeFileSync(tmpPath, rewritten, 'utf8');
  return tmpPath;
}

/** ドキュメント全体の三角形数を数える */
function countTriangles(doc) {
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (!indices) continue;
      total += indices.getCount() / 3;
    }
  }
  return total;
}

/** 三角形数とバイト数を整形して表示 */
function fmt(n) {
  return n.toLocaleString('ja-JP');
}

async function convertModel(model) {
  const { name, obj, mtl, out } = model;
  const objPath = join(root, obj);
  const outPath = join(root, out);
  const tmpPath = rewriteMtllib(objPath, mtl);
  console.log(`\n=== ${name} ===`);
  try {
    // 2. OBJ+MTL → GLB (binary: true で ArrayBuffer が返る)
    const glb = await obj2gltf(tmpPath, { binary: true, metallicRoughness: true });
    console.log(`  obj2gltf 変換完了 (${fmt(glb.byteLength)} バイト / 圧縮前)`);

    // 3. @gltf-transform パイプライン
    const io = new NodeIO()
      .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
      .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
    const doc = await io.readBinary(glb);
    for (const buffer of doc.getRoot().listBuffers()) buffer.setName(name);
    const srcTriangles = countTriangles(doc);
    console.log(`  元の三角形数: ${fmt(srcTriangles)}`);

    const ratio =
      SIMPLIFY_RATIO ?? Math.min(1, Math.max(0.05, TARGET_TRIANGLES / srcTriangles));
    console.log(`  simplify ratio: ${ratio} / error: ${SIMPLIFY_ERROR}`);

    await doc.transform(
      dedup(),
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio, error: SIMPLIFY_ERROR }),
      reorder({ encoder: MeshoptEncoder, target: 'size' }),
      meshopt({ encoder: MeshoptEncoder, level: 'high' }),
    );

    const dstTriangles = countTriangles(doc);
    mkdirSync(dirname(outPath), { recursive: true });
    await io.write(outPath, doc);
    const bytes = statSync(outPath).size;

    console.log(
      `  出力: ${out}  ${fmt(bytes)} バイト / ${fmt(dstTriangles)} 三角形` +
        ` (削減率 ${(100 * (1 - dstTriangles / srcTriangles)).toFixed(1)}%)`,
    );
  } finally {
    rmSync(tmpPath, { force: true });
  }
}

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

console.log('モデル変換を開始します (target triangles: ' + fmt(TARGET_TRIANGLES) + ')');
for (const model of MODELS) {
  await convertModel(model);
}
console.log('\n完了。');
