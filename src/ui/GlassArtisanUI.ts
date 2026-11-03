import { HotbarUI } from './Hotbar.ts';
import { BlockType, BLOCK_METAS } from '../core/Constants.ts';

export class GlassArtisanUI {
  private hotbar: HotbarUI;
  private modal: HTMLElement;
  private closeBtn: HTMLElement;
  public isOpen: boolean = false;

  public onOpen?: () => void;
  public onClose?: () => void;
  public onTradeSuccess?: (msg: string) => void;

  private selectBlockEl: HTMLSelectElement;
  private amountInput: HTMLInputElement;
  private maxAmountBtn: HTMLButtonElement;
  private tradeBtn: HTMLButtonElement;
  private previewInputCountEl: HTMLElement;
  private previewOutputCountEl: HTMLElement;
  private availableCountEl: HTMLElement;

  constructor(hotbar: HotbarUI) {
    this.hotbar = hotbar;

    // 모달 DOM 생성 또는 검색
    let modal = document.getElementById('glass-artisan-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'glass-artisan-modal';
      modal.className = 'modal-backdrop hidden';
      modal.innerHTML = `
        <div class="shop-card artisan-card">
          <div class="shop-header">
            <div class="shop-title">
              <span class="shop-icon">🪟</span>
              <div>
                <h3>유리 장인의 공방</h3>
                <span class="shop-subtitle">모든 블록을 투명하고 아름다운 유리 블록으로 연마합니다</span>
              </div>
            </div>
            <button id="btn-close-artisan" class="close-btn" title="닫기 (ESC)">✕</button>
          </div>
          <div class="artisan-body" style="padding: 20px; display: flex; flex-direction: column; gap: 16px;">
            <div class="artisan-rate-banner" style="background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; border-radius: 8px; padding: 12px 16px; text-align: center; color: #bae6fd; font-weight: bold; font-size: 15px;">
              ⚖️ 장인의 교환비: <span style="color:#ffffff;">아무 블록 1개</span> ➔ <span style="color:#38bdf8;">유리 블록 2개</span> (1 : 2)
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <label style="font-size: 14px; color: #cbd5e1; font-weight: bold;">교환할 재료 블록 선택:</label>
              <select id="artisan-block-select" style="padding: 10px; background: #1e293b; color: #fff; border: 1px solid #475569; border-radius: 6px; font-size: 15px; cursor: pointer;"></select>
              <span style="font-size: 13px; color: #94a3b8;">현재 가방 보유량: <strong id="artisan-available-count" style="color:#38bdf8;">0</strong>개</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <label style="font-size: 14px; color: #cbd5e1; font-weight: bold;">교환할 수량:</label>
              <div style="display: flex; gap: 8px;">
                <input id="artisan-amount-input" type="number" min="1" value="1" style="flex: 1; padding: 10px; background: #0f172a; color: #fff; border: 1px solid #475569; border-radius: 6px; font-size: 15px;" />
                <button id="btn-artisan-max" class="shop-btn secondary-btn" style="padding: 0 16px;">최대</button>
              </div>
            </div>

            <div class="artisan-preview-box" style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 14px; display: flex; align-items: center; justify-content: space-around;">
              <div style="text-align: center;">
                <div style="font-size: 13px; color: #94a3b8; margin-bottom: 4px;">지불 블록</div>
                <div style="font-size: 20px; font-weight: bold; color: #f87171;"><span id="artisan-preview-in">1</span>개</div>
              </div>
              <div style="font-size: 24px; color: #38bdf8;">➔</div>
              <div style="text-align: center;">
                <div style="font-size: 13px; color: #94a3b8; margin-bottom: 4px;">획득 유리 블록</div>
                <div style="font-size: 20px; font-weight: bold; color: #38bdf8;">🪟 <span id="artisan-preview-out">2</span>개</div>
              </div>
            </div>

            <button id="btn-artisan-trade" class="shop-btn primary-btn" style="padding: 14px; font-size: 16px; font-weight: bold; margin-top: 8px;">
              ✨ 유리 블록으로 교환하기
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    this.modal = modal;
    this.closeBtn = document.getElementById('btn-close-artisan')!;
    this.selectBlockEl = document.getElementById('artisan-block-select') as HTMLSelectElement;
    this.amountInput = document.getElementById('artisan-amount-input') as HTMLInputElement;
    this.maxAmountBtn = document.getElementById('btn-artisan-max') as HTMLButtonElement;
    this.tradeBtn = document.getElementById('btn-artisan-trade') as HTMLButtonElement;
    this.previewInputCountEl = document.getElementById('artisan-preview-in')!;
    this.previewOutputCountEl = document.getElementById('artisan-preview-out')!;
    this.availableCountEl = document.getElementById('artisan-available-count')!;

    this.initEventListeners();
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

    this.selectBlockEl.addEventListener('change', () => {
      this.updateSelection();
    });

    this.amountInput.addEventListener('input', () => {
      this.updatePreview();
    });

    this.maxAmountBtn.addEventListener('click', () => {
      const type = parseInt(this.selectBlockEl.value) as BlockType;
      const count = this.hotbar.getCount(type);
      this.amountInput.value = Math.max(1, count).toString();
      this.updatePreview();
    });

    this.tradeBtn.addEventListener('click', () => {
      this.executeTrade();
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  public open(): void {
    this.isOpen = true;
    this.modal.classList.remove('hidden');
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.populateBlockOptions();
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

  private populateBlockOptions(): void {
    this.selectBlockEl.innerHTML = '';

    // 인벤토리에 있는 블록들 수집 (공기 및 이미 유리인 블록 제외)
    const availableBlocks = new Map<BlockType, number>();
    for (const slot of this.hotbar.slots) {
      if (!slot.isTool && !slot.isItem && slot.blockType !== undefined && slot.count > 0) {
        if (slot.blockType !== BlockType.AIR && slot.blockType !== BlockType.GLASS) {
          const prev = availableBlocks.get(slot.blockType) || 0;
          availableBlocks.set(slot.blockType, prev + slot.count);
        }
      }
    }

    if (availableBlocks.size === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '교환 가능한 블록이 인벤토리에 없습니다';
      this.selectBlockEl.appendChild(opt);
      this.availableCountEl.textContent = '0';
      this.tradeBtn.disabled = true;
      this.amountInput.value = '0';
      this.amountInput.disabled = true;
      this.maxAmountBtn.disabled = true;
      this.previewInputCountEl.textContent = '0';
      this.previewOutputCountEl.textContent = '0';
      return;
    }

    this.tradeBtn.disabled = false;
    this.amountInput.disabled = false;
    this.maxAmountBtn.disabled = false;

    for (const [bType, count] of availableBlocks.entries()) {
      const meta = BLOCK_METAS[bType];
      const opt = document.createElement('option');
      opt.value = bType.toString();
      opt.textContent = `${meta ? meta.emoji : '🧱'} ${meta ? meta.name : '블록'} (보유: ${count}개)`;
      this.selectBlockEl.appendChild(opt);
    }

    this.amountInput.value = '1';
    this.updateSelection();
  }

  private updateSelection(): void {
    if (!this.selectBlockEl.value) return;
    const type = parseInt(this.selectBlockEl.value) as BlockType;
    const count = this.hotbar.getCount(type);
    this.availableCountEl.textContent = count.toString();
    this.amountInput.max = count.toString();
    this.updatePreview();
  }

  private updatePreview(): void {
    let amt = parseInt(this.amountInput.value) || 0;
    amt = Math.max(0, amt);
    this.previewInputCountEl.textContent = amt.toString();
    this.previewOutputCountEl.textContent = (amt * 2).toString();
  }

  private executeTrade(): void {
    if (!this.selectBlockEl.value) return;
    const type = parseInt(this.selectBlockEl.value) as BlockType;
    let amt = parseInt(this.amountInput.value) || 0;
    if (amt <= 0) return;

    const available = this.hotbar.getCount(type);
    if (available < amt) {
      alert(`보유한 블록이 부족합니다! (필요: ${amt}개, 보유: ${available}개)`);
      return;
    }

    const outputCount = amt * 2;
    if (!this.hotbar.hasSpaceFor(BlockType.GLASS, outputCount)) {
      alert('인벤토리에 유리 블록을 담을 공간이 부족합니다! 가방을 비워주세요.');
      return;
    }

    // 블록 차감
    const consumed = this.hotbar.consumeResource(type, amt);
    if (!consumed) {
      alert('블록 차감에 실패했습니다.');
      return;
    }

    // 유리 블록 지급 (1 : 2 비율)
    const added = this.hotbar.addResource(BlockType.GLASS, outputCount);
    if (!added) {
      // 롤백
      this.hotbar.addResource(type, amt);
      alert('유리 지급에 실패하여 비용이 반환되었습니다.');
      return;
    }

    const meta = BLOCK_METAS[type];
    const blockName = meta ? meta.name : '블록';
    const message = `🪟 [유리 장인] ${blockName} ${amt}개를 유리 블록 ${outputCount}개로 교환했습니다!`;
    if (this.onTradeSuccess) {
      this.onTradeSuccess(message);
    }

    this.populateBlockOptions();
  }
}

