import { BattleManager, CardArenaState, CardBet, RpsChoice } from '../game/BattleManager.ts';
import { HotbarUI } from './Hotbar.ts';
import { BlockType, BLOCK_METAS, ToolType, TOOL_METAS } from '../core/Constants.ts';

export class CardGameUI {
  private battleManager: BattleManager;
  private hotbar: HotbarUI;
  private modal: HTMLElement;
  private closeBtn: HTMLElement;
  public isOpen: boolean = false;

  public onOpen?: () => void;
  public onClose?: () => void;
  public onNotify?: (msg: string, icon: string) => void;

  private lobbyView: HTMLElement;
  private arenaView: HTMLElement;
  private roomsContainer: HTMLElement;

  private currentArenaTitle: HTMLElement;
  private btnLeaveArena: HTMLButtonElement;

  private p1NameEl: HTMLElement;
  private p1ReadyEl: HTMLElement;
  private p2NameEl: HTMLElement;
  private p2ReadyEl: HTMLElement;

  private btnStartGame: HTMLButtonElement;
  private bettingSection: HTMLElement;
  private resultSection: HTMLElement;

  private selectBetItemEl: HTMLSelectElement;
  private betAmountInput: HTMLInputElement;
  private selectedRps: RpsChoice = 'ROCK';
  private rpsRockBtn: HTMLButtonElement;
  private rpsScissorsBtn: HTMLButtonElement;
  private rpsPaperBtn: HTMLButtonElement;
  private btnSubmitBattle: HTMLButtonElement;

  private resultBanner: HTMLElement;
  private resultDetail: HTMLElement;
  private btnRestartGame: HTMLButtonElement;

  constructor(battleManager: BattleManager, hotbar: HotbarUI) {
    this.battleManager = battleManager;
    this.hotbar = hotbar;

    let modal = document.getElementById('card-arena-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'card-arena-modal';
      modal.className = 'modal-backdrop hidden';
      modal.innerHTML = `
        <div class="shop-card arena-card" style="width: 720px; max-width: 95vw;">
          <div class="shop-header">
            <div class="shop-title">
              <span class="shop-icon">⚔️</span>
              <div>
                <h3>1:1 가위바위보 카드 투기장</h3>
                <span class="shop-subtitle">자원을 걸고 치열한 두뇌 카드 배틀을 펼쳐보세요!</span>
              </div>
            </div>
            <button id="btn-close-arena" class="close-btn" title="닫기 (ESC)">✕</button>
          </div>

          <!-- 로비: 10개 투기장 방 선택 -->
          <div id="arena-lobby-view" style="padding: 20px;">
            <div style="margin-bottom: 14px; font-weight: bold; color: #cbd5e1; font-size: 15px;">
              🏟️ 입장할 투기장 방을 선택하세요 (총 10개 부스):
            </div>
            <div id="arena-rooms-grid" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;">
              <!-- 1~10 동적 렌더링 -->
            </div>
          </div>

          <!-- 투기장 방 내부 -->
          <div id="arena-room-view" class="hidden" style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
              <h4 id="arena-current-title" style="margin: 0; color: #f59e0b; font-size: 18px;">투기장 #1</h4>
              <button id="btn-leave-arena" class="shop-btn secondary-btn" style="padding: 6px 14px; font-size: 13px;">🚪 투기장 나가기</button>
            </div>

            <!-- 플레이어 대전 현황 -->
            <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 10px; border: 2px solid #334155;">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <span style="font-size: 12px; color: #94a3b8;">PLAYER 1</span>
                <strong id="arena-p1-name" style="font-size: 16px; color: #60a5fa;">대기 중</strong>
                <span id="arena-p1-ready" style="font-size: 12px; background: #475569; color: #fff; padding: 2px 8px; border-radius: 10px;">준비 중</span>
              </div>

              <div style="font-size: 24px; font-weight: bold; color: #ef4444;">VS</div>

              <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <span style="font-size: 12px; color: #94a3b8;">PLAYER 2</span>
                <strong id="arena-p2-name" style="font-size: 16px; color: #f472b6;">대기 중</strong>
                <span id="arena-p2-ready" style="font-size: 12px; background: #475569; color: #fff; padding: 2px 8px; border-radius: 10px;">준비 중</span>
              </div>
            </div>

            <!-- 대기 단계: 카드게임 시작 버튼 -->
            <div id="arena-start-section" style="text-align: center; padding: 10px 0;">
              <button id="btn-arena-start-game" class="shop-btn primary-btn" style="padding: 14px 28px; font-size: 16px; font-weight: bold;">
                🎮 카드게임 시작하기
              </button>
              <div style="font-size: 13px; color: #94a3b8; margin-top: 8px;">
                두 플레이어가 모두 [카드게임 시작하기]를 누르면 배팅과 카드 선택이 시작됩니다!
              </div>
            </div>

            <!-- 배팅 및 카드 선택 섹션 -->
            <div id="arena-betting-section" class="hidden" style="display: flex; flex-direction: column; gap: 14px; background: rgba(0,0,0,0.3); padding: 16px; border-radius: 10px;">
              <div>
                <label style="font-size: 14px; font-weight: bold; color: #cbd5e1; display: block; margin-bottom: 6px;">
                  1. 걸고 싸울 나의 자원 선택 (승자가 모두 독식!):
                </label>
                <div style="display: flex; gap: 8px;">
                  <select id="arena-bet-item-select" style="flex: 1; padding: 8px; background: #1e293b; color: #fff; border: 1px solid #475569; border-radius: 6px;"></select>
                  <input id="arena-bet-amount" type="number" min="1" value="1" style="width: 80px; padding: 8px; background: #0f172a; color: #fff; border: 1px solid #475569; border-radius: 6px;" />
                </div>
              </div>

              <div>
                <label style="font-size: 14px; font-weight: bold; color: #cbd5e1; display: block; margin-bottom: 6px;">
                  2. 낼 카드 선택 (가위, 바위, 보):
                </label>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                  <button id="btn-rps-scissors" class="shop-btn secondary-btn rps-btn" style="padding: 16px; font-size: 20px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <span>✌️</span>
                    <span style="font-size: 14px;">가위</span>
                  </button>
                  <button id="btn-rps-rock" class="shop-btn secondary-btn rps-btn active" style="padding: 16px; font-size: 20px; display: flex; flex-direction: column; align-items: center; gap: 4px; border-color: #38bdf8; background: rgba(56, 189, 248, 0.2);">
                    <span>✊</span>
                    <span style="font-size: 14px;">바위</span>
                  </button>
                  <button id="btn-rps-paper" class="shop-btn secondary-btn rps-btn" style="padding: 16px; font-size: 20px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <span>🖐️</span>
                    <span style="font-size: 14px;">보</span>
                  </button>
                </div>
              </div>

              <button id="btn-arena-submit-battle" class="shop-btn primary-btn" style="padding: 14px; font-size: 16px; font-weight: bold; margin-top: 6px;">
                🔥 배틀! (선택 제출)
              </button>
            </div>

            <!-- 배틀 결과 섹션 -->
            <div id="arena-result-section" class="hidden" style="text-align: center; padding: 16px; background: rgba(0,0,0,0.4); border-radius: 10px; display: flex; flex-direction: column; gap: 12px; align-items: center;">
              <div id="arena-result-banner" style="font-size: 22px; font-weight: bold; color: #f59e0b;">
                결과 발표
              </div>
              <div id="arena-result-detail" style="font-size: 15px; color: #e2e8f0; line-height: 1.6;">
                카드를 공개하는 중...
              </div>
              <button id="btn-arena-restart" class="shop-btn primary-btn" style="padding: 10px 24px; font-size: 15px; margin-top: 8px;">
                🔄 한 판 더 하기
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    this.modal = modal;
    this.closeBtn = document.getElementById('btn-close-arena')!;
    this.lobbyView = document.getElementById('arena-lobby-view')!;
    this.arenaView = document.getElementById('arena-room-view')!;
    this.roomsContainer = document.getElementById('arena-rooms-grid')!;

    this.currentArenaTitle = document.getElementById('arena-current-title')!;
    this.btnLeaveArena = document.getElementById('btn-leave-arena') as HTMLButtonElement;

    this.p1NameEl = document.getElementById('arena-p1-name')!;
    this.p1ReadyEl = document.getElementById('arena-p1-ready')!;
    this.p2NameEl = document.getElementById('arena-p2-name')!;
    this.p2ReadyEl = document.getElementById('arena-p2-ready')!;

    this.btnStartGame = document.getElementById('btn-arena-start-game') as HTMLButtonElement;
    this.bettingSection = document.getElementById('arena-betting-section')!;
    this.resultSection = document.getElementById('arena-result-section')!;

    this.selectBetItemEl = document.getElementById('arena-bet-item-select') as HTMLSelectElement;
    this.betAmountInput = document.getElementById('arena-bet-amount') as HTMLInputElement;

    this.rpsScissorsBtn = document.getElementById('btn-rps-scissors') as HTMLButtonElement;
    this.rpsRockBtn = document.getElementById('btn-rps-rock') as HTMLButtonElement;
    this.rpsPaperBtn = document.getElementById('btn-rps-paper') as HTMLButtonElement;
    this.btnSubmitBattle = document.getElementById('btn-arena-submit-battle') as HTMLButtonElement;

    this.resultBanner = document.getElementById('arena-result-banner')!;
    this.resultDetail = document.getElementById('arena-result-detail')!;
    this.btnRestartGame = document.getElementById('btn-arena-restart') as HTMLButtonElement;

    this.initEventListeners();
    this.setupBattleManagerCallbacks();
  }

  private initEventListeners(): void {
    this.closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    this.btnLeaveArena.addEventListener('click', async () => {
      await this.battleManager.leaveRoom();
      this.showLobby();
    });

    this.btnStartGame.addEventListener('click', () => {
      this.battleManager.setReady(true);
      this.btnStartGame.disabled = true;
      this.btnStartGame.textContent = '⏳ 상대방 시작 대기 중...';
    });

    // 가위바위보 카드 선택
    const selectRps = (choice: RpsChoice) => {
      this.selectedRps = choice;
      [this.rpsScissorsBtn, this.rpsRockBtn, this.rpsPaperBtn].forEach(b => {
        b.style.borderColor = '';
        b.style.background = '';
      });
      const activeBtn = choice === 'SCISSORS' ? this.rpsScissorsBtn : (choice === 'ROCK' ? this.rpsRockBtn : this.rpsPaperBtn);
      activeBtn.style.borderColor = '#38bdf8';
      activeBtn.style.background = 'rgba(56, 189, 248, 0.2)';
    };

    this.rpsScissorsBtn.addEventListener('click', () => selectRps('SCISSORS'));
    this.rpsRockBtn.addEventListener('click', () => selectRps('ROCK'));
    this.rpsPaperBtn.addEventListener('click', () => selectRps('PAPER'));

    this.btnSubmitBattle.addEventListener('click', () => {
      this.submitMyBetAndChoice();
    });

    this.btnRestartGame.addEventListener('click', () => {
      this.battleManager.restartGame();
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  private setupBattleManagerCallbacks(): void {
    this.battleManager.onArenaRoomsUpdate = (summary) => {
      this.renderArenaLobby(summary);
    };

    this.battleManager.onArenaStateChange = (state) => {
      this.renderArenaState(state);
    };

    this.battleManager.onGameResult = (winnerSlot, p1Bet, p2Bet) => {
      this.resolveBattleResult(winnerSlot, p1Bet, p2Bet);
    };
  }

  public open(): void {
    this.isOpen = true;
    this.modal.classList.remove('hidden');
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    if (this.battleManager.currentRoomId) {
      this.showRoom(this.battleManager.currentRoomId);
    } else {
      this.showLobby();
      this.battleManager.listenToArenaList();
    }

    if (this.onOpen) {
      this.onOpen();
    }
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.modal.classList.add('hidden');
    if (this.onClose) {
      this.onClose();
    }
  }

  private showLobby(): void {
    this.lobbyView.classList.remove('hidden');
    this.arenaView.classList.add('hidden');
  }

  private showRoom(roomId: number): void {
    this.lobbyView.classList.add('hidden');
    this.arenaView.classList.remove('hidden');
    this.currentArenaTitle.textContent = `⚔️ 투기장 #${roomId}`;
    this.populateBetOptions();
  }

  private renderArenaLobby(summary: Record<number, { count: number; names: string[] }>): void {
    this.roomsContainer.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
      const info = summary[i] || { count: 0, names: [] };
      const btn = document.createElement('button');
      btn.className = `shop-btn ${info.count >= 2 ? 'secondary-btn disabled' : 'primary-btn'}`;
      btn.style.display = 'flex';
      btn.style.flexDirection = 'column';
      btn.style.alignItems = 'center';
      btn.style.padding = '14px 8px';
      btn.style.gap = '6px';

      const statusColor = info.count === 0 ? '#10b981' : (info.count === 1 ? '#f59e0b' : '#ef4444');
      btn.innerHTML = `
        <span style="font-weight: bold; font-size: 15px;">투기장 #${i}</span>
        <span style="font-size: 12px; color: ${statusColor};">👥 ${info.count}/2명</span>
      `;

      btn.addEventListener('click', async () => {
        if (info.count >= 2) {
          alert('이미 2명이 대전 중인 투기장입니다!');
          return;
        }
        const res = await this.battleManager.joinRoom(i);
        if (res.success) {
          this.showRoom(i);
        } else {
          alert(res.message || '입장에 실패했습니다.');
        }
      });

      this.roomsContainer.appendChild(btn);
    }
  }

  private populateBetOptions(): void {
    this.selectBetItemEl.innerHTML = '';
    const items: { label: string; value: string; maxCount: number }[] = [];

    this.hotbar.slots.forEach((s) => {
      if (s.count > 0) {
        if (s.blockType !== undefined && s.blockType !== BlockType.AIR) {
          const meta = BLOCK_METAS[s.blockType];
          items.push({
            label: `${meta.emoji} ${meta.name} (${s.count}개 보유)`,
            value: `block_${s.blockType}`,
            maxCount: s.count
          });
        } else if (s.isItem && s.itemType) {
          items.push({
            label: `${s.itemEmoji} ${s.itemName} (${s.count}개 보유)`,
            value: `item_${s.itemType}`,
            maxCount: s.count
          });
        }
      }
    });

    if (items.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '배팅할 자원이 없습니다';
      this.selectBetItemEl.appendChild(opt);
      this.btnSubmitBattle.disabled = true;
      return;
    }

    this.btnSubmitBattle.disabled = false;
    items.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.value;
      opt.textContent = it.label;
      this.selectBetItemEl.appendChild(opt);
    });

    this.betAmountInput.value = '1';
    this.betAmountInput.max = items[0].maxCount.toString();
  }

  private submitMyBetAndChoice(): void {
    const val = this.selectBetItemEl.value;
    if (!val) return;
    const parts = val.split('_');
    const kind = parts[0];
    const amt = Math.max(1, parseInt(this.betAmountInput.value) || 1);

    let bet: CardBet | null = null;
    if (kind === 'block') {
      const bType = parseInt(parts[1]) as BlockType;
      const meta = BLOCK_METAS[bType];
      const has = this.hotbar.getCount(bType);
      if (has < amt) {
        alert('보유한 블록 수량이 부족합니다!');
        return;
      }
      bet = {
        type: 'block',
        blockType: bType,
        count: amt,
        name: meta.name,
        emoji: meta.emoji
      };
    } else if (kind === 'item') {
      const iType = parts[1] as any;
      const has = this.hotbar.getCount(iType);
      if (has < amt) {
        alert('보유한 아이템 수량이 부족합니다!');
        return;
      }
      bet = {
        type: 'item',
        itemType: iType,
        count: amt,
        name: parts[1],
        emoji: '📦'
      };
    }

    if (bet) {
      this.battleManager.submitBattle(bet, this.selectedRps);
      this.btnSubmitBattle.disabled = true;
      this.btnSubmitBattle.textContent = '⏳ 상대방 카드 선택 기다리는 중...';
    }
  }

  private renderArenaState(state: CardArenaState): void {
    // 1. 플레이어 상태
    if (state.p1 && state.p1.uid) {
      this.p1NameEl.textContent = state.p1.name;
      this.p1ReadyEl.textContent = state.p1.submitted ? '🔥 배틀 준비!' : (state.p1.ready ? '✅ 시작 준비' : '대기 중');
      this.p1ReadyEl.style.background = state.p1.submitted ? '#ef4444' : (state.p1.ready ? '#10b981' : '#475569');
    } else {
      this.p1NameEl.textContent = '대기 중...';
      this.p1ReadyEl.textContent = '빈 자리';
      this.p1ReadyEl.style.background = '#475569';
    }

    if (state.p2 && state.p2.uid) {
      this.p2NameEl.textContent = state.p2.name;
      this.p2ReadyEl.textContent = state.p2.submitted ? '🔥 배틀 준비!' : (state.p2.ready ? '✅ 시작 준비' : '대기 중');
      this.p2ReadyEl.style.background = state.p2.submitted ? '#ef4444' : (state.p2.ready ? '#10b981' : '#475569');
    } else {
      this.p2NameEl.textContent = '대기 중...';
      this.p2ReadyEl.textContent = '빈 자리';
      this.p2ReadyEl.style.background = '#475569';
    }

    // 2. 단계별 UI 전환
    const startSection = document.getElementById('arena-start-section')!;

    if (state.phase === 'LOBBY') {
      startSection.classList.remove('hidden');
      this.bettingSection.classList.add('hidden');
      this.resultSection.classList.add('hidden');

      const mySlot = this.battleManager.mySlot;
      const me = mySlot === 'p1' ? state.p1 : state.p2;
      if (me && me.ready) {
        this.btnStartGame.disabled = true;
        this.btnStartGame.textContent = '⏳ 상대방 시작 대기 중...';
      } else {
        this.btnStartGame.disabled = false;
        this.btnStartGame.textContent = '🎮 카드게임 시작하기';
      }
    } else if (state.phase === 'BETTING') {
      startSection.classList.add('hidden');
      this.bettingSection.classList.remove('hidden');
      this.resultSection.classList.add('hidden');

      const mySlot = this.battleManager.mySlot;
      const me = mySlot === 'p1' ? state.p1 : state.p2;
      if (me && me.submitted) {
        this.btnSubmitBattle.disabled = true;
        this.btnSubmitBattle.textContent = '⏳ 상대방 카드 선택 기다리는 중...';
      } else {
        this.btnSubmitBattle.disabled = false;
        this.btnSubmitBattle.textContent = '🔥 배틀! (선택 제출)';
      }
    } else if (state.phase === 'RESULT') {
      startSection.classList.add('hidden');
      this.bettingSection.classList.add('hidden');
      this.resultSection.classList.remove('hidden');
    }
  }

  private resolveBattleResult(winnerSlot: 'p1' | 'p2' | 'DRAW', p1Bet: CardBet | null, p2Bet: CardBet | null): void {
    const mySlot = this.battleManager.mySlot;
    if (!mySlot) return;

    const myBet = mySlot === 'p1' ? p1Bet : p2Bet;
    const partnerBet = mySlot === 'p1' ? p2Bet : p1Bet;

    if (winnerSlot === 'DRAW') {
      this.resultBanner.textContent = '🤝 무승부 (DRAW)!';
      this.resultBanner.style.color = '#f59e0b';
      this.resultDetail.innerHTML = `
        두 플레이어가 같은 카드를 냈습니다!<br/>
        <strong>건 자원이 모두 안전하게 반환되었습니다.</strong>
      `;
      if (this.onNotify) {
        this.onNotify('🤝 가위바위보 무승부! 자원이 반환되었습니다.', '⚖️');
      }
    } else if (winnerSlot === mySlot) {
      // 내가 승리! 둘이 건 모든 자원을 다 가짐!
      this.resultBanner.textContent = '🎉 승리 (VICTORY)!';
      this.resultBanner.style.color = '#10b981';

      let winMsg = `축하합니다! 가위바위보 배틀에서 승리했습니다!<br/>`;
      if (partnerBet) {
        winMsg += `상대방이 건 <strong style="color:#38bdf8;">${partnerBet.name} ×${partnerBet.count}개</strong>를 획득하여 내 인벤토리에 들어왔습니다!`;
        // 상대방 자원 추가 지급
        if (partnerBet.type === 'block' && partnerBet.blockType !== undefined) {
          this.hotbar.addResource(partnerBet.blockType, partnerBet.count);
        } else if (partnerBet.type === 'item' && partnerBet.itemType) {
          this.hotbar.addItem(partnerBet.itemType as any, partnerBet.count);
        }
      } else {
        winMsg += `모든 자원을 지켜냈습니다!`;
      }
      this.resultDetail.innerHTML = winMsg;

      if (this.onNotify) {
        this.onNotify('🏆 가위바위보 승리! 상대방의 모든 자원을 획득했습니다!', '🎉');
      }
    } else {
      // 패배! 내가 건 자원 차감
      this.resultBanner.textContent = '💀 패배 (DEFEAT)!';
      this.resultBanner.style.color = '#ef4444';

      let loseMsg = `아쉽게도 가위바위보 배틀에서 패배했습니다...<br/>`;
      if (myBet) {
        loseMsg += `내가 건 <strong style="color:#ef4444;">${myBet.name} ×${myBet.count}개</strong>를 상대방에게 넘겨주었습니다.`;
        // 내 자원 차감
        if (myBet.type === 'block' && myBet.blockType !== undefined) {
          this.hotbar.consumeResource(myBet.blockType, myBet.count);
        } else if (myBet.type === 'item' && myBet.itemType) {
          this.hotbar.consumeItem(myBet.itemType as any, myBet.count);
        }
      }
      this.resultDetail.innerHTML = loseMsg;

      if (this.onNotify) {
        this.onNotify('💀 가위바위보 패배! 건 자원을 잃었습니다.', '😭');
      }
    }

    this.populateBetOptions();
  }
}

