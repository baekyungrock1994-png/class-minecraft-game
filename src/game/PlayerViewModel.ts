import * as THREE from 'three';
import { BlockType, ToolType } from '../core/Constants.ts';
import { createBlockTextureAtlas, getTileIndexForBlockFace, getAtlasUV } from '../core/TextureAtlas.ts';

export class PlayerViewModel {
  public root: THREE.Group;
  private camera: THREE.PerspectiveCamera;

  // 팔 및 손 관절 노드
  private armContainer: THREE.Group;
  private armMesh: THREE.Mesh;
  private sleeveMesh: THREE.Mesh;

  // 장착물 노드
  private itemHolder: THREE.Group;
  private currentToolMesh: THREE.Group | null = null;
  private currentBlockMesh: THREE.Mesh | null = null;
  private sharedAtlas: THREE.CanvasTexture;

  // 상태 추적
  private lastTool: ToolType = ToolType.NONE;
  private lastBlock: BlockType = BlockType.AIR;

  // 애니메이션 변수
  private swingProgress: number = 0; // 0 ~ 1
  private isSwinging: boolean = false;
  private swingSpeed: number = 4.2; // 1회 스윙 약 0.24초
  private walkBobTime: number = 0;

  // 기본 위치 및 회전 (Rest / Idle)
  private readonly defaultPos = new THREE.Vector3(0.34, -0.32, -0.48);
  private readonly defaultRot = new THREE.Euler(0.2, -0.4, 0.1, 'YXZ');

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.sharedAtlas = createBlockTextureAtlas();

    this.root = new THREE.Group();
    this.root.name = 'PlayerViewModel';

    // 1. 팔 컨테이너 (어깨/팔꿈치 관절 기준)
    this.armContainer = new THREE.Group();
    this.armContainer.position.copy(this.defaultPos);
    this.armContainer.rotation.copy(this.defaultRot);

    // 2. 소매 (상의 옷감: 청록색)
    const sleeveGeo = new THREE.BoxGeometry(0.12, 0.28, 0.12);
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0x3b82f6 });
    this.sleeveMesh = new THREE.Mesh(sleeveGeo, sleeveMat);
    this.sleeveMesh.position.set(0, -0.14, 0);
    this.armContainer.add(this.sleeveMesh);

    // 3. 맨팔/손 (피부색 살구빛)
    const armGeo = new THREE.BoxGeometry(0.11, 0.3, 0.11);
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xdba682 });
    this.armMesh = new THREE.Mesh(armGeo, skinMat);
    this.armMesh.position.set(0, -0.35, 0);
    this.armContainer.add(this.armMesh);

    // 4. 손 끝 장착물 홀더 (도구/블록이 부착되는 위치)
    this.itemHolder = new THREE.Group();
    this.itemHolder.position.set(0, -0.48, 0.05);
    this.armContainer.add(this.itemHolder);

    this.root.add(this.armContainer);
    this.camera.add(this.root);
  }

  /**
   * 즉시 1회 휘두르기 (채굴 시작 또는 우클릭 설치 시)
   */
  public triggerSwing(): void {
    this.isSwinging = true;
    this.swingProgress = 0;
  }

  /**
   * 매 프레임 애니메이션 갱신
   */
  public update(
    delta: number,
    isMoving: boolean,
    isMining: boolean,
    currentTool: ToolType,
    currentBlock: BlockType,
    isModalOpen: boolean
  ): void {
    // 모달창이 열려있으면 팔 뷰모델 숨김
    if (isModalOpen) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;

    // 1. 도구 또는 손에 든 블록이 변경되었는지 검사하여 3D 모델 교체
    if (currentTool !== this.lastTool || currentBlock !== this.lastBlock) {
      this.updateHeldItem(currentTool, currentBlock);
    }

    // 2. 스윙 (휘두르기 / 휘적임) 애니메이션 계산
    if (isMining) {
      // 채굴 중일 때는 계속해서 빠르게 연속 휘두름
      this.isSwinging = true;
      this.swingProgress = (this.swingProgress + delta * 5.5) % 1.0;
    } else if (this.isSwinging) {
      this.swingProgress += delta * this.swingSpeed;
      if (this.swingProgress >= 1.0) {
        this.swingProgress = 0;
        this.isSwinging = false;
      }
    } else {
      this.swingProgress = 0;
    }

    // 3. 이동 중 밥빙 (Walk Bobbing)
    let bobX = 0;
    let bobY = 0;
    if (isMoving) {
      this.walkBobTime += delta * 8.5;
      bobX = Math.cos(this.walkBobTime) * 0.018;
      bobY = Math.abs(Math.sin(this.walkBobTime)) * 0.022;
    } else {
      this.walkBobTime = 0;
    }

    // 4. 스윙 모션 커브 적용 (마인크래프트 특유의 찰진 휘두르기)
    const sinProgress = Math.sin(this.swingProgress * Math.PI);
    const swingRotX = -0.75 * sinProgress;
    const swingRotY = -0.45 * sinProgress;
    const swingRotZ = 0.5 * sinProgress;

    const swingPosX = -0.08 * sinProgress;
    const swingPosY = -0.12 * sinProgress;
    const swingPosZ = 0.18 * sinProgress;

    // 최종 위치 및 회전 블렌딩
    this.armContainer.position.set(
      this.defaultPos.x + bobX + swingPosX,
      this.defaultPos.y - bobY + swingPosY,
      this.defaultPos.z + swingPosZ
    );

    this.armContainer.rotation.set(
      this.defaultRot.x + swingRotX,
      this.defaultRot.y + swingRotY,
      this.defaultRot.z + swingRotZ
    );
  }

  /**
   * 손에 든 도구 또는 블록 3D 모델 업데이트
   */
  private updateHeldItem(tool: ToolType, block: BlockType): void {
    this.lastTool = tool;
    this.lastBlock = block;

    // 기존 장착물 제거
    if (this.currentToolMesh) {
      this.itemHolder.remove(this.currentToolMesh);
      this.currentToolMesh = null;
    }
    if (this.currentBlockMesh) {
      this.itemHolder.remove(this.currentBlockMesh);
      this.currentBlockMesh = null;
    }

    // 1. 도구를 들고 있는 경우 (곡괭이, 도끼, 삽)
    if (tool !== ToolType.NONE) {
      this.currentToolMesh = this.createToolModel(tool);
      this.itemHolder.add(this.currentToolMesh);
      return;
    }

    // 2. 블록을 들고 있는 경우 (흙, 목재, 상자 등)
    if (block !== BlockType.AIR) {
      this.currentBlockMesh = this.createMiniBlockModel(block);
      this.itemHolder.add(this.currentBlockMesh);
      return;
    }

    // 3. 맨손일 경우: 아무것도 추가하지 않음 (맨손 팔만 노출되어 휘적임)
  }

  /**
   * 3D 도구 모델 생성 (곡괭이, 도끼, 삽)
   */
  private createToolModel(tool: ToolType): THREE.Group {
    const group = new THREE.Group();
    // 손에 자연스럽게 쥐어지도록 회전 및 위치 조정
    group.position.set(0.04, 0.18, 0.12);
    group.rotation.set(-0.4, 0.2, -0.6);

    const isStone =
      tool === ToolType.STONE_PICKAXE ||
      tool === ToolType.STONE_AXE ||
      tool === ToolType.STONE_SHOVEL;

    const headColor = isStone ? 0x94a3b8 : 0xb45309; // 돌: 슬레이트 그레이, 나무: 진한 목재
    const stickColor = 0x78350f; // 나무 막대 손잡이

    const handleMat = new THREE.MeshLambertMaterial({ color: stickColor });
    const headMat = new THREE.MeshLambertMaterial({ color: headColor });

    // 1) 손잡이 나무 막대기 (공통)
    const handleGeo = new THREE.BoxGeometry(0.035, 0.48, 0.035);
    const handleMesh = new THREE.Mesh(handleGeo, handleMat);
    handleMesh.position.set(0, 0.12, 0);
    group.add(handleMesh);

    // 2) 도구별 헤드 날 생성
    if (tool === ToolType.WOOD_PICKAXE || tool === ToolType.STONE_PICKAXE) {
      // [곡괭이 T자 헤드]
      const pickHeadGeo = new THREE.BoxGeometry(0.28, 0.06, 0.05);
      const pickHeadMesh = new THREE.Mesh(pickHeadGeo, headMat);
      pickHeadMesh.position.set(0, 0.35, 0);
      group.add(pickHeadMesh);

      // 곡괭이 양끝 날카로운 끝부분
      const tipGeo = new THREE.BoxGeometry(0.04, 0.04, 0.045);
      const leftTip = new THREE.Mesh(tipGeo, headMat);
      leftTip.position.set(-0.13, 0.32, 0);
      const rightTip = new THREE.Mesh(tipGeo, headMat);
      rightTip.position.set(0.13, 0.32, 0);
      group.add(leftTip, rightTip);
    } else if (tool === ToolType.WOOD_AXE || tool === ToolType.STONE_AXE) {
      // [도끼 비대칭 날]
      const axeHeadGeo = new THREE.BoxGeometry(0.14, 0.12, 0.05);
      const axeHeadMesh = new THREE.Mesh(axeHeadGeo, headMat);
      axeHeadMesh.position.set(0.06, 0.32, 0);
      group.add(axeHeadMesh);
    } else if (tool === ToolType.WOOD_SHOVEL || tool === ToolType.STONE_SHOVEL) {
      // [삽 넓은 평면 날]
      const shovelBladeGeo = new THREE.BoxGeometry(0.12, 0.14, 0.03);
      const shovelBladeMesh = new THREE.Mesh(shovelBladeGeo, headMat);
      shovelBladeMesh.position.set(0, 0.36, 0);
      group.add(shovelBladeMesh);
    }

    return group;
  }

  /**
   * 손에 올려진 3D 미니 블록 모델 생성
   */
  private createMiniBlockModel(blockType: BlockType): THREE.Mesh {
    const size = 0.18;
    const geo = new THREE.BoxGeometry(size, size, size);

    // BoxGeometry 6개 면: Right(+X), Left(-X), Top(+Y), Bottom(-Y), Front(+Z), Back(-Z)
    const faceDirs = [
      { dirY: 0 },
      { dirY: 0 },
      { dirY: 1 },
      { dirY: -1 },
      { dirY: 0 },
      { dirY: 0 },
    ];

    const uvs: number[] = [];
    for (const f of faceDirs) {
      const tileIdx = getTileIndexForBlockFace(blockType, f.dirY);
      const [u0, v0] = getAtlasUV(tileIdx, 0, 1);
      const [u1, v1] = getAtlasUV(tileIdx, 1, 1);
      const [u2, v2] = getAtlasUV(tileIdx, 0, 0);
      const [u3, v3] = getAtlasUV(tileIdx, 1, 0);
      uvs.push(u0, v0, u1, v1, u2, v2, u3, v3);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    const mat = new THREE.MeshLambertMaterial({
      map: this.sharedAtlas,
      transparent: blockType === BlockType.LEAF,
      opacity: blockType === BlockType.LEAF ? 0.9 : 1.0,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0.1, 0.08);
    mesh.rotation.set(0.2, 0.5, 0.1);
    return mesh;
  }
}
