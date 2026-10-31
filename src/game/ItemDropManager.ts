import * as THREE from 'three';
import { BlockType, ToolType, BLOCK_METAS, TOOL_METAS } from '../core/Constants.ts';
import { HotbarUI } from '../ui/Hotbar.ts';
import { createBlockTextureAtlas, getTileIndexForBlockFace, getAtlasUV } from '../core/TextureAtlas.ts';

export interface DropItemData {
  type: 'block' | 'item' | 'tool';
  blockType?: BlockType;
  itemType?: 'STICK';
  toolType?: ToolType;
  count: number;
}

export class FloatingItemEntity {
  public id: string;
  public data: DropItemData;
  public mesh: THREE.Group;
  public baseY: number;
  public createdAt: number;
  public isBeingPickedUp: boolean = false;

  constructor(id: string, data: DropItemData, x: number, y: number, z: number, sharedAtlas: THREE.CanvasTexture) {
    this.id = id;
    this.data = data;
    this.baseY = y;
    this.createdAt = performance.now();

    this.mesh = new THREE.Group();
    this.mesh.position.set(x, y, z);

    // 미니 큐브 또는 아이템 메시 생성 (0.35 크기)
    const cubeMesh = this.createVisualMesh(data, sharedAtlas);
    this.mesh.add(cubeMesh);
  }

  private createVisualMesh(data: DropItemData, sharedAtlas: THREE.CanvasTexture): THREE.Mesh {
    const size = 0.35;
    const geo = new THREE.BoxGeometry(size, size, size);

    if (data.type === 'block' && data.blockType !== undefined) {
      // 블록 타입에 맞는 텍스처 매핑
      const bType = data.blockType;
      const uvs: number[] = [];

      // BoxGeometry 6개 면: Right(+X), Left(-X), Top(+Y), Bottom(-Y), Front(+Z), Back(-Z)
      const faceDirs = [
        { dirY: 0 },  // +X
        { dirY: 0 },  // -X
        { dirY: 1 },  // +Y (Top)
        { dirY: -1 }, // -Y (Bottom)
        { dirY: 0 },  // +Z
        { dirY: 0 },  // -Z
      ];

      for (const f of faceDirs) {
        const tileIdx = getTileIndexForBlockFace(bType, f.dirY);
        const [u0, v0] = getAtlasUV(tileIdx, 0, 1);
        const [u1, v1] = getAtlasUV(tileIdx, 1, 1);
        const [u2, v2] = getAtlasUV(tileIdx, 0, 0);
        const [u3, v3] = getAtlasUV(tileIdx, 1, 0);
        // BoxGeometry face UV 순서: (0,1), (1,1), (0,0), (1,0)
        uvs.push(u0, v0, u1, v1, u2, v2, u3, v3);
      }

      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

      const mat = new THREE.MeshLambertMaterial({
        map: sharedAtlas,
        transparent: bType === BlockType.LEAF,
        opacity: bType === BlockType.LEAF ? 0.9 : 1.0,
      });

      return new THREE.Mesh(geo, mat);
    } else {
      // 도구 또는 막대기
      const color = data.itemType === 'STICK' ? 0x92400e : 0x38bdf8;
      const mat = new THREE.MeshLambertMaterial({ color });
      return new THREE.Mesh(geo, mat);
    }
  }

  public update(delta: number, time: number): void {
    // 1. 부드러운 Y축 자전
    this.mesh.rotation.y += delta * 2.4;

    // 2. 상하 둥둥 부유 애니메이션
    if (!this.isBeingPickedUp) {
      const bobOffset = Math.sin((time * 0.003) + (this.createdAt * 0.01)) * 0.12;
      this.mesh.position.y = this.baseY + bobOffset;
    }
  }
}

export class ItemDropManager {
  private scene: THREE.Scene;
  private items: Map<string, FloatingItemEntity> = new Map();
  private sharedAtlas: THREE.CanvasTexture;
  public onPickupNotice?: (msg: string, icon: string) => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sharedAtlas = createBlockTextureAtlas();
  }

  /**
   * 월드에 아이템 드롭 (인벤토리가 꽉 찼거나 조합 시 자리가 없을 때)
   */
  public spawnDropItem(data: DropItemData, x: number, y: number, z: number): void {
    const id = `drop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    // 살짝 흩뿌려지는 랜덤 오프셋
    const rx = x + (Math.random() - 0.5) * 0.8;
    const rz = z + (Math.random() - 0.5) * 0.8;
    const item = new FloatingItemEntity(id, data, rx, y + 0.35, rz, this.sharedAtlas);

    this.scene.add(item.mesh);
    this.items.set(id, item);
  }

  /**
   * 매 프레임 업데이트: 부유 애니메이션 및 플레이어 자석 픽업
   */
  public update(delta: number, playerPos: THREE.Vector3, hotbar: HotbarUI): void {
    const time = performance.now();
    const feetY = playerPos.y - 1.8;
    const playerCenter = new THREE.Vector3(playerPos.x, feetY + 0.8, playerPos.z);

    const pickupRadiusSq = 2.0 * 2.0;   // 2.0m 내 접근 시 흡수 시작
    const collectRadiusSq = 0.55 * 0.55; // 0.55m 내 도달 시 인벤토리 적립

    for (const [id, item] of this.items.entries()) {
      item.update(delta, time);

      // 플레이어와의 거리 계산
      const distSq = item.mesh.position.distanceToSquared(playerCenter);

      if (distSq <= pickupRadiusSq) {
        // 인벤토리에 여유가 있는지 확인
        let canTake = false;
        if (item.data.type === 'block' && item.data.blockType !== undefined) {
          canTake = hotbar.hasSpaceFor(item.data.blockType, item.data.count);
        } else if (item.data.type === 'item' && item.data.itemType === 'STICK') {
          canTake = hotbar.hasSpaceFor('STICK', item.data.count);
        } else if (item.data.type === 'tool' && item.data.toolType) {
          canTake = hotbar.slots.some(s => s.count === 0 && !s.isTool && !s.isItem);
        }

        if (canTake) {
          // 자석처럼 플레이어 중심을 향해 빠르게 빨려 들어옴
          item.isBeingPickedUp = true;
          item.mesh.position.lerp(playerCenter, delta * 7.5);

          // 플레이어에게 도달 완료! 인벤토리에 지급
          if (distSq <= collectRadiusSq) {
            let success = false;
            let itemName = '';
            let emoji = '📦';

            if (item.data.type === 'block' && item.data.blockType !== undefined) {
              success = hotbar.addResource(item.data.blockType, item.data.count);
              const meta = BLOCK_METAS[item.data.blockType];
              itemName = meta.name;
              emoji = meta.emoji;
            } else if (item.data.type === 'item' && item.data.itemType === 'STICK') {
              success = hotbar.addItem('STICK', item.data.count);
              itemName = '막대기';
              emoji = '🥢';
            } else if (item.data.type === 'tool' && item.data.toolType) {
              success = hotbar.addTool(item.data.toolType);
              const meta = TOOL_METAS[item.data.toolType];
              itemName = meta.name;
              emoji = meta.emoji;
            }

            if (success) {
              if (this.onPickupNotice) {
                this.onPickupNotice(`✨ [아이템 획득] ${itemName} x${item.data.count}`, emoji);
              }
              // 씬에서 제거
              this.scene.remove(item.mesh);
              this.items.delete(id);
            }
          }
        } else {
          item.isBeingPickedUp = false;
        }
      }
    }
  }

  public clearAll(): void {
    for (const item of this.items.values()) {
      this.scene.remove(item.mesh);
    }
    this.items.clear();
  }
}
