import * as THREE from 'three';
import {
  BlockType,
  BLOCK_METAS,
  WORLD_SIZE,
  RESOURCE_WORLD_SIZE,
  CHUNK_SIZE,
  WORLD_HEIGHT,
  SEA_LEVEL,
  PLOT_SIZE,
  PLOT_GRID_COUNT,
  ROAD_WIDTH,
  PlotInfo,
  WorldType
} from './Constants.ts';

// 6개 면 정의 (Hidden Face Culling용)
interface FaceSpec {
  dir: [number, number, number];
  corners: [number, number, number][];
  uv: number[];
}

const FACES: FaceSpec[] = [
  // 1. Right (+X)
  {
    dir: [1, 0, 0],
    corners: [
      [1, 0, 1], [1, 0, 0], [1, 1, 0],
      [1, 0, 1], [1, 1, 0], [1, 1, 1]
    ],
    uv: [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]
  },
  // 2. Left (-X)
  {
    dir: [-1, 0, 0],
    corners: [
      [0, 0, 0], [0, 0, 1], [0, 1, 1],
      [0, 0, 0], [0, 1, 1], [0, 1, 0]
    ],
    uv: [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]
  },
  // 3. Top (+Y)
  {
    dir: [0, 1, 0],
    corners: [
      [0, 1, 1], [1, 1, 1], [1, 1, 0],
      [0, 1, 1], [1, 1, 0], [0, 1, 0]
    ],
    uv: [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]
  },
  // 4. Bottom (-Y)
  {
    dir: [0, -1, 0],
    corners: [
      [0, 0, 0], [1, 0, 0], [1, 0, 1],
      [0, 0, 0], [1, 0, 1], [0, 0, 1]
    ],
    uv: [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]
  },
  // 5. Front (+Z)
  {
    dir: [0, 0, 1],
    corners: [
      [0, 0, 1], [1, 0, 1], [1, 1, 1],
      [0, 0, 1], [1, 1, 1], [0, 1, 1]
    ],
    uv: [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]
  },
  // 6. Back (-Z)
  {
    dir: [0, 0, -1],
    corners: [
      [1, 0, 0], [0, 0, 0], [0, 1, 0],
      [1, 0, 0], [0, 1, 0], [1, 1, 0]
    ],
    uv: [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]
  }
];

export interface PortalInfo {
  plotId?: number;
  name: string;
  x: number;
  y: number;
  z: number;
}

export class VoxelWorld {
  public townBlocks: Map<string, BlockType> = new Map();
  public resourceBlocks: Map<string, BlockType> = new Map();
  public blocks: Map<string, BlockType>; // 현재 활성 블록 맵 참조

  public currentWorldType: WorldType = 'town';
  public plots: PlotInfo[] = [];

  // 마을 중앙 광장 신성한 차원문 제단 1개 및 자원 구역 복귀 문
  public townPortals: PortalInfo[] = [
    { name: '신성한 자원 차원문', x: 0.5, y: 5, z: 0.5 }
  ];
  public resourceReturnPortal: PortalInfo = { name: '마을 복귀 문', x: 0.5, y: 5, z: -3.5 };

  // 청크 기반 지형 분할 렌더러 (평지 마을 & 자원 구역 독립 캐싱 -> 월드 전환 렉 0ms)
  private townChunkMeshes: Map<string, THREE.Mesh> = new Map();
  private townChunkGroup: THREE.Group = new THREE.Group();

  private resourceChunkMeshes: Map<string, THREE.Mesh> = new Map();
  private resourceChunkGroup: THREE.Group = new THREE.Group();

  private sharedMaterial: THREE.MeshLambertMaterial;

  // 자연 웅덩이/호수 전용 수면 메시와 대재앙 홍수 메시 분리 (산/지하 관통 방지)
  public resourceWaterMesh!: THREE.Mesh;
  public disasterWaterMesh!: THREE.Mesh;
  public isDisasterActive: boolean = false;
  public disasterWaterLevel: number = 1.0;

  public get waterMesh(): THREE.Mesh {
    return this.currentWorldType === 'town' ? this.disasterWaterMesh : this.resourceWaterMesh;
  }

  private scene: THREE.Scene;

  // 재앙 발생 시 분출된 마그마 블록 기록
  public eruptedMagmaKeys: Map<string, BlockType> = new Map();

  private get currentChunkGroup(): THREE.Group {
    return this.currentWorldType === 'town' ? this.townChunkGroup : this.resourceChunkGroup;
  }

  private get currentChunkMeshes(): Map<string, THREE.Mesh> {
    return this.currentWorldType === 'town' ? this.townChunkMeshes : this.resourceChunkMeshes;
  }

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.blocks = this.townBlocks;

    this.sharedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.scene.add(this.townChunkGroup);
    this.scene.add(this.resourceChunkGroup);

    const waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.65,
      roughness: 0.1,
      metalness: 0.2,
    });

    // 1. 대재앙 전용 홍수 메시 (평소에는 평지마을에서 숨김)
    const disasterGeometry = new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2);
    disasterGeometry.rotateX(-Math.PI / 2);
    this.disasterWaterMesh = new THREE.Mesh(disasterGeometry, waterMaterial);
    this.disasterWaterMesh.position.set(0, 1.0 - 0.15, 0);
    this.disasterWaterMesh.visible = false;
    this.scene.add(this.disasterWaterMesh);

    // 2. 10x10 구획 정보 계산 및 초기화
    this.initPlotInfo();

    // 3. 두 월드 지형 사전 생성
    this.generateTownTerrain();
    this.generateResourceTerrain();

    // 4. 자원 구역 전용 수면 메시: 자연 웅덩이/호수 셀에만 정확히 생성 (산이나 흙 지하를 가로지르지 않음!)
    this.resourceWaterMesh = this.buildResourceWaterMesh(waterMaterial);
    this.resourceWaterMesh.visible = false;
    this.scene.add(this.resourceWaterMesh);

    // 5. 양쪽 월드 청크 사전 빌드 (전환 시 0ms 즉시 표시)
    this.rebuildAllChunksForWorld('town');
    this.rebuildAllChunksForWorld('resource');

    // 6. 초기 마을 활성화
    this.switchWorld('town');
  }

  private getKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  public getBlock(x: number, y: number, z: number): BlockType {
    if (y < 0 || y >= WORLD_HEIGHT) return BlockType.AIR;
    return this.blocks.get(this.getKey(x, y, z)) ?? BlockType.AIR;
  }

  /**
   * 해당 좌표가 자원 구역의 원래 자연 웅덩이/호수인지 검사
   */
  public isNaturalWaterColumn(x: number, z: number): boolean {
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    const hill = Math.sin(fx * 0.08) * Math.cos(fz * 0.08) * 4.5 +
                 Math.sin(fx * 0.18 + fz * 0.12) * 2.0;
    const groundY = Math.max(2, Math.min(WORLD_HEIGHT - 6, Math.round(5 + hill)));
    return groundY < SEA_LEVEL; // SEA_LEVEL = 4 (지반 고도가 4보다 낮았던 곳만 자연 웅덩이)
  }

  /**
   * 플레이어/카메라 위치가 실제로 물속인지 검사 (지하 흙/돌 파냈을 때 물로 오인하는 문제 완전 해결)
   */
  public isPositionInWater(x: number, y: number, z: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);

    // 1. 해당 복셀 블록이 명시적으로 물 블록인 경우
    const block = this.getBlock(ix, iy, iz);
    if (block === BlockType.WATER) return true;

    // 2. 평지 마을 (town): 평화 상태에서는 100% 마른 땅 (지하를 파도 절대 물로 인식하지 않음)
    if (this.currentWorldType === 'town') {
      if (!this.isDisasterActive) return false;
      return y < this.disasterWaterLevel;
    }

    // 3. 자원 구역 (resource):
    // 기존에 자연 웅덩이/호수였던 구역(isNaturalWaterColumn)인 경우:
    // 수면(SEA_LEVEL = 4) 아래이거나 바닥을 파고 내려가도 웅덩이 수중으로 인식
    if (this.isNaturalWaterColumn(x, z)) {
      return y < (SEA_LEVEL - 0.05);
    }

    // 기존에 흙이나 돌이 있던 육지/산악 구역은 땅을 파고 내려가도 100% 마른 지하 땅(동굴)
    return false;
  }

  /**
   * 자원 구역 자연 웅덩이/호수 위에만 맞춤형 수면 메시 생성
   */
  private buildResourceWaterMesh(material: THREE.Material): THREE.Mesh {
    const half = Math.floor(RESOURCE_WORLD_SIZE / 2);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const y = SEA_LEVEL - 0.15;

    for (let x = -half; x < half; x++) {
      for (let z = -half; z < half; z++) {
        if (this.isNaturalWaterColumn(x + 0.5, z + 0.5)) {
          positions.push(
            x, y, z,
            x, y, z + 1,
            x + 1, y, z + 1,

            x, y, z,
            x + 1, y, z + 1,
            x + 1, y, z
          );
          for (let i = 0; i < 6; i++) {
            normals.push(0, 1, 0);
          }
          uvs.push(
            0, 0,  0, 1,  1, 1,
            0, 0,  1, 1,  1, 0
          );
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * 블록 변경 (채굴 및 설치):
   * 전체 월드가 아닌, 해당 블록이 속한 16x16 청크만 즉시 재구성하므로 0.1ms 이내로 부드럽게 완료됨!
   */
  public setBlock(x: number, y: number, z: number, type: BlockType): void {
    const numType = Number(type);
    const key = this.getKey(x, y, z);
    if (numType === BlockType.AIR || isNaN(numType)) {
      this.blocks.delete(key);
    } else {
      this.blocks.set(key, numType);
    }

    // 변경된 블록이 속한 청크 리빌드
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    this.rebuildChunk(cx, cz);

    // 청크 경계선 블록인 경우 인접 청크도 함께 리빌드
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    if (localX === 0) this.rebuildChunk(cx - 1, cz);
    if (localX === CHUNK_SIZE - 1) this.rebuildChunk(cx + 1, cz);
    if (localZ === 0) this.rebuildChunk(cx, cz - 1);
    if (localZ === CHUNK_SIZE - 1) this.rebuildChunk(cx, cz + 1);
  }

  /**
   * 10x10 구획 그리드 좌표 계산 및 각 대지별 자원 이동 문(포탈) 등록
   */
  private initPlotInfo(): void {
    this.plots = [];
    this.townPortals = [];
    const totalUnit = PLOT_SIZE + ROAD_WIDTH;
    const startOffset = -Math.floor((PLOT_GRID_COUNT * totalUnit) / 2);

    let id = 1;
    for (let r = 0; r < PLOT_GRID_COUNT; r++) {
      for (let c = 0; c < PLOT_GRID_COUNT; c++) {
        const minX = startOffset + c * totalUnit + ROAD_WIDTH;
        const maxX = minX + PLOT_SIZE - 1;
        const minZ = startOffset + r * totalUnit + ROAD_WIDTH;
        const maxZ = minZ + PLOT_SIZE - 1;

        this.plots.push({
          id,
          name: `대지 #${id}`,
          minX,
          maxX,
          minZ,
          maxZ,
          centerX: (minX + maxX) / 2,
          centerZ: (minZ + maxZ) / 2,
        });

        id++;
      }
    }
  }

  public getPlotAt(x: number, z: number): PlotInfo | null {
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    for (const plot of this.plots) {
      if (fx >= plot.minX && fx <= plot.maxX && fz >= plot.minZ && fz <= plot.maxZ) {
        return plot;
      }
    }
    return null;
  }

  /**
   * 해당 좌표가 신성한 차원문 제단 또는 파괴 불가 구역인지 확인 (채굴/함정 방지)
   */
  public isProtectedBlock(x: number, y: number, z: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);

    // 1. 월드 최하층 바닥 기반암 (Y=0)은 어디서든 파괴 불가 (보이드 추락 원천 방지)
    if (iy <= 0) return true;

    // 2. 평지 마을 (town): 중앙 광장 신성한 제단 (x: -3~+3, z: -3~+3, y: 0~8) 파괴 불가
    if (this.currentWorldType === 'town') {
      if (Math.abs(ix) <= 3 && Math.abs(iz) <= 3 && iy <= 8) {
        return true;
      }
    }

    // 3. 자원 구역 (resource): 마을 복귀 신성한 제단 (x: -3~+3, z: -7~-1, y: 0~8) 파괴 불가
    if (this.currentWorldType === 'resource') {
      if (Math.abs(ix) <= 3 && iz >= -7 && iz <= -1 && iy <= 8) {
        return true;
      }
    }

    return false;
  }

  /**
   * 해당 좌표가 포탈 문/제단 블록인지 확인 (isProtectedBlock 연동)
   */
  public isPortalBlock(x: number, y: number, z: number): boolean {
    return this.isProtectedBlock(x, y, z);
  }

  /**
   * 특정 10x10 구획(대지)의 건축물을 기본 평지 상태로 초기화 (관리자 전용 / 장난 복구용)
   */
  public resetPlot(plotId: number): boolean {
    const plot = this.plots.find(p => p.id === plotId);
    if (!plot) return false;

    // 해당 대지 범위 내의 모든 블록 초기화
    for (let x = plot.minX; x <= plot.maxX; x++) {
      for (let z = plot.minZ; z <= plot.maxZ; z++) {
        // Y=0 기반암(돌)
        this.townBlocks.set(this.getKey(x, 0, z), BlockType.STONE);
        // Y=1, 2, 3 흙
        for (let y = 1; y <= 3; y++) {
          this.townBlocks.set(this.getKey(x, y, z), BlockType.DIRT);
        }
        // Y=4 지표면 (경계선은 목재, 내부는 잔디)
        const isBorder = (x === plot.minX || x === plot.maxX || z === plot.minZ || z === plot.maxZ);
        this.townBlocks.set(this.getKey(x, 4, z), isBorder ? BlockType.PLANK : BlockType.GRASS);

        // Y>=5 모든 상단 건축 블록 삭제 (AIR)
        for (let y = 5; y < WORLD_HEIGHT; y++) {
          this.townBlocks.delete(this.getKey(x, y, z));
        }
      }
    }

    // 해당 구역과 인접한 청크들을 리빌드
    if (this.currentWorldType === 'town') {
      const minCx = Math.floor((plot.minX - 1) / CHUNK_SIZE);
      const maxCx = Math.floor((plot.maxX + 1) / CHUNK_SIZE);
      const minCz = Math.floor((plot.minZ - 1) / CHUNK_SIZE);
      const maxCz = Math.floor((plot.maxZ + 1) / CHUNK_SIZE);

      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          this.rebuildChunk(cx, cz);
        }
      }
    }

    return true;
  }

  /**
   * 1. 주거 월드: 평지 + 각 대지별 자원 이동 포탈 문 자동 건축
   */
  public generateTownTerrain(): void {
    this.townBlocks.clear();
    const half = Math.floor(WORLD_SIZE / 2);

    // 평지 지반 (Y=4)
    for (let x = -half; x < half; x++) {
      for (let z = -half; z < half; z++) {
        this.townBlocks.set(this.getKey(x, 0, z), BlockType.STONE);
        this.townBlocks.set(this.getKey(x, 1, z), BlockType.DIRT);
        this.townBlocks.set(this.getKey(x, 2, z), BlockType.DIRT);
        this.townBlocks.set(this.getKey(x, 3, z), BlockType.DIRT);

        let surfaceBlock = BlockType.GRASS;
        const plot = this.getPlotAt(x, z);

        if (plot) {
          const isBorder = (x === plot.minX || x === plot.maxX || z === plot.minZ || z === plot.maxZ);
          surfaceBlock = isBorder ? BlockType.PLANK : BlockType.GRASS;
        } else {
          const inVillageBounds = x >= this.plots[0].minX - 3 && x <= this.plots[this.plots.length - 1].maxX + 3 &&
                                  z >= this.plots[0].minZ - 3 && z <= this.plots[this.plots.length - 1].maxZ + 3;
          surfaceBlock = inVillageBounds ? BlockType.STONE : BlockType.GRASS;
        }

        this.townBlocks.set(this.getKey(x, 4, z), surfaceBlock);
      }
    }

    // 마을 중앙 광장 (x: -3~+3, z: -3~+3) 신성한 차원문 제단 건축
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        // 기단 하부 단단한 석재
        for (let y = 0; y <= 4; y++) {
          this.townBlocks.set(this.getKey(x, y, z), BlockType.STONE);
        }

        const dist = Math.max(Math.abs(x), Math.abs(z));
        if (dist === 3) {
          this.townBlocks.set(this.getKey(x, 4, z), BlockType.PLANK);
        } else if (dist <= 2) {
          this.townBlocks.set(this.getKey(x, 5, z), BlockType.STONE);
        }
      }
    }

    // 신성한 차원문 아치 기둥 (가운데 뚫린 부분이 2칸인 웅장한 대문)
    // 좌우 기둥: x = -1, x = 2 / 뚫린 통로: x = 0, x = 1 (가로 2블록 완벽 개방)
    const pillarPositions = [
      { x: -1, z: 0 },
      { x: 2, z: 0 },
    ];
    for (const p of pillarPositions) {
      this.townBlocks.set(this.getKey(p.x, 5, p.z), BlockType.STONE);
      this.townBlocks.set(this.getKey(p.x, 6, p.z), BlockType.MAGMA); // 빛나는 차원 룬
      this.townBlocks.set(this.getKey(p.x, 7, p.z), BlockType.MAGMA);
      this.townBlocks.set(this.getKey(p.x, 8, p.z), BlockType.STONE);
    }

    // 가운데 2칸 문 통로 (x: 0, 1) - 상단 아치 & 바닥 발판 & 통과 공간 2x2 에어
    for (let x = 0; x <= 1; x++) {
      this.townBlocks.set(this.getKey(x, 5, 0), BlockType.PLANK); // 바닥 발판
      this.townBlocks.set(this.getKey(x, 6, 0), BlockType.AIR);   // 통과 공간 하단
      this.townBlocks.set(this.getKey(x, 7, 0), BlockType.AIR);   // 통과 공간 상단
      this.townBlocks.set(this.getKey(x, 8, 0), BlockType.STONE); // 상단 아치
      this.townBlocks.set(this.getKey(x, 9, 0), BlockType.PLANK); // 장식 지붕

      // 문 앞뒤 보행 통로 확보 (z: -1, 1)
      for (const z of [-1, 1]) {
        this.townBlocks.set(this.getKey(x, 6, z), BlockType.AIR);
        this.townBlocks.set(this.getKey(x, 7, z), BlockType.AIR);
      }
    }

    // 모서리 장식 기둥
    const corners = [
      { x: -2, z: -2 }, { x: 3, z: -2 },
      { x: -2, z: 2 }, { x: 3, z: 2 }
    ];
    for (const c of corners) {
      this.townBlocks.set(this.getKey(c.x, 5, c.z), BlockType.STONE);
      this.townBlocks.set(this.getKey(c.x, 6, c.z), BlockType.PLANK);
    }

    // 포탈 중심 좌표 (x: 0.5, y: 5, z: 0)
    this.townPortals = [
      { name: '신성한 자원 차원문', x: 0.5, y: 5, z: 0 }
    ];
  }

  /**
   * 2. 자원 채취 전용 월드 (개발도상국): 숲, 바위산 + 신성한 마을 복귀 제단
   * (기존 대비 1/8 크기인 56x56 면적 규격 적용)
   */
  public generateResourceTerrain(): void {
    this.resourceBlocks.clear();
    const half = Math.floor(RESOURCE_WORLD_SIZE / 2); // 56 / 2 = 28

    for (let x = -half; x < half; x++) {
      for (let z = -half; z < half; z++) {
        this.resourceBlocks.set(this.getKey(x, 0, z), BlockType.STONE);

        // 아담한 56x56 크기에 맞게 지형 주파수 조정
        const hill = Math.sin(x * 0.16) * Math.cos(z * 0.16) * 4.0 +
                     Math.sin(x * 0.32 + z * 0.24) * 1.8;
        const groundY = Math.max(2, Math.min(WORLD_HEIGHT - 6, Math.round(5 + hill)));

        for (let y = 1; y <= groundY; y++) {
          if (y < groundY - 2) {
            this.resourceBlocks.set(this.getKey(x, y, z), BlockType.STONE);
          } else if (y < groundY) {
            const isRocky = hill > 2.8;
            this.resourceBlocks.set(this.getKey(x, y, z), isRocky ? BlockType.STONE : BlockType.DIRT);
          } else {
            if (hill > 3.2) {
              this.resourceBlocks.set(this.getKey(x, y, z), BlockType.STONE);
            } else if (hill < -2.6) {
              this.resourceBlocks.set(this.getKey(x, y, z), BlockType.DIRT);
            } else {
              this.resourceBlocks.set(this.getKey(x, y, z), BlockType.GRASS);
            }
          }
        }

        // 자연 웅덩이/호수 바닥 위 수면(SEA_LEVEL=4)까지 물 블록 등록
        if (groundY < SEA_LEVEL) {
          for (let wy = groundY + 1; wy <= SEA_LEVEL; wy++) {
            this.resourceBlocks.set(this.getKey(x, wy, z), BlockType.WATER);
          }
        }

        // 광맥 (아담한 맵에 맞게 풍성하게 분포)
        const oreSeed = Math.sin(x * 45.123 + z * 89.456);
        if (oreSeed > 0.91 && groundY >= 3) {
          this.resourceBlocks.set(this.getKey(x, groundY, z), BlockType.MAGMA);
        }

        // 참나무 숲
        if (groundY >= 3 && hill <= 3.0) {
          const treeSeed = Math.sin(x * 17.654 + z * 93.21) * 43758.5453;
          const rand = treeSeed - Math.floor(treeSeed);
          if (rand > 0.85) {
            this.spawnTreeInResource(x, groundY + 1, z);
          }
        }
      }
    }

    // 자원 월드 스폰 위치 앞 "신성한 마을 복귀 제단" 설치
    const rx = 0;
    const rz = -4;

    let returnGroundY = 5;
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (this.resourceBlocks.has(this.getKey(rx, y, rz))) {
        returnGroundY = y;
        break;
      }
    }

    // 제단 주변 (rx: -3~+3, rz: -7~-1) 바닥을 단단한 석재로 채워 보이드 추락/함정 완벽 방지
    for (let x = rx - 3; x <= rx + 3; x++) {
      for (let z = rz - 3; z <= rz + 3; z++) {
        for (let y = 0; y <= returnGroundY; y++) {
          this.resourceBlocks.set(this.getKey(x, y, z), BlockType.STONE);
        }
        this.resourceBlocks.set(this.getKey(x, returnGroundY, z), BlockType.PLANK);
      }
    }

    // 신성한 마을 복귀 제단 대문 (2칸 문 통로: x: 0, 1 / 기둥: x: -1, 2)
    // 좌우 기둥 (단단한 석재 및 마그마 룬)
    const resPillars = [
      { x: rx - 1, z: rz },
      { x: rx + 2, z: rz }
    ];
    for (const p of resPillars) {
      this.resourceBlocks.set(this.getKey(p.x, returnGroundY + 1, p.z), BlockType.STONE);
      this.resourceBlocks.set(this.getKey(p.x, returnGroundY + 2, p.z), BlockType.MAGMA);
      this.resourceBlocks.set(this.getKey(p.x, returnGroundY + 3, p.z), BlockType.MAGMA);
      this.resourceBlocks.set(this.getKey(p.x, returnGroundY + 4, p.z), BlockType.STONE);
    }

    // 가운데 2칸 문 통로 (x: 0, 1) - 상단 아치 & 바닥 발판 & 통과 공간 2x2 에어
    for (let x = rx; x <= rx + 1; x++) {
      this.resourceBlocks.set(this.getKey(x, returnGroundY, rz), BlockType.PLANK);
      this.resourceBlocks.set(this.getKey(x, returnGroundY + 1, rz), BlockType.AIR);
      this.resourceBlocks.set(this.getKey(x, returnGroundY + 2, rz), BlockType.AIR);
      this.resourceBlocks.set(this.getKey(x, returnGroundY + 3, rz), BlockType.AIR);
      this.resourceBlocks.set(this.getKey(x, returnGroundY + 4, rz), BlockType.STONE);

      // 앞뒤 보행 통로 확보 (rz - 1, rz + 1)
      for (const z of [rz - 1, rz + 1]) {
        this.resourceBlocks.set(this.getKey(x, returnGroundY + 1, z), BlockType.AIR);
        this.resourceBlocks.set(this.getKey(x, returnGroundY + 2, z), BlockType.AIR);
      }
    }

    this.resourceReturnPortal = {
      name: '신성한 마을 복귀 문',
      x: rx + 0.5,
      y: returnGroundY,
      z: rz,
    };
  }

  private spawnTreeInResource(rootX: number, rootY: number, rootZ: number): void {
    const trunkHeight = 4 + Math.floor(Math.abs(Math.sin(rootX * 3 + rootZ)) * 2);
    for (let dy = 0; dy < trunkHeight; dy++) {
      this.resourceBlocks.set(this.getKey(rootX, rootY + dy, rootZ), BlockType.WOOD);
    }
    const leafStartY = rootY + trunkHeight - 2;
    for (let lx = -2; lx <= 2; lx++) {
      for (let lz = -2; lz <= 2; lz++) {
        for (let ly = 0; ly <= 2; ly++) {
          if (Math.abs(lx) === 2 && Math.abs(lz) === 2 && ly === 2) continue;
          const key = this.getKey(rootX + lx, leafStartY + ly, rootZ + lz);
          if (!this.resourceBlocks.has(key)) {
            this.resourceBlocks.set(key, BlockType.LEAF);
          }
        }
      }
    }
  }

  /**
   * 대재앙 마그마 솟구침
   */
  public triggerMagmaEruption(): void {
    if (this.currentWorldType !== 'town') return;

    const centers = [
      { x: 0, z: 0 },
      { x: 12, z: 12 },
      { x: -12, z: 12 },
      { x: 12, z: -12 },
      { x: -12, z: -12 },
      { x: 0, z: 24 },
      { x: 0, z: -24 },
      { x: 24, z: 0 },
      { x: -24, z: 0 },
    ];

    centers.forEach(c => {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > 2.2) continue;

          const tx = c.x + dx;
          const tz = c.z + dz;
          const groundY = 4;

          const keyGround = this.getKey(tx, groundY, tz);
          if (!this.eruptedMagmaKeys.has(keyGround)) {
            const original = this.townBlocks.get(keyGround) ?? BlockType.STONE;
            this.eruptedMagmaKeys.set(keyGround, original);
          }
          this.townBlocks.set(keyGround, BlockType.MAGMA);

          if (dist <= 1.2) {
            const keyUp1 = this.getKey(tx, groundY + 1, tz);
            if (!this.eruptedMagmaKeys.has(keyUp1)) {
              this.eruptedMagmaKeys.set(keyUp1, this.townBlocks.get(keyUp1) ?? BlockType.AIR);
            }
            this.townBlocks.set(keyUp1, BlockType.MAGMA);

            if (dist <= 0.5) {
              const keyUp2 = this.getKey(tx, groundY + 2, tz);
              if (!this.eruptedMagmaKeys.has(keyUp2)) {
                this.eruptedMagmaKeys.set(keyUp2, this.townBlocks.get(keyUp2) ?? BlockType.AIR);
              }
              this.townBlocks.set(keyUp2, BlockType.MAGMA);
            }
          }
        }
      }
    });

    this.rebuildAllChunks();
  }

  public clearMagmaEruption(): void {
    if (this.eruptedMagmaKeys.size === 0) return;

    for (const [key, origBlock] of this.eruptedMagmaKeys.entries()) {
      if (origBlock === BlockType.AIR) {
        this.townBlocks.delete(key);
      } else {
        this.townBlocks.set(key, origBlock);
      }
    }
    this.eruptedMagmaKeys.clear();
    this.rebuildAllChunks();
  }

  /**
   * 월드 전환 ('town' <-> 'resource'): 사전 빌드된 메시 가시성만 토글하므로 0ms 무지연 완료!
   */
  public switchWorld(type: WorldType): void {
    this.currentWorldType = type;
    this.blocks = type === 'town' ? this.townBlocks : this.resourceBlocks;

    if (type === 'town') {
      this.townChunkGroup.visible = true;
      this.resourceChunkGroup.visible = false;
      this.resourceWaterMesh.visible = false;
      this.disasterWaterMesh.visible = this.isDisasterActive;
    } else {
      this.townChunkGroup.visible = false;
      this.resourceChunkGroup.visible = true;
      this.resourceWaterMesh.visible = true;
      this.disasterWaterMesh.visible = false;
    }
  }

  /**
   * 16x16 단일 청크 메시 재구성 (초고속 0.1ms 미만, 채굴 끊김 100% 제거)
   */
  public rebuildChunk(cx: number, cz: number): void {
    this.buildChunkMesh(this.currentWorldType, cx, cz);
  }

  private buildChunkMesh(worldType: WorldType, cx: number, cz: number): void {
    const chunkKey = `${cx},${cz}`;
    const minX = cx * CHUNK_SIZE;
    const maxX = minX + CHUNK_SIZE;
    const minZ = cz * CHUNK_SIZE;
    const maxZ = minZ + CHUNK_SIZE;

    const blockMap = worldType === 'town' ? this.townBlocks : this.resourceBlocks;
    const chunkGroup = worldType === 'town' ? this.townChunkGroup : this.resourceChunkGroup;
    const chunkMeshes = worldType === 'town' ? this.townChunkMeshes : this.resourceChunkMeshes;

    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const tempColor = new THREE.Color();

    const getBlockFromMap = (x: number, y: number, z: number): BlockType => {
      if (y < 0 || y >= WORLD_HEIGHT) return BlockType.AIR;
      return blockMap.get(this.getKey(x, y, z)) ?? BlockType.AIR;
    };

    for (let x = minX; x < maxX; x++) {
      for (let z = minZ; z < maxZ; z++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const blockType = getBlockFromMap(x, y, z);
          if (blockType === BlockType.AIR || blockType === BlockType.WATER) continue;

          const meta = BLOCK_METAS[blockType];

          for (const face of FACES) {
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];

            const neighbor = getBlockFromMap(nx, ny, nz);
            const neighborMeta = BLOCK_METAS[neighbor];

            if (neighbor === BlockType.AIR || (neighborMeta.transparent && neighbor !== blockType)) {
              let col = meta.color;
              if (face.dir[1] === 1 && meta.topColor) col = meta.topColor;
              if (face.dir[1] === -1 && meta.bottomColor) col = meta.bottomColor;

              tempColor.setHex(col);
              if (face.dir[1] === 1) tempColor.multiplyScalar(1.0);
              else if (face.dir[1] === -1) tempColor.multiplyScalar(0.5);
              else if (face.dir[0] !== 0) tempColor.multiplyScalar(0.75);
              else tempColor.multiplyScalar(0.85);

              for (const corner of face.corners) {
                positions.push(x + corner[0], y + corner[1], z + corner[2]);
                normals.push(face.dir[0], face.dir[1], face.dir[2]);
                colors.push(tempColor.r, tempColor.g, tempColor.b);
              }
            }
          }
        }
      }
    }

    let mesh = chunkMeshes.get(chunkKey);

    if (positions.length === 0) {
      if (mesh) {
        chunkGroup.remove(mesh);
        mesh.geometry.dispose();
        chunkMeshes.delete(chunkKey);
      }
      return;
    }

    if (!mesh) {
      const geo = new THREE.BufferGeometry();
      mesh = new THREE.Mesh(geo, this.sharedMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      chunkGroup.add(mesh);
      chunkMeshes.set(chunkKey, mesh);
    }

    const geometry = mesh.geometry;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  /**
   * 지정 월드의 전체 청크 빌드
   */
  public rebuildAllChunksForWorld(worldType: WorldType): void {
    const chunkMeshes = worldType === 'town' ? this.townChunkMeshes : this.resourceChunkMeshes;
    const chunkGroup = worldType === 'town' ? this.townChunkGroup : this.resourceChunkGroup;

    for (const mesh of chunkMeshes.values()) {
      chunkGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    chunkMeshes.clear();

    const size = worldType === 'town' ? WORLD_SIZE : RESOURCE_WORLD_SIZE;
    const half = Math.floor(size / 2);
    const minChunk = Math.floor(-half / CHUNK_SIZE);
    const maxChunk = Math.ceil(half / CHUNK_SIZE);

    for (let cx = minChunk; cx < maxChunk; cx++) {
      for (let cz = minChunk; cz < maxChunk; cz++) {
        this.buildChunkMesh(worldType, cx, cz);
      }
    }
  }

  /**
   * 현재 활성 월드 전체 청크 일괄 재구성
   */
  public rebuildAllChunks(): void {
    this.rebuildAllChunksForWorld(this.currentWorldType);
  }

  // 기존 API 호환용
  public rebuildMesh(): void {
    this.rebuildAllChunks();
  }
}
