import { HotbarUI } from './Hotbar';
import { BlockType } from '../core/Constants';

export class ShopUI {
  private hotbar: HotbarUI;
  private modal: HTMLElement;
  private closeBtn: HTMLElement;
  public isOpen: boolean = false;

  public onOpen?: () => void;
  public onClose?: () => void;
  public onTradeSuccess?: (msg: string) => void;

  // DOM elements
  private dirtBalanceEl: HTMLElement;
  private stoneBalanceEl: HTMLElement;
  private saplingBalanceEl: HTMLElement;

  private buyDirt1Btn: HTMLButtonElement;
  private buyDirtMaxBtn: HTMLButtonElement;
  private buyStone1Btn: HTMLButtonElement;
  private buyStoneMaxBtn: HTMLButtonElement;

  constructor(hotbar: HotbarUI) {
    this.hotbar = hotbar;
    this.modal = document.getElementById('shop-modal')!;
    this.closeBtn = document.getElementById('btn-close-shop')!;

    this.dirtBalanceEl = document.getElementById('shop-dirt-balance')!;
    this.stoneBalanceEl = document.getElementById('shop-stone-balance')!;
    this.saplingBalanceEl = document.getElementById('shop-sapling-balance')!;

    this.buyDirt1Btn = document.getElementById('btn-buy-seed-dirt-1') as HTMLButtonElement;
    this.buyDirtMaxBtn = document.getElementById('btn-buy-seed-dirt-max') as HTMLButtonElement;
    this.buyStone1Btn = document.getElementById('btn-buy-seed-stone-1') as HTMLButtonElement;
    this.buyStoneMaxBtn = document.getElementById('btn-buy-seed-stone-max') as HTMLButtonElement;

    this.initEventListeners();
  }

  private initEventListeners(): void {
    this.closeBtn.addEventListener('click', () => {
      this.close();
    });

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    // 흙 10개 -> 씨앗 1개 구매
    this.buyDirt1Btn.addEventListener('click', () => {
      this.handleTrade(BlockType.DIRT, 1);
    });

    // 흙 최대 교환
    this.buyDirtMaxBtn.addEventListener('click', () => {
      const dirtCount = this.hotbar.getCount(BlockType.DIRT);
      const maxTrade = Math.floor(dirtCount / 10);
      if (maxTrade <= 0) {
        alert('교환할 흙 블럭이 부족합니다! (10개 필요)');
        return;
      }
      this.handleTrade(BlockType.DIRT, maxTrade);
    });

    // 돌 10개 -> 씨앗 1개 구매
    this.buyStone1Btn.addEventListener('click', () => {
      this.handleTrade(BlockType.STONE, 1);
    });

    // 돌 최대 교환
    this.buyStoneMaxBtn.addEventListener('click', () => {
      const stoneCount = this.hotbar.getCount(BlockType.STONE);
      const maxTrade = Math.floor(stoneCount / 10);
      if (maxTrade <= 0) {
        alert('교환할 돌 블럭이 부족합니다! (10개 필요)');
        return;
      }
      this.handleTrade(BlockType.STONE, maxTrade);
    });

    // ESC or B to close when shop is open
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(targetTag)) return;

      if (e.code === 'Escape' || e.code === 'KeyB') {
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
    this.updateBalances();
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

  public updateBalances(): void {
    const dirtCount = this.hotbar.getCount(BlockType.DIRT);
    const stoneCount = this.hotbar.getCount(BlockType.STONE);
    const saplingCount = this.hotbar.getCount('TREE_SAPLING');

    if (this.dirtBalanceEl) this.dirtBalanceEl.textContent = `${dirtCount}개`;
    if (this.stoneBalanceEl) this.stoneBalanceEl.textContent = `${stoneCount}개`;
    if (this.saplingBalanceEl) this.saplingBalanceEl.textContent = `${saplingCount}개`;

    // 흙 버튼 활성화/비활성화
    const maxDirtTrades = Math.floor(dirtCount / 10);
    this.buyDirt1Btn.disabled = maxDirtTrades < 1;
    this.buyDirtMaxBtn.disabled = maxDirtTrades < 1;
    this.buyDirtMaxBtn.textContent = maxDirtTrades > 1 ? `최대 교환 (${maxDirtTrades}개)` : '최대 교환';

    // 돌 버튼 활성화/비활성화
    const maxStoneTrades = Math.floor(stoneCount / 10);
    this.buyStone1Btn.disabled = maxStoneTrades < 1;
    this.buyStoneMaxBtn.disabled = maxStoneTrades < 1;
    this.buyStoneMaxBtn.textContent = maxStoneTrades > 1 ? `최대 교환 (${maxStoneTrades}개)` : '최대 교환';
  }

  private handleTrade(costType: BlockType.DIRT | BlockType.STONE, count: number): void {
    const costPerUnit = 10;
    const totalCost = costPerUnit * count;
    const currentBlocks = this.hotbar.getCount(costType);

    if (currentBlocks < totalCost) {
      const typeName = costType === BlockType.DIRT ? '흙' : '돌';
      alert(`보유한 ${typeName} 블럭이 부족합니다! (필요: ${totalCost}개, 보유: ${currentBlocks}개)`);
      return;
    }

    // 핫바 인벤토리 공간 확인
    if (!this.hotbar.hasSpaceFor('TREE_SAPLING', count)) {
      alert('인벤토리에 나무 씨앗을 담을 빈 공간이 부족합니다!');
      return;
    }

    // 블럭 차감
    const consumed = this.hotbar.consumeResource(costType, totalCost);
    if (!consumed) {
      alert('블럭 차감에 실패했습니다.');
      return;
    }

    // 나무 씨앗 지급
    const added = this.hotbar.addItem('TREE_SAPLING', count);

    if (!added) {
      // 롤백 (안전장치)
      this.hotbar.addResource(costType, totalCost);
      alert('나무 씨앗 지급에 실패하여 비용이 반환되었습니다.');
      return;
    }

    this.updateBalances();
    const sourceName = costType === BlockType.DIRT ? '흙' : '돌';
    const message = `🌱 나무 씨앗 ${count}개를 구매했습니다! (${sourceName} ${totalCost}개 소모)`;
    if (this.onTradeSuccess) {
      this.onTradeSuccess(message);
    }
  }
}
