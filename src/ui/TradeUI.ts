import { TradeManager, TradeOffer, TradeRoomState } from '../game/TradeManager.ts';
import { HotbarUI } from './Hotbar.ts';
import { BlockType, BLOCK_METAS, ToolType, TOOL_METAS } from '../core/Constants.ts';

export class TradeUI {
  private tradeManager: TradeManager;
  private hotbar: HotbarUI;
  private modal: HTMLElement;
  private closeBtn: HTMLElement;
  public isOpen: boolean = false;

  public onOpen?: () => void;
  public onClose?: () => void;
  public onNotify?: (msg: string, icon: string) => void;

  private lobbyView: HTMLElement;
  private roomView: HTMLElement;
  private roomsContainer: HTMLElement;

  private currentRoomTitle: HTMLElement;
  private btnLeaveRoom: HTMLButtonElement;

  private myNameEl: HTMLElement;
  private myOfferDisplay: HTMLElement;
  private myConfirmBtn: HTMLButtonElement;
  private mySelectItemEl: HTMLSelectElement;
  private myAmountInput: HTMLInputElement;
  private myOfferSetBtn: HTMLButtonElement;
  private myOfferClearBtn: HTMLButtonElement;

  private partnerNameEl: HTMLElement;
  private partnerOfferDisplay: HTMLElement;
  private partnerStatusBadge: HTMLElement;

  constructor(tradeManager: TradeManager, hotbar: HotbarUI) {
    this.tradeManager = tradeManager;
    this.hotbar = hotbar;

    let modal = document.getElementById('trade-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'trade-modal';
      modal.className = 'modal-backdrop hidden';
      modal.innerHTML = `
        <div class="shop-card trade-card" style="width: 720px; max-width: 95vw;">
          <div class="shop-header">
            <div class="shop-title">
              <span class="shop-icon">🤝</span>
              <div>
                <h3>마을 1:1 자유 거래소 (거래구역)</h3>
                <span class="shop-subtitle">원하는 방에 들어가 친구와 자원을 교환해보세요</span>
              </div>
            </div>
            <button id="btn-close-trade" class="close-btn" title="닫기 (ESC)">✕</button>
          </div>

          <div id="trade-lobby-view" style="padding: 20px;">
            <div style="margin-bottom: 14px; font-weight: bold; color: #cbd5e1; font-size: 15px;">
              🚪 입장할 거래 부스(방)를 선택하세요:
            </div>
            <div id="trade-rooms-grid" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;">
              <!-- 방 1 ~ 10 버튼 동적 렌더링 -->
            </div>
          </div>

          <div id="trade-room-view" class="hidden" style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
              <h4 id="trade-current-room-title" style="margin: 0; color: #38bdf8; font-size: 18px;">부스 #1</h4>
              <button id="btn-leave-trade-room" class="shop-btn secondary-btn" style="padding: 6px 14px; font-size: 13px;">🚪 방 나가기</button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <!-- 내 거래 영역 -->
              <div style="background: rgba(15, 23, 42, 0.6); border: 2px solid #334155; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong id="trade-my-name" style="color: #60a5fa;">나</strong>
                  <span style="font-size: 12px; color: #94a3b8;">내가 제시하는 자원</span>
                </div>

                <div id="trade-my-offer-display" style="min-height: 80px; background: rgba(0,0,0,0.3); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #94a3b8;">
                  제시된 자원이 없습니다
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <select id="trade-my-item-select" style="padding: 8px; background: #1e293b; color: #fff; border: 1px solid #475569; border-radius: 6px; font-size: 13px;"></select>
                  <div style="display: flex; gap: 6px;">
                    <input id="trade-my-amount-input" type="number" min="1" value="1" style="width: 80px; padding: 6px; background: #0f172a; color: #fff; border: 1px solid #475569; border-radius: 6px; font-size: 13px;" />
                    <button id="btn-trade-my-set" class="shop-btn primary-btn" style="flex: 1; padding: 6px; font-size: 13px;">제시하기</button>
                    <button id="btn-trade-my-clear" class="shop-btn secondary-btn" style="padding: 6px 10px; font-size: 13px;">취소</button>
                  </div>
                </div>

                <button id="btn-trade-my-confirm" class="shop-btn secondary-btn" style="margin-top: 6px; padding: 12px; font-weight: bold; font-size: 15px;">
                  🤝 거래 승인 대기
                </button>
              </div>

              <!-- 상대방 거래 영역 -->
              <div style="background: rgba(15, 23, 42, 0.6); border: 2px solid #334155; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong id="trade-partner-name" style="color: #f472b6;">상대방</strong>
                  <span id="trade-partner-status-badge" style="font-size: 12px; background: #475569; color: #fff; padding: 2px 8px; border-radius: 10px;">참여 대기 중</span>
                </div>

                <div id="trade-partner-offer-display" style="min-height: 80px; background: rgba(0,0,0,0.3); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #94a3b8;">
                  상대방이 아직 자원을 제시하지 않았습니다
                </div>

                <div style="font-size: 13px; color: #94a3b8; line-height: 1.5; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px;">
                  💡 양쪽 플레이어가 모두 [거래 승인]을 누르면 인벤토리에서 자원이 즉시 맞교환됩니다!
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    this.modal = modal;
    this.closeBtn = document.getElementById('btn-close-trade')!;
    this.lobbyView = document.getElementById('trade-lobby-view')!;
    this.roomView = document.getElementById('trade-room-view')!;
    this.roomsContainer = document.getElementById('trade-rooms-grid')!;

    this.currentRoomTitle = document.getElementById('trade-current-room-title')!;
    this.btnLeaveRoom = document.getElementById('btn-leave-trade-room') as HTMLButtonElement;

    this.myNameEl = document.getElementById('trade-my-name')!;
    this.myOfferDisplay = document.getElementById('trade-my-offer-display')!;
    this.myConfirmBtn = document.getElementById('btn-trade-my-confirm') as HTMLButtonElement;
    this.mySelectItemEl = document.getElementById('trade-my-item-select') as HTMLSelectElement;
    this.myAmountInput = document.getElementById('trade-my-amount-input') as HTMLInputElement;
    this.myOfferSetBtn = document.getElementById('btn-trade-my-set') as HTMLButtonElement;
    this.myOfferClearBtn = document.getElementById('btn-trade-my-clear') as HTMLButtonElement;

    this.partnerNameEl = document.getElementById('trade-partner-name')!;
    this.partnerOfferDisplay = document.getElementById('trade-partner-offer-display')!;
    this.partnerStatusBadge = document.getElementById('trade-partner-status-badge')!;

    this.initEventListeners();
    this.setupTradeManagerCallbacks();
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

    this.btnLeaveRoom.addEventListener('click', async () => {
      await this.tradeManager.leaveRoom();
      this.showLobby();
    });

    this.myOfferSetBtn.addEventListener('click', () => {
      this.applyMyOffer();
    });

    this.myOfferClearBtn.addEventListener('click', () => {
      this.tradeManager.setOffer(null);
    });

    this.myConfirmBtn.addEventListener('click', () => {
      const isCurrentlyConfirmed = this.myConfirmBtn.classList.contains('confirmed');
      this.tradeManager.setConfirmed(!isCurrentlyConfirmed);
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  private setupTradeManagerCallbacks(): void {
    this.tradeManager.onRoomsListUpdate = (summary) => {
      this.renderRoomsLobby(summary);
    };

    this.tradeManager.onRoomStateChange = (state) => {
      this.renderRoomState(state);
    };

    this.tradeManager.onTradeExecute = (myOffer, partnerOffer) => {
      this.executeTradeLocally(myOffer, partnerOffer);
    };
  }

  public open(): void {
    this.isOpen = true;
    this.modal.classList.remove('hidden');
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    if (this.tradeManager.currentRoomId) {
      this.showRoom(this.tradeManager.currentRoomId);
    } else {
      this.showLobby();
      this.tradeManager.listenToRoomsList();
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
    this.roomView.classList.add('hidden');
  }

  private showRoom(roomId: number): void {
    this.lobbyView.classList.add('hidden');
    this.roomView.classList.remove('hidden');
    this.currentRoomTitle.textContent = `🤝 거래 부스 #${roomId}`;
    this.populateInventorySelect();
  }

  private renderRoomsLobby(summary: Record<number, { count: number; names: string[] }>): void {
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
        <span style="font-weight: bold; font-size: 15px;">부스 #${i}</span>
        <span style="font-size: 12px; color: ${statusColor};">👥 ${info.count}/2명</span>
      `;

      btn.addEventListener('click', async () => {
        if (info.count >= 2) {
          alert('이미 2명이 참여 중인 방입니다!');
          return;
        }
        const res = await this.tradeManager.joinRoom(i);
        if (res.success) {
          this.showRoom(i);
        } else {
          alert(res.message || '입장에 실패했습니다.');
        }
      });

      this.roomsContainer.appendChild(btn);
    }
  }

  private populateInventorySelect(): void {
    this.mySelectItemEl.innerHTML = '';
    const items: { label: string; value: string; maxCount: number }[] = [];

    this.hotbar.slots.forEach((s, idx) => {
      if (s.count > 0) {
        if (s.isTool && s.toolType) {
          const meta = TOOL_METAS[s.toolType];
          items.push({
            label: `[도구] ${meta.name}`,
            value: `tool_${s.toolType}_${idx}`,
            maxCount: 1
          });
        } else if (s.blockType !== undefined) {
          const meta = BLOCK_METAS[s.blockType];
          items.push({
            label: `[블록] ${meta.emoji} ${meta.name} (${s.count}개)`,
            value: `block_${s.blockType}_${s.count}`,
            maxCount: s.count
          });
        } else if (s.isItem && s.itemType) {
          items.push({
            label: `[아이템] ${s.itemEmoji} ${s.itemName} (${s.count}개)`,
            value: `item_${s.itemType}_${s.count}`,
            maxCount: s.count
          });
        }
      }
    });

    if (items.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '제시할 수 있는 자원이 없습니다';
      this.mySelectItemEl.appendChild(opt);
      this.myOfferSetBtn.disabled = true;
      return;
    }

    this.myOfferSetBtn.disabled = false;
    items.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.value;
      opt.textContent = it.label;
      this.mySelectItemEl.appendChild(opt);
    });

    this.myAmountInput.value = '1';
    this.myAmountInput.max = items[0].maxCount.toString();
  }

  private applyMyOffer(): void {
    const val = this.mySelectItemEl.value;
    if (!val) return;
    const parts = val.split('_');
    const kind = parts[0];
    const amt = Math.max(1, parseInt(this.myAmountInput.value) || 1);

    let offer: TradeOffer | null = null;
    if (kind === 'block') {
      const bType = parseInt(parts[1]) as BlockType;
      const meta = BLOCK_METAS[bType];
      const has = this.hotbar.getCount(bType);
      const actualAmt = Math.min(amt, has);
      if (actualAmt <= 0) return;
      offer = {
        type: 'block',
        blockType: bType,
        count: actualAmt,
        name: meta.name,
        emoji: meta.emoji
      };
    } else if (kind === 'item') {
      const iType = parts[1] as any;
      const has = this.hotbar.getCount(iType);
      const actualAmt = Math.min(amt, has);
      if (actualAmt <= 0) return;
      offer = {
        type: 'item',
        itemType: iType,
        count: actualAmt,
        name: parts[1],
        emoji: '📦'
      };
    }

    if (offer) {
      this.tradeManager.setOffer(offer);
    }
  }

  private renderRoomState(state: TradeRoomState): void {
    const mySlot = this.tradeManager.mySlot;
    const me = mySlot === 'p1' ? state.p1 : state.p2;
    const partner = mySlot === 'p1' ? state.p2 : state.p1;

    // 내 상태
    if (me) {
      this.myNameEl.textContent = me.name;
      if (me.offer) {
        this.myOfferDisplay.innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
            <span style="font-size:32px;">${me.offer.emoji}</span>
            <strong style="color:#fff; font-size:16px;">${me.offer.name} ×${me.offer.count}</strong>
          </div>
        `;
      } else {
        this.myOfferDisplay.innerHTML = `<span style="color:#94a3b8; font-size:14px;">제시된 자원이 없습니다</span>`;
      }

      if (me.confirmed) {
        this.myConfirmBtn.classList.add('confirmed');
        this.myConfirmBtn.style.background = '#10b981';
        this.myConfirmBtn.style.borderColor = '#10b981';
        this.myConfirmBtn.textContent = '✅ 거래 승인 완료 (클릭하여 취소)';
      } else {
        this.myConfirmBtn.classList.remove('confirmed');
        this.myConfirmBtn.style.background = '';
        this.myConfirmBtn.style.borderColor = '';
        this.myConfirmBtn.textContent = '🤝 이 거래 승인하기';
      }
    }

    // 상대방 상태
    if (partner && partner.uid) {
      this.partnerNameEl.textContent = partner.name;
      if (partner.confirmed) {
        this.partnerStatusBadge.textContent = '✅ 승인 완료';
        this.partnerStatusBadge.style.background = '#10b981';
      } else {
        this.partnerStatusBadge.textContent = '⏳ 제시/검토 중';
        this.partnerStatusBadge.style.background = '#f59e0b';
      }

      if (partner.offer) {
        this.partnerOfferDisplay.innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
            <span style="font-size:32px;">${partner.offer.emoji}</span>
            <strong style="color:#fff; font-size:16px;">${partner.offer.name} ×${partner.offer.count}</strong>
          </div>
        `;
      } else {
        this.partnerOfferDisplay.innerHTML = `<span style="color:#94a3b8; font-size:14px;">상대방이 자원을 선택하는 중...</span>`;
      }
    } else {
      this.partnerNameEl.textContent = '대기 중...';
      this.partnerStatusBadge.textContent = '빈 자리';
      this.partnerStatusBadge.style.background = '#475569';
      this.partnerOfferDisplay.innerHTML = `<span style="color:#94a3b8; font-size:14px;">상대방 입장을 기다리고 있습니다</span>`;
    }
  }

  private executeTradeLocally(myOffer: TradeOffer | null, partnerOffer: TradeOffer | null): void {
    // 1. 내 제시품 차감
    if (myOffer) {
      if (myOffer.type === 'block' && myOffer.blockType !== undefined) {
        this.hotbar.consumeResource(myOffer.blockType, myOffer.count);
      } else if (myOffer.type === 'item' && myOffer.itemType) {
        this.hotbar.consumeItem(myOffer.itemType as any, myOffer.count);
      }
    }

    // 2. 상대방 제시품 획득
    if (partnerOffer) {
      if (partnerOffer.type === 'block' && partnerOffer.blockType !== undefined) {
        this.hotbar.addResource(partnerOffer.blockType, partnerOffer.count);
      } else if (partnerOffer.type === 'item' && partnerOffer.itemType) {
        this.hotbar.addItem(partnerOffer.itemType as any, partnerOffer.count);
      }
    }

    const message = `🎉 [거래 성사] 상대방과 자원을 성공적으로 맞교환했습니다!`;
    if (this.onNotify) {
      this.onNotify(message, '🤝');
    }

    this.populateInventorySelect();
  }
}

