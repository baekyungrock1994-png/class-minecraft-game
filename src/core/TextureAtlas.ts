import * as THREE from 'three';
import { BlockType } from './Constants.ts';

/**
 * 4x4 타일 (총 16칸, 각 타일 32x32 픽셀 -> 전체 128x128 캔버스)
 * 마인크래프트 정통 도트 그래픽 프로시저럴 텍스처 아틀라스 생성기
 */

export const ATLAS_GRID = 4;
export const TILE_PIXELS = 32;
export const ATLAS_SIZE = ATLAS_GRID * TILE_PIXELS; // 128x128

export enum TileIndex {
  GRASS_TOP = 0,
  GRASS_SIDE = 1,
  DIRT = 2,
  STONE = 3,
  WOOD_SIDE = 4,
  WOOD_TOP = 5,
  PLANK = 6,
  LEAF = 7,
  CRAFTING_TOP = 8,
  CRAFTING_SIDE = 9,
  MAGMA = 10,
  BEDROCK = 11,
}

export function createBlockTextureAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 1. 타일 0: GRASS_TOP (잔디 윗면)
  drawGrassTop(ctx, 0 * TILE_PIXELS, 0 * TILE_PIXELS);

  // 2. 타일 1: GRASS_SIDE (잔디 옆면 - 위쪽 풀 지그재그 + 아래쪽 흙)
  drawGrassSide(ctx, 1 * TILE_PIXELS, 0 * TILE_PIXELS);

  // 3. 타일 2: DIRT (흙 블록)
  drawDirt(ctx, 2 * TILE_PIXELS, 0 * TILE_PIXELS);

  // 4. 타일 3: STONE (돌 블록 - 바위 균열과 질감)
  drawStone(ctx, 3 * TILE_PIXELS, 0 * TILE_PIXELS);

  // 5. 타일 4: WOOD_SIDE (참나무 원목 옆면 - 세로 껍질 결)
  drawWoodSide(ctx, 0 * TILE_PIXELS, 1 * TILE_PIXELS);

  // 6. 타일 5: WOOD_TOP (참나무 원목 윗면 - 둥근 나이테)
  drawWoodTop(ctx, 1 * TILE_PIXELS, 1 * TILE_PIXELS);

  // 7. 타일 6: PLANK (가공 목재 - 4개 판자 가로선 및 못 자국)
  drawPlank(ctx, 2 * TILE_PIXELS, 1 * TILE_PIXELS);

  // 8. 타일 7: LEAF (나뭇잎 - 풍성한 잎사귀 패턴)
  drawLeaf(ctx, 3 * TILE_PIXELS, 1 * TILE_PIXELS);

  // 9. 타일 8: CRAFTING_TOP (조합대 윗면 - 3x3 격자 및 도구)
  drawCraftingTop(ctx, 0 * TILE_PIXELS, 2 * TILE_PIXELS);

  // 10. 타일 9: CRAFTING_SIDE (조합대 옆면 - 서랍장 및 공구)
  drawCraftingSide(ctx, 1 * TILE_PIXELS, 2 * TILE_PIXELS);

  // 11. 타일 10: MAGMA (마그마 블록 - 화산암 균열 사이로 흐르는 불타는 용암)
  drawMagma(ctx, 2 * TILE_PIXELS, 2 * TILE_PIXELS);

  // 12. 타일 11: BEDROCK (기반암 - 파괴 불가 단단한 암반)
  drawBedrock(ctx, 3 * TILE_PIXELS, 2 * TILE_PIXELS);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}

/**
 * 블록 타입과 노멀 Y값에 따라 알맞은 타일 인덱스 반환
 */
export function getTileIndexForBlockFace(blockType: BlockType, faceDirY: number): TileIndex {
  switch (blockType) {
    case BlockType.GRASS:
      if (faceDirY === 1) return TileIndex.GRASS_TOP;
      if (faceDirY === -1) return TileIndex.DIRT;
      return TileIndex.GRASS_SIDE;

    case BlockType.DIRT:
      return TileIndex.DIRT;

    case BlockType.STONE:
      return TileIndex.STONE;

    case BlockType.WOOD:
      if (faceDirY !== 0) return TileIndex.WOOD_TOP;
      return TileIndex.WOOD_SIDE;

    case BlockType.PLANK:
      return TileIndex.PLANK;

    case BlockType.LEAF:
      return TileIndex.LEAF;

    case BlockType.CRAFTING_TABLE:
      if (faceDirY === 1) return TileIndex.CRAFTING_TOP;
      if (faceDirY === -1) return TileIndex.PLANK;
      return TileIndex.CRAFTING_SIDE;

    case BlockType.MAGMA:
      return TileIndex.MAGMA;

    default:
      return TileIndex.STONE;
  }
}

/**
 * 0~1 단위의 localU, localV를 아틀라스 상의 실제 UV 좌표로 변환
 */
export function getAtlasUV(tileIndex: number, localU: number, localV: number): [number, number] {
  const col = tileIndex % ATLAS_GRID;
  const row = Math.floor(tileIndex / ATLAS_GRID);
  const tileSize = 1.0 / ATLAS_GRID; // 0.25

  const uMin = col * tileSize;
  const uMax = (col + 1) * tileSize;
  const vMin = 1.0 - (row + 1) * tileSize;
  const vMax = 1.0 - row * tileSize;

  const u = localU === 0 ? uMin : uMax;
  const v = localV === 0 ? vMin : vMax;

  return [u, v];
}

// -------------------------------------------------------------
// 정밀 픽셀 아트 드로잉 헬퍼들 (각 32x32 픽셀)
// -------------------------------------------------------------

function setPixel(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size = 2) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
}

// 1. 돌 블록: 거친 바위 암석, 미세한 균열(Cracks)과 음영
function drawStone(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.fillStyle = '#787878';
  ctx.fillRect(ox, oy, 32, 32);

  // 불규칙한 암석 픽셀 노이즈
  const colors = ['#686868', '#707070', '#828282', '#8c8c8c', '#606060'];
  for (let px = 0; px < 32; px += 2) {
    for (let py = 0; py < 32; py += 2) {
      const n = (Math.sin(px * 12.3 + py * 45.7) * 43758.5453) % 1;
      if (Math.abs(n) > 0.45) {
        const c = colors[Math.floor(Math.abs(n * 5)) % colors.length];
        setPixel(ctx, ox + px, oy + py, c);
      }
    }
  }

  // 바위 균열 1 (좌상단에서 우하단)
  const crack1 = [
    [4, 6], [6, 8], [8, 8], [10, 10], [12, 10], [14, 12], [16, 12], [18, 14], [20, 16]
  ];
  for (const [cx, cy] of crack1) {
    setPixel(ctx, ox + cx, oy + cy, '#454545');
    setPixel(ctx, ox + cx + 2, oy + cy, '#9c9c9c'); // 균열 하이라이트
  }

  // 바위 균열 2 (우상단)
  const crack2 = [
    [22, 4], [24, 6], [24, 8], [26, 10], [28, 12]
  ];
  for (const [cx, cy] of crack2) {
    setPixel(ctx, ox + cx, oy + cy, '#454545');
    setPixel(ctx, ox + cx, oy + cy + 2, '#9c9c9c');
  }

  // 바위 덩어리 음영 라인
  ctx.fillStyle = '#505050';
  ctx.fillRect(ox + 8, oy + 22, 10, 2);
  ctx.fillRect(ox + 6, oy + 24, 14, 2);
  ctx.fillStyle = '#9e9e9e';
  ctx.fillRect(ox + 8, oy + 20, 10, 2);
}

// 2. 참나무 원목 옆면: 뚜렷한 세로 방향 나무 껍질 결(Bark)
function drawWoodSide(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.fillStyle = '#5c4126'; // 중간 나무껍질 갈색
  ctx.fillRect(ox, oy, 32, 32);

  // 세로 줄무늬 베이스
  const grooveX = [0, 6, 14, 22, 28];
  for (const gx of grooveX) {
    // 깊은 세로 홈
    ctx.fillStyle = '#382515';
    ctx.fillRect(ox + gx, oy, 2, 32);
    // 홈 옆 튀어나온 밝은 껍질 능선
    ctx.fillStyle = '#7a5735';
    ctx.fillRect(ox + gx + 2, oy, 2, 32);
  }

  // 껍질 마디 및 불규칙 결
  const barkHighlights = ['#6e4e2e', '#7d5936', '#4a321b', '#3b2614'];
  for (let px = 0; px < 32; px += 2) {
    for (let py = 0; py < 32; py += 4) {
      const n = (Math.sin(px * 3.7 + py * 19.1) * 43758.5) % 1;
      if (Math.abs(n) > 0.5) {
        const c = barkHighlights[Math.floor(Math.abs(n * 4)) % barkHighlights.length];
        setPixel(ctx, ox + px, oy + py, c, 2);
      }
    }
  }
}

// 3. 참나무 원목 윗면: 둥근 나이테(Rings)와 밝은 속살
function drawWoodTop(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // 밝은 속살
  ctx.fillStyle = '#b59768';
  ctx.fillRect(ox, oy, 32, 32);

  // 외곽 어두운 나무 껍질 테두리 (두께 3px)
  ctx.fillStyle = '#3b2515';
  ctx.fillRect(ox, oy, 32, 3);
  ctx.fillRect(ox, oy + 29, 32, 3);
  ctx.fillRect(ox, oy, 3, 32);
  ctx.fillRect(ox + 29, oy, 3, 32);

  // 껍질 안쪽 보조 테두리
  ctx.fillStyle = '#5c4126';
  ctx.fillRect(ox + 3, oy + 3, 26, 2);
  ctx.fillRect(ox + 3, oy + 27, 26, 2);
  ctx.fillRect(ox + 3, oy + 3, 2, 26);
  ctx.fillRect(ox + 27, oy + 3, 2, 26);

  // 1차 바깥 나이테 (정사각형/팔각형 형태)
  ctx.strokeStyle = '#8f734a';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox + 7, oy + 7, 18, 18);

  // 2차 안쪽 나이테
  ctx.strokeRect(ox + 11, oy + 11, 10, 10);

  // 중심 심재 코어
  ctx.fillStyle = '#7a5f38';
  ctx.fillRect(ox + 14, oy + 14, 4, 4);
}

// 4. 가공 목재: 4개의 수평 판자(Planks)와 못 자국
function drawPlank(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.fillStyle = '#b8945f';
  ctx.fillRect(ox, oy, 32, 32);

  // 4개의 판자 가로 구분선 (8px 간격)
  const lineYs = [0, 8, 16, 24];
  for (let i = 0; i < lineYs.length; i++) {
    const y = lineYs[i];
    // 짙은 틈새 홈선
    ctx.fillStyle = '#6e512c';
    ctx.fillRect(ox, oy + y, 32, 2);
    // 아래쪽 판자 상단 밝은 하이라이트
    ctx.fillStyle = '#cca872';
    ctx.fillRect(ox, oy + y + 2, 32, 1);
  }

  // 각 판자별 미세 톤 차이 (줄무늬 목재 결)
  const plankTones = ['#c29e67', '#b5905a', '#ba9661', '#b08b54'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = plankTones[i];
    ctx.fillRect(ox, oy + i * 8 + 3, 32, 5);
  }

  // 판자 양쪽 끝 못(Nail) 픽셀
  const nailPositions = [
    [3, 4], [27, 4],
    [5, 12], [29, 12],
    [3, 20], [27, 20],
    [5, 28], [29, 28]
  ];
  for (const [nx, ny] of nailPositions) {
    setPixel(ctx, ox + nx, oy + ny, '#4a341b', 2);
  }
}

// 5. 잔디 윗면: 싱그러운 풀잎 패턴
function drawGrassTop(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.fillStyle = '#5da82d';
  ctx.fillRect(ox, oy, 32, 32);

  const grassTones = ['#6fb838', '#7ec942', '#4e9124', '#417d1c'];
  for (let px = 0; px < 32; px += 2) {
    for (let py = 0; py < 32; py += 2) {
      const n = (Math.sin(px * 7.1 + py * 13.9) * 43758.5) % 1;
      if (Math.abs(n) > 0.4) {
        const c = grassTones[Math.floor(Math.abs(n * 4)) % grassTones.length];
        setPixel(ctx, ox + px, oy + py, c, 2);
      }
    }
  }
}

// 6. 잔디 옆면: 상단 지그재그 풀잎 + 하단 거친 흙
function drawGrassSide(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // 1) 전체 흙 배경
  drawDirt(ctx, ox, oy);

  // 2) 상단 잔디 띠 (기본 6px)
  ctx.fillStyle = '#5da82d';
  ctx.fillRect(ox, oy, 32, 6);

  // 상단 하이라이트
  ctx.fillStyle = '#7ec942';
  ctx.fillRect(ox, oy, 32, 2);

  // 아래로 뾰족하게 삐져나온 지그재그 풀잎들
  const drops = [
    [2, 6, 4], [4, 6, 6], [8, 6, 3], [12, 6, 5],
    [14, 6, 7], [18, 6, 4], [22, 6, 6], [24, 6, 4], [28, 6, 5]
  ];
  for (const [dx, dy, len] of drops) {
    ctx.fillStyle = '#5da82d';
    ctx.fillRect(ox + dx, oy + dy, 2, len);
    // 풀잎 끝단 어두운 그림자
    ctx.fillStyle = '#417d1c';
    ctx.fillRect(ox + dx, oy + dy + len, 2, 2);
  }
}

// 7. 흙 블록: 따뜻한 갈색 흙과 자갈 입자
function drawDirt(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.fillStyle = '#866043';
  ctx.fillRect(ox, oy, 32, 32);

  const dirtTones = ['#966e4f', '#785437', '#6e4a2d', '#5a3b22'];
  for (let px = 0; px < 32; px += 2) {
    for (let py = 0; py < 32; py += 2) {
      const n = (Math.sin(px * 15.3 + py * 27.7) * 43758.5) % 1;
      if (Math.abs(n) > 0.45) {
        const c = dirtTones[Math.floor(Math.abs(n * 4)) % dirtTones.length];
        setPixel(ctx, ox + px, oy + py, c, 2);
      }
    }
  }
}

// 8. 나뭇잎: 풍성한 잎사귀 덩어리 패턴
function drawLeaf(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.fillStyle = '#347822';
  ctx.fillRect(ox, oy, 32, 32);

  const leafTones = ['#459930', '#55b33d', '#286119', '#1d4a11'];
  for (let px = 0; px < 32; px += 2) {
    for (let py = 0; py < 32; py += 2) {
      const n = (Math.sin(px * 23.1 + py * 31.7) * 43758.5) % 1;
      if (Math.abs(n) > 0.35) {
        const c = leafTones[Math.floor(Math.abs(n * 4)) % leafTones.length];
        setPixel(ctx, ox + px, oy + py, c, 2);
      }
    }
  }
}

// 9. 조합대 윗면: 3x3 격자 작업대와 톱/망치 도구 실루엣
function drawCraftingTop(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // 목재 바탕
  drawPlank(ctx, ox, oy);

  // 작업판 가죽/직물 패드 중앙 사각
  ctx.fillStyle = '#a17342';
  ctx.fillRect(ox + 4, oy + 4, 24, 24);

  // 3x3 격자선
  ctx.fillStyle = '#573a1c';
  // 가로선 2개
  ctx.fillRect(ox + 4, oy + 11, 24, 2);
  ctx.fillRect(ox + 4, oy + 19, 24, 2);
  // 세로선 2개
  ctx.fillRect(ox + 11, oy + 4, 2, 24);
  ctx.fillRect(ox + 19, oy + 4, 2, 24);

  // 외곽 테두리선
  ctx.strokeStyle = '#422a12';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox + 3, oy + 3, 26, 26);

  // 작은 망치/도구 실루엣
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(ox + 6, oy + 6, 4, 2); // 쇠머리
  ctx.fillStyle = '#78350f';
  ctx.fillRect(ox + 7, oy + 8, 2, 2); // 자루
}

// 10. 조합대 옆면: 공구 걸이와 서랍장
function drawCraftingSide(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  drawPlank(ctx, ox, oy);

  // 상단 공구 걸이 랙
  ctx.fillStyle = '#422a12';
  ctx.fillRect(ox + 3, oy + 4, 26, 2);

  // 가위/톱 실루엣
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(ox + 6, oy + 6, 2, 10);
  ctx.fillRect(ox + 10, oy + 6, 3, 8);
  ctx.fillRect(ox + 16, oy + 6, 2, 9);

  // 하단 작은 서랍장 2칸
  ctx.fillStyle = '#8f6738';
  ctx.fillRect(ox + 4, oy + 18, 11, 10);
  ctx.fillRect(ox + 17, oy + 18, 11, 10);

  ctx.strokeStyle = '#4a3217';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox + 4, oy + 18, 11, 10);
  ctx.strokeRect(ox + 17, oy + 18, 11, 10);

  // 서랍 손잡이
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(ox + 8, oy + 22, 3, 2);
  ctx.fillRect(ox + 21, oy + 22, 3, 2);
}

// 11. 마그마 블록: 짙은 흑요석 화산암과 이글거리는 용암 균열선
function drawMagma(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  // 짙은 흑자색 화산암 바탕
  ctx.fillStyle = '#260a10';
  ctx.fillRect(ox, oy, 32, 32);

  // 어두운 적갈색 암석 덩어리
  ctx.fillStyle = '#47131d';
  ctx.fillRect(ox + 2, oy + 2, 12, 10);
  ctx.fillRect(ox + 18, oy + 4, 12, 8);
  ctx.fillRect(ox + 4, oy + 16, 10, 12);
  ctx.fillRect(ox + 16, oy + 16, 14, 12);

  // 1차 붉은 용암 테두리
  ctx.fillStyle = '#b91c1c';
  const lavaPaths = [
    [14, 0, 2, 32], [0, 14, 32, 2],
    [6, 6, 18, 2], [14, 8, 2, 14], [8, 20, 16, 2]
  ];
  for (const [lx, ly, lw, lh] of lavaPaths) {
    ctx.fillRect(ox + lx, oy + ly, lw, lh);
  }

  // 2차 주황색 뜨거운 용암
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(ox + 14, oy + 4, 2, 24);
  ctx.fillRect(ox + 4, oy + 14, 24, 2);
  ctx.fillRect(ox + 8, oy + 8, 12, 2);

  // 3차 노란 백열 코어 (가장 뜨거운 곳)
  ctx.fillStyle = '#fde047';
  ctx.fillRect(ox + 14, oy + 14, 2, 2);
  ctx.fillRect(ox + 8, oy + 8, 3, 2);
  ctx.fillRect(ox + 20, oy + 14, 3, 2);
  ctx.fillRect(ox + 14, oy + 20, 2, 3);
}

// 12. 기반암 (Bedrock): 굳건한 바닥 암석
function drawBedrock(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(ox, oy, 32, 32);

  const rockTones = ['#2e2e2e', '#3d3d3d', '#111111', '#080808'];
  for (let px = 0; px < 32; px += 2) {
    for (let py = 0; py < 32; py += 2) {
      const n = (Math.sin(px * 19.3 + py * 41.1) * 43758.5) % 1;
      if (Math.abs(n) > 0.4) {
        const c = rockTones[Math.floor(Math.abs(n * 4)) % rockTones.length];
        setPixel(ctx, ox + px, oy + py, c, 2);
      }
    }
  }
}
