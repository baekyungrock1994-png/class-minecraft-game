import * as THREE from 'three';
import { VoxelWorld } from './core/VoxelWorld.ts';
import { PlayerController, BlockInteractEvent } from './game/PlayerController.ts';
import { HotbarUI } from './ui/Hotbar.ts';
import { CraftingUI } from './ui/CraftingUI.ts';
import { BlockType, ToolType, WorldType, WORLD_HEIGHT } from './core/Constants.ts';
import { NetworkManager, BlockDeltaData } from './core/NetworkManager.ts';

class GameApp {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private ambientLight: THREE.AmbientLight;
  private sunLight: THREE.DirectionalLight;

  private world: VoxelWorld;
  private player: PlayerController;
  private hotbar: HotbarUI;
  private craftingUI: CraftingUI;
  public networkManager: NetworkManager;

  private clock: THREE.Clock = new THREE.Clock();
  private startModal: HTMLElement;
  private notificationBanner: HTMLElement;
  private notificationText: HTMLElement;
  private mouseModeHint: HTMLElement;
  private roomDisplayEl: HTMLElement;
  private bannerTimeout?: number;
  private hasGameStarted: boolean = false;
  private portalCooldown: number = 0;

  // 개발자 모드 및 시간 조절
  private devPanel: HTMLElement;
  private timeSlider: HTMLInputElement;
  private timeDisplay: HTMLElement;
  private timeFlowCheckbox: HTMLInputElement;
  private plotSelector: HTMLSelectElement;
  private devBypassCheckbox: HTMLInputElement;
  private playerDisplayEl: HTMLElement;
  private currentZoneLabelEl: HTMLElement;

  // 대재앙 (홍수 & 마그마 분출) 시뮬레이션
  public isDisasterActive: boolean = false;
  private targetWaterY: number = 1.0;
  private currentWaterY: number = 1.0;
  private disasterStatusBadge: HTMLElement;
  private waterHeightVal: HTMLElement;
  private waterHeightSlider: HTMLInputElement;

  // 개발자 비행(플라이) 모드 요소
  private btnToggleFly: HTMLButtonElement;
  private flyStatusBadge: HTMLElement;
  private flyModePill: HTMLElement;

  private timeOfDay: number = 12.0; // 0 ~ 24 시간 단위 (기본 12:00 정오 화창한 낮)
  private isTimeAutoAdvancing: boolean = false; // [수정사항 3]: 시간의 흐름 시스템 삭제 (항상 밝은 상태 유지)
  private timeAdvanceSpeed: number = 0;

  constructor() {
    const container = document.getElementById('game-container')!;
    this.startModal = document.getElementById('click-to-play')!;
    this.notificationBanner = document.getElementById('notification-banner')!;
    this.notificationText = document.getElementById('notification-text')!;
    this.playerDisplayEl = document.getElementById('player-display')!;
    this.currentZoneLabelEl = document.getElementById('current-zone-label')!;
    this.mouseModeHint = document.getElementById('mouse-mode-hint')!;

    // 개발자 패널 요소
    this.devPanel = document.getElementById('dev-panel')!;
    this.timeSlider = document.getElementById('time-slider') as HTMLInputElement;
    this.timeDisplay = document.getElementById('time-display')!;
    this.timeFlowCheckbox = document.getElementById('time-flow-checkbox') as HTMLInputElement;
    this.plotSelector = document.getElementById('plot-selector') as HTMLSelectElement;
    this.devBypassCheckbox = document.getElementById('dev-bypass-checkbox') as HTMLInputElement;

    // 대재앙 패널 요소
    this.disasterStatusBadge = document.getElementById('disaster-status-badge')!;
    this.waterHeightVal = document.getElementById('water-height-val')!;
    this.waterHeightSlider = document.getElementById('water-height-slider') as HTMLInputElement;

    // 개발자 비행 모드 요소
    this.btnToggleFly = document.getElementById('btn-toggle-fly') as HTMLButtonElement;
    this.flyStatusBadge = document.getElementById('fly-status-badge')!;
    this.flyModePill = document.getElementById('fly-mode-pill')!;

    // 1. Three.js 기본 씬 & 카메라
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // 맑은 하늘색
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.012); // 넓은 원경 안개

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);

    // 2. 고성능 렌더러
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // 3. 조명 (태양광 + 환경광)
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfff8e7, 1.25);
    this.sunLight.position.set(40, 80, 30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 180;
    const d = 45;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    // 4. 복셀 월드 및 플레이어
    this.world = new VoxelWorld(this.scene);
    this.player = new PlayerController(this.camera, this.scene, this.world);

    // 5. 핫바 UI 및 생존/도구 시스템 연동
    this.hotbar = new HotbarUI('hotbar');
    this.updatePlayerSelectedItem();

    this.hotbar.onSelectChange = () => {
      this.updatePlayerSelectedItem();
    };

    // 도구 파괴 이벤트
    this.hotbar.onToolBreak = (toolName: string) => {
      this.showNotification(`쨍그랑! ${toolName}의 내구도가 다해 부서졌습니다!`, '💥');
      this.updatePlayerSelectedItem();
    };

    // 채굴 성공 시 도구 내구도 소모
    this.player.onBlockMinedSuccess = () => {
      this.hotbar.useCurrentTool();
    };

    // 플레이어 사망 시 알림
    this.player.onPlayerDeath = (reason: string) => {
      this.showNotification(reason, '💀');
    };

    // 블록 인터랙션 (채굴 / 설치) 규칙 연결
    this.player.onBlockInteract = (event: BlockInteractEvent) => this.handleBlockInteract(event);

    // 조합대 및 제작(Crafting) 시스템 연동
    this.craftingUI = new CraftingUI(this.hotbar);
    this.player.onOpenCraftingTable = () => {
      this.player.isModalOpen = true;
      this.craftingUI.open();
    };
    this.craftingUI.onClose = () => {
      this.player.isModalOpen = false;
      this.requestPointerLockSafely();
    };
    this.craftingUI.onCraftSuccess = (msg: string) => {
      this.showNotification(msg, '🛠️');
      this.updatePlayerSelectedItem();
    };

    // [수정사항 2]: 핫바 9번 '마을 귀환석' 우클릭 사용 시 평지 마을(내 대지)로 즉시 귀환
    this.player.onUseItem = () => {
      const slot = this.hotbar.getSelectedSlot();
      if (slot.isItem && slot.itemType === 'RETURN_STONE') {
        if (this.world.currentWorldType === 'resource') {
          this.switchWorld('town');
          this.showNotification('🧭 마을 귀환석을 사용하여 평지 마을(내 대지)로 귀환했습니다!', '✨');
        } else {
          this.teleportToMyPlot();
          this.showNotification(`📍 마을 귀환석을 사용하여 내 대지(#${this.player.assignedPlotIndex}) 중심으로 이동했습니다!`, '🏡');
        }
        this.requestPointerLockSafely();
        return true;
      }
      return false;
    };

    const btnOpenCrafting = document.getElementById('btn-open-crafting');
    if (btnOpenCrafting) {
      btnOpenCrafting.addEventListener('click', (e) => {
        e.stopPropagation();
        this.player.isModalOpen = true;
        this.craftingUI.open();
      });
    }

    this.roomDisplayEl = document.getElementById('room-display')!;
    this.networkManager = new NetworkManager(this.scene);
    this.setupNetworkCallbacks();
    this.setupAuthModal();

    // 6. 이벤트 및 UI 초기화
    this.setupPointerLock();
    this.setupWindowResize();
    this.setupWorldTabs();
    this.setupDevTools();

    // 초기 시간 및 구획 UI 갱신
    this.setTime(12.0);
    this.initPlotSelectorUI();

    // 7. 게임 루프 시작
    this.animate();
  }

  private updatePlayerSelectedItem(): void {
    const slot = this.hotbar.getSelectedSlot();
    if (slot.isTool) {
      this.player.currentTool = this.hotbar.getSelectedTool();
      this.player.currentSelectedBlock = BlockType.AIR; // 도구 들고 있을 땐 건축 불가
    } else {
      this.player.currentTool = ToolType.NONE;
      this.player.currentSelectedBlock = this.hotbar.getSelectedBlock();
    }
  }

  /**
   * 블록 인터랙션 검사 (채굴 및 10x10 대지 건축/수정 제한 / 다른 학생 건축물 보호 + 관리자 권한)
   */
  private handleBlockInteract(event: BlockInteractEvent): boolean {
    const isResourceWorld = this.world.currentWorldType === 'resource';
    const isTeacher = (this.networkManager && this.networkManager.role === 'teacher') || this.player.bypassPlotRestriction;

    // 1. 채굴 / 파괴 동작 (break)
    if (event.action === 'break') {
      if (isResourceWorld) {
        // 자원 구역(개발도상국): 학생, 교사 모두 자유롭게 채굴 가능
        this.hotbar.addResource(event.type, 1);
        this.networkManager.sendBlockDelta(this.world.currentWorldType, event.x, event.y, event.z, BlockType.AIR);
        return true;
      } else {
        // 평지 주거 마을 (town)
        // 기반암(Y <= 0)은 파괴 불가
        if (event.y <= 0) {
          this.showNotification('바닥 기반암은 채굴할 수 없습니다!', '🛑');
          return false;
        }

        // 교사(관리자)는 모든 학생의 대지 및 공용 구역 건축물을 자유롭게 수정(파괴) 가능
        if (isTeacher) {
          this.hotbar.addResource(event.type, 1);
          this.networkManager.sendBlockDelta(this.world.currentWorldType, event.x, event.y, event.z, BlockType.AIR);
          return true;
        }

        // --- 일반 학생의 파괴/수정 제한 ---
        const plot = this.world.getPlotAt(event.x, event.z);

        // 1) 마을 공용 구역(도로, 광장) 파괴 시도 차단
        if (!plot) {
          this.showNotification('🚫 마을 공용 도로 및 광장의 블록은 파괴할 수 없습니다!', '🛑');
          return false;
        }

        // 2) 다른 학생의 대지 파괴 시도 차단 (다른 사람 구역 및 건축물 절대 수정 불가!)
        if (plot.id !== this.player.assignedPlotIndex) {
          this.showNotification(`🚫 [대지 #${plot.id}]은 다른 친구의 구역입니다! 다른 학생의 건축물은 수정할 수 없습니다.`, '🛡️');
          return false;
        }

        // 3) 본인 대지 내 포탈 문 파괴 방지
        if (this.world.isPortalBlock(event.x, event.y, event.z)) {
          this.showNotification('🌀 자원 구역 이동 문은 파괴할 수 없습니다!', '🔒');
          return false;
        }

        // 본인 대지(#assignedPlotIndex) 내 정상 파괴
        this.hotbar.addResource(event.type, 1);
        this.networkManager.sendBlockDelta(this.world.currentWorldType, event.x, event.y, event.z, BlockType.AIR);
        return true;
      }
    } else if (event.action === 'place') {
      // 2. 건축 / 블록 설치 동작 (place)
      if (isResourceWorld) {
        // [수정사항 2]: 자원 채취 구역(개발도상국)에서는 건축 절대 불가! (단, 관리자 예외)
        if (!isTeacher) {
          this.showNotification('🚫 자원 구역(개발도상국)에서는 집을 지을 수 없습니다! 채취만 가능합니다.', '⛏️');
          return false;
        }
      }

      // 평지 주거 마을 (town)
      if (!isResourceWorld) {
        // 교사(관리자)는 모든 대지 및 공용 구역에 자유롭게 건축 가능
        if (!isTeacher) {
          const plot = this.world.getPlotAt(event.x, event.z);

          // 1) 마을 공용 구역(도로, 광장) 건축 차단
          if (!plot) {
            this.showNotification(`🚫 마을 공용 도로에는 건축할 수 없습니다! 나만의 대지(#${this.player.assignedPlotIndex}) 안에서만 집을 지어주세요.`, '🛡️');
            return false;
          }

          // 2) 다른 학생의 대지 건축 차단
          if (plot.id !== this.player.assignedPlotIndex) {
            this.showNotification(`🚫 [대지 #${plot.id}]은 다른 학생의 구역입니다! 할당받은 나만의 대지(#${this.player.assignedPlotIndex}) 안에서만 건축할 수 있습니다!`, '🛡️');
            return false;
          }
        }
      }

      // 인벤토리 자원 소모 검사 (교사는 자원 없어도 건축 가능)
      if (!isTeacher) {
        const success = this.hotbar.consumeResource(event.type, 1);
        if (!success) {
          this.showNotification('해당 블록의 자원이 부족합니다! 자원 구역에서 채취해보세요.', '⚠️');
          return false;
        }
      } else {
        this.hotbar.consumeResource(event.type, 1);
      }

      // 실시간 네트워크로 블록 설치 전파
      this.networkManager.sendBlockDelta(this.world.currentWorldType, event.x, event.y, event.z, event.type);
      return true;
    }
    return true;
  }

  /**
   * 월드 텔레포트 탭 바 설정
   */
  private setupWorldTabs(): void {
    const btnTown = document.getElementById('btn-world-town')!;
    const btnResource = document.getElementById('btn-world-resource')!;
    const btnQuickReturn = document.getElementById('btn-quick-return');

    btnTown.addEventListener('click', (e) => {
      e.stopPropagation();
      this.switchWorld('town');
      this.requestPointerLockSafely();
    });

    btnResource.addEventListener('click', (e) => {
      e.stopPropagation();
      this.switchWorld('resource');
      this.requestPointerLockSafely();
    });

    if (btnQuickReturn) {
      btnQuickReturn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.switchWorld('town');
        this.requestPointerLockSafely();
      });
    }
  }

  /**
   * 월드 전환 (평지 마을 <-> 개발도상국 자원구역)
   */
  public switchWorld(target: WorldType): void {
    if (this.world.currentWorldType === target) return;

    this.world.switchWorld(target);

    const btnTown = document.getElementById('btn-world-town')!;
    const btnResource = document.getElementById('btn-world-resource')!;
    const btnQuickReturn = document.getElementById('btn-quick-return');

    if (target === 'town') {
      btnTown.classList.add('active');
      btnResource.classList.remove('active');
      if (btnQuickReturn) btnQuickReturn.classList.add('hidden');
      this.currentZoneLabelEl.textContent = '마을 평지 (주거지)';
      this.showNotification('🏡 평지 마을로 이동했습니다! 나만의 10x10 대지에 집을 지어보세요.', '✨');

      // 플레이어를 자신의 대지로 텔레포트
      this.teleportToMyPlot();
    } else {
      btnResource.classList.add('active');
      btnTown.classList.remove('active');
      if (btnQuickReturn) btnQuickReturn.classList.remove('hidden');
      this.currentZoneLabelEl.textContent = '자원 구역 (개발도상국)';
      this.showNotification('⛏️ 자원 구역(개발도상국)으로 이동했습니다! [ 키 또는 9번 귀환석으로 언제든 귀환 가능합니다.', '🌲');

      // 자원 월드 스폰 위치로 텔레포트
      this.teleportToResourceWorld();
    }

    // [수정사항 1]: 월드 전환 시 마우스 포인터 락 안전하게 유지/복구 (로딩 멈춤 느낌 원천 해결)
    this.requestPointerLockSafely();
  }

  private teleportToMyPlot(): void {
    const plot = this.world.plots.find(p => p.id === this.player.assignedPlotIndex);
    const tx = plot ? plot.centerX : 0;
    const tz = plot ? plot.centerZ : 0;
    const ix = Math.floor(tx);
    const iz = Math.floor(tz);
    let highestY = 4;
    for (let y = WORLD_HEIGHT - 1; y >= 4; y--) {
      if (this.world.getBlock(ix, y, iz) !== BlockType.AIR) {
        highestY = y;
        break;
      }
    }
    this.player.teleport(tx + 0.5, highestY + 1.0 + this.player.playerHeight + 0.1, tz + 0.5);
  }

  private teleportToResourceWorld(): void {
    let groundY = 5;
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const b = this.world.getBlock(0, y, 0);
      if (b !== BlockType.AIR && b !== BlockType.LEAF) {
        groundY = y;
        break;
      }
    }
    this.player.teleport(0.5, groundY + 1.0 + this.player.playerHeight + 0.1, 0.5);
  }

  /**
   * 개발자 도구 패널 이벤트 설정
   */
  private setupDevTools(): void {
    const btnToggleDev = document.getElementById('btn-toggle-dev')!;
    const btnCloseDev = document.getElementById('btn-close-dev')!;

    btnToggleDev.addEventListener('click', (e) => {
      e.stopPropagation();
      btnToggleDev.blur();
      this.toggleDevPanel();
    });

    btnCloseDev.addEventListener('click', (e) => {
      e.stopPropagation();
      btnCloseDev.blur();
      this.devPanel.classList.add('hidden');
      this.player.isModalOpen = false;
      this.requestPointerLockSafely();
    });

    // 1. 시간 슬라이더 인풋 이벤트
    this.timeSlider.addEventListener('input', () => {
      const val = parseFloat(this.timeSlider.value);
      this.setTime(val);
    });

    // 시간 프리셋 버튼들
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const t = parseFloat(btn.getAttribute('data-time') || '12');
        this.setTime(t);
      });
    });

    // 시간 자동 진행 체크박스
    this.timeFlowCheckbox.addEventListener('change', () => {
      this.isTimeAutoAdvancing = this.timeFlowCheckbox.checked;
    });

    // 2. 10x10 대지 할당 변경
    this.plotSelector.addEventListener('change', () => {
      const plotId = parseInt(this.plotSelector.value);
      this.player.assignedPlotIndex = plotId;
      this.playerDisplayEl.textContent = `나의 대지 (#${plotId})`;
      this.showNotification(`내 대지가 [대지 #${plotId}]로 변경되었습니다!`, '📍');
    });

    // 내 대지로 이동 버튼
    const btnTeleportPlot = document.getElementById('btn-teleport-plot')!;
    btnTeleportPlot.addEventListener('click', () => {
      if (this.world.currentWorldType !== 'town') {
        this.switchWorld('town');
      } else {
        this.teleportToMyPlot();
        this.showNotification(`나의 대지(#${this.player.assignedPlotIndex})로 텔레포트했습니다!`, '🚀');
      }
    });

    // 개발자 건축 제한 해제 체크박스
    this.devBypassCheckbox.addEventListener('change', () => {
      this.player.bypassPlotRestriction = this.devBypassCheckbox.checked;
      if (this.player.bypassPlotRestriction) {
        this.showNotification('🛠️ 개발자 권한: 모든 영역에 자유 건축이 허용되었습니다!', '🔓');
      } else {
        this.showNotification('🔒 개발자 권한 해제: 10x10 내 대지에서만 건축 가능합니다.', '🛡️');
      }
    });

    // 2-1. 특정 대지(구역) 건축물 초기화 버튼 (장난/훼손 복구용)
    const btnResetSpecificPlot = document.getElementById('btn-reset-specific-plot');
    const resetPlotSelector = document.getElementById('reset-plot-selector') as HTMLSelectElement | null;

    if (btnResetSpecificPlot && resetPlotSelector) {
      btnResetSpecificPlot.addEventListener('click', async (e) => {
        e.stopPropagation();
        const targetPlotId = parseInt(resetPlotSelector.value);
        const plot = this.world.plots.find(p => p.id === targetPlotId);
        if (!plot) return;

        const isConfirmed = window.confirm(
          `[선생님 확인] 정말로 [대지 #${targetPlotId}]의 모든 건축물을 초기화하시겠습니까?\n\n` +
          `• 해당 대지에 지어진 모든 블록이 삭제되고 기본 평지로 즉시 복구됩니다.\n` +
          `• 특정 학생이 부적절한 건축물이나 장난을 쳤을 때 유용합니다.\n` +
          `• 모든 접속 학생의 화면에도 실시간으로 깨끗하게 초기화됩니다.`
        );

        if (!isConfirmed) return;

        btnResetSpecificPlot.setAttribute('disabled', 'true');
        btnResetSpecificPlot.textContent = '초기화 진행 중...';

        try {
          await this.networkManager.sendPlotReset(targetPlotId, plot);
          this.world.resetPlot(targetPlotId);
          this.showNotification(`🧹 [대지 #${targetPlotId}] 건축물이 깨끗하게 초기화되어 평지로 복구되었습니다!`, '✅');
        } catch (err: any) {
          this.showNotification('대지 초기화 실패: ' + (err.message || err), '❌');
        } finally {
          btnResetSpecificPlot.removeAttribute('disabled');
          btnResetSpecificPlot.textContent = '🧹 선택한 대지 건축물 즉시 초기화';
        }
      });
    }

    // 자원 지급 편의 버튼
    const btnGiveRes = document.getElementById('btn-give-resources')!;
    btnGiveRes.addEventListener('click', () => {
      this.hotbar.addResource(BlockType.WOOD, 64);
      this.hotbar.addResource(BlockType.DIRT, 64);
      this.hotbar.addResource(BlockType.STONE, 64);
      this.hotbar.addResource(BlockType.PLANK, 64);
      this.hotbar.addItem('STICK', 64);
      this.showNotification('💎 기본 제작 재료(원목, 돌, 흙, 목재, 막대기) +64개가 지급되었습니다!', '📦');
    });

    // 도구 내구도 리셋 버튼
    const btnResetTools = document.getElementById('btn-reset-tools')!;
    btnResetTools.addEventListener('click', () => {
      this.hotbar.slots.forEach((s) => {
        if (s.isTool && s.maxDurability) {
          s.durability = s.maxDurability;
        }
      });
      this.hotbar.render();
      this.showNotification('🔧 모든 도구의 내구도가 100% 충전되었습니다!', '✨');
    });

    // 3. 환경 대재앙 시뮬레이터 이벤트 연동
    const btnTriggerDisaster = document.getElementById('btn-trigger-disaster')!;
    btnTriggerDisaster.addEventListener('click', () => {
      if (this.world.currentWorldType !== 'town') {
        this.switchWorld('town');
      }
      this.triggerDisaster();
    });

    const btnResetDisaster = document.getElementById('btn-reset-disaster')!;
    btnResetDisaster.addEventListener('click', () => {
      this.resetDisaster();
    });

    this.waterHeightSlider.addEventListener('input', () => {
      const val = parseFloat(this.waterHeightSlider.value);
      this.targetWaterY = val;
      this.world.disasterWaterLevel = val;
      this.world.disasterWaterMesh.visible = true;
      this.waterHeightVal.textContent = `Y = ${val.toFixed(1)}${val >= 4 ? ' (침수 중)' : ''}`;
    });

    // 4. 개발자 비행(플라이) 모드 토글 버튼
    if (this.btnToggleFly) {
      this.btnToggleFly.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFlyMode();
      });
    }
  }

  /**
   * 개발자 비행(플라이) 모드 토글
   */
  public toggleFlyMode(): void {
    const isFlying = this.player.toggleFlying();
    this.updateFlyUI(isFlying);
    if (isFlying) {
      this.showNotification('✈️ [비행 모드 활성화] Space:상승 / Shift:하강 / WASD로 하늘을 자유롭게 날아다닙니다!', '🚀');
    } else {
      this.showNotification('🛬 [비행 모드 종료] 안전하게 지상에 착륙했습니다.', '✨');
    }
  }

  private updateFlyUI(isFlying: boolean): void {
    if (this.btnToggleFly) {
      if (isFlying) {
        this.btnToggleFly.classList.add('active');
        this.btnToggleFly.innerHTML = '🛬 비행 중지 (착륙하기)';
      } else {
        this.btnToggleFly.classList.remove('active');
        this.btnToggleFly.innerHTML = '✈️ 하늘 날기 (비행 모드 켜기)';
      }
    }
    if (this.flyStatusBadge) {
      this.flyStatusBadge.textContent = isFlying ? '비행 중 (활성)' : '비행 비활성화';
      this.flyStatusBadge.style.color = isFlying ? '#c4b5fd' : '';
      this.flyStatusBadge.style.borderColor = isFlying ? '#8b5cf6' : '';
    }
    if (this.flyModePill) {
      if (isFlying) {
        this.flyModePill.classList.remove('hidden');
      } else {
        this.flyModePill.classList.add('hidden');
      }
    }
  }

  /**
   * [Phase 3] 환경 대재앙 발동: 해수면 급상승(홍수) 및 마그마 분출
   */
  public triggerDisaster(): void {
    this.isDisasterActive = true;
    this.world.isDisasterActive = true;
    this.targetWaterY = 6.8; // 평지 Y=4 위로 2.8블록 차오름 (집 1층 수몰)
    this.world.disasterWaterLevel = this.targetWaterY;
    this.world.disasterWaterMesh.visible = true;
    this.world.triggerMagmaEruption();

    this.disasterStatusBadge.textContent = '🔥 대재앙 발생 중!';
    this.disasterStatusBadge.style.color = '#ef4444';
    this.disasterStatusBadge.style.borderColor = '#ef4444';

    this.showNotification('🚨 [환경 대재앙 발동] 해수면이 폭주하고 지열 마그마가 솟구칩니다! 높은 곳으로 대피하세요!', '🌋');
  }

  /**
   * 평화 상태 복구 / 리셋
   */
  public resetDisaster(): void {
    this.isDisasterActive = false;
    this.world.isDisasterActive = false;
    this.targetWaterY = 1.0;
    this.world.disasterWaterLevel = 1.0;
    this.world.disasterWaterMesh.visible = false;
    this.world.clearMagmaEruption();

    this.disasterStatusBadge.textContent = '평화 상태';
    this.disasterStatusBadge.style.color = '';
    this.disasterStatusBadge.style.borderColor = '';

    this.setTime(this.timeOfDay); // 원래 시간 조명 복귀
    this.showNotification('🕊️ 환경이 정화되어 수위가 내려가고 마그마가 굳어 평화가 찾아왔습니다.', '✨');
  }

  private toggleDevPanel(): void {
    if (this.networkManager && this.networkManager.role !== 'teacher') {
      return; // 학생은 개발자 도구 열람 불가
    }
    if (document.activeElement && typeof (document.activeElement as HTMLElement).blur === 'function') {
      (document.activeElement as HTMLElement).blur();
    }
    const isHidden = this.devPanel.classList.contains('hidden');
    if (isHidden) {
      this.devPanel.classList.remove('hidden');
      this.player.isModalOpen = true;
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } else {
      this.devPanel.classList.add('hidden');
      this.player.isModalOpen = false;
      this.requestPointerLockSafely();
    }
  }

  /**
   * 10x10 구획 셀렉터 옵션 초기화 (대지 #1 ~ #16)
   */
  private initPlotSelectorUI(): void {
    this.plotSelector.innerHTML = '';
    const resetSelector = document.getElementById('reset-plot-selector') as HTMLSelectElement | null;
    if (resetSelector) resetSelector.innerHTML = '';

    this.world.plots.forEach(plot => {
      const opt = document.createElement('option');
      opt.value = plot.id.toString();
      opt.textContent = `${plot.name} (중심: X=${Math.round(plot.centerX)}, Z=${Math.round(plot.centerZ)})`;
      if (plot.id === this.player.assignedPlotIndex) {
        opt.selected = true;
      }
      this.plotSelector.appendChild(opt);

      if (resetSelector) {
        const resetOpt = document.createElement('option');
        resetOpt.value = plot.id.toString();
        resetOpt.textContent = `${plot.name} 건축물`;
        resetSelector.appendChild(resetOpt);
      }
    });
  }

  /**
   * [개발자용 1]: 시간 조절 슬라이더 및 동적 낮/밤/노을 환경 렌더링
   */
  public setTime(time: number): void {
    this.timeOfDay = (time % 24 + 24) % 24;
    this.timeSlider.value = this.timeOfDay.toFixed(1);

    // 시간 문자열 포맷팅 (HH:MM)
    const hours = Math.floor(this.timeOfDay);
    const minutes = Math.floor((this.timeOfDay - hours) * 60);
    const hh = hours.toString().padStart(2, '0');
    const mm = minutes.toString().padStart(2, '0');

    let phaseName = '낮';
    if (this.timeOfDay >= 5 && this.timeOfDay < 7) phaseName = '새벽 / 일출';
    else if (this.timeOfDay >= 7 && this.timeOfDay < 17) phaseName = '화창한 낮';
    else if (this.timeOfDay >= 17 && this.timeOfDay < 19.5) phaseName = '붉은 노을 / 일몰';
    else phaseName = '별빛 밤하늘';

    this.timeDisplay.textContent = `${hh}:${mm} (${phaseName})`;

    // 태양/달 궤도 및 조도 계산
    // 0시 = 바닥(-Y), 6시 = 동쪽(+X), 12시 = 머리 위(+Y), 18시 = 서쪽(-X)
    const angle = (this.timeOfDay / 24) * Math.PI * 2 - Math.PI / 2;
    const sunDist = 90;
    const sunX = Math.cos(angle) * sunDist;
    const sunY = Math.sin(angle) * sunDist;
    const sunZ = 30;

    this.sunLight.position.set(sunX, Math.max(-50, sunY), sunZ);

    // 시간에 따른 하늘색, 안개색, 빛 색상 보간
    const skyColor = new THREE.Color();
    const fogColor = new THREE.Color();
    const sunColor = new THREE.Color();

    if (this.timeOfDay >= 7 && this.timeOfDay < 17) {
      // 1. 화창한 한낮
      skyColor.setHex(0x87ceeb);
      fogColor.setHex(0x87ceeb);
      sunColor.setHex(0xfff8e7);
      this.sunLight.intensity = 1.25;
      this.ambientLight.intensity = 0.75;
    } else if (this.timeOfDay >= 17 && this.timeOfDay < 19.5) {
      // 2. 황혼 & 노을
      const t = (this.timeOfDay - 17) / 2.5;
      skyColor.setHex(0x87ceeb).lerp(new THREE.Color(0xd9532f), t);
      fogColor.setHex(0x87ceeb).lerp(new THREE.Color(0xc2410c), t);
      sunColor.setHex(0xfb923c);
      this.sunLight.intensity = 1.0 - t * 0.4;
      this.ambientLight.intensity = 0.65 - t * 0.3;
    } else if (this.timeOfDay >= 5 && this.timeOfDay < 7) {
      // 3. 여명 & 일출
      const t = (this.timeOfDay - 5) / 2.0;
      skyColor.setHex(0x0f172a).lerp(new THREE.Color(0x87ceeb), t);
      fogColor.setHex(0x0f172a).lerp(new THREE.Color(0x87ceeb), t);
      sunColor.setHex(0xfde047);
      this.sunLight.intensity = 0.4 + t * 0.7;
      this.ambientLight.intensity = 0.25 + t * 0.45;
    } else {
      // 4. 깊은 밤 (자정)
      skyColor.setHex(0x0a101f);
      fogColor.setHex(0x0a101f);
      sunColor.setHex(0x60a5fa); // 푸르스름한 은은한 달빛
      this.sunLight.intensity = 0.25;
      this.ambientLight.intensity = 0.2;
    }

    this.scene.background = skyColor;
    if (this.scene.fog) {
      (this.scene.fog as THREE.FogExp2).color.copy(fogColor);
    }
    this.sunLight.color.copy(sunColor);
  }

  private showNotification(msg: string, icon: string = '📢'): void {
    this.notificationText.textContent = msg;
    const iconEl = document.getElementById('notification-icon');
    if (iconEl) iconEl.innerHTML = icon;

    this.notificationBanner.classList.remove('hidden');
    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    this.bannerTimeout = window.setTimeout(() => {
      this.notificationBanner.classList.add('hidden');
    }, 2800);
  }

  public requestPointerLockSafely(): void {
    if (!this.hasGameStarted) return;
    if (this.craftingUI && this.craftingUI.isOpen) return;
    if (document.pointerLockElement === this.renderer.domElement) return;

    if (!this.devPanel.classList.contains('hidden')) {
      this.devPanel.classList.add('hidden');
    }

    try {
      const p = this.renderer.domElement.requestPointerLock() as any;
      if (p && typeof p.catch === 'function') {
        p.catch((err: any) => {
          console.warn('Pointer lock request could not be fulfilled immediately:', err);
        });
      }
    } catch (e) {
      console.warn('Pointer lock request error:', e);
    }
  }

  private setupPointerLock(): void {
    const canvas = this.renderer.domElement;
    const container = document.getElementById('game-container')!;

    // 1. 캔버스 및 컨테이너 클릭 시 즉시 1인칭 조작 복귀
    canvas.addEventListener('click', () => {
      this.requestPointerLockSafely();
    });

    container.addEventListener('click', () => {
      this.requestPointerLockSafely();
    });

    // 2. 마우스 자유 모드 힌트 칩 클릭 시 즉시 1인칭 조작 복귀
    this.mouseModeHint.addEventListener('click', (e) => {
      e.stopPropagation();
      this.requestPointerLockSafely();
    });

    // 3. 화면 클릭/마우스다운 시 안전하게 1인칭 복귀 (상단 바/핫바/패널 외 클릭 시 즉시 락)
    const handleScreenInteractToLock = (e: MouseEvent) => {
      if (!this.hasGameStarted) return;
      if (document.pointerLockElement === canvas) return;
      if (this.craftingUI && this.craftingUI.isOpen) return;
      if (!this.devPanel.classList.contains('hidden')) return;

      const target = e.target as HTMLElement;
      if (
        target.closest('#top-bar') ||
        target.closest('#hotbar') ||
        target.closest('#crafting-modal') ||
        target.closest('#dev-panel') ||
        target.closest('#click-to-play')
      ) {
        return;
      }
      this.requestPointerLockSafely();
    };

    window.addEventListener('click', handleScreenInteractToLock);
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        handleScreenInteractToLock(e);
      }
    });

    // 4. 포인터 락 상태 변경 이벤트 (마우스 튀어나감 및 상단 버튼 오클릭 완벽 차단)
    document.addEventListener('pointerlockchange', () => {
      const isLocked = document.pointerLockElement === canvas;
      this.player.setPointerLocked(isLocked);

      if (isLocked) {
        // 게임 중에는 상단 버튼의 포인터 이벤트 원천 차단하여 오클릭 방지
        document.body.classList.add('pointer-locked-mode');
        // 포커스된 버튼이 남아 스페이스바로 클릭되는 현상 방지
        if (document.activeElement && typeof (document.activeElement as HTMLElement).blur === 'function') {
          (document.activeElement as HTMLElement).blur();
        }
        this.startModal.classList.add('hidden');
        this.mouseModeHint.classList.add('hidden');
        this.devPanel.classList.add('hidden');
        this.player.isModalOpen = false;
        if (this.craftingUI && this.craftingUI.isOpen) {
          this.craftingUI.close();
        }
      } else {
        document.body.classList.remove('pointer-locked-mode');
        // ESC를 누르거나 마우스가 풀렸을 때:
        if (this.hasGameStarted) {
          this.startModal.classList.add('hidden');
          this.mouseModeHint.classList.remove('hidden');
        } else {
          this.startModal.classList.remove('hidden');
        }
      }
    });

    // 버튼 클릭 후 포커스가 남아 스페이스바(점프) 입력 시 버튼이 재클릭되는 브라우저 기본 동작 원천 차단
    window.addEventListener('mouseup', () => {
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'BUTTON' || active.classList.contains('world-tab') || active.classList.contains('dev-toggle-btn'))) {
        active.blur();
      }
    });

    // 5. 브라우저 포인터 락 거부/오류 방어
    document.addEventListener('pointerlockerror', () => {
      console.warn('Pointer lock request error handled');
    });

    // 6. 편의 단축키: 오직 F2 키만 교사 권한일 때 개발자 패널 토글 (실수 유발하는 Backquote 키 제거)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F2') {
        if (this.networkManager.role !== 'teacher') return;
        e.preventDefault();
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
        this.toggleDevPanel();
      }

      // [수정사항 2]: '[' 키를 누르면 평지 마을(내 대지)로 즉시 귀환!
      if (e.code === 'BracketLeft' || e.key === '[') {
        e.preventDefault();
        if (this.world.currentWorldType === 'resource') {
          this.switchWorld('town');
          this.showNotification('🏡 [ 키를 눌러 평지 마을(내 대지)로 귀환했습니다!', '✨');
        } else {
          this.teleportToMyPlot();
          this.showNotification(`📍 [ 키를 눌러 내 대지(#${this.player.assignedPlotIndex}) 중심으로 이동했습니다!`, '🏡');
        }
        this.requestPointerLockSafely();
      }

      // [개발자 기능]: 'F' 키를 누르면 비행 모드 온/오프 즉시 토글 (교사 전용)
      if (e.code === 'KeyF' && !this.player.isModalOpen && !['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        if (this.networkManager.role === 'teacher') {
          e.preventDefault();
          this.toggleFlyMode();
        }
      }
    });
  }

  /**
   * 실시간 멀티플레이 네트워크 콜백 등록
   */
  private setupNetworkCallbacks(): void {
    // 1. 다른 플레이어가 설치/파괴한 블록 실시간 수신
    this.networkManager.onBlockUpdate = (delta: BlockDeltaData) => {
      if (delta.worldType === this.world.currentWorldType) {
        this.world.setBlock(delta.x, delta.y, delta.z, delta.blockType);
      } else {
        const key = `${delta.x},${delta.y},${delta.z}`;
        if (delta.worldType === 'town') {
          if (delta.blockType === BlockType.AIR) {
            this.world.townBlocks.delete(key);
          } else {
            this.world.townBlocks.set(key, delta.blockType);
          }
        } else {
          if (delta.blockType === BlockType.AIR) {
            this.world.resourceBlocks.delete(key);
          } else {
            this.world.resourceBlocks.set(key, delta.blockType);
          }
        }
      }
    };

    // 2. 방 초기화(교사 리셋) 감지
    this.networkManager.onRoomReset = () => {
      this.world.townBlocks.clear();
      this.world.generateTownTerrain();
      this.world.rebuildAllChunksForWorld('town');
      this.showNotification('선생님이 마을 건축물을 초기화했습니다!', '📢');
    };

    // 3. 플레이어 목록 갱신 (접속자 수 실시간 표시)
    this.networkManager.onPlayerListUpdate = (players) => {
      const code = this.networkManager.roomCode;
      const count = players.length;
      if (this.networkManager.role === 'teacher') {
        this.roomDisplayEl.textContent = `[#${code}] 👑 ${count}/16명`;
      } else {
        this.roomDisplayEl.textContent = `[#${code}] 우리 반 (${count}/16명)`;
      }
    };

    // 4. 교사의 특정 대지(구역) 초기화 실시간 수신
    this.networkManager.onPlotReset = (plotId: number) => {
      this.world.resetPlot(plotId);
      this.showNotification(`🧹 [대지 #${plotId}] 건축물이 선생님에 의해 초기 상태로 복구되었습니다!`, '✨');
    };
  }

  /**
   * 로그인 및 방 생성/참가 모달 이벤트 (2단계 구조: 1단계 역할 선택 -> 2단계 정보 입력)
   */
  private setupAuthModal(): void {
    const authStepSelect = document.getElementById('auth-step-select')!;
    const authStepTeacher = document.getElementById('auth-step-teacher')!;
    const authStepStudent = document.getElementById('auth-step-student')!;

    const btnSelectTeacher = document.getElementById('btn-select-teacher')!;
    const btnSelectStudent = document.getElementById('btn-select-student')!;
    const btnBackTeacher = document.getElementById('btn-back-teacher')!;
    const btnBackStudent = document.getElementById('btn-back-student')!;

    const teacherNameInput = document.getElementById('teacher-name-input') as HTMLInputElement;
    const roomTitleInput = document.getElementById('room-title-input') as HTMLInputElement;
    const btnCreateRoom = document.getElementById('btn-create-room')!;
    const teacherFormSection = document.getElementById('teacher-form-section')!;
    const teacherCodeSection = document.getElementById('teacher-code-section')!;
    const displayCreatedCode = document.getElementById('display-created-code')!;
    const btnCopyCode = document.getElementById('btn-copy-code')!;
    const btnEnterAsTeacher = document.getElementById('btn-enter-as-teacher')!;

    const studentRoomCode = document.getElementById('student-room-code') as HTMLInputElement;
    const studentNameInput = document.getElementById('student-name-input') as HTMLInputElement;
    const btnJoinRoom = document.getElementById('btn-join-room')!;
    const authErrorMsg = document.getElementById('auth-error-msg')!;

    const showError = (msg: string) => {
      authErrorMsg.textContent = msg;
      authErrorMsg.classList.remove('hidden');
    };
    const clearError = () => {
      authErrorMsg.textContent = '';
      authErrorMsg.classList.add('hidden');
    };

    // 1단계 -> 2단계: 교사 선택
    btnSelectTeacher.addEventListener('click', () => {
      clearError();
      authStepSelect.classList.add('hidden');
      authStepTeacher.classList.remove('hidden');
      setTimeout(() => teacherNameInput.focus(), 50);
    });

    // 1단계 -> 2단계: 학생 선택
    btnSelectStudent.addEventListener('click', () => {
      clearError();
      authStepSelect.classList.add('hidden');
      authStepStudent.classList.remove('hidden');
      setTimeout(() => studentRoomCode.focus(), 50);
    });

    // 2단계 -> 1단계: 교사 폼에서 뒤로 가기
    btnBackTeacher.addEventListener('click', () => {
      clearError();
      authStepTeacher.classList.add('hidden');
      authStepSelect.classList.remove('hidden');
    });

    // 2단계 -> 1단계: 학생 폼에서 뒤로 가기
    btnBackStudent.addEventListener('click', () => {
      clearError();
      authStepStudent.classList.add('hidden');
      authStepSelect.classList.remove('hidden');
    });

    // 1. 선생님 방 생성
    btnCreateRoom.addEventListener('click', async (e) => {
      e.stopPropagation();
      clearError();
      const teacherName = teacherNameInput.value.trim() || '선생님';
      const roomTitle = roomTitleInput.value.trim() || '우리 반 마을';

      btnCreateRoom.setAttribute('disabled', 'true');
      btnCreateRoom.textContent = '방 생성 중...';

      try {
        const code = await this.networkManager.createRoom(roomTitle, teacherName);
        displayCreatedCode.textContent = code;
        teacherFormSection.classList.add('hidden');
        teacherCodeSection.classList.remove('hidden');
      } catch (err: any) {
        showError('방 생성 실패: ' + (err.message || err));
        btnCreateRoom.removeAttribute('disabled');
        btnCreateRoom.textContent = '🚀 5자리 코드로 교실 방 만들기';
      }
    });

    // 코드 복사
    btnCopyCode.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = displayCreatedCode.textContent || '';
      navigator.clipboard.writeText(code).then(() => {
        btnCopyCode.textContent = '✅ 복사 완료!';
        setTimeout(() => {
          btnCopyCode.textContent = '📋 코드 복사하기';
        }, 2000);
      });
    });

    // 선생님 입장
    btnEnterAsTeacher.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hasGameStarted = true;
      this.startModal.classList.add('hidden');
      this.player.bypassPlotRestriction = true; // 교사는 모든 구역 건축 허용
      this.playerDisplayEl.textContent = '👑 교사 (관리자)';
      this.roomDisplayEl.textContent = `[#${this.networkManager.roomCode}] 👑 1/16명`;
      this.showNotification(`교실 방 #${this.networkManager.roomCode} 개설 완료! 학생들에게 코드를 알려주세요.`, '👑');
      this.requestPointerLockSafely();
    });

    // 2. 학생 방 참가
    btnJoinRoom.addEventListener('click', async (e) => {
      e.stopPropagation();
      clearError();
      const code = studentRoomCode.value.trim();
      const studentName = studentNameInput.value.trim() || `학생_${Math.floor(Math.random() * 900) + 100}`;

      if (!code) {
        showError('5자리 방 코드를 입력해주세요.');
        return;
      }

      btnJoinRoom.setAttribute('disabled', 'true');
      btnJoinRoom.textContent = '방 참가 중...';

      try {
        const res = await this.networkManager.joinRoom(code, studentName);
        if (!res.success) {
          showError(res.message || '방 참가에 실패했습니다.');
          btnJoinRoom.removeAttribute('disabled');
          btnJoinRoom.textContent = '🎒 우리 반 마을로 참가하기';
          return;
        }

        this.hasGameStarted = true;
        this.startModal.classList.add('hidden');

        // 학생 UI 모드 적용 (개발자 도구 버튼 완전 은닉)
        document.body.classList.add('student-mode');

        // 배정받은 대지 적용
        const assignedPlot = res.plotId || 1;
        this.player.assignedPlotIndex = assignedPlot;
        this.plotSelector.value = assignedPlot.toString();
        this.playerDisplayEl.textContent = `나의 대지 (#${assignedPlot})`;
        this.roomDisplayEl.textContent = `[코드: ${code}] 우리 반 마을`;

        this.teleportToMyPlot();
        this.showNotification(`교실 마을에 오신 것을 환영합니다! 당신의 대지는 [#${assignedPlot}번]입니다.`, '🏡');
        this.requestPointerLockSafely();
      } catch (err: any) {
        showError('참가 오류: ' + (err.message || err));
        btnJoinRoom.removeAttribute('disabled');
        btnJoinRoom.textContent = '🎒 우리 반 마을로 참가하기';
      }
    });
  }

  private setupWindowResize(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.1);

    // [수정사항 3]: 시간 자동 흐름 시스템 삭제 - 항상 화창한 정오(낮) 유지
    // animate 루프에서 setTime을 계속 재호출하지 않고 초기 12.0 밝은 낮 상태 유지

    // 1. 해수면 수위(홍수) 부드러운 애니메이션
    if (Math.abs(this.currentWaterY - this.targetWaterY) > 0.01) {
      this.currentWaterY += (this.targetWaterY - this.currentWaterY) * delta * 1.8;
      this.world.disasterWaterLevel = this.currentWaterY;
      this.world.disasterWaterMesh.position.y = this.currentWaterY - 0.15;
      if (this.waterHeightVal) {
        this.waterHeightVal.textContent = `Y = ${this.currentWaterY.toFixed(1)}${this.currentWaterY >= 4 ? ' (침수 중)' : ''}`;
      }
      if (this.waterHeightSlider) {
        this.waterHeightSlider.value = this.currentWaterY.toFixed(1);
      }
    } else {
      if (!this.isDisasterActive && this.world.currentWorldType === 'town' && this.currentWaterY <= 1.2) {
        this.world.disasterWaterMesh.visible = false;
      }
    }

    // 2. 재앙 발동 중 하늘/조명 세기말적 붉은 연출
    if (this.isDisasterActive) {
      (this.scene.background as THREE.Color).setHex(0x3b0707);
      if (this.scene.fog) {
        (this.scene.fog as THREE.FogExp2).color.setHex(0x450a0a);
        (this.scene.fog as THREE.FogExp2).density = 0.024;
      }
      this.sunLight.color.setHex(0xef4444);
      this.sunLight.intensity = 1.35;
    }

    this.player.update(delta);

    // 각 대지의 자원 이동 문(포탈) 진입 충돌 검사
    if (this.portalCooldown > 0) {
      this.portalCooldown -= delta;
    } else {
      this.checkPortalCollisions();
    }

    // 현재 플레이어가 딛고 있는 구획 감지 및 HUD 업데이트
    this.updateCurrentPlotStatus();

    // 멀티플레이 위치 동기화 및 원격 플레이어 렌더링
    if (this.hasGameStarted && this.networkManager) {
      this.networkManager.updateMyPosition(
        this.player.position.x,
        this.player.position.y,
        this.player.position.z,
        this.camera.rotation.y,
        this.world.currentWorldType,
        this.player.isFlying
      );
      this.networkManager.update(delta, this.world.currentWorldType);
    }

    this.renderer.render(this.scene, this.camera);
  };

  /**
   * [수정사항 4]: 대지별 자원 구역 문 및 복귀 문 통과 검사
   */
  private checkPortalCollisions(): void {
    const px = this.player.position.x;
    const py = this.player.position.y;
    const pz = this.player.position.z;

    if (this.world.currentWorldType === 'town') {
      // 평지 마을 -> 자원 구역(개발도상국) 이동 문 검사
      for (const portal of this.world.townPortals) {
        const dx = px - portal.x;
        const dz = pz - portal.z;
        const distSq = dx * dx + dz * dz;

        // 문 프레임 안(반경 1.25블록)으로 걸어 들어오면 이동!
        if (distSq < 1.4 && Math.abs(py - (portal.y + 1)) < 2.2) {
          this.portalCooldown = 3.5;
          this.switchWorld('resource');
          this.showNotification(`🚪 [${portal.name}]을 통과하여 자원 구역(개발도상국)에 도착했습니다!`, '🌀');
          break;
        }
      }
    } else {
      // 개발도상국(자원 구역) -> 평지 마을 귀환 문 검사
      const rp = this.world.resourceReturnPortal;
      const dx = px - rp.x;
      const dz = pz - rp.z;
      const distSq = dx * dx + dz * dz;

      // 귀환 문 통과 시 (반경 1.8블록, 높이 2.8블록 이내)
      if (distSq < 2.2 && Math.abs(py - (rp.y + 1.2)) < 2.8) {
        this.portalCooldown = 3.5;
        this.switchWorld('town');
        this.showNotification(`🚪 마을 귀환 문을 통과하여 나의 대지(#${this.player.assignedPlotIndex})로 복귀했습니다!`, '🏡');
        this.requestPointerLockSafely();
      }
    }
  }

  /**
   * 플레이어의 현재 위치(대지 번호 또는 자원지)를 HUD에 반영
   */
  private updateCurrentPlotStatus(): void {
    if (this.isDisasterActive) {
      this.currentZoneLabelEl.textContent = '🔥 대재앙 발생 중 (수몰 & 마그마 분출)';
      return;
    }

    if (this.world.currentWorldType === 'town') {
      const plot = this.world.getPlotAt(this.player.position.x, this.player.position.z);
      if (plot) {
        if (plot.id === this.player.assignedPlotIndex) {
          this.currentZoneLabelEl.textContent = `🏡 내 대지 (#${plot.id}) 내부`;
        } else {
          this.currentZoneLabelEl.textContent = `대지 #${plot.id} 영역`;
        }
      } else {
        this.currentZoneLabelEl.textContent = '마을 공용 도로/평지';
      }
    } else {
      this.currentZoneLabelEl.textContent = '⛏️ 개발도상국 (자원 채취 전용)';
    }
  }

  private updateUnderwaterVisuals(): void {
    const isUnderwater = this.world.isPositionInWater(this.camera.position.x, this.camera.position.y, this.camera.position.z);
    const fog = this.scene.fog as THREE.FogExp2;

    if (isUnderwater) {
      const waterColor = this.isDisasterActive ? 0x450a0a : 0x0c2744;
      (this.scene.background as THREE.Color).setHex(waterColor);
      if (fog) {
        fog.color.setHex(waterColor);
        fog.density = 0.07;
      }
    } else if (!this.isDisasterActive) {
      (this.scene.background as THREE.Color).setHex(0x87ceeb);
      if (fog) {
        fog.color.setHex(0x87ceeb);
        fog.density = 0.012;
      }
    }
  }
}

// 앱 실행
window.addEventListener('DOMContentLoaded', () => {
  new GameApp();
});
