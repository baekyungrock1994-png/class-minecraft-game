import * as THREE from 'three';
import { VoxelWorld } from './core/VoxelWorld.ts';
import { PlayerController, BlockInteractEvent } from './game/PlayerController.ts';
import { HotbarUI } from './ui/Hotbar.ts';
import { CraftingUI } from './ui/CraftingUI.ts';
import { BlockType, ToolType, WorldType, WORLD_HEIGHT, BLOCK_METAS, TOOL_METAS } from './core/Constants.ts';
import { NetworkManager, BlockDeltaData, PlayerNetworkData, ChatMessage, JoinRequestData } from './core/NetworkManager.ts';
import { ItemDropManager } from './game/ItemDropManager.ts';
import { ChestManager } from './game/ChestManager.ts';
import { BattleManager, BattleSession, BattleBetItem } from './game/BattleManager.ts';

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
  public itemDropManager: ItemDropManager;
  public chestManager: ChestManager;
  public battleManager: BattleManager;

  // 상자(보관함) 모달 요소
  private chestModal: HTMLElement;
  private chestGrid: HTMLElement;
  private chestHotbarGrid: HTMLElement;
  private btnCloseChest: HTMLElement;

  // 투기장 배틀 관련 UI 요소
  private btnOpenArenaBattle: HTMLElement;
  private battleRequestModal: HTMLElement;
  private btnCloseBattleRequest: HTMLElement;
  private battleTargetSelect: HTMLSelectElement;
  private battleBetItemSelect: HTMLSelectElement;
  private battleBetCountInput: HTMLInputElement;
  private btnSubmitBattleRequest: HTMLElement;

  private battleIncomingToast: HTMLElement;
  private battleToastMsg: HTMLElement;
  private battleToastDetail: HTMLElement;
  private btnBattleAccept: HTMLElement;
  private btnBattleReject: HTMLElement;

  private battleTeacherModal: HTMLElement;
  private btnCloseTeacherBattle: HTMLElement;
  private vsPlayer1Name: HTMLElement;
  private vsPlayer2Name: HTMLElement;
  private teacherBattleBetInfo: HTMLElement;
  private btnTeacherApproveBattle: HTMLElement;
  private btnTeacherCancelBattle: HTMLElement;

  private battleHud: HTMLElement;
  private fighter1NameHud: HTMLElement;
  private fighter1HpFill: HTMLElement;
  private fighter1HpText: HTMLElement;
  private fighter2NameHud: HTMLElement;
  private fighter2HpFill: HTMLElement;
  private fighter2HpText: HTMLElement;

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

  // 참여자 명단 및 닉네임 관리 모달 요소
  private playerListModal: HTMLElement;
  private btnPlayerList: HTMLElement;
  private btnClosePlayerList: HTMLElement;
  private btnClosePlayerListBottom: HTMLElement;
  private playerListSubtitle: HTMLElement;
  private playerListRoomCode: HTMLElement;
  private playerListAdminNotice: HTMLElement;
  private playerRosterContainer: HTMLElement;
  private currentPlayers: PlayerNetworkData[] = [];
  private lastRosterHash: string = '';

  // 교사 승인 및 대기열 요소
  private pendingRequests: JoinRequestData[] = [];
  private joinRequestToast: HTMLElement;
  private joinToastMsg: HTMLElement;
  private btnToastApprove: HTMLElement;
  private btnToastReject: HTMLElement;
  private pendingRequestsSection: HTMLElement;
  private pendingCountBadge: HTMLElement;
  private pendingRequestsContainer: HTMLElement;
  private kickedModal: HTMLElement;
  private btnKickedConfirm: HTMLElement;

  // 칭찬 & 긍정 언어 채팅 모달 및 로그 요소
  private quickChatModal: HTMLElement;
  private btnOpenChat: HTMLElement;
  private btnCloseQuickChat: HTMLElement;
  private chatMessagesContainer: HTMLElement;

  // [수정사항 2]: 나무 50그루 추적, 비(Rain), 약한 홍수 및 환경 카드뉴스 요소
  private treeCountPill: HTMLElement;
  private treeCountLabel: HTMLElement;
  private cardNewsModal: HTMLElement;
  private currentCardSlide: number = 0;
  private isDeforestationFloodTriggered: boolean = false;
  private rainParticles: THREE.Points | null = null;
  private isRaining: boolean = false;

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

    // 나무 카운트 및 환경 카드뉴스 요소
    this.treeCountPill = document.getElementById('tree-count-pill')!;
    this.treeCountLabel = document.getElementById('tree-count-label')!;
    this.cardNewsModal = document.getElementById('card-news-modal')!;

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

    // 참여자 명단 요소
    this.playerListModal = document.getElementById('player-list-modal')!;
    this.btnPlayerList = document.getElementById('btn-player-list')!;
    this.btnClosePlayerList = document.getElementById('btn-close-player-list')!;
    this.btnClosePlayerListBottom = document.getElementById('btn-close-player-list-bottom')!;
    this.playerListSubtitle = document.getElementById('player-list-subtitle')!;
    this.playerListRoomCode = document.getElementById('player-list-room-code')!;
    this.playerListAdminNotice = document.getElementById('player-list-admin-notice')!;
    this.playerRosterContainer = document.getElementById('player-roster-container')!;

    // 교사 승인 및 대기열 / 추방 요소
    this.joinRequestToast = document.getElementById('join-request-toast')!;
    this.joinToastMsg = document.getElementById('join-toast-msg')!;
    this.btnToastApprove = document.getElementById('btn-toast-approve')!;
    this.btnToastReject = document.getElementById('btn-toast-reject')!;
    this.pendingRequestsSection = document.getElementById('pending-requests-section')!;
    this.pendingCountBadge = document.getElementById('pending-count-badge')!;
    this.pendingRequestsContainer = document.getElementById('pending-requests-container')!;
    this.kickedModal = document.getElementById('kicked-modal')!;
    this.btnKickedConfirm = document.getElementById('btn-kicked-confirm')!;
    this.btnKickedConfirm.addEventListener('click', () => {
      window.location.reload();
    });

    // 칭찬 소통 채팅 요소
    this.quickChatModal = document.getElementById('quick-chat-modal')!;
    this.btnOpenChat = document.getElementById('btn-open-chat')!;
    this.btnCloseQuickChat = document.getElementById('btn-close-quick-chat')!;
    this.chatMessagesContainer = document.getElementById('chat-messages-container')!;

    // 상자(보관함) 모달 요소
    this.chestModal = document.getElementById('chest-modal')!;
    this.chestGrid = document.getElementById('chest-grid')!;
    this.chestHotbarGrid = document.getElementById('chest-hotbar-grid')!;
    this.btnCloseChest = document.getElementById('btn-close-chest')!;

    // 투기장 배틀 관련 요소
    this.btnOpenArenaBattle = document.getElementById('btn-open-arena-battle')!;
    this.battleRequestModal = document.getElementById('battle-request-modal')!;
    this.btnCloseBattleRequest = document.getElementById('btn-close-battle-request')!;
    this.battleTargetSelect = document.getElementById('battle-target-select') as HTMLSelectElement;
    this.battleBetItemSelect = document.getElementById('battle-bet-item-select') as HTMLSelectElement;
    this.battleBetCountInput = document.getElementById('battle-bet-count-input') as HTMLInputElement;
    this.btnSubmitBattleRequest = document.getElementById('btn-submit-battle-request')!;

    this.battleIncomingToast = document.getElementById('battle-incoming-toast')!;
    this.battleToastMsg = document.getElementById('battle-toast-msg')!;
    this.battleToastDetail = document.getElementById('battle-toast-detail')!;
    this.btnBattleAccept = document.getElementById('btn-battle-accept')!;
    this.btnBattleReject = document.getElementById('btn-battle-reject')!;

    this.battleTeacherModal = document.getElementById('battle-teacher-modal')!;
    this.btnCloseTeacherBattle = document.getElementById('btn-close-teacher-battle')!;
    this.vsPlayer1Name = document.getElementById('vs-player1-name')!;
    this.vsPlayer2Name = document.getElementById('vs-player2-name')!;
    this.teacherBattleBetInfo = document.getElementById('teacher-battle-bet-info')!;
    this.btnTeacherApproveBattle = document.getElementById('btn-teacher-approve-battle')!;
    this.btnTeacherCancelBattle = document.getElementById('btn-teacher-cancel-battle')!;

    this.battleHud = document.getElementById('battle-hud')!;
    this.fighter1NameHud = document.getElementById('fighter1-name-hud')!;
    this.fighter1HpFill = document.getElementById('fighter1-hp-fill')!;
    this.fighter1HpText = document.getElementById('fighter1-hp-text')!;
    this.fighter2NameHud = document.getElementById('fighter2-name-hud')!;
    this.fighter2HpFill = document.getElementById('fighter2-hp-fill')!;
    this.fighter2HpText = document.getElementById('fighter2-hp-text')!;

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

    // 5-1. 아이템 드롭 & 픽업 시스템
    this.itemDropManager = new ItemDropManager(this.scene);
    this.itemDropManager.onPickupNotice = (msg: string, icon: string) => {
      this.showNotification(msg, icon);
      this.updatePlayerSelectedItem();
    };

    // 5-2. 보관 상자 시스템
    this.chestManager = new ChestManager();
    this.player.onOpenChest = (chestKey: string) => {
      this.openChestModal(chestKey);
    };

    // 5-3. 외곽 배틀 투기장 매니저
    this.battleManager = new BattleManager();

    // [요청 2]: 'Q' 키를 눌러 손에 든 아이템 1개 (Ctrl/Shift+Q는 전체) 버리기
    this.player.onDropItem = (all: boolean) => {
      const dropped = this.hotbar.dropSelectedItem(all);
      if (!dropped) return;

      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const spawnX = this.player.position.x + dir.x * 1.1;
      const spawnY = this.player.position.y - 0.4 + dir.y * 0.5;
      const spawnZ = this.player.position.z + dir.z * 1.1;

      let name = '아이템';
      let emoji = '📦';

      if (dropped.isTool && dropped.toolType) {
        name = TOOL_METAS[dropped.toolType].name;
        emoji = TOOL_METAS[dropped.toolType].emoji;
        this.itemDropManager.spawnDropItem({
          type: 'tool',
          worldType: this.world.currentWorldType,
          toolType: dropped.toolType,
          count: 1
        }, spawnX, spawnY, spawnZ, 2.0); // 2초간 픽업 지연
      } else if (dropped.blockType !== undefined) {
        name = BLOCK_METAS[dropped.blockType].name;
        emoji = BLOCK_METAS[dropped.blockType].emoji;
        this.itemDropManager.spawnDropItem({
          type: 'block',
          worldType: this.world.currentWorldType,
          blockType: dropped.blockType,
          count: dropped.count
        }, spawnX, spawnY, spawnZ, 2.0);
      } else if (dropped.itemType) {
        name = dropped.itemType === 'STICK' ? '막대기' : '마을 귀환석';
        emoji = dropped.itemType === 'STICK' ? '🥢' : '🧭';
        this.itemDropManager.spawnDropItem({
          type: 'item',
          worldType: this.world.currentWorldType,
          itemType: dropped.itemType,
          count: dropped.count
        }, spawnX, spawnY, spawnZ, 2.0);
      }

      this.updatePlayerSelectedItem();
      this.showNotification(`🗑️ [아이템 버림] ${name} ${dropped.count}개를 바닥에 버렸습니다.`, emoji);
    };

    // [요청 3]: 투기장 배틀 중 좌클릭 상대방 타격 공격
    this.player.onAttackPlayer = () => {
      if (!this.battleManager.currentSession || this.battleManager.currentSession.status !== 'in_progress') return;
      if (!this.world.isArenaZone(this.player.position.x, this.player.position.z)) return;

      const s = this.battleManager.currentSession;
      const opponentUid = s.challengerUid === this.battleManager.myUid ? s.targetUid : s.challengerUid;

      // 상대 플레이어와의 거리 검사
      const opponentRemote = this.networkManager.getRemotePlayer(opponentUid);
      if (opponentRemote) {
        const dist = this.player.position.distanceTo(opponentRemote.mesh.position);
        if (dist <= 3.8) {
          // 데미지 계산: 도구 장착 시 20, 맨손 12
          const dmg = this.player.currentTool !== ToolType.NONE ? 20 : 12;
          this.battleManager.applyAttackDamage(opponentUid, dmg, this.hotbar);
          this.showNotification(`💥 상대를 타격했습니다! (-${dmg} HP)`, '⚔️');
        }
      }
    };

    // 블록 인터랙션 (채굴 / 설치) 규칙 연결
    this.player.onBlockInteract = (event: BlockInteractEvent) => this.handleBlockInteract(event);

    // 조합대 및 제작(Crafting) 시스템 연동
    this.craftingUI = new CraftingUI(this.hotbar);
    this.player.onOpenCraftingTable = () => {
      this.player.setModalOpen(true);
      this.craftingUI.open();
    };
    this.craftingUI.onClose = () => {
      this.player.setModalOpen(false);
      this.requestPointerLockSafely();
    };
    this.craftingUI.onCraftSuccess = (msg: string) => {
      this.showNotification(msg, '🛠️');
      this.updatePlayerSelectedItem();
    };
    this.craftingUI.onItemDrop = (data) => {
      this.itemDropManager.spawnDropItem(
        { ...data, worldType: this.world.currentWorldType },
        this.player.position.x,
        this.player.position.y - 0.5,
        this.player.position.z
      );
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
    this.setupPlayerListModal();
    this.setupQuickChatModal();
    this.setupChestModal();
    this.setupBattleUI();
    this.initRainSystem();
    this.setupCardNewsModal();
    this.updateTreeCountUI();

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
   * 아이템 획득 처리: 가방 공간이 부족하면 바닥에 둥둥 뜨는 3D 아이템으로 드롭
   */
  private giveOrDropItem(blockType: BlockType, count: number = 1, x: number, y: number, z: number): void {
    const success = this.hotbar.addResource(blockType, count);
    if (!success) {
      this.itemDropManager.spawnDropItem(
        { type: 'block', worldType: this.world.currentWorldType, blockType, count },
        x + 0.5,
        y + 0.5,
        z + 0.5
      );
      this.showNotification('🎒 가방이 가득 차 아이템이 주변에 떨어졌습니다!', '📦');
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
      // 0) 신성한 차원문 제단 및 바닥 기반암, 외곽 투기장 파괴 원천 차단
      if (this.world.isProtectedBlock(event.x, event.y, event.z)) {
        if (this.world.isArenaZone(event.x, event.z)) {
          this.showNotification('⚔️ 외곽 배틀 투기장은 그 어떤 방법으로도 훼손할 수 없습니다!', '🔒');
        } else {
          this.showNotification('✨ 신성한 차원문 제단과 바닥 기반암은 절대 파괴할 수 없습니다!', '🔒');
        }
        return false;
      }

      // 상자 파괴 시 내부 아이템 바닥에 드롭 및 데이터 삭제
      if (event.type === BlockType.CHEST) {
        const chestKey = `${event.x}_${event.y}_${event.z}`;
        this.chestManager.deleteChest(chestKey).then(slots => {
          if (slots) {
            slots.forEach(slot => {
              if (slot && slot.count > 0) {
                if (slot.isTool && slot.toolType) {
                  this.itemDropManager.spawnDropItem(
                    { type: 'tool', worldType: this.world.currentWorldType, toolType: slot.toolType, count: 1 },
                    event.x + 0.5, event.y + 0.5, event.z + 0.5
                  );
                } else if (slot.blockType !== undefined) {
                  this.itemDropManager.spawnDropItem(
                    { type: 'block', worldType: this.world.currentWorldType, blockType: slot.blockType, count: slot.count },
                    event.x + 0.5, event.y + 0.5, event.z + 0.5
                  );
                } else if (slot.itemType === 'STICK') {
                  this.itemDropManager.spawnDropItem(
                    { type: 'item', worldType: this.world.currentWorldType, itemType: 'STICK', count: slot.count },
                    event.x + 0.5, event.y + 0.5, event.z + 0.5
                  );
                }
              }
            });
          }
        });
      }

      if (isResourceWorld) {
        // 자원 구역(개발도상국): 학생, 교사 모두 자유롭게 채굴 가능
        this.giveOrDropItem(event.type, 1, event.x, event.y, event.z);
        this.networkManager.sendBlockDelta(this.world.currentWorldType, event.x, event.y, event.z, BlockType.AIR);
        if (event.type === BlockType.WOOD) {
          setTimeout(() => this.checkDeforestation(), 50);
        }
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
          this.giveOrDropItem(event.type, 1, event.x, event.y, event.z);
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

        // 본인 대지(#assignedPlotIndex) 내 정상 파괴
        this.giveOrDropItem(event.type, 1, event.x, event.y, event.z);
        this.networkManager.sendBlockDelta(this.world.currentWorldType, event.x, event.y, event.z, BlockType.AIR);
        return true;
      }
    } else if (event.action === 'place') {
      // 2. 건축 / 블록 설치 동작 (place)
      // [요청 3]: 외곽 배틀 투기장 구역(Arena) 내 건축 원천 차단
      if (this.world.isArenaZone(event.x, event.z) && !isTeacher) {
        this.showNotification('🚫 배틀 투기장 구역에는 건축할 수 없습니다! 결투 전용 구역입니다.', '⚔️');
        return false;
      }

      const plot = this.world.getPlotAt(event.x, event.z);

      // [규칙 2]: 보관 상자(CHEST)는 오직 나만의 집(내 10x10 대지 내부)에만 설치 가능!
      if (event.type === BlockType.CHEST) {
        if (isResourceWorld || !plot || plot.id !== this.player.assignedPlotIndex) {
          this.showNotification(`📦 보관 상자는 오직 나만의 집(내 대지 #${this.player.assignedPlotIndex}) 안에만 설치할 수 있습니다!`, '🏠');
          return false;
        }
      }

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
   * @param target 이동할 월드 타입 ('town' | 'resource')
   * @param spawnMode 소환 위치 모드 ('portal': 제단 관문 바로 앞 소환 / 'plot': 개인 대지 중심 소환)
   */
  public switchWorld(target: WorldType, spawnMode: 'portal' | 'plot' = 'portal'): void {
    if (this.world.currentWorldType === target) return;

    this.world.switchWorld(target);

    const btnTown = document.getElementById('btn-world-town')!;
    const btnResource = document.getElementById('btn-world-resource')!;
    const btnQuickReturn = document.getElementById('btn-quick-return');

    if (target === 'town') {
      btnTown.classList.add('active');
      btnResource.classList.remove('active');
      if (btnQuickReturn) btnQuickReturn.classList.add('hidden');
      if (this.treeCountPill) this.treeCountPill.classList.add('hidden');
      this.currentZoneLabelEl.textContent = '마을 평지 (주거지)';
      this.showNotification('🏡 평지 마을로 이동했습니다! 나만의 10x10 대지에 집을 지어보세요.', '✨');

      if (spawnMode === 'portal') {
        // [지시사항 1]: 제단 관문 이동 시에는 자기 구역이 아닌 "마을 제단 관문 바로 앞(x: 0.5, z: 2.0)"에 소환!
        this.teleportToTownPortalFront();
      } else {
        // [ 키 또는 귀환석을 사용한 경우에만 개인 대지 중심으로 이동
        this.teleportToMyPlot();
      }
    } else {
      btnResource.classList.add('active');
      btnTown.classList.remove('active');
      if (btnQuickReturn) btnQuickReturn.classList.remove('hidden');
      if (this.treeCountPill) this.treeCountPill.classList.remove('hidden');
      this.updateTreeCountUI();
      this.currentZoneLabelEl.textContent = '자원 구역 (개발도상국)';
      this.showNotification('⛏️ 자원 구역(개발도상국)으로 이동했습니다! [ 키 또는 9번 귀환석으로 언제든 귀환 가능합니다.', '🌲');

      // [지시사항 1]: 자원 구역 제단 관문 바로 앞(x: 0.5, z: -1.8)에 소환!
      this.teleportToResourcePortalFront();
    }

    // [요청 1]: 월드 전환 시 드롭 아이템 가시성 필터링 (월드 격리)
    this.itemDropManager.filterByWorld(target);

    this.requestPointerLockSafely();
  }

  /**
   * 마을 중앙 신성한 제단 관문 바로 앞(x: 0.5, z: 2.0)으로 정확하게 소환
   */
  public teleportToTownPortalFront(): void {
    // 마을 제단 기단 Y=5, 바닥 위 안전한 지상 높이(5.0 + 1.0 + playerHeight + 0.1)
    const spawnY = 5.0 + 1.0 + this.player.playerHeight + 0.1;
    this.player.teleport(0.5, spawnY, 2.0);
  }

  /**
   * 개발도상국(자원 구역) 신성한 제단 관문 바로 앞(x: 0.5, z: -1.8)으로 정확하게 소환
   */
  public teleportToResourcePortalFront(): void {
    const rp = this.world.resourceReturnPortal;
    const baseGroundY = rp ? rp.y : 5;
    const spawnY = baseGroundY + 1.0 + this.player.playerHeight + 0.1;
    this.player.teleport(0.5, spawnY, -1.8);
  }

  private teleportToMyPlot(): void {
    const plot = this.world.plots.find(p => p.id === this.player.assignedPlotIndex);
    const tx = plot ? plot.centerX : 0;
    const tz = plot ? plot.centerZ : 3.0;
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
      this.applyWaterLevelLocally(val);
      // 교사가 수동으로 해수면 높이를 조절하면 학생 화면에도 실시간 브로드캐스트!
      if (this.networkManager && this.networkManager.role === 'teacher') {
        this.networkManager.sendWaterLevel(val);
      }
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
   * [지시사항 2]: 해수면 수위를 로컬에 적용 (수동 슬라이더 및 원격 교사 조작 수신 공통)
   */
  public applyWaterLevelLocally(val: number): void {
    this.targetWaterY = val;
    this.world.disasterWaterLevel = val;
    this.world.disasterWaterMesh.visible = val > 1.2 || this.isDisasterActive;
    if (this.waterHeightVal) {
      this.waterHeightVal.textContent = `Y = ${val.toFixed(1)}${val >= 4 ? ' (침수 중)' : ''}`;
    }
    if (this.waterHeightSlider) {
      this.waterHeightSlider.value = val.toFixed(1);
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
    this.applyDisasterLocally();
    // 교사가 발동한 경우 Firebase를 통해 모든 학생 화면에 실시간 전파!
    if (this.networkManager && this.networkManager.role === 'teacher') {
      this.networkManager.sendDisasterState(true);
      this.networkManager.sendWaterLevel(this.targetWaterY);
    }
  }

  public applyDisasterLocally(): void {
    this.isDisasterActive = true;
    this.world.isDisasterActive = true;
    this.targetWaterY = 6.8; // 평지 Y=4 위로 2.8블록 차오름 (집 1층 수몰)
    this.world.disasterWaterLevel = this.targetWaterY;
    this.world.disasterWaterMesh.visible = true;
    this.world.triggerMagmaEruption();

    if (this.disasterStatusBadge) {
      this.disasterStatusBadge.textContent = '🔥 대재앙 발생 중!';
      this.disasterStatusBadge.style.color = '#ef4444';
      this.disasterStatusBadge.style.borderColor = '#ef4444';
    }

    this.showNotification('🚨 [환경 대재앙 발동] 해수면이 폭주하고 지열 마그마가 솟구칩니다! 높은 곳으로 대피하세요!', '🌋');
  }

  /**
   * 평화 상태 복구 / 리셋
   */
  public resetDisaster(): void {
    this.applyPeaceLocally();
    // 교사가 리셋한 경우 Firebase를 통해 모든 학생 화면에 실시간 전파!
    if (this.networkManager && this.networkManager.role === 'teacher') {
      this.networkManager.sendDisasterState(false);
      this.networkManager.sendWaterLevel(1.0);
    }
  }

  public applyPeaceLocally(): void {
    this.isDisasterActive = false;
    this.world.isDisasterActive = false;
    this.targetWaterY = 1.0;
    this.world.disasterWaterLevel = 1.0;
    this.world.disasterWaterMesh.visible = false;
    this.world.clearMagmaEruption();
    this.isDeforestationFloodTriggered = false;
    this.isRaining = false;
    if (this.rainParticles) this.rainParticles.visible = false;

    if (this.disasterStatusBadge) {
      this.disasterStatusBadge.textContent = '평화 상태';
      this.disasterStatusBadge.style.color = '';
      this.disasterStatusBadge.style.borderColor = '';
    }

    this.setTime(this.timeOfDay); // 원래 시간 조명 복귀
    this.showNotification('🕊️ 환경이 정화되어 수위가 내려가고 마그마가 굳어 평화가 찾아왔습니다.', '✨');
  }

  /**
   * [수정사항 2]: 자원 구역의 참나무 50그루가 전부 벌목되었을 때 약한 홍수와 비 발생 및 카드뉴스 안내
   */
  public triggerDeforestationFlood(): void {
    if (this.isDeforestationFloodTriggered) return;
    this.isDeforestationFloodTriggered = true;

    // 마을에 비가 내리고 약한 홍수 발생
    this.isRaining = true;
    if (this.rainParticles) this.rainParticles.visible = true;

    this.isDisasterActive = true;
    this.world.isDisasterActive = true;
    this.targetWaterY = 5.2; // 평지 Y=4.0 기준 1.2블록 차오름 (마을 침수)
    this.world.disasterWaterLevel = this.targetWaterY;
    this.world.disasterWaterMesh.visible = true;

    // 흐리고 비오는 하늘 분위기 연출
    (this.scene.background as THREE.Color).setHex(0x52606d);
    if (this.scene.fog) {
      (this.scene.fog as THREE.FogExp2).color.setHex(0x64748b);
      (this.scene.fog as THREE.FogExp2).density = 0.02;
    }
    this.sunLight.color.setHex(0x94a3b8);
    this.sunLight.intensity = 0.6;

    if (this.disasterStatusBadge) {
      this.disasterStatusBadge.textContent = '🌧️ 산림 벌채 침수 발생';
      this.disasterStatusBadge.style.color = '#38bdf8';
      this.disasterStatusBadge.style.borderColor = '#38bdf8';
    }

    this.showNotification('🌧️ [경고] 무분별한 벌목으로 숲이 사라져 평지 마을에 폭우와 홍수가 시작되었습니다!', '🌊');

    // 환경 교육 카드뉴스 모달 팝업 표시
    this.openCardNewsModal();
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
    if (this.player && this.player.isModalOpen) return;
    if (this.craftingUI && this.craftingUI.isOpen) return;
    if (this.chestModal && !this.chestModal.classList.contains('hidden')) return;
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
      if (this.player && this.player.isModalOpen) return;
      if (this.craftingUI && this.craftingUI.isOpen) return;
      if (this.chestModal && !this.chestModal.classList.contains('hidden')) return;
      if (!this.devPanel.classList.contains('hidden')) return;

      const target = e.target as HTMLElement;
      if (
        target.closest('#top-bar') ||
        target.closest('#hotbar') ||
        target.closest('#crafting-modal') ||
        target.closest('#chest-modal') ||
        target.closest('#dev-panel') ||
        target.closest('#click-to-play') ||
        target.closest('#player-list-modal') ||
        target.closest('#quick-chat-modal')
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
        this.playerListModal.classList.add('hidden');
        this.quickChatModal.classList.add('hidden');
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
      if (active && (active.tagName === 'BUTTON' || active.classList.contains('world-tab') || active.classList.contains('dev-toggle-btn') || active.classList.contains('chat-toggle-btn') || active.classList.contains('clickable-badge'))) {
        active.blur();
      }
    });

    // 5. 브라우저 포인터 락 거부/오류 방어
    document.addEventListener('pointerlockerror', () => {
      console.warn('Pointer lock request error handled');
    });

    // 6. 단축키 핸들러
    window.addEventListener('keydown', (e) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      const isInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(targetTag);

      // ESC 키로 열려있는 모달창 닫기
      if (e.code === 'Escape') {
        if (!this.chestModal.classList.contains('hidden')) {
          this.closeChestModal();
        }
        if (!this.playerListModal.classList.contains('hidden')) {
          this.closePlayerListModal();
        }
        if (!this.quickChatModal.classList.contains('hidden')) {
          this.closeQuickChat();
        }
      }

      // [소통 기능]: 'T' 키를 누르면 칭찬 & 소통 채팅창 토글
      if (e.code === 'KeyT' && !isInput && this.hasGameStarted) {
        e.preventDefault();
        this.toggleQuickChat();
        return;
      }

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
      if (e.code === 'KeyF' && !this.player.isModalOpen && !isInput) {
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
      const bType = Number(delta.blockType);
      if (delta.worldType === this.world.currentWorldType) {
        this.world.setBlock(delta.x, delta.y, delta.z, bType);
      } else {
        const key = `${delta.x},${delta.y},${delta.z}`;
        if (delta.worldType === 'town') {
          if (bType === BlockType.AIR) {
            this.world.townBlocks.delete(key);
          } else {
            this.world.townBlocks.set(key, bType);
          }
        } else {
          if (bType === BlockType.AIR) {
            this.world.resourceBlocks.delete(key);
          } else {
            this.world.resourceBlocks.set(key, bType);
          }
        }
      }

      if (delta.worldType === 'resource' && (bType === BlockType.AIR || bType === 0)) {
        this.checkDeforestation();
      }
    };

    // 2. 방 초기화(교사 리셋) 감지
    this.networkManager.onRoomReset = () => {
      this.world.townBlocks.clear();
      this.world.generateTownTerrain();
      this.world.rebuildAllChunksForWorld('town');
      this.showNotification('선생님이 마을 건축물을 초기화했습니다!', '📢');
    };

    // 3. 플레이어 목록 갱신 (접속자 수 실시간 표시 & 명단 모달 갱신)
    this.networkManager.onPlayerListUpdate = (players) => {
      this.currentPlayers = players;
      const code = this.networkManager.roomCode;
      const count = players.length;
      if (this.networkManager.role === 'teacher') {
        this.roomDisplayEl.textContent = `[#${code}] 👑 ${count}/16명`;
      } else {
        this.roomDisplayEl.textContent = `[#${code}] 👥 ${count}/16명`;
      }
      this.playerListSubtitle.textContent = `현재 ${count}/16명 참여 중`;
      this.playerListRoomCode.textContent = code;
      if (!this.playerListModal.classList.contains('hidden')) {
        this.renderPlayerRoster();
      }
    };

    // 4. 교사의 특정 대지(구역) 초기화 실시간 수신
    this.networkManager.onPlotReset = (plotId: number) => {
      this.world.resetPlot(plotId);
      this.showNotification(`🧹 [대지 #${plotId}] 건축물이 선생님에 의해 초기 상태로 복구되었습니다!`, '✨');
    };

    // 5. 관리자에 의해 내 닉네임이 변경된 경우 실시간 알림 및 UI 반영
    this.networkManager.onMyNameChanged = (newName: string) => {
      this.showNotification(`📢 선생님이 내 닉네임을 [${newName}](으)로 변경했습니다!`, '✏️');
      if (this.networkManager.role === 'student') {
        this.playerDisplayEl.textContent = `${newName} (#${this.player.assignedPlotIndex})`;
      }
    };

    // 5-1. 관리자에 의해 내 대지 번호가 재할당된 경우 실시간 알림 및 UI 반영
    this.networkManager.onMyPlotChanged = (newPlotId: number) => {
      this.player.assignedPlotIndex = newPlotId;
      this.plotSelector.value = newPlotId.toString();
      this.playerDisplayEl.textContent = `${this.networkManager.playerName} (#${newPlotId})`;
      this.showNotification(`👑 선생님이 내 건축 구역을 [대지 #${newPlotId}]로 변경했습니다!`, '🏡');
    };

    // 5-2. 환경 대재앙 상태 실시간 수신 (학생 화면에도 즉시 동기화)
    this.networkManager.onDisasterChange = (isActive: boolean) => {
      if (isActive) {
        this.applyDisasterLocally();
      } else {
        this.applyPeaceLocally();
      }
    };

    // 5-3. [지시사항 2]: 교사가 수동 조절한 해수면 높이 실시간 수신 (학생 화면에도 즉시 동기화)
    this.networkManager.onWaterLevelChange = (level: number) => {
      this.applyWaterLevelLocally(level);
    };

    // 6. 긍정적 멘트 실시간 채팅 수신
    this.networkManager.onChatMessage = (chat: ChatMessage) => {
      this.displayIncomingChat(chat);
    };

    // 7. [교사용] 학생 입장 승인 대기열 실시간 수신
    this.networkManager.onPendingRequestsUpdate = (requests) => {
      this.pendingRequests = requests;
      this.updatePendingRequestsUI();
    };

    // 8. [학생용] 교사의 마을 입장 승인 수신
    this.networkManager.onJoinApproved = (assignedPlot: number) => {
      this.hasGameStarted = true;
      this.startModal.classList.add('hidden');

      // 학생 UI 모드 적용 (개발자 도구 버튼 완전 은닉)
      document.body.classList.add('student-mode');

      this.player.assignedPlotIndex = assignedPlot;
      this.plotSelector.value = assignedPlot.toString();
      this.playerDisplayEl.textContent = `${this.networkManager.playerName} (#${assignedPlot})`;
      this.roomDisplayEl.textContent = `[#${this.networkManager.roomCode}] 우리 반 마을`;

      this.chestManager.setNetwork(this.networkManager.getDb(), this.networkManager.roomCode);
      this.battleManager.setNetwork(
        this.networkManager.getDb(),
        this.networkManager.roomCode,
        this.networkManager.currentUser?.uid || `student_${Date.now()}`,
        this.networkManager.playerName,
        'student'
      );

      this.teleportToMyPlot();
      this.showNotification(`🎉 선생님께서 입장을 승인하셨습니다! 당신의 대지는 [#${assignedPlot}번]입니다.`, '🏡');
      this.requestPointerLockSafely();
    };

    // 9. [학생용] 교사의 입장 거절 수신
    this.networkManager.onJoinRejected = () => {
      const studentWaitingSection = document.getElementById('student-waiting-section');
      const studentFormSection = document.getElementById('student-form-section');
      const authErrorMsg = document.getElementById('auth-error-msg');
      const btnJoinRoom = document.getElementById('btn-join-room');

      if (studentWaitingSection) studentWaitingSection.classList.add('hidden');
      if (studentFormSection) studentFormSection.classList.remove('hidden');
      if (btnJoinRoom) {
        btnJoinRoom.removeAttribute('disabled');
        btnJoinRoom.textContent = '🎒 입장 승인 신청하기';
      }
      if (authErrorMsg) {
        authErrorMsg.textContent = '선생님께서 입장을 거절하셨습니다. 이름과 방 코드를 다시 확인해주세요.';
        authErrorMsg.classList.remove('hidden');
      }
      this.showNotification('선생님께서 입장을 거절하셨습니다.', '❌');
    };

    // 10. [학생/참여자] 교사에 의한 강제 추방 수신
    this.networkManager.onKicked = () => {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      this.player.isModalOpen = true;
      this.hasGameStarted = false;
      this.kickedModal.classList.remove('hidden');
    };
  }

  /**
   * 로그인 및 방 생성/참가 모달 이벤트 (2단계 구조: 1단계 역할 선택 -> 2단계 정보 입력 및 승인 대기)
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

    const studentFormSection = document.getElementById('student-form-section')!;
    const studentWaitingSection = document.getElementById('student-waiting-section')!;
    const studentRoomCode = document.getElementById('student-room-code') as HTMLInputElement;
    const studentNameInput = document.getElementById('student-name-input') as HTMLInputElement;
    const waitingStudentName = document.getElementById('waiting-student-name')!;
    const waitingRoomCode = document.getElementById('waiting-room-code')!;
    const btnCancelWaiting = document.getElementById('btn-cancel-waiting')!;
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
      studentFormSection.classList.remove('hidden');
      studentWaitingSection.classList.add('hidden');
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

    const tabTeacherCreate = document.getElementById('tab-teacher-create');
    const tabTeacherList = document.getElementById('tab-teacher-list');
    const teacherSavedRoomsSection = document.getElementById('teacher-saved-rooms-section');
    const teacherPinInput = document.getElementById('teacher-pin-input') as HTMLInputElement;
    const teacherSavedNameInput = document.getElementById('teacher-saved-name-input') as HTMLInputElement;
    const teacherSavedPinInput = document.getElementById('teacher-saved-pin-input') as HTMLInputElement;
    const btnFetchSavedRooms = document.getElementById('btn-fetch-saved-rooms');
    const savedRoomsList = document.getElementById('saved-rooms-list');
    const btnToggleHint = document.getElementById('btn-toggle-hint');
    const controlsHintBody = document.getElementById('controls-hint-body');

    // 조작 안내 힌트 접기/펼치기 토글
    if (btnToggleHint && controlsHintBody) {
      btnToggleHint.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = controlsHintBody.classList.toggle('collapsed');
        btnToggleHint.textContent = isCollapsed ? '조작법 펴기 📖' : '접기 ✕';
      });
    }

    // 1. 교사용 서브 탭 전환 (새 마을 만들기 vs 내 마을 목록 이어하기)
    if (tabTeacherCreate && tabTeacherList && teacherSavedRoomsSection) {
      tabTeacherCreate.addEventListener('click', () => {
        clearError();
        tabTeacherCreate.classList.add('active');
        tabTeacherList.classList.remove('active');
        teacherFormSection.classList.remove('hidden');
        teacherSavedRoomsSection.classList.add('hidden');
      });

      tabTeacherList.addEventListener('click', () => {
        clearError();
        tabTeacherList.classList.add('active');
        tabTeacherCreate.classList.remove('active');
        teacherSavedRoomsSection.classList.remove('hidden');
        teacherFormSection.classList.add('hidden');
        if (teacherNameInput && teacherSavedNameInput) {
          teacherSavedNameInput.value = teacherNameInput.value;
        }
        if (teacherPinInput && teacherSavedPinInput) {
          teacherSavedPinInput.value = teacherPinInput.value;
        }
        fetchTeacherRoomsList();
      });
    }

    // 교사 이전 마을 목록 불러오기 및 이어하기/삭제 함수
    const fetchTeacherRoomsList = async () => {
      if (!savedRoomsList) return;
      const tName = (teacherSavedNameInput?.value || teacherNameInput?.value || '선생님').trim();
      const tPin = (teacherSavedPinInput?.value || teacherPinInput?.value || '1234').trim();

      savedRoomsList.innerHTML = '<div class="empty-rooms-msg">마을 목록을 불러오는 중...</div>';
      try {
        const rooms = await this.networkManager.getTeacherRooms(tName, tPin);
        if (!rooms || rooms.length === 0) {
          savedRoomsList.innerHTML = '<div class="empty-rooms-msg">이전에 생성했던 마을이 없습니다.<br>새 마을을 개설해보세요!</div>';
          return;
        }
        savedRoomsList.innerHTML = '';
        rooms.forEach((r: any) => {
          const card = document.createElement('div');
          card.className = 'saved-room-card';
          const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '일자 미상';
          card.innerHTML = `
            <div class="saved-room-info">
              <div class="saved-room-name">${r.roomName || '우리 반 마을'}</div>
              <div class="saved-room-code-tag">🔑 코드: <span>#${r.roomCode}</span></div>
              <div class="saved-room-date">📅 개설: ${dateStr}</div>
            </div>
            <div class="saved-room-actions">
              <button class="btn-resume-room" data-code="${r.roomCode}">▶ 이어하기</button>
              <button class="btn-delete-room" data-code="${r.roomCode}">🗑️ 삭제</button>
            </div>
          `;

          const resumeBtn = card.querySelector('.btn-resume-room') as HTMLButtonElement;
          resumeBtn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            clearError();
            resumeBtn.setAttribute('disabled', 'true');
            resumeBtn.textContent = '불러오는 중...';
            try {
              const res = await this.networkManager.resumeRoom(r.roomCode, tName, tPin);
              if (res.success) {
                this.hasGameStarted = true;
                this.startModal.classList.add('hidden');
                this.player.bypassPlotRestriction = true;
                this.playerDisplayEl.textContent = '👑 교사 (관리자)';
                this.roomDisplayEl.textContent = `[#${this.networkManager.roomCode}] 👑 1/16명`;
                this.chestManager.setNetwork(this.networkManager.getDb(), this.networkManager.roomCode);
                this.battleManager.setNetwork(
                  this.networkManager.getDb(),
                  this.networkManager.roomCode,
                  this.networkManager.currentUser?.uid || 'teacher',
                  this.networkManager.playerName || '교사',
                  'teacher'
                );
                this.showNotification(`마을 #${r.roomCode} [${r.roomName}] 이어하기 성공!`, '👑');
                this.requestPointerLockSafely();
              } else {
                showError(res.message || '마을 이어하기 실패');
                resumeBtn.removeAttribute('disabled');
                resumeBtn.textContent = '▶ 이어하기';
              }
            } catch (err: any) {
              showError('마을 이어하기 오류: ' + (err.message || err));
              resumeBtn.removeAttribute('disabled');
              resumeBtn.textContent = '▶ 이어하기';
            }
          });

          const deleteBtn = card.querySelector('.btn-delete-room') as HTMLButtonElement;
          deleteBtn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(`정말 #${r.roomCode} (${r.roomName || '마을'})을 영구 삭제하시겠습니까?\n모든 건축 데이터가 삭제됩니다.`)) {
              return;
            }
            deleteBtn.setAttribute('disabled', 'true');
            deleteBtn.textContent = '삭제 중...';
            try {
              const ok = await this.networkManager.deleteTeacherRoom(r.roomCode, tName, tPin);
              if (ok) {
                this.showNotification(`마을 #${r.roomCode}가 삭제되었습니다.`, '🗑️');
                fetchTeacherRoomsList();
              } else {
                showError('마을 삭제 실패');
                deleteBtn.removeAttribute('disabled');
                deleteBtn.textContent = '🗑️ 삭제';
              }
            } catch (err: any) {
              showError('마을 삭제 오류: ' + (err.message || err));
              deleteBtn.removeAttribute('disabled');
              deleteBtn.textContent = '🗑️ 삭제';
            }
          });

          savedRoomsList.appendChild(card);
        });
      } catch (err: any) {
        savedRoomsList.innerHTML = `<div class="empty-rooms-msg">목록 조회 중 오류: ${err.message || err}</div>`;
      }
    };

    if (btnFetchSavedRooms) {
      btnFetchSavedRooms.addEventListener('click', (e) => {
        e.stopPropagation();
        fetchTeacherRoomsList();
      });
    }

    // 1. 선생님 방 생성
    btnCreateRoom.addEventListener('click', async (e) => {
      e.stopPropagation();
      clearError();
      const teacherName = teacherNameInput.value.trim() || '선생님';
      const teacherPin = teacherPinInput ? teacherPinInput.value.trim() : '1234';
      const roomTitle = roomTitleInput.value.trim() || '우리 반 마을';

      btnCreateRoom.setAttribute('disabled', 'true');
      btnCreateRoom.textContent = '방 생성 중...';

      try {
        const code = await this.networkManager.createRoom(roomTitle, teacherName, teacherPin);
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
      this.chestManager.setNetwork(this.networkManager.getDb(), this.networkManager.roomCode);
      this.battleManager.setNetwork(
        this.networkManager.getDb(),
        this.networkManager.roomCode,
        this.networkManager.currentUser?.uid || 'teacher',
        this.networkManager.playerName || '교사',
        'teacher'
      );
      this.showNotification(`교실 방 #${this.networkManager.roomCode} 개설 완료! 학생들에게 코드를 알려주세요.`, '👑');
      this.requestPointerLockSafely();
    });

    // 2. 학생 입장 승인 신청
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
      btnJoinRoom.textContent = '선생님 확인 중...';

      try {
        const res = await this.networkManager.requestJoinRoom(code, studentName);
        if (!res.success) {
          showError(res.message || '방 참가 신청에 실패했습니다.');
          btnJoinRoom.removeAttribute('disabled');
          btnJoinRoom.textContent = '🎒 입장 승인 신청하기';
          return;
        }

        // 신청 성공 -> 대기실 화면으로 전환
        waitingStudentName.textContent = studentName;
        waitingRoomCode.textContent = code;
        studentFormSection.classList.add('hidden');
        studentWaitingSection.classList.remove('hidden');
      } catch (err: any) {
        showError('신청 오류: ' + (err.message || err));
        btnJoinRoom.removeAttribute('disabled');
        btnJoinRoom.textContent = '🎒 입장 승인 신청하기';
      }
    });

    // 3. 학생 입장 대기 취소
    btnCancelWaiting.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await this.networkManager.cancelJoinRequest();
      } catch (err) {
        console.warn('cancelJoinRequest error:', err);
      }
      studentWaitingSection.classList.add('hidden');
      studentFormSection.classList.remove('hidden');
      btnJoinRoom.removeAttribute('disabled');
      btnJoinRoom.textContent = '🎒 입장 승인 신청하기';
      clearError();
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

    // 2. 재앙 발동 중 하늘/조명 연출 (폭우 vs 마그마 분출)
    if (this.isDisasterActive) {
      if (this.isRaining) {
        (this.scene.background as THREE.Color).setHex(0x475569);
        if (this.scene.fog) {
          (this.scene.fog as THREE.FogExp2).color.setHex(0x64748b);
          (this.scene.fog as THREE.FogExp2).density = 0.02;
        }
        this.sunLight.color.setHex(0x94a3b8);
        this.sunLight.intensity = 0.65;
      } else {
        (this.scene.background as THREE.Color).setHex(0x3b0707);
        if (this.scene.fog) {
          (this.scene.fog as THREE.FogExp2).color.setHex(0x450a0a);
          (this.scene.fog as THREE.FogExp2).density = 0.024;
        }
        this.sunLight.color.setHex(0xef4444);
        this.sunLight.intensity = 1.35;
      }
    }

    // 3. 비 파티클 애니메이션
    this.updateRain(delta);

    this.player.update(delta);

    // 4. 주변 드롭 아이템 회전/부유 및 자석 픽업 (현재 월드 격리)
    this.itemDropManager.update(delta, this.player.position, this.hotbar, this.world.currentWorldType);

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
      // 평지 마을 -> 자원 구역(개발도상국) 이동 문 검사 (가로 2칸 문: x: 0~1 통로)
      for (const portal of this.world.townPortals) {
        const dx = Math.abs(px - portal.x);
        const dz = Math.abs(pz - portal.z);

        // 2칸 너비 문 통과 시 (dx <= 1.2, dz <= 0.8, 높이 범위 충족)
        if (dx <= 1.2 && dz <= 0.8 && Math.abs(py - (portal.y + 1.2)) < 2.5) {
          this.portalCooldown = 4.0;
          this.switchWorld('resource', 'portal');
          this.showNotification(`🚪 [${portal.name}]을 통과하여 자원 구역(개발도상국) 제단 앞에 도착했습니다!`, '🌀');
          break;
        }
      }
    } else {
      // 개발도상국(자원 구역) -> 평지 마을 귀환 문 검사 (가로 2칸 문: x: 0~1 통로)
      const rp = this.world.resourceReturnPortal;
      const dx = Math.abs(px - rp.x);
      const dz = Math.abs(pz - rp.z);

      if (dx <= 1.2 && dz <= 0.8 && Math.abs(py - (rp.y + 1.2)) < 2.5) {
        this.portalCooldown = 4.0;
        this.switchWorld('town', 'portal');
        this.showNotification(`🚪 신성한 마을 귀환 문을 통과하여 마을 제단 앞에 복귀했습니다!`, '🏡');
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
      const isArena = this.world.isArenaZone(this.player.position.x, this.player.position.z);
      if (isArena) {
        this.currentZoneLabelEl.textContent = '⚔️ 외곽 배틀 투기장 (결투장 내부)';
        if (this.btnOpenArenaBattle) this.btnOpenArenaBattle.classList.remove('hidden');
        return;
      } else {
        if (this.btnOpenArenaBattle) this.btnOpenArenaBattle.classList.add('hidden');
      }

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
      if (this.btnOpenArenaBattle) this.btnOpenArenaBattle.classList.add('hidden');
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

  /**
   * 참여자 명단 및 닉네임 관리 모달 이벤트 등록
   */
  private setupPlayerListModal(): void {
    this.btnPlayerList.addEventListener('click', (e) => {
      e.stopPropagation();
      this.btnPlayerList.blur();
      this.openPlayerListModal();
    });

    this.btnClosePlayerList.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePlayerListModal();
    });

    this.btnClosePlayerListBottom.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closePlayerListModal();
    });
  }

  private openPlayerListModal(): void {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.player.isModalOpen = true;
    this.playerListModal.classList.remove('hidden');

    const isTeacher = this.networkManager.role === 'teacher';
    this.playerListAdminNotice.textContent = isTeacher
      ? '👑 교사 관리자 모드: 학생 대지(구역 1~16) 임의 재배정, 닉네임 수정 및 외부인/문제 학생 강제 추방 권한이 부여되었습니다.'
      : '👥 현재 우리 반 마을에 참여 중인 친구들의 명단입니다.';

    this.renderPendingRequests();
    this.renderPlayerRoster(true);
  }

  private closePlayerListModal(): void {
    this.playerListModal.classList.add('hidden');
    this.player.isModalOpen = false;
    this.requestPointerLockSafely();
  }

  /**
   * [교사용] 학생 입장 대기열 UI 및 토스트 갱신
   */
  private updatePendingRequestsUI(): void {
    if (this.networkManager.role !== 'teacher') return;

    const count = this.pendingRequests.length;
    this.pendingCountBadge.textContent = `${count}명`;

    // 1. 플로팅 토스트 배너 갱신
    if (count > 0) {
      const latest = this.pendingRequests[count - 1];
      this.joinToastMsg.innerHTML = `<strong>${latest.name}</strong> 학생이 입장을 기다리고 있습니다.${count > 1 ? ` (외 ${count - 1}명)` : ''}`;

      this.btnToastApprove.onclick = async (e) => {
        e.stopPropagation();
        this.btnToastApprove.setAttribute('disabled', 'true');
        try {
          await this.networkManager.approveStudent(latest.uid);
          this.showNotification(`[${latest.name}] 학생의 입장을 승인했습니다!`, '✅');
        } catch (err: any) {
          console.error('Approve error:', err);
          this.showNotification(`입장 승인 중 오류가 발생했습니다: ${err.message || err}`, '⚠️');
        } finally {
          this.btnToastApprove.removeAttribute('disabled');
        }
      };

      this.btnToastReject.onclick = async (e) => {
        e.stopPropagation();
        this.btnToastReject.setAttribute('disabled', 'true');
        try {
          await this.networkManager.rejectStudent(latest.uid);
          this.showNotification(`[${latest.name}] 학생의 입장을 거절했습니다.`, '❌');
        } catch (err: any) {
          console.error('Reject error:', err);
        } finally {
          this.btnToastReject.removeAttribute('disabled');
        }
      };

      this.joinRequestToast.classList.remove('hidden');
    } else {
      this.joinRequestToast.classList.add('hidden');
    }

    // 2. 명단 모달 내 대기자 목록 갱신
    if (!this.playerListModal.classList.contains('hidden')) {
      this.renderPendingRequests();
    }
  }

  /**
   * [교사용] 참여자 명단 모달 내 대기자 리스트 렌더링
   */
  private renderPendingRequests(): void {
    if (this.networkManager.role !== 'teacher') {
      this.pendingRequestsSection.classList.add('hidden');
      return;
    }

    if (this.pendingRequests.length === 0) {
      this.pendingRequestsSection.classList.add('hidden');
      this.pendingRequestsContainer.innerHTML = '';
      return;
    }

    this.pendingRequestsSection.classList.remove('hidden');
    this.pendingRequestsContainer.innerHTML = '';

    this.pendingRequests.forEach((req) => {
      const item = document.createElement('div');
      item.className = 'pending-item-card';

      const left = document.createElement('div');
      left.className = 'pending-item-left';
      left.innerHTML = `
        <span class="pending-user-icon">🧑‍🎓</span>
        <div class="pending-user-info">
          <span class="pending-user-name">${req.name}</span>
          <span class="pending-user-time">${new Date(req.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 입장 신청</span>
        </div>
      `;

      const right = document.createElement('div');
      right.className = 'pending-item-actions';

      const approveBtn = document.createElement('button');
      approveBtn.className = 'pending-action-btn approve';
      approveBtn.textContent = '✅ 승인';
      approveBtn.title = '이 학생의 마을 입장을 승인하고 대지를 배정합니다';
      approveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        approveBtn.setAttribute('disabled', 'true');
        try {
          await this.networkManager.approveStudent(req.uid);
          this.showNotification(`[${req.name}] 학생의 입장을 승인했습니다!`, '✅');
        } catch (err: any) {
          console.error('Approve error in modal:', err);
          this.showNotification(`입장 승인 오류: ${err.message || err}`, '⚠️');
          approveBtn.removeAttribute('disabled');
        }
      });

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'pending-action-btn reject';
      rejectBtn.textContent = '❌ 거절';
      rejectBtn.title = '이 학생의 마을 입장을 거절합니다';
      rejectBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        rejectBtn.setAttribute('disabled', 'true');
        await this.networkManager.rejectStudent(req.uid);
        this.showNotification(`[${req.name}] 학생의 입장을 거절했습니다.`, '❌');
      });

      right.appendChild(approveBtn);
      right.appendChild(rejectBtn);

      item.appendChild(left);
      item.appendChild(right);
      this.pendingRequestsContainer.appendChild(item);
    });
  }

  /**
   * 참여자 명단 렌더링 (닉네임 강제 변경 및 강제 추방 버튼 제공)
   */
  private renderPlayerRoster(force: boolean = false): void {
    const isTeacher = this.networkManager.role === 'teacher';
    const currentHash = this.currentPlayers.map(p => `${p.uid}:${p.name}:${p.plotId}:${p.role}:${p.currentWorld}`).join('|') + `|${isTeacher}`;

    // 불필요한 DOM 재생성을 방지하여 버튼 클릭이 도중에 씹히거나 더블클릭해야 하는 현상 원천 해결
    if (!force && this.lastRosterHash === currentHash && this.playerRosterContainer.children.length > 0) {
      return;
    }
    this.lastRosterHash = currentHash;

    this.playerRosterContainer.innerHTML = '';

    if (this.currentPlayers.length === 0) {
      this.playerRosterContainer.innerHTML = '<div class="empty-roster-msg">현재 접속 중인 플레이어가 없습니다.</div>';
      return;
    }

    this.currentPlayers.forEach((p) => {
      const card = document.createElement('div');
      card.className = `player-roster-card ${p.role}`;

      const left = document.createElement('div');
      left.className = 'player-roster-left';

      const icon = document.createElement('span');
      icon.className = 'roster-role-icon';
      icon.textContent = p.role === 'teacher' ? '👑' : '🧑‍🎓';

      const info = document.createElement('div');
      info.className = 'roster-info';

      const nameRow = document.createElement('div');
      nameRow.className = 'roster-name-row';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'roster-player-name';
      nameSpan.textContent = p.name;
      if (p.uid === this.networkManager.currentUser?.uid) {
        nameSpan.textContent += ' (나)';
      }

      const roleBadge = document.createElement('span');
      roleBadge.className = `roster-badge ${p.role}`;
      roleBadge.textContent = p.role === 'teacher' ? '선생님' : '학생';

      const plotBadge = document.createElement('span');
      plotBadge.className = 'roster-badge plot-badge';
      plotBadge.textContent = p.role === 'teacher' ? '전체 관리' : `#${p.plotId}번 대지`;

      nameRow.appendChild(nameSpan);
      nameRow.appendChild(roleBadge);
      nameRow.appendChild(plotBadge);

      const subRow = document.createElement('div');
      subRow.className = 'roster-sub-row';
      subRow.textContent = `📍 현재 위치: ${p.currentWorld === 'town' ? '평지 마을' : '자원 구역'}`;

      info.appendChild(nameRow);
      info.appendChild(subRow);

      left.appendChild(icon);
      left.appendChild(info);
      card.appendChild(left);

      // 교사(관리자)에게만 학생 구역 변경, 닉네임 변경 및 강제 추방 버튼 제공
      if (isTeacher && p.role === 'student') {
        const right = document.createElement('div');
        right.className = 'player-roster-right';

        // 1. [지시사항 2]: 관리자가 학생이 할당받은 구역을 임의로 즉시 변경
        const reassignBtn = document.createElement('button');
        reassignBtn.className = 'roster-plot-btn';
        reassignBtn.type = 'button';
        reassignBtn.innerHTML = `🏠 대지(#${p.plotId}) 변경`;
        reassignBtn.title = '이 학생의 할당 구역(대지 번호 1~16)을 즉시 임의 변경합니다';
        reassignBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();
          const input = prompt(`[${p.name}] 학생에게 새로 배정할 대지 번호(1~16)를 입력하세요:`, p.plotId?.toString() || '1');
          if (input !== null) {
            const plotNum = parseInt(input.trim(), 10);
            if (!isNaN(plotNum) && plotNum >= 1 && plotNum <= 16) {
              p.plotId = plotNum;
              await this.networkManager.reassignStudentPlot(p.uid, p.name, plotNum);
              this.showNotification(`[${p.name}] 학생의 대지를 [#${plotNum}번]으로 재배치했습니다.`, '🏠');
              this.renderPlayerRoster(true);
            } else {
              alert('대지 번호는 1부터 16 사이의 숫자여야 합니다.');
            }
          }
        });

        // 2. [지시사항 3]: 관리자가 학생 닉네임 변경 시 한 번만 눌러도 즉시 변경되도록 개선
        const renameBtn = document.createElement('button');
        renameBtn.className = 'roster-rename-btn';
        renameBtn.type = 'button';
        renameBtn.innerHTML = '✏️ 닉네임 변경';
        renameBtn.title = '이 학생의 닉네임을 변경합니다';
        renameBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();
          const newName = prompt(`[${p.name}] 학생의 새로운 닉네임을 입력하세요:`, p.name);
          if (newName && newName.trim() && newName.trim() !== p.name) {
            const clean = newName.trim();
            p.name = clean;
            await this.networkManager.changePlayerName(p.uid, clean);
            this.showNotification(`[${p.name}] 학생의 닉네임을 [${clean}](으)로 변경했습니다.`, '✏️');
            this.renderPlayerRoster(true);
          }
        });

        // 3. 강제 추방(Kick) 버튼
        const kickBtn = document.createElement('button');
        kickBtn.className = 'roster-kick-btn';
        kickBtn.type = 'button';
        kickBtn.innerHTML = '🚫 추방';
        kickBtn.title = '이 학생(또는 외부인)을 교실 마을에서 강제 추방합니다';
        kickBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();
          const confirmed = confirm(
            `[${p.name}] 학생(또는 외부인)을 교실 마을에서 강제 추방하시겠습니까?\n\n※ 추방된 사용자는 즉시 퇴장 처리되며, 다시 방에 참가할 수 없습니다.`
          );
          if (confirmed) {
            await this.networkManager.kickPlayer(p.uid);
            this.showNotification(`[${p.name}] 학생을 교실 마을에서 강제 추방했습니다.`, '🚫');
          }
        });

        right.appendChild(reassignBtn);
        right.appendChild(renameBtn);
        right.appendChild(kickBtn);
        card.appendChild(right);
      }

      this.playerRosterContainer.appendChild(card);
    });
  }

  /**
   * 긍정적 언어 칭찬 소통 채팅 모달 설정
   */
  private setupQuickChatModal(): void {
    this.btnOpenChat.addEventListener('click', (e) => {
      e.stopPropagation();
      this.btnOpenChat.blur();
      this.toggleQuickChat();
    });

    this.btnCloseQuickChat.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeQuickChat();
    });

    // 멘트 버튼 클릭 시 채팅 전송
    const phraseBtns = document.querySelectorAll('.chat-phrase-btn');
    phraseBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const msg = btn.getAttribute('data-msg') || btn.textContent || '';
        if (msg) {
          this.networkManager.sendChatMessage(msg);
          this.closeQuickChat();
        }
      });
    });
  }

  private toggleQuickChat(): void {
    if (this.quickChatModal.classList.contains('hidden')) {
      this.openQuickChat();
    } else {
      this.closeQuickChat();
    }
  }

  private openQuickChat(): void {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.player.isModalOpen = true;
    this.quickChatModal.classList.remove('hidden');
  }

  private closeQuickChat(): void {
    this.quickChatModal.classList.add('hidden');
    this.player.isModalOpen = false;
    this.requestPointerLockSafely();
  }

  /**
   * 수신된 칭찬 소통 채팅을 좌측 하단 HUD에 출력
   */
  private displayIncomingChat(chat: ChatMessage): void {
    const item = document.createElement('div');
    item.className = `chat-bubble-card ${chat.role}`;

    const sender = document.createElement('span');
    sender.className = 'chat-sender';
    sender.textContent = chat.role === 'teacher' ? `👑 ${chat.senderName}: ` : `🧑‍🎓 ${chat.senderName}: `;

    const msg = document.createElement('span');
    msg.className = 'chat-text';
    msg.textContent = chat.message;

    item.appendChild(sender);
    item.appendChild(msg);

    this.chatMessagesContainer.appendChild(item);

    // 최대 6개 메시지만 화면에 보관
    while (this.chatMessagesContainer.children.length > 6) {
      this.chatMessagesContainer.removeChild(this.chatMessagesContainer.firstChild!);
    }

    // 7.5초 후 자연스럽게 fade-out 삭제
    setTimeout(() => {
      item.classList.add('fade-out');
      setTimeout(() => {
        if (item.parentNode) {
          item.parentNode.removeChild(item);
        }
      }, 500);
    }, 7500);
  }

  /**
   * [수정사항 2]: 비(Rain) 파티클 시스템 초기화
   */
  private initRainSystem(): void {
    const rainCount = 1800;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(rainCount * 3);

    for (let i = 0; i < rainCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 120; // x
      positions[i * 3 + 1] = Math.random() * 40;          // y
      positions[i * 3 + 2] = (Math.random() - 0.5) * 120; // z
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.18,
      transparent: true,
      opacity: 0.75,
    });

    this.rainParticles = new THREE.Points(geometry, material);
    this.rainParticles.visible = false;
    this.scene.add(this.rainParticles);
  }

  /**
   * 비 파티클 낙하 및 플레이어 추적 애니메이션
   */
  private updateRain(delta: number): void {
    if (!this.rainParticles || !this.isRaining) return;

    // 비 파티클을 플레이어 카메라 주위로 유지
    const px = this.camera.position.x;
    const pz = this.camera.position.z;
    this.rainParticles.position.x = px;
    this.rainParticles.position.z = pz;

    const positions = this.rainParticles.geometry.attributes.position.array as Float32Array;
    const count = positions.length / 3;
    const speed = 35.0 * delta;

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 1] -= speed;
      if (positions[i * 3 + 1] < 0) {
        positions[i * 3 + 1] = 35 + Math.random() * 5;
      }
    }
    this.rainParticles.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * [수정사항 2]: 환경 교육 카드뉴스 모달 이벤트 바인딩
   */
  private setupCardNewsModal(): void {
    const btnCloseX = document.getElementById('btn-card-close-x');
    const btnGoTown = document.getElementById('btn-card-go-town');
    const btnPrev = document.getElementById('btn-card-prev') as HTMLButtonElement | null;
    const btnNext = document.getElementById('btn-card-next') as HTMLButtonElement | null;
    const dots = document.querySelectorAll('.card-dot');

    if (btnCloseX) {
      btnCloseX.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeCardNewsModal();
      });
    }

    if (btnGoTown) {
      btnGoTown.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeCardNewsModal();
        if (this.world.currentWorldType !== 'town') {
          this.switchWorld('town', 'portal');
        }
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.currentCardSlide > 0) {
          this.showCardSlide(this.currentCardSlide - 1);
        }
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.currentCardSlide < 2) {
          this.showCardSlide(this.currentCardSlide + 1);
        } else {
          this.closeCardNewsModal();
        }
      });
    }

    dots.forEach((dot, index) => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showCardSlide(index);
      });
    });
  }

  public openCardNewsModal(): void {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.player.isModalOpen = true;
    this.cardNewsModal.classList.remove('hidden');
    this.showCardSlide(0);
  }

  public closeCardNewsModal(): void {
    this.cardNewsModal.classList.add('hidden');
    this.player.isModalOpen = false;
    this.requestPointerLockSafely();
  }

  private showCardSlide(index: number): void {
    this.currentCardSlide = Math.max(0, Math.min(2, index));
    const slides = document.querySelectorAll('.card-news-slide');
    const dots = document.querySelectorAll('.card-dot');
    const btnPrev = document.getElementById('btn-card-prev') as HTMLButtonElement | null;
    const btnNext = document.getElementById('btn-card-next') as HTMLButtonElement | null;

    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === this.currentCardSlide);
    });

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === this.currentCardSlide);
    });

    if (btnPrev) {
      btnPrev.style.visibility = this.currentCardSlide === 0 ? 'hidden' : 'visible';
    }

    if (btnNext) {
      btnNext.textContent = this.currentCardSlide === 2 ? '확인 및 마을 보기 ✓' : '다음 카드 ❯';
    }
  }

  /**
   * 남은 참나무 수 HUD 갱신
   */
  public updateTreeCountUI(): void {
    if (!this.treeCountLabel || !this.treeCountPill) return;
    const count = this.world.getRemainingTreeCount();
    this.treeCountLabel.textContent = `남은 나무: ${count}/50`;

    if (count <= 10) {
      this.treeCountPill.style.background = 'rgba(239, 68, 68, 0.25)';
      this.treeCountPill.style.borderColor = '#ef4444';
      this.treeCountPill.style.color = '#fca5a5';
    } else {
      this.treeCountPill.style.background = '';
      this.treeCountPill.style.borderColor = '';
      this.treeCountPill.style.color = '';
    }
  }

  /**
   * 자원 구역의 벌목 상황을 감지하여 0그루일 때 홍수 유발
   */
  public checkDeforestation(): void {
    this.updateTreeCountUI();
    const count = this.world.getRemainingTreeCount();
    if (count <= 0 && !this.isDeforestationFloodTriggered) {
      this.triggerDeforestationFlood();
    }
  }

  /**
   * 보관 상자 모달 초기화
   */
  private setupChestModal(): void {
    if (this.btnCloseChest) {
      this.btnCloseChest.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeChestModal();
      });
    }

    if (this.chestModal) {
      this.chestModal.addEventListener('click', (e) => {
        if (e.target === this.chestModal) {
          this.closeChestModal();
        }
      });
    }

    this.chestManager.onChestDataChanged = (key, _slots) => {
      if (this.chestManager.currentOpenChestKey === key) {
        this.renderChestSlots();
      }
    };
  }

  public openChestModal(chestKey: string): void {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.player.setModalOpen(true);
    this.chestManager.currentOpenChestKey = chestKey;
    this.chestModal.classList.remove('hidden');
    this.renderChestSlots();
  }

  public closeChestModal(): void {
    this.chestModal.classList.add('hidden');
    this.chestManager.currentOpenChestKey = null;
    this.player.setModalOpen(false);
    this.updatePlayerSelectedItem();
    this.requestPointerLockSafely();
  }

  private getSlotDisplayInfo(slot: any): { emoji: string; name: string } {
    if (slot.isTool && slot.toolType) {
      const meta = TOOL_METAS[slot.toolType as ToolType];
      return { emoji: meta?.emoji || '⛏️', name: meta?.name || '도구' };
    }
    if (slot.blockType !== undefined && slot.blockType !== BlockType.AIR) {
      const meta = BLOCK_METAS[slot.blockType as BlockType];
      return { emoji: meta?.emoji || '🧱', name: meta?.name || '블록' };
    }
    if (slot.itemType === 'STICK') {
      return { emoji: '🥢', name: '막대기' };
    }
    if (slot.itemType === 'RETURN_STONE') {
      return { emoji: '🧭', name: '마을 귀환석' };
    }
    return { emoji: '', name: '빈 슬롯' };
  }

  private renderChestSlots(): void {
    const key = this.chestManager.currentOpenChestKey;
    if (!key) return;

    const chestSlots = this.chestManager.getOrCreateChest(key);

    // 1. 상자 10칸 슬롯 렌더링
    this.chestGrid.innerHTML = '';
    chestSlots.forEach((slot, index) => {
      const slotEl = document.createElement('div');
      slotEl.className = 'chest-slot inv-interactive-slot';
      slotEl.dataset.index = index.toString();

      if (slot && slot.count > 0) {
        const info = this.getSlotDisplayInfo(slot);
        slotEl.innerHTML = `
          <span class="slot-icon">${info.emoji}</span>
          ${slot.count > 1 ? `<span class="slot-count">${slot.count}</span>` : ''}
        `;
        slotEl.title = `${info.name} ${slot.count}개 (클릭 시 핫바로 가져오기)`;
        slotEl.classList.add('has-item');
      } else {
        slotEl.title = '빈 슬롯';
      }

      slotEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!slot || slot.count <= 0) return;
        const success = this.chestManager.withdrawToHotbar(key, index, this.hotbar);
        if (success) {
          this.renderChestSlots();
          this.updatePlayerSelectedItem();
        } else {
          this.showNotification('🎒 가방(핫바)에 여유 공간이 없습니다!', '⚠️');
        }
      });

      this.chestGrid.appendChild(slotEl);
    });

    // 2. 플레이어 핫바 9칸 슬롯 렌더링
    this.chestHotbarGrid.innerHTML = '';
    this.hotbar.slots.forEach((slot, index) => {
      const slotEl = document.createElement('div');
      slotEl.className = 'chest-hotbar-slot inv-interactive-slot';
      slotEl.dataset.index = index.toString();

      if (slot && slot.count > 0) {
        const info = this.getSlotDisplayInfo(slot);
        slotEl.innerHTML = `
          <span class="slot-icon">${info.emoji}</span>
          ${slot.count > 1 ? `<span class="slot-count">${slot.count}</span>` : ''}
        `;
        slotEl.title = `${info.name} ${slot.count}개 (클릭 시 상자에 보관하기)`;
        slotEl.classList.add('has-item');
      } else {
        slotEl.title = '빈 슬롯';
      }

      slotEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!slot || slot.count <= 0) return;
        const success = this.chestManager.depositFromHotbar(key, index, this.hotbar);
        if (success) {
          this.renderChestSlots();
          this.updatePlayerSelectedItem();
        } else {
          this.showNotification('📦 보관 상자가 가득 찼습니다! (최대 10칸)', '⚠️');
        }
      });

      this.chestHotbarGrid.appendChild(slotEl);
    });
  }

  /**
   * [요청 3]: 외곽 배틀 투기장 및 교사 승인 베팅 결투 UI 이벤트 바인딩
   */
  private setupBattleUI(): void {
    // 1. 투기장 진입 시 HUD에 나타나는 '⚔️ 결투 신청하기' 버튼
    if (this.btnOpenArenaBattle) {
      this.btnOpenArenaBattle.addEventListener('click', (e) => {
        e.stopPropagation();

        // 1) 현재 접속 중인 다른 플레이어 목록 조회
        const players = this.networkManager.getRemotePlayersList();
        this.battleTargetSelect.innerHTML = '';

        if (players.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = '현재 마을에 다른 플레이어가 없습니다';
          this.battleTargetSelect.appendChild(opt);
          this.btnSubmitBattleRequest.setAttribute('disabled', 'true');
        } else {
          this.btnSubmitBattleRequest.removeAttribute('disabled');
          players.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.uid;
            opt.textContent = `${p.name} (대지 #${p.plotId})`;
            this.battleTargetSelect.appendChild(opt);
          });
        }

        // 2) 내가 가방에 소지하고 있는 자원/도구/아이템 목록 채우기
        this.battleBetItemSelect.innerHTML = '';
        const myItems: BattleBetItem[] = [];

        this.hotbar.slots.forEach((s) => {
          if (!s || s.count <= 0) return;
          if (s.isTool && s.toolType) {
            const meta = TOOL_METAS[s.toolType];
            myItems.push({
              type: 'tool',
              toolType: s.toolType,
              count: 1,
              name: meta.name,
              emoji: meta.emoji,
            });
          } else if (s.blockType !== undefined) {
            const meta = BLOCK_METAS[s.blockType];
            myItems.push({
              type: 'block',
              blockType: s.blockType,
              count: s.count,
              name: meta.name,
              emoji: meta.emoji,
            });
          } else if (s.itemType === 'STICK') {
            myItems.push({
              type: 'item',
              itemType: 'STICK',
              count: s.count,
              name: '막대기',
              emoji: '🥢',
            });
          }
        });

        if (myItems.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = '가방에 베팅할 자원이나 아이템이 없습니다';
          this.battleBetItemSelect.appendChild(opt);
          this.btnSubmitBattleRequest.setAttribute('disabled', 'true');
        } else {
          myItems.forEach((item, idx) => {
            const opt = document.createElement('option');
            opt.value = idx.toString();
            opt.textContent = `${item.emoji} ${item.name} (보유: ${item.count}개)`;
            (opt as any)._betItem = item;
            this.battleBetItemSelect.appendChild(opt);
          });
          // 첫 번째 아이템의 수량에 맞춰 max 조정
          const first = myItems[0];
          this.battleBetCountInput.max = first.count.toString();
          this.battleBetCountInput.value = '1';
        }

        if (document.pointerLockElement) document.exitPointerLock();
        this.player.isModalOpen = true;
        this.battleRequestModal.classList.remove('hidden');
      });
    }

    // 아이템 선택 변경 시 수량 input max 갱신
    if (this.battleBetItemSelect) {
      this.battleBetItemSelect.addEventListener('change', () => {
        const opt = this.battleBetItemSelect.selectedOptions[0];
        const item: BattleBetItem | undefined = (opt as any)?._betItem;
        if (item) {
          this.battleBetCountInput.max = item.count.toString();
          this.battleBetCountInput.value = '1';
        }
      });
    }

    // 모달 닫기
    if (this.btnCloseBattleRequest) {
      this.btnCloseBattleRequest.addEventListener('click', (e) => {
        e.stopPropagation();
        this.battleRequestModal.classList.add('hidden');
        this.player.isModalOpen = false;
        this.requestPointerLockSafely();
      });
    }

    // 결투 신청 전송 버튼
    if (this.btnSubmitBattleRequest) {
      this.btnSubmitBattleRequest.addEventListener('click', async (e) => {
        e.stopPropagation();
        const targetUid = this.battleTargetSelect.value;
        if (!targetUid) {
          this.showNotification('대결 상대를 선택해주세요.', '⚠️');
          return;
        }

        const selectedOpt = this.battleTargetSelect.selectedOptions[0];
        const targetName = selectedOpt ? selectedOpt.textContent?.split(' (')[0] || '상대 플레이어' : '상대 플레이어';

        const itemOpt = this.battleBetItemSelect.selectedOptions[0];
        const rawBetItem: BattleBetItem | undefined = (itemOpt as any)?._betItem;
        if (!rawBetItem) {
          this.showNotification('베팅할 자원/아이템을 선택해주세요.', '⚠️');
          return;
        }

        const betCount = Math.max(1, Math.min(rawBetItem.count, parseInt(this.battleBetCountInput.value) || 1));
        const betItem: BattleBetItem = {
          ...rawBetItem,
          count: rawBetItem.type === 'tool' ? 1 : betCount,
        };

        if (!this.battleManager.hasBetItem(betItem, this.hotbar)) {
          this.showNotification('🎒 베팅할 자원이 부족합니다!', '⚠️');
          return;
        }

        const remotePlayer = this.networkManager.getRemotePlayer(targetUid);
        const targetPlot = remotePlayer?.data.plotId ?? 0;

        const success = await this.battleManager.requestBattle(
          targetUid,
          targetName,
          targetPlot,
          this.player.assignedPlotIndex,
          betItem,
          this.hotbar
        );

        if (success) {
          this.battleRequestModal.classList.add('hidden');
          this.player.isModalOpen = false;
          this.updatePlayerSelectedItem();
          this.showNotification(`⚔️ [${targetName}]님에게 결투를 신청했습니다! 상대방과 교사의 승인을 기다립니다.`, '⏳');
          this.requestPointerLockSafely();
        } else {
          this.showNotification('대결 신청에 실패했습니다. (이미 진행 중인 배틀이 있거나 자원 부족)', '❌');
        }
      });
    }

    // 상대방에게 배틀 신청이 들어온 경우
    this.battleManager.onBattleRequestedToMe = (session) => {
      this.battleToastMsg.textContent = `⚔️ [${session.challengerName}]님이 결투를 신청했습니다!`;
      this.battleToastDetail.textContent = `베팅 판돈: ${session.betItem.emoji} ${session.betItem.name} ${session.betItem.count}개 (수락 시 동일 자원 차감)`;
      this.battleIncomingToast.classList.remove('hidden');

      this.btnBattleAccept.onclick = async (e) => {
        e.stopPropagation();
        if (!this.battleManager.hasBetItem(session.betItem, this.hotbar)) {
          this.showNotification(`🎒 베팅에 필요한 [${session.betItem.name} ${session.betItem.count}개]가 없어 수락할 수 없습니다!`, '⚠️');
          return;
        }

        const ok = await this.battleManager.acceptBattle(this.hotbar);
        this.battleIncomingToast.classList.add('hidden');
        if (ok) {
          this.updatePlayerSelectedItem();
          this.showNotification('⚔️ 대결 신청을 수락했습니다! 교사의 최종 승인을 기다립니다.', '⏳');
        }
      };

      this.btnBattleReject.onclick = async (e) => {
        e.stopPropagation();
        await this.battleManager.rejectOrCancelBattle(this.hotbar);
        this.battleIncomingToast.classList.add('hidden');
        this.showNotification('대결 신청을 거절했습니다.', '❌');
      };
    };

    // 교사 승인 모달
    this.battleManager.onTeacherApprovalRequired = (session) => {
      this.vsPlayer1Name.textContent = `${session.challengerName} (#${session.challengerPlot})`;
      this.vsPlayer2Name.textContent = `${session.targetName} (#${session.targetPlot})`;
      this.teacherBattleBetInfo.textContent = `베팅 품목: ${session.betItem.emoji} ${session.betItem.name} 각 ${session.betItem.count}개 (총 2배 승자 독식: ${session.betItem.count * 2}개)`;

      if (document.pointerLockElement) document.exitPointerLock();
      this.player.isModalOpen = true;
      this.battleTeacherModal.classList.remove('hidden');

      this.btnTeacherApproveBattle.onclick = async (e) => {
        e.stopPropagation();
        await this.battleManager.approveBattleByTeacher();
        this.battleTeacherModal.classList.add('hidden');
        this.player.isModalOpen = false;
        this.showNotification(`👑 [${session.challengerName}] vs [${session.targetName}] 투기장 배틀을 승인했습니다!`, '⚔️');
        this.requestPointerLockSafely();
      };

      this.btnTeacherCancelBattle.onclick = async (e) => {
        e.stopPropagation();
        await this.battleManager.rejectOrCancelBattle();
        this.battleTeacherModal.classList.add('hidden');
        this.player.isModalOpen = false;
        this.showNotification('교사 권한으로 배틀 신청을 기각했습니다.', '🛡️');
        this.requestPointerLockSafely();
      };

      if (this.btnCloseTeacherBattle) {
        this.btnCloseTeacherBattle.onclick = (e) => {
          e.stopPropagation();
          this.battleTeacherModal.classList.add('hidden');
          this.player.isModalOpen = false;
          this.requestPointerLockSafely();
        };
      }
    };

    // 배틀 시작 시 투기장 HUD 표시 및 선수 텔레포트
    this.battleManager.onBattleStarted = (session) => {
      this.battleHud.classList.remove('hidden');
      this.fighter1NameHud.textContent = session.challengerName;
      this.fighter2NameHud.textContent = session.targetName;
      this.fighter1HpFill.style.width = '100%';
      this.fighter1HpText.textContent = '100/100';
      this.fighter2HpFill.style.width = '100%';
      this.fighter2HpText.textContent = '100/100';

      const isChallenger = session.challengerUid === this.battleManager.myUid;
      const isTarget = session.targetUid === this.battleManager.myUid;

      if (isChallenger || isTarget) {
        // 투기장이 있는 마을 월드로 자동 전환
        if (this.world.currentWorldType !== 'town') {
          this.switchWorld('town');
        }

        // 투기장 결투 시작 위치로 이동 (도전자 X: -6, 상대 X: 6, Z: 52)
        if (isChallenger) {
          this.player.teleport(-6, 2.0, 52);
        } else {
          this.player.teleport(6, 2.0, 52);
        }

        this.showNotification('⚔️ 외곽 투기장 결투 시작! 상대를 조준하고 좌클릭으로 타격하세요!', '🔥');
      } else {
        this.showNotification(`⚔️ 투기장에서 [${session.challengerName}] vs [${session.targetName}] 배틀이 시작되었습니다!`, '🏟️');
      }
    };

    // 실시간 HP 게이지 갱신
    this.battleManager.onHpUpdate = (challengerHp, targetHp) => {
      if (this.fighter1HpFill) this.fighter1HpFill.style.width = `${Math.max(0, challengerHp)}%`;
      if (this.fighter1HpText) this.fighter1HpText.textContent = `${Math.max(0, challengerHp)}/100`;
      if (this.fighter2HpFill) this.fighter2HpFill.style.width = `${Math.max(0, targetHp)}%`;
      if (this.fighter2HpText) this.fighter2HpText.textContent = `${Math.max(0, targetHp)}/100`;
    };

    // 배틀 종료 시 처리
    this.battleManager.onBattleEnded = (session, isWinner) => {
      this.battleHud.classList.add('hidden');

      const isChallenger = session.challengerUid === this.battleManager.myUid;
      const isTarget = session.targetUid === this.battleManager.myUid;

      if (isWinner) {
        // 승자: 베팅 자원 2배 지급
        const doubleCount = session.betItem.count * 2;
        this.battleManager.refundBetItem({ ...session.betItem, count: doubleCount }, this.hotbar);
        this.updatePlayerSelectedItem();
        this.showNotification(`🏆 [결투 승리!] 상대를 쓰러뜨리고 ${session.betItem.emoji} ${session.betItem.name} ${doubleCount}개를 전액 획득했습니다!`, '🎉');
      } else if (isChallenger || isTarget) {
        // 패자: 내 대지로 리스폰
        this.showNotification(`💀 [결투 패배!] 체력이 모두 소진되었습니다. 내 대지로 귀환합니다.`, '💀');
        setTimeout(() => {
          this.teleportToMyPlot();
        }, 1200);
      } else {
        // 관전자
        const winner = session.winnerName || '승자';
        this.showNotification(`🏆 투기장 결투 종료! [${winner}] 선수의 최종 승리!`, '🏟️');
      }
    };
  }
}

// 앱 실행
window.addEventListener('DOMContentLoaded', () => {
  new GameApp();
});
