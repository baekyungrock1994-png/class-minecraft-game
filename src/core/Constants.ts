export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  WOOD = 3,
  LEAF = 4,
  STONE = 5,
  PLANK = 6,
  CRAFTING_TABLE = 7,
  WATER = 8,
  MAGMA = 9,
}

// 아이템 전용 (인벤토리 및 조합 재료)
export const ITEM_STICK = -1;

export interface BlockMeta {
  id: BlockType;
  name: string;
  color: number;
  topColor?: number;
  bottomColor?: number;
  transparent?: boolean;
  opacity?: number;
  iconBg: string;
  emoji: string;
}

export const BLOCK_METAS: Record<BlockType, BlockMeta> = {
  [BlockType.AIR]: {
    id: BlockType.AIR,
    name: "공기",
    color: 0x000000,
    transparent: true,
    opacity: 0,
    iconBg: "transparent",
    emoji: "💨",
  },
  [BlockType.GRASS]: {
    id: BlockType.GRASS,
    name: "잔디 블록",
    color: 0x5b8c32,
    topColor: 0x6bb33b,
    bottomColor: 0x866043,
    iconBg: "linear-gradient(135deg, #6bb33b, #866043)",
    emoji: "🌱",
  },
  [BlockType.DIRT]: {
    id: BlockType.DIRT,
    name: "흙 블록",
    color: 0x866043,
    iconBg: "#866043",
    emoji: "🟫",
  },
  [BlockType.WOOD]: {
    id: BlockType.WOOD,
    name: "참나무 원목",
    color: 0x675232,
    topColor: 0xad9468,
    bottomColor: 0xad9468,
    iconBg: "linear-gradient(135deg, #675232, #ad9468)",
    emoji: "🪵",
  },
  [BlockType.LEAF]: {
    id: BlockType.LEAF,
    name: "나뭇잎",
    color: 0x3a7d28,
    transparent: true,
    opacity: 0.9,
    iconBg: "#3a7d28",
    emoji: "🍃",
  },
  [BlockType.STONE]: {
    id: BlockType.STONE,
    name: "돌 블록",
    color: 0x7c7c7c,
    iconBg: "#7c7c7c",
    emoji: "🪨",
  },
  [BlockType.PLANK]: {
    id: BlockType.PLANK,
    name: "가공 목재",
    color: 0xb8945f,
    iconBg: "#b8945f",
    emoji: "📦",
  },
  [BlockType.CRAFTING_TABLE]: {
    id: BlockType.CRAFTING_TABLE,
    name: "조합대",
    color: 0x854d0e,
    topColor: 0xb45309,
    bottomColor: 0x78350f,
    iconBg: "linear-gradient(135deg, #b45309, #78350f)",
    emoji: "🪑",
  },
  [BlockType.WATER]: {
    id: BlockType.WATER,
    name: "물",
    color: 0x2563eb,
    transparent: true,
    opacity: 0.7,
    iconBg: "rgba(37, 99, 235, 0.8)",
    emoji: "💧",
  },
  [BlockType.MAGMA]: {
    id: BlockType.MAGMA,
    name: "마그마 블록",
    color: 0xe11d48,
    iconBg: "linear-gradient(135deg, #e11d48, #f97316)",
    emoji: "🔥",
  },
};

export enum ToolType {
  NONE = 'NONE',
  WOOD_PICKAXE = 'WOOD_PICKAXE',
  STONE_PICKAXE = 'STONE_PICKAXE',
  WOOD_AXE = 'WOOD_AXE',
  STONE_AXE = 'STONE_AXE',
  WOOD_SHOVEL = 'WOOD_SHOVEL',
  STONE_SHOVEL = 'STONE_SHOVEL',
}

export interface ToolMeta {
  type: ToolType;
  name: string;
  emoji: string;
  maxDurability: number;
  effectiveBlocks: BlockType[];
  speedMultiplier: number;
}

// 마인크래프트 정통 도트 그래픽 삽 SVG 아이콘
export const WOOD_SHOVEL_ICON = `<svg class="shovel-icon" viewBox="0 0 16 16" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated;display:inline-block;vertical-align:middle;filter:drop-shadow(1px 1px 0px rgba(0,0,0,0.4));">
  <rect x="13" y="1" width="2" height="1" fill="#78350f"/>
  <rect x="14" y="2" width="1" height="2" fill="#78350f"/>
  <rect x="12" y="3" width="2" height="1" fill="#78350f"/>
  <rect x="10" y="4" width="2" height="2" fill="#92400e"/>
  <rect x="8" y="6" width="2" height="2" fill="#92400e"/>
  <rect x="6" y="8" width="2" height="2" fill="#92400e"/>
  <rect x="5" y="9" width="2" height="2" fill="#b45309"/>
  <rect x="3" y="11" width="3" height="3" fill="#a16207"/>
  <rect x="2" y="12" width="3" height="3" fill="#ca8a04"/>
  <rect x="1" y="13" width="2" height="2" fill="#78350f"/>
</svg>`;

export const STONE_SHOVEL_ICON = `<svg class="shovel-icon" viewBox="0 0 16 16" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated;display:inline-block;vertical-align:middle;filter:drop-shadow(1px 1px 0px rgba(0,0,0,0.4));">
  <rect x="13" y="1" width="2" height="1" fill="#64748b"/>
  <rect x="14" y="2" width="1" height="2" fill="#64748b"/>
  <rect x="12" y="3" width="2" height="1" fill="#64748b"/>
  <rect x="10" y="4" width="2" height="2" fill="#92400e"/>
  <rect x="8" y="6" width="2" height="2" fill="#92400e"/>
  <rect x="6" y="8" width="2" height="2" fill="#92400e"/>
  <rect x="5" y="9" width="2" height="2" fill="#b45309"/>
  <rect x="3" y="11" width="3" height="3" fill="#94a3b8"/>
  <rect x="2" y="12" width="3" height="3" fill="#cbd5e1"/>
  <rect x="1" y="13" width="2" height="2" fill="#475569"/>
</svg>`;

// 마인크래프트 원작 내구도: 나무=59, 돌=131
export const TOOL_METAS: Record<ToolType, ToolMeta> = {
  [ToolType.NONE]: {
    type: ToolType.NONE,
    name: "맨손",
    emoji: "👊",
    maxDurability: Infinity,
    effectiveBlocks: [],
    speedMultiplier: 1.0,
  },
  [ToolType.WOOD_PICKAXE]: {
    type: ToolType.WOOD_PICKAXE,
    name: "나무 곡괭이",
    emoji: "⛏️",
    maxDurability: 59,
    effectiveBlocks: [BlockType.STONE, BlockType.MAGMA],
    speedMultiplier: 3.5,
  },
  [ToolType.STONE_PICKAXE]: {
    type: ToolType.STONE_PICKAXE,
    name: "돌 곡괭이",
    emoji: "⛏️",
    maxDurability: 131,
    effectiveBlocks: [BlockType.STONE, BlockType.MAGMA],
    speedMultiplier: 6.0,
  },
  [ToolType.WOOD_AXE]: {
    type: ToolType.WOOD_AXE,
    name: "나무 도끼",
    emoji: "🪓",
    maxDurability: 59,
    effectiveBlocks: [BlockType.WOOD, BlockType.PLANK, BlockType.CRAFTING_TABLE],
    speedMultiplier: 4.0,
  },
  [ToolType.STONE_AXE]: {
    type: ToolType.STONE_AXE,
    name: "돌 도끼",
    emoji: "🪓",
    maxDurability: 131,
    effectiveBlocks: [BlockType.WOOD, BlockType.PLANK, BlockType.CRAFTING_TABLE],
    speedMultiplier: 6.5,
  },
  [ToolType.WOOD_SHOVEL]: {
    type: ToolType.WOOD_SHOVEL,
    name: "나무 삽",
    emoji: WOOD_SHOVEL_ICON,
    maxDurability: 59,
    effectiveBlocks: [BlockType.DIRT, BlockType.GRASS],
    speedMultiplier: 4.0,
  },
  [ToolType.STONE_SHOVEL]: {
    type: ToolType.STONE_SHOVEL,
    name: "돌 삽",
    emoji: STONE_SHOVEL_ICON,
    maxDurability: 131,
    effectiveBlocks: [BlockType.DIRT, BlockType.GRASS],
    speedMultiplier: 6.0,
  },
};

// 블록별 기본 맨손 채굴 소요 시간 (초 단위)
export const BLOCK_BREAK_TIMES: Record<BlockType, number> = {
  [BlockType.AIR]: 0,
  [BlockType.GRASS]: 0.8,
  [BlockType.DIRT]: 0.7,
  [BlockType.WOOD]: 1.8,
  [BlockType.LEAF]: 0.25,
  [BlockType.STONE]: 3.5,
  [BlockType.PLANK]: 1.4,
  [BlockType.CRAFTING_TABLE]: 1.5,
  [BlockType.WATER]: Infinity,
  [BlockType.MAGMA]: 3.0,
};

// 월드 기본 규격
export const WORLD_SIZE = 160; // 마을 주거 월드 규격 (160x160)
export const RESOURCE_WORLD_SIZE = 56; // 자원을 얻을 수 있는 개발도상국 월드 규격 (기존 대비 1/8 크기, 56x56)
export const CHUNK_SIZE = 16; // 16x16 청크 단위 최적화 (채굴 렉 제거)
export const WORLD_HEIGHT = 32;
export const SEA_LEVEL = 4; // 기본 해수면 Y좌표
export const MAX_HP = 100;

// 10x10 구획(Plot) 시스템 규격
export const PLOT_SIZE = 10; // 구획 한 변 10칸
export const PLOT_GRID_COUNT = 4; // 4x4 = 총 16개 구획
export const ROAD_WIDTH = 2; // 구획 사이 도로 폭 2칸

export interface PlotInfo {
  id: number;
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
}

export type WorldType = 'town' | 'resource';
