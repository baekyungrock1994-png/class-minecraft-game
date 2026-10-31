import * as THREE from 'three';
import { VoxelWorld } from '../core/VoxelWorld.ts';
import { BlockType, WORLD_SIZE, WORLD_HEIGHT, MAX_HP, ToolType, TOOL_METAS, BLOCK_BREAK_TIMES } from '../core/Constants.ts';

export interface BlockInteractEvent {
  x: number;
  y: number;
  z: number;
  type: BlockType;
  action: 'break' | 'place';
}

export class PlayerController {
  public camera: THREE.PerspectiveCamera;
  public position: THREE.Vector3;
  private velocity: THREE.Vector3 = new THREE.Vector3();
  private onGround: boolean = false;

  private yaw: number = 0;
  private pitch: number = 0;
  private isLocked: boolean = false;
  private isFirstMouseMoveAfterLock: boolean = false;

  // 10x10 구획 할당 & 개발자 권한
  public assignedPlotIndex: number = 1; // 기본 1번 대지 할당
  public bypassPlotRestriction: boolean = false; // 개발자 건축 제한 해제
  public isFlying: boolean = false; // 개발자 비행(플라이) 모드

  // HP & 서바이벌
  public hp: number = MAX_HP;
  public oxygen: number = 10.0;
  private damageCooldown: number = 0;
  private damageVignette: HTMLElement | null = null;
  private heartsContainer: HTMLElement | null = null;
  private oxygenContainer: HTMLElement | null = null;

  // 채굴 진행도 (Hold to Mine)
  private isMining: boolean = false;
  private miningProgress: number = 0;
  private miningBlockPos: { x: number; y: number; z: number } | null = null;
  private miningRing: HTMLElement | null = null;
  private miningCircleFill: SVGPathElement | null = null;

  // 현재 장착 도구 & 블록
  public currentTool: ToolType = ToolType.NONE;
  public currentSelectedBlock: BlockType = BlockType.AIR;

  // 조작 키 상태
  private keys: Record<string, boolean> = {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    Space: false,
    ShiftLeft: false,
    ShiftRight: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
  };

  private world: VoxelWorld;
  private scene: THREE.Scene;
  private highlightBox: THREE.LineSegments;
  public targetBlock: { x: number; y: number; z: number; normal: [number, number, number] } | null = null;

  // 인터랙션 콜백
  public onBlockInteract?: (event: BlockInteractEvent) => boolean;
  public onBlockMinedSuccess?: () => void; // 도구 내구도 소모 트리거
  public onPlayerDeath?: (reason: string) => void;
  public onNotify?: (msg: string, icon: string) => void;
  public onOpenCraftingTable?: () => void;
  public onUseItem?: () => boolean; // 핫바 아이템(마을 귀환석 등) 우클릭 사용 콜백

  // 평화 모드 (PVP 원천 차단)
  public readonly isPvpAllowed: boolean = false;

  public playerRadius = 0.3;
  public playerHeight = 1.8;
  public isModalOpen: boolean = false;

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene, world: VoxelWorld) {
    this.camera = camera;
    this.scene = scene;
    this.world = world;
    this.position = camera.position;

    this.damageVignette = document.getElementById('damage-vignette');
    this.heartsContainer = document.getElementById('hearts-container');
    this.oxygenContainer = document.getElementById('oxygen-container');
    this.miningRing = document.getElementById('mining-progress-ring');
    this.miningCircleFill = document.getElementById('mining-circle-fill') as unknown as SVGPathElement;

    this.renderHearts();
    this.spawnOnGround();

    // 블록 선택 하이라이트 와이어프레임 박스
    const boxGeo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    const boxMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    this.highlightBox = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), boxMat);
    this.highlightBox.visible = false;
    this.scene.add(this.highlightBox);

    this.setupEventListeners();
  }

  public teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
  }

  /**
   * 개발자 비행(플라이) 모드 토글
   */
  public toggleFlying(): boolean {
    this.isFlying = !this.isFlying;
    this.velocity.set(0, 0, 0);
    if (this.isFlying) {
      // 비행 활성화 시 살짝 공중으로 부양
      this.position.y += 0.8;
      this.onGround = false;
    }
    return this.isFlying;
  }

  public spawnOnGround(): void {
    let spawnX = 0.5;
    let spawnZ = 0.5;

    // 마을 월드이고 할당된 대지가 있으면 그 대지의 중심으로 스폰
    if (this.world.currentWorldType === 'town') {
      const plot = this.world.plots.find(p => p.id === this.assignedPlotIndex);
      if (plot) {
        spawnX = plot.centerX + 0.5;
        spawnZ = plot.centerZ + 0.5;
      }
    }

    let groundY = 4;
    const checkX = Math.floor(spawnX);
    const checkZ = Math.floor(spawnZ);
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (this.world.getBlock(checkX, y, checkZ) !== BlockType.AIR) {
        groundY = y;
        break;
      }
    }
    this.position.set(spawnX, groundY + 1 + this.playerHeight, spawnZ);
    this.velocity.set(0, 0, 0);
    this.onGround = true;
    this.hp = MAX_HP;
    this.oxygen = 10.0;
    this.renderHearts();
  }

  private setupEventListeners(): void {
    window.addEventListener('keydown', (e) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      const isInputActive = targetTag === 'INPUT' || targetTag === 'TEXTAREA';

      // 텍스트 입력 중이 아닐 때 Space 키 기본 동작(스크롤 / 버튼 클릭) 원천 차단
      if (e.code === 'Space' && !isInputActive) {
        e.preventDefault();
        if (document.activeElement && typeof (document.activeElement as HTMLElement).blur === 'function') {
          (document.activeElement as HTMLElement).blur();
        }
      }

      // [마우스 대체 키보드 조작]: 마우스가 없는 학생을 위해 ,(쉼표)는 좌클릭(채굴), /(슬래시)는 우클릭(설치)
      if (!isInputActive && !this.isModalOpen) {
        if (e.code === 'Comma') {
          e.preventDefault();
          this.isMining = true;
          return;
        }
        if (e.code === 'Slash') {
          e.preventDefault();
          if (this.onUseItem && this.onUseItem()) {
            return;
          }
          this.handlePlaceBlock();
          return;
        }
        // 방향키 조작 시 브라우저 스크롤 방지
        if (e.code.startsWith('Arrow')) {
          e.preventDefault();
        }
      }

      if (this.keys.hasOwnProperty(e.code)) {
        this.keys[e.code] = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      // 마우스 대체 키 뗌 감지
      if (e.code === 'Comma') {
        this.isMining = false;
        this.resetMiningProgress();
      }

      if (this.keys.hasOwnProperty(e.code)) {
        this.keys[e.code] = false;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      if (this.isFirstMouseMoveAfterLock) {
        this.isFirstMouseMoveAfterLock = false;
        return;
      }
      // 마우스 빠른 조작 시에도 먹통되지 않도록 델타 클램핑 후 적용
      const sensitivity = 0.0022;
      const clampedX = Math.max(-120, Math.min(120, e.movementX));
      const clampedY = Math.max(-120, Math.min(120, e.movementY));
      this.yaw -= clampedX * sensitivity;
      this.pitch -= clampedY * sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });

    // 마우스 다운 (좌클릭 채굴 시작 / 우클릭 즉시 설치 또는 아이템 사용)
    window.addEventListener('mousedown', (e) => {
      if (!this.isLocked) return;
      if (e.button === 0) {
        this.isMining = true;
      } else if (e.button === 2) {
        if (this.onUseItem && this.onUseItem()) {
          return;
        }
        this.handlePlaceBlock();
      }
    });

    // 마우스 업 (채굴 취소)
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isMining = false;
        this.resetMiningProgress();
      }
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  public setPointerLocked(locked: boolean): void {
    this.isLocked = locked;
    if (locked) {
      this.isFirstMouseMoveAfterLock = true;
    } else {
      this.isMining = false;
      this.resetMiningProgress();
      this.keys.KeyW = false;
      this.keys.KeyA = false;
      this.keys.KeyS = false;
      this.keys.KeyD = false;
      this.keys.Space = false;
      this.keys.ShiftLeft = false;
      this.keys.ShiftRight = false;
      this.keys.ArrowUp = false;
      this.keys.ArrowDown = false;
      this.keys.ArrowLeft = false;
      this.keys.ArrowRight = false;
      this.velocity.set(0, 0, 0);
    }
  }

  public update(delta: number): void {
    // 모달창(조합대 등)이 열려있지 않은 동안에는 이동 물리와 생존 로직을 항시 정상 수행
    if (!this.isModalOpen) {
      // [마우스 대체 조작]: 방향키로 카메라 시점 회전 (마우스 없는 학생용)
      const rotSpeed = 2.4;
      if (this.keys.ArrowLeft) {
        this.yaw += rotSpeed * delta;
      }
      if (this.keys.ArrowRight) {
        this.yaw -= rotSpeed * delta;
      }
      if (this.keys.ArrowUp) {
        this.pitch += rotSpeed * delta;
        this.pitch = Math.min(Math.PI / 2 - 0.01, this.pitch);
      }
      if (this.keys.ArrowDown) {
        this.pitch -= rotSpeed * delta;
        this.pitch = Math.max(-Math.PI / 2 + 0.01, this.pitch);
      }

      this.updateMovement(delta);
      this.updateSurvival(delta);
      if (this.isMining) {
        this.updateMining(delta);
      }
    }
    this.updateCameraRotation();
    this.updateRaycast();
  }

  /**
   * HP 및 환경 위험 (물속 익사, 마그마 피해) 업데이트
   */
  private updateSurvival(delta: number): void {
    if (this.damageCooldown > 0) {
      this.damageCooldown -= delta;
    }

    // 개발자 비행 모드 중에는 익사 및 환경 피해 무적
    if (this.isFlying) {
      this.oxygen = 30.0;
      this.updateOxygenUI(false);
      return;
    }

    const feetY = this.position.y - this.playerHeight;
    const headY = this.position.y;

    // 1. 물속 상태 검사 (실제 물 블록 또는 자연 웅덩이/침수 구역 여부 검사)
    const isUnderwater = this.world.isPositionInWater(this.position.x, headY, this.position.z);
    if (isUnderwater) {
      // 산소 30초 동안 넉넉하게 유지 (초당 1씩 소모)
      this.oxygen = Math.max(0, this.oxygen - delta);
      this.updateOxygenUI(true);

      // 산소 완전 고갈 시 익사 피해 (3초마다 10 피해로 완화)
      if (this.oxygen <= 0 && this.damageCooldown <= 0) {
        this.takeDamage(10, '물속에 너무 오래 잠겨 숨이 찼습니다! 💧');
        this.damageCooldown = 1.5;
      }
    } else {
      this.oxygen = 30.0;
      this.updateOxygenUI(false);
    }

    // 2. 마그마 블록 접촉 검사
    const bx = Math.floor(this.position.x);
    const byFeet = Math.floor(feetY);
    const bz = Math.floor(this.position.z);

    const standingBlock = this.world.getBlock(bx, byFeet, bz);
    const insideBlock = this.world.getBlock(bx, Math.floor(feetY + 0.5), bz);

    if ((standingBlock === BlockType.MAGMA || insideBlock === BlockType.MAGMA) && this.damageCooldown <= 0) {
      this.takeDamage(25, '마그마의 뜨거운 열기에 데였습니다! 🔥');
      // 넉백 점프
      this.velocity.y = 8.0;
      this.damageCooldown = 0.8;
    }

    // 3. 보이드(허공) 추락 방지: Y좌표가 -4 이하로 떨어지면 안전한 지상 스폰 지점으로 즉시 텔레포트
    if (this.position.y < -4) {
      this.velocity.set(0, 0, 0);
      if (this.world.currentWorldType === 'town') {
        this.teleport(0.5, 6.0, 3.5);
      } else {
        this.teleport(0.5, 7.0, -1.0);
      }
      this.takeDamage(10, '허공으로 추락하여 신성한 제단으로 긴급 복귀했습니다! ⚡');
    }
  }

  public takeDamage(amount: number, reason: string, isFromPlayer: boolean = false): void {
    if (isFromPlayer) return; // [수정사항 4]: 플레이어 간 상호 공격(PVP) 원천 차단
    this.hp -= amount;
    this.flashDamage();
    this.renderHearts();

    if (this.hp <= 0) {
      if (this.onPlayerDeath) this.onPlayerDeath(reason);
      this.spawnOnGround();
    }
  }

  private flashDamage(): void {
    if (this.damageVignette) {
      this.damageVignette.classList.add('hit');
      setTimeout(() => {
        this.damageVignette?.classList.remove('hit');
      }, 200);
    }
  }

  private renderHearts(): void {
    if (!this.heartsContainer) return;
    this.heartsContainer.innerHTML = '';
    const totalHearts = 10;
    const activeHearts = Math.ceil((Math.max(0, this.hp) / MAX_HP) * totalHearts);

    for (let i = 0; i < totalHearts; i++) {
      const span = document.createElement('span');
      span.className = `heart-icon ${i < activeHearts ? 'active' : 'lost'}`;
      span.textContent = i < activeHearts ? '❤️' : '🖤';
      this.heartsContainer.appendChild(span);
    }
  }

  private updateOxygenUI(show: boolean): void {
    if (!this.oxygenContainer) return;
    if (!show) {
      this.oxygenContainer.classList.add('hidden');
      return;
    }
    this.oxygenContainer.classList.remove('hidden');
    this.oxygenContainer.innerHTML = '';
    const totalBubbles = 10;
    const activeBubbles = Math.ceil((this.oxygen / 10.0) * totalBubbles);

    for (let i = 0; i < totalBubbles; i++) {
      const span = document.createElement('span');
      const activeBubbles = Math.ceil((this.oxygen / 30.0) * totalBubbles);
      span.className = `bubble-icon ${i < activeBubbles ? 'active' : 'lost'}`;
      span.textContent = i < activeBubbles ? '🫧' : '⚪';
      this.oxygenContainer.appendChild(span);
    }
  }

  /**
   * 지속 채굴 진행도 (Hold to Mine) 업데이트
   */
  private updateMining(delta: number): void {
    if (!this.isMining || !this.targetBlock) {
      this.resetMiningProgress();
      return;
    }

    const { x, y, z } = this.targetBlock;
    const blockType = this.world.getBlock(x, y, z);
    if (blockType === BlockType.AIR || blockType === BlockType.WATER) {
      this.resetMiningProgress();
      return;
    }

    // 타겟 블록이 바뀌면 진행도 초기화
    if (!this.miningBlockPos || this.miningBlockPos.x !== x || this.miningBlockPos.y !== y || this.miningBlockPos.z !== z) {
      this.miningBlockPos = { x, y, z };
      this.miningProgress = 0;
    }

    // 도구 효율 계산
    const baseTime = BLOCK_BREAK_TIMES[blockType] ?? 1.5;
    const toolMeta = TOOL_METAS[this.currentTool];
    let multiplier = 1.0;

    if (toolMeta && toolMeta.effectiveBlocks.includes(blockType)) {
      multiplier = toolMeta.speedMultiplier;
    }

    const requiredTime = Math.max(0.1, baseTime / multiplier);
    this.miningProgress += delta / requiredTime;

    // UI 진행도 링 표시
    if (this.miningRing) {
      this.miningRing.classList.add('active');
    }
    if (this.miningCircleFill) {
      const pct = Math.min(100, Math.floor(this.miningProgress * 100));
      this.miningCircleFill.setAttribute('stroke-dasharray', `${pct}, 100`);
    }

    // 채굴 완료 도달!
    if (this.miningProgress >= 1.0) {
      this.handleBreakBlock();
      this.resetMiningProgress();
    }
  }

  private resetMiningProgress(): void {
    this.miningProgress = 0;
    this.miningBlockPos = null;
    if (this.miningRing) {
      this.miningRing.classList.remove('active');
    }
    if (this.miningCircleFill) {
      this.miningCircleFill.setAttribute('stroke-dasharray', `0, 100`);
    }
  }

  private updateCameraRotation(): void {
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.x = this.pitch;
    euler.y = this.yaw;
    this.camera.quaternion.setFromEuler(euler);
  }

  private updateMovement(delta: number): void {
    const feetY = this.position.y - this.playerHeight;
    const isWater = this.world.isPositionInWater(this.position.x, feetY + 0.2, this.position.z);

    // 1. 시선 방향 벡터
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const forwardHoriz = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const moveDir = new THREE.Vector3();

    if (this.isFlying) {
      // [개발자 3D 비행 (Fly Mode) 물리]
      const flySpeed = 16.0; // 시원하게 날아다니는 빠른 비행 속도 (보행의 2배 이상)
      const verticalFlySpeed = 11.0;

      // WASD 이동 (카메라 기준 전후좌우 비행)
      if (this.keys.KeyW) moveDir.add(forwardHoriz);
      if (this.keys.KeyS) moveDir.sub(forwardHoriz);
      if (this.keys.KeyA) moveDir.sub(right);
      if (this.keys.KeyD) moveDir.add(right);

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        this.velocity.x = moveDir.x * flySpeed;
        this.velocity.z = moveDir.z * flySpeed;
      } else {
        this.velocity.x *= 0.75;
        this.velocity.z *= 0.75;
      }

      // Space: 상승, Shift: 하강
      if (this.keys.Space) {
        this.velocity.y = verticalFlySpeed;
      } else if (this.keys.ShiftLeft || this.keys.ShiftRight) {
        this.velocity.y = -verticalFlySpeed;
      } else {
        // 공중 호버링 (상하 정지)
        this.velocity.y *= 0.75;
      }

      // 중력(gravity) 미적용! 공중에 자유롭게 부유
      this.onGround = false;
    } else if (isWater) {
      // [물속 3D 자유 유영 물리]: 아래를 보며 W를 누르면 아래로 잠수, 위를 보면 위로 상승!
      const swimSpeed = 5.5;
      if (this.keys.KeyW) moveDir.add(lookDir);
      if (this.keys.KeyS) moveDir.sub(lookDir);
      if (this.keys.KeyA) moveDir.sub(right);
      if (this.keys.KeyD) moveDir.add(right);

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        this.velocity.x = moveDir.x * swimSpeed;
        this.velocity.y = moveDir.y * swimSpeed;
        this.velocity.z = moveDir.z * swimSpeed;
      } else {
        this.velocity.x *= 0.8;
        this.velocity.y *= 0.8;
        this.velocity.z *= 0.8;
      }

      // 스페이스바로 위로 솟구치기
      if (this.keys.Space) {
        this.velocity.y = 4.0;
      }
      // 물속 아주 미세한 가라앉음
      this.velocity.y -= 2.0 * delta;
    } else {
      // [지상 보행 물리]
      const moveSpeed = 7.5;
      const gravity = 25.0;
      const jumpStrength = 8.5;

      if (this.keys.KeyW) moveDir.add(forwardHoriz);
      if (this.keys.KeyS) moveDir.sub(forwardHoriz);
      if (this.keys.KeyA) moveDir.sub(right);
      if (this.keys.KeyD) moveDir.add(right);

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        this.velocity.x = moveDir.x * moveSpeed;
        this.velocity.z = moveDir.z * moveSpeed;
      } else {
        this.velocity.x *= 0.7;
        this.velocity.z *= 0.7;
      }

      if (this.keys.Space && this.onGround) {
        this.velocity.y = jumpStrength;
        this.onGround = false;
      }
      this.velocity.y -= gravity * delta;
      this.velocity.y = Math.max(-20.0, this.velocity.y);
    }

    this.moveWithCollision(delta);
  }

  private moveWithCollision(delta: number): void {
    // 지형 로딩이나 텔레포트로 블록 내부에 파묻혔을 경우 위로 자동 탈출 (끼임 방지)
    if (this.checkCollision()) {
      for (let step = 0; step < 8; step++) {
        this.position.y += 0.5;
        if (!this.checkCollision()) {
          this.velocity.y = 0;
          break;
        }
      }
    }

    // Y축 이동
    this.position.y += this.velocity.y * delta;
    if (this.checkCollision()) {
      if (this.velocity.y < 0) {
        const feetY = this.position.y - this.playerHeight;
        this.position.y = Math.floor(feetY) + 1 + this.playerHeight + 0.001;
        this.onGround = true;
      } else {
        this.position.y = Math.floor(this.position.y) - 0.001;
      }
      this.velocity.y = 0;
    } else {
      this.onGround = false;
    }

    // X축 이동 & 월드 바깥 낭떠러지 낙하 방지
    const limit = Math.floor(WORLD_SIZE / 2) - 2;
    this.position.x += this.velocity.x * delta;
    if (this.checkCollision()) {
      this.position.x -= this.velocity.x * delta;
      this.velocity.x = 0;
    }
    this.position.x = Math.max(-limit, Math.min(limit, this.position.x));

    // Z축 이동 & 월드 바깥 낭떠러지 낙하 방지
    this.position.z += this.velocity.z * delta;
    if (this.checkCollision()) {
      this.position.z -= this.velocity.z * delta;
      this.velocity.z = 0;
    }
    this.position.z = Math.max(-limit, Math.min(limit, this.position.z));

    // 혹시라도 버그로 지하 바닥 아래로 뚫린 경우에만 리스폰
    if (this.position.y < -3) {
      this.spawnOnGround();
    }
  }

  private checkCollision(): boolean {
    const minX = Math.floor(this.position.x - this.playerRadius);
    const maxX = Math.floor(this.position.x + this.playerRadius);
    const minY = Math.floor(this.position.y - this.playerHeight);
    const maxY = Math.floor(this.position.y);
    const minZ = Math.floor(this.position.z - this.playerRadius);
    const maxZ = Math.floor(this.position.z + this.playerRadius);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const block = this.world.getBlock(x, y, z);
          if (block !== BlockType.AIR && block !== BlockType.WATER) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private updateRaycast(): void {
    const maxDist = 5.5;
    const step = 0.05;
    const rayDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const current = this.position.clone();

    this.targetBlock = null;
    let prevX = Math.floor(current.x);
    let prevY = Math.floor(current.y);
    let prevZ = Math.floor(current.z);

    for (let dist = 0; dist < maxDist; dist += step) {
      current.addScaledVector(rayDir, step);
      const bx = Math.floor(current.x);
      const by = Math.floor(current.y);
      const bz = Math.floor(current.z);

      if (bx !== prevX || by !== prevY || bz !== prevZ) {
        const block = this.world.getBlock(bx, by, bz);
        if (block !== BlockType.AIR && block !== BlockType.WATER) {
          const normal: [number, number, number] = [prevX - bx, prevY - by, prevZ - bz];
          this.targetBlock = { x: bx, y: by, z: bz, normal };

          this.highlightBox.position.set(bx + 0.5, by + 0.5, bz + 0.5);
          this.highlightBox.visible = true;
          return;
        }
        prevX = bx;
        prevY = by;
        prevZ = bz;
      }
    }

    this.highlightBox.visible = false;
  }

  private handleBreakBlock(): void {
    if (!this.targetBlock) return;
    const { x, y, z } = this.targetBlock;
    const brokenType = this.world.getBlock(x, y, z);
    if (brokenType === BlockType.AIR) return;

    if (this.onBlockInteract) {
      const allowed = this.onBlockInteract({ x, y, z, type: brokenType, action: 'break' });
      if (!allowed) return;
    }

    this.world.setBlock(x, y, z, BlockType.AIR);
    // setBlock 내부에서 해당 16x16 청크만 초고속(0.1ms) 리빌드하여 끊김 현상 완전 제거!

    if (this.onBlockMinedSuccess) {
      this.onBlockMinedSuccess();
    }
  }

  private handlePlaceBlock(): void {
    if (!this.targetBlock) return;

    // 만약 바라보고 있는 대상 블록이 조합대라면 조합창 열기!
    const targetBlockType = this.world.getBlock(this.targetBlock.x, this.targetBlock.y, this.targetBlock.z);
    if (targetBlockType === BlockType.CRAFTING_TABLE) {
      if (this.onOpenCraftingTable) {
        this.onOpenCraftingTable();
        return;
      }
    }

    if (this.currentSelectedBlock === BlockType.AIR) return;
    const { x, y, z, normal } = this.targetBlock;
    const px = x + normal[0];
    const py = y + normal[1];
    const pz = z + normal[2];

    const minX = Math.floor(this.position.x - this.playerRadius);
    const maxX = Math.floor(this.position.x + this.playerRadius);
    const minY = Math.floor(this.position.y - this.playerHeight);
    const maxY = Math.floor(this.position.y);
    const minZ = Math.floor(this.position.z - this.playerRadius);
    const maxZ = Math.floor(this.position.z + this.playerRadius);

    if (px >= minX && px <= maxX && py >= minY && py <= maxY && pz >= minZ && pz <= maxZ) {
      return;
    }

    if (this.onBlockInteract) {
      const allowed = this.onBlockInteract({ x: px, y: py, z: pz, type: this.currentSelectedBlock, action: 'place' });
      if (!allowed) return;
    }

    this.world.setBlock(px, py, pz, this.currentSelectedBlock);
    // setBlock 내부에서 해당 16x16 청크만 초고속 리빌드
  }
}
