import * as THREE from 'three';
import { VoxelWorld } from '../core/VoxelWorld.ts';
import { BlockType, WORLD_SIZE, WORLD_HEIGHT, MAX_HP, ToolType, TOOL_METAS, BLOCK_BREAK_TIMES } from '../core/Constants.ts';
import { PlayerViewModel } from './PlayerViewModel.ts';

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

  // 1인칭 팔 및 장착 도구/블록 3D 뷰모델
  public viewModel: PlayerViewModel;

  // 10x10 구획 할당 & 개발자 권한
  public assignedPlotIndex: number = 1; // 기본 1번 대지 할당
  public bypassPlotRestriction: boolean = false; // 개발자 건축 제한 해제
  public isFlying: boolean = false; // 개발자 비행(플라이) 모드

  // HP & 서바이벌
  public hp: number = MAX_HP;
  public oxygen: number = 10.0;
  private damageCooldown: number = 0;
  private timeSinceLastDamage: number = 0;
  private regenTimer: number = 0;
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
  public onOpenChest?: (chestKey: string) => void;
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

    // 1인칭 팔 및 장착 도구/블록 3D 뷰모델 초기화
    this.viewModel = new PlayerViewModel(this.camera);

    this.setupEventListeners();
  }

  /**
   * 모달창(보관 상자, 조합대, 참여자 명단 등) 열림/닫힘 상태 설정
   * 모달이 열리면 캐릭터 조작 및 이동을 즉시 완전 차단하여 키패드/마우스 오작동 방지
   */
  public setModalOpen(open: boolean): void {
    this.isModalOpen = open;
    if (open) {
      // 모든 이동 키 및 물리 속도 초기화
      for (const k in this.keys) {
        this.keys[k] = false;
      }
      this.velocity.set(0, 0, 0);
      this.isMining = false;
      this.resetMiningProgress();
      this.setPointerLocked(false);
    }
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
          this.viewModel.triggerSwing();
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

      // 모달창이 열려있거나 텍스트 입력 중일 때는 게임 내 이동 키 입력 차단
      if (isInputActive || this.isModalOpen) {
        return;
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
      if (!this.isLocked || this.isModalOpen) return;
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
      if (!this.isLocked || this.isModalOpen) return;
      if (e.button === 0) {
        this.isMining = true;
        this.viewModel.triggerSwing();
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

    // 1인칭 팔 및 장착 도구/블록 3D 뷰모델 애니메이션 갱신
    const isMoving = !this.isModalOpen && (this.keys.KeyW || this.keys.KeyA || this.keys.KeyS || this.keys.KeyD);
    this.viewModel.update(
      delta,
      isMoving,
      this.isMining,
      this.currentTool,
      this.currentSelectedBlock,
      this.isModalOpen
    );
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

    // 2. 마그마 블록 접촉 및 근접 열기 피해 검사 (마그마 근처 1.5블록 접근 시 지속 피해)
    let isTouchingMagma = false;
    let isNearMagma = false;

    const feetBlockY = Math.floor(feetY);
    const headBlockY = Math.floor(headY);
    const minBx = Math.floor(this.position.x - 1.3);
    const maxBx = Math.floor(this.position.x + 1.3);
    const minBz = Math.floor(this.position.z - 1.3);
    const maxBz = Math.floor(this.position.z + 1.3);
    const minBy = Math.max(0, feetBlockY - 1);
    const maxBy = Math.min(WORLD_HEIGHT - 1, headBlockY + 1);

    for (let x = minBx; x <= maxBx; x++) {
      for (let y = minBy; y <= maxBy; y++) {
        for (let z = minBz; z <= maxBz; z++) {
          if (this.world.getBlock(x, y, z) === BlockType.MAGMA) {
            const cdx = (x + 0.5) - this.position.x;
            const cdy = (y + 0.5) - (feetY + 0.9);
            const cdz = (z + 0.5) - this.position.z;
            const distSq = cdx * cdx + cdy * cdy + cdz * cdz;

            if (distSq < 0.95) {
              isTouchingMagma = true;
            } else if (distSq < 2.5) {
              isNearMagma = true;
            }
          }
        }
      }
    }

    if (isTouchingMagma && this.damageCooldown <= 0) {
      this.takeDamage(20, '마그마를 직접 밟아 심한 화상을 입었습니다! 🔥');
      this.velocity.y = 6.0;
      this.damageCooldown = 0.8;
    } else if (isNearMagma && this.damageCooldown <= 0) {
      this.takeDamage(8, '마그마의 극심한 고열에 화상을 입고 있습니다! 🔥');
      this.damageCooldown = 1.0;
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

    // 4. [지시사항 3]: 데미지를 받지 않고 4.0초가 지나면 1초마다 조금씩 피가 다시 회복 (+5 HP)
    this.timeSinceLastDamage += delta;
    if (this.timeSinceLastDamage >= 4.0 && this.hp < MAX_HP && this.hp > 0) {
      this.regenTimer += delta;
      if (this.regenTimer >= 1.0) {
        this.regenTimer = 0;
        this.hp = Math.min(MAX_HP, this.hp + 5);
        this.renderHearts();
      }
    } else {
      this.regenTimer = 0;
    }
  }

  public takeDamage(amount: number, reason: string, isFromPlayer: boolean = false): void {
    if (isFromPlayer) return; // [수정사항 4]: 플레이어 간 상호 공격(PVP) 원천 차단
    this.hp -= amount;
    this.timeSinceLastDamage = 0;
    this.regenTimer = 0;
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
      const swimSpeed = 6.0;
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

      // [버그 수정 1]: 물 표면 근처에서 점프(Space)를 누르면 물 밖 블록/육지로 뛰어오르는 수면 도약
      const isHeadNearWaterSurface = !this.world.isPositionInWater(this.position.x, this.position.y - 0.3, this.position.z);
      if (this.keys.Space) {
        if (isHeadNearWaterSurface) {
          // 과도하지 않고 산뜻하게 수면 위로 뛰어오름 (6.8)
          this.velocity.y = 6.8;
        } else {
          // 깊은 물속 안정적인 상승 유영 (5.0)
          this.velocity.y = 5.0;
        }
      }

      // 수면 근처 자연스러운 부력 (가라앉지 않고 머리를 수면 위로 띄움)
      if (isHeadNearWaterSurface && this.velocity.y < 0) {
        this.velocity.y += 3.0 * delta;
      } else {
        // 깊은 물속 미세한 침강
        this.velocity.y -= 1.5 * delta;
      }
    } else {
      // [지상 보행 물리]
      const moveSpeed = 7.5;
      const gravity = 25.0;
      const jumpStrength = 7.4; // 1블록을 자연스럽고 묵직하게 뛰어넘는 마인크래프트 표준 점프력 (과도한 붕 뜸 방지)

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

    // [버그 수정 1]: X, Z축 이동 시 1블록 높이 턱을 부드럽게 타고 오르는 Step-Up(오토 클라이밍) 적용!
    // 물속에서 블록 위로 올라가거나, 지상에서 1단 블록 턱을 오를 때 걸림 없이 매끄럽게 통과
    const limit = Math.floor(WORLD_SIZE / 2) - 2;
    this.moveAxisWithStepUp('x', this.velocity.x * delta);
    this.position.x = Math.max(-limit, Math.min(limit, this.position.x));

    this.moveAxisWithStepUp('z', this.velocity.z * delta);
    this.position.z = Math.max(-limit, Math.min(limit, this.position.z));

    // 혹시라도 버그로 지하 바닥 아래로 뚫린 경우에만 리스폰
    if (this.position.y < -3) {
      this.spawnOnGround();
    }
  }

  /**
   * [버그 수정 1]: 1블록 턱 자동 오르기 (Step-Up / Auto-Jump)
   * 물속에서 블록 벽을 만나거나 지상에서 1블록 턱을 만났을 때,
   * 머리 위 공간이 비어있으면 1.10블록 턱 위로 자연스럽게 올라서도록 처리
   */
  private moveAxisWithStepUp(axis: 'x' | 'z', deltaVal: number): void {
    if (Math.abs(deltaVal) < 1e-6) return;

    const origPos = this.position[axis];
    const origY = this.position.y;
    this.position[axis] += deltaVal;

    if (!this.checkCollision()) {
      return; // 장애물 없이 정상 이동 완료
    }

    // 수평 이동 시 충돌 발생 -> Step-Up (최대 1.10블록 높이 턱 승강) 시도!
    this.position[axis] = origPos; // 일단 제자리 복귀

    const maxStep = 1.10;
    const stepInterval = 0.1;
    let success = false;

    for (let h = stepInterval; h <= maxStep + 0.01; h += stepInterval) {
      this.position.y = origY + h;
      this.position[axis] = origPos + deltaVal;

      if (!this.checkCollision()) {
        // 턱 위 공간으로 성공적으로 진입!
        success = true;
        // 남은 틈새만큼 아래로 살짝 안착시켜 붕 뜨지 않게 정렬
        for (let down = 0.05; down < h; down += 0.05) {
          this.position.y = origY + h - down;
          if (this.checkCollision()) {
            this.position.y = origY + h - down + 0.05;
            break;
          }
        }
        break;
      }
    }

    if (!success) {
      // 2블록 이상의 높은 벽이거나 천장이 막힌 경우 -> 원위치 복원 및 속도 0
      this.position.y = origY;
      this.position[axis] = origPos;
      if (axis === 'x') this.velocity.x = 0;
      else this.velocity.z = 0;
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
    if (targetBlockType === BlockType.CHEST) {
      if (this.onOpenChest) {
        const chestKey = `${this.targetBlock.x}_${this.targetBlock.y}_${this.targetBlock.z}`;
        this.onOpenChest(chestKey);
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

    // 1인칭 팔 스윙 연출
    this.viewModel.triggerSwing();
  }
}
