import { BlockType, BLOCK_METAS, ToolType, TOOL_METAS } from '../core/Constants.ts';

export interface InventorySlot {
  isTool?: boolean;
  toolType?: ToolType;
  durability?: number;
  maxDurability?: number;

  blockType?: BlockType;

  isItem?: boolean;
  itemType?: 'STICK' | 'RETURN_STONE';
  itemName?: string;
  itemEmoji?: string;

  count: number;
}

export class HotbarUI {
  private container: HTMLElement;
  public slots: InventorySlot[] = [
    // 1번: 기본 나무 도끼 (내구도 59)
    { isTool: true, toolType: ToolType.WOOD_AXE, durability: 59, maxDurability: 59, count: 1 },
    // 2~4번: 핵심 기본 3대 재료 (나무, 흙, 돌)
    { blockType: BlockType.WOOD, count: 12 },
    { blockType: BlockType.DIRT, count: 20 },
    { blockType: BlockType.STONE, count: 10 },
    // 5~7번: 파생 조합 재료 및 조합대
    { blockType: BlockType.PLANK, count: 0 },
    { isItem: true, itemType: 'STICK', itemName: '막대기', itemEmoji: '🥢', count: 0 },
    { blockType: BlockType.CRAFTING_TABLE, count: 0 },
    // 8번: 제작 도구 여유 슬롯
    { count: 0 },
    // 9번: 마을 귀환석 (우클릭 또는 [ 키로 평지마을 즉시 귀환)
    { isItem: true, itemType: 'RETURN_STONE', itemName: '마을 귀환석', itemEmoji: '🧭', count: 1 },
  ];
  public selectedIndex: number = 0;
  public onSelectChange?: (slot: InventorySlot) => void;
  public onToolBreak?: (toolName: string) => void;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Hotbar container #${containerId} not found`);
    this.container = el;

    this.render();
    this.setupListeners();
  }

  public getSelectedSlot(): InventorySlot {
    return this.slots[this.selectedIndex];
  }

  public getSelectedTool(): ToolType {
    const slot = this.getSelectedSlot();
    return slot.isTool && slot.toolType ? slot.toolType : ToolType.NONE;
  }

  public getSelectedBlock(): BlockType {
    const slot = this.getSelectedSlot();
    if (!slot.isTool && !slot.isItem && slot.blockType !== undefined && slot.count > 0) {
      return slot.blockType;
    }
    return BlockType.AIR;
  }

  /**
   * 도구 내구도 소모 (채굴 성공 시 호출)
   */
  public useCurrentTool(): void {
    const slot = this.getSelectedSlot();
    if (slot.isTool && slot.durability !== undefined) {
      slot.durability -= 1;

      if (slot.durability <= 0) {
        // 도구 파괴
        const brokenName = TOOL_METAS[slot.toolType!].name;
        slot.isTool = false;
        slot.toolType = undefined;
        slot.count = 0;
        this.render();
        if (this.onToolBreak) this.onToolBreak(brokenName);
      } else {
        this.render();
      }
    }
  }

  public getCount(type: BlockType | 'STICK'): number {
    if (type === 'STICK') {
      const slot = this.slots.find(s => s.isItem && s.itemType === 'STICK');
      return slot ? slot.count : 0;
    }
    const slot = this.slots.find(s => !s.isTool && !s.isItem && s.blockType === type);
    return slot ? slot.count : 0;
  }

  public addResource(type: BlockType, amount: number = 1): void {
    let slot = this.slots.find(s => !s.isTool && !s.isItem && s.blockType === type);
    if (!slot) {
      // 빈 슬롯 찾기
      slot = this.slots.find(s => s.count === 0 && !s.isTool);
      if (slot) {
        slot.isTool = false;
        slot.isItem = false;
        slot.blockType = type;
        slot.count = 0;
      }
    }
    if (slot) {
      slot.count += amount;
      this.render();
    }
  }

  public consumeResource(type: BlockType, amount: number = 1): boolean {
    const slot = this.slots.find(s => !s.isTool && !s.isItem && s.blockType === type);
    if (slot && slot.count >= amount) {
      slot.count -= amount;
      this.render();
      return true;
    }
    return false;
  }

  public addItem(itemType: 'STICK', amount: number = 1): void {
    let slot = this.slots.find(s => s.isItem && s.itemType === itemType);
    if (!slot) {
      slot = this.slots.find(s => s.count === 0 && !s.isTool);
      if (slot) {
        slot.isTool = false;
        slot.isItem = true;
        slot.itemType = itemType;
        slot.itemName = '막대기';
        slot.itemEmoji = '🥢';
        slot.count = 0;
      }
    }
    if (slot) {
      slot.count += amount;
      this.render();
    }
  }

  public consumeItem(itemType: 'STICK', amount: number = 1): boolean {
    const slot = this.slots.find(s => s.isItem && s.itemType === itemType);
    if (slot && slot.count >= amount) {
      slot.count -= amount;
      this.render();
      return true;
    }
    return false;
  }

  public addTool(toolType: ToolType): boolean {
    const meta = TOOL_METAS[toolType];
    // 빈 슬롯 또는 카운트가 0인 슬롯 찾기 (마을 귀환석 슬롯 보호)
    let emptySlot = this.slots.find(s => s.count === 0 && !s.isTool && !s.isItem);
    if (!emptySlot) {
      emptySlot = this.slots.find(s => s.count === 0 && s.itemType !== 'RETURN_STONE');
    }
    if (!emptySlot) {
      // 8번 슬롯 우선 대체 (9번 귀환석 보호)
      emptySlot = this.slots[7] && this.slots[7].itemType !== 'RETURN_STONE' ? this.slots[7] : this.slots[0];
    }

    if (emptySlot) {
      emptySlot.isTool = true;
      emptySlot.toolType = toolType;
      emptySlot.durability = meta.maxDurability;
      emptySlot.maxDurability = meta.maxDurability;
      emptySlot.count = 1;
      emptySlot.blockType = undefined;
      emptySlot.isItem = false;
      this.render();
      return true;
    }
    return false;
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        this.selectIndex(num - 1);
      }
    });

    window.addEventListener('wheel', (e) => {
      if (e.deltaY > 0) {
        this.selectIndex((this.selectedIndex + 1) % this.slots.length);
      } else {
        this.selectIndex((this.selectedIndex - 1 + this.slots.length) % this.slots.length);
      }
    });
  }

  public selectIndex(idx: number): void {
    if (idx < 0 || idx >= this.slots.length) return;
    this.selectedIndex = idx;

    const slotEls = this.container.querySelectorAll('.slot');
    slotEls.forEach((el, i) => {
      if (i === idx) el.classList.add('active');
      else el.classList.remove('active');
    });

    if (this.onSelectChange) {
      this.onSelectChange(this.getSelectedSlot());
    }
  }

  public render(): void {
    this.container.innerHTML = '';
    this.slots.forEach((slot, i) => {
      const slotEl = document.createElement('div');
      slotEl.className = `slot ${i === this.selectedIndex ? 'active' : ''}`;

      if (slot.isTool && slot.toolType) {
        const meta = TOOL_METAS[slot.toolType];
        slotEl.title = `${meta.name} (내구도: ${slot.durability}/${slot.maxDurability})`;
        const pct = Math.max(0, (slot.durability! / slot.maxDurability!) * 100);
        const barColor = pct > 50 ? '#10b981' : pct > 20 ? '#f59e0b' : '#ef4444';

        slotEl.innerHTML = `
          <span class="slot-num">${i + 1}</span>
          <div class="slot-icon" style="background: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; font-size: 20px;">
            ${meta.emoji}
          </div>
          <div class="durability-bar">
            <div class="durability-fill" style="width: ${pct}%; background-color: ${barColor};"></div>
          </div>
        `;
      } else if (slot.isItem && slot.itemType) {
        slotEl.title = `${slot.itemName} (수량: ${slot.count})`;
        slotEl.innerHTML = `
          <span class="slot-num">${i + 1}</span>
          <div class="slot-icon" style="background: rgba(180, 83, 9, 0.2); display: flex; align-items: center; justify-content: center; font-size: 20px;">
            ${slot.itemEmoji}
          </div>
          <span class="slot-count" id="slot-count-${i}">${slot.count}</span>
        `;
      } else if (slot.blockType !== undefined) {
        const meta = BLOCK_METAS[slot.blockType];
        slotEl.title = `${meta.name} (키: ${i + 1})`;
        slotEl.innerHTML = `
          <span class="slot-num">${i + 1}</span>
          <div class="slot-icon" style="background: ${meta.iconBg}; display: flex; align-items: center; justify-content: center; font-size: 16px;">
            ${meta.emoji}
          </div>
          <span class="slot-count" id="slot-count-${i}">${slot.count}</span>
        `;
      } else {
        slotEl.innerHTML = `<span class="slot-num">${i + 1}</span>`;
      }

      slotEl.addEventListener('click', () => this.selectIndex(i));
      this.container.appendChild(slotEl);
    });
  }
}
