import { BlockType, ToolType, BLOCK_METAS, TOOL_METAS, WOOD_SHOVEL_ICON, STONE_SHOVEL_ICON } from '../core/Constants.ts';
import { HotbarUI } from './Hotbar.ts';

export type CraftItemType =
  | { kind: 'block'; type: BlockType }
  | { kind: 'item'; type: 'STICK' }
  | { kind: 'tool'; type: ToolType };

export interface Recipe {
  id: string;
  name: string;
  emoji: string;
  description: string;
  grid: (string | null)[]; // 9칸 (3x3), null은 빈칸
  cost: {
    wood?: number;
    stone?: number;
    plank?: number;
    stick?: number;
  };
  result: {
    type: 'block' | 'item' | 'tool';
    blockType?: BlockType;
    itemType?: 'STICK';
    toolType?: ToolType;
    count: number;
    name: string;
    emoji: string;
  };
}

export const RECIPES: Recipe[] = [
  // 1. 가공 목재 (원목 1개 -> 목재 4개)
  {
    id: 'plank',
    name: '가공 목재 (4개)',
    emoji: '📦',
    description: '참나무 원목 1개로 가공 목재 4개 제작',
    grid: [
      'WOOD', null, null,
      null, null, null,
      null, null, null
    ],
    cost: { wood: 1 },
    result: { type: 'block', blockType: BlockType.PLANK, count: 4, name: '가공 목재', emoji: '📦' }
  },
  // 2. 막대기 (가공목재 2개 -> 막대기 4개)
  {
    id: 'stick',
    name: '막대기 (4개)',
    emoji: '🥢',
    description: '가공 목재 2개로 막대기 4개 제작',
    grid: [
      'PLANK', null, null,
      'PLANK', null, null,
      null, null, null
    ],
    cost: { plank: 2 },
    result: { type: 'item', itemType: 'STICK', count: 4, name: '막대기', emoji: '🥢' }
  },
  // 3. 조합대 (가공목재 4개 -> 조합대 1개)
  {
    id: 'crafting_table',
    name: '조합대 (작업대)',
    emoji: '🪑',
    description: '가공 목재 4개로 3x3 조합대 제작',
    grid: [
      'PLANK', 'PLANK', null,
      'PLANK', 'PLANK', null,
      null, null, null
    ],
    cost: { plank: 4 },
    result: { type: 'block', blockType: BlockType.CRAFTING_TABLE, count: 1, name: '조합대', emoji: '🪑' }
  },
  // 4. 나무 곡괭이 (목재 3 + 막대기 2)
  {
    id: 'wood_pickaxe',
    name: '나무 곡괭이',
    emoji: '⛏️',
    description: '내구도 59 | 돌과 마그마를 채굴할 수 있음',
    grid: [
      'PLANK', 'PLANK', 'PLANK',
      null, 'STICK', null,
      null, 'STICK', null
    ],
    cost: { plank: 3, stick: 2 },
    result: { type: 'tool', toolType: ToolType.WOOD_PICKAXE, count: 1, name: '나무 곡괭이', emoji: '⛏️' }
  },
  // 5. 돌 곡괭이 (돌 3 + 막대기 2)
  {
    id: 'stone_pickaxe',
    name: '돌 곡괭이',
    emoji: '⛏️',
    description: '내구도 131 | 돌을 빠르고 강력하게 채굴',
    grid: [
      'STONE', 'STONE', 'STONE',
      null, 'STICK', null,
      null, 'STICK', null
    ],
    cost: { stone: 3, stick: 2 },
    result: { type: 'tool', toolType: ToolType.STONE_PICKAXE, count: 1, name: '돌 곡괭이', emoji: '⛏️' }
  },
  // 6. 나무 도끼 (목재 3 + 막대기 2)
  {
    id: 'wood_axe',
    name: '나무 도끼',
    emoji: '🪓',
    description: '내구도 59 | 나무와 목재를 빠르게 벌목',
    grid: [
      'PLANK', 'PLANK', null,
      'PLANK', 'STICK', null,
      null, 'STICK', null
    ],
    cost: { plank: 3, stick: 2 },
    result: { type: 'tool', toolType: ToolType.WOOD_AXE, count: 1, name: '나무 도끼', emoji: '🪓' }
  },
  // 7. 돌 도끼 (돌 3 + 막대기 2)
  {
    id: 'stone_axe',
    name: '돌 도끼',
    emoji: '🪓',
    description: '내구도 131 | 원목을 매우 빠르게 대량 벌목',
    grid: [
      'STONE', 'STONE', null,
      'STONE', 'STICK', null,
      null, 'STICK', null
    ],
    cost: { stone: 3, stick: 2 },
    result: { type: 'tool', toolType: ToolType.STONE_AXE, count: 1, name: '돌 도끼', emoji: '🪓' }
  },
  // 8. 나무 삽 (목재 1 + 막대기 2)
  {
    id: 'wood_shovel',
    name: '나무 삽',
    emoji: WOOD_SHOVEL_ICON,
    description: '내구도 59 | 흙을 빠르게 파낼 수 있음',
    grid: [
      null, 'PLANK', null,
      null, 'STICK', null,
      null, 'STICK', null
    ],
    cost: { plank: 1, stick: 2 },
    result: { type: 'tool', toolType: ToolType.WOOD_SHOVEL, count: 1, name: '나무 삽', emoji: WOOD_SHOVEL_ICON }
  },
  // 9. 돌 삽 (돌 1 + 막대기 2)
  {
    id: 'stone_shovel',
    name: '돌 삽',
    emoji: STONE_SHOVEL_ICON,
    description: '내구도 131 | 흙과 잔디를 초고속 굴착',
    grid: [
      null, 'STONE', null,
      null, 'STICK', null,
      null, 'STICK', null
    ],
    cost: { stone: 1, stick: 2 },
    result: { type: 'tool', toolType: ToolType.STONE_SHOVEL, count: 1, name: '돌 삽', emoji: STONE_SHOVEL_ICON }
  },
];

export class CraftingUI {
  private modal: HTMLElement;
  private gridContainer: HTMLElement;
  private resultSlotEl: HTMLElement;
  private recipeListEl: HTMLElement;
  private closeBtn: HTMLElement;
  private hotbar: HotbarUI;

  private currentSelectedRecipe: Recipe | null = null;
  public isOpen: boolean = false;
  public onCraftSuccess?: (msg: string) => void;
  public onClose?: () => void;

  constructor(hotbar: HotbarUI) {
    this.hotbar = hotbar;

    this.modal = document.getElementById('crafting-modal')!;
    this.gridContainer = document.getElementById('crafting-grid')!;
    this.resultSlotEl = document.getElementById('crafting-result-slot')!;
    this.recipeListEl = document.getElementById('recipe-list')!;
    this.closeBtn = document.getElementById('btn-close-crafting')!;

    this.initRecipeBook();
    this.setupListeners();
  }

  private setupListeners(): void {
    this.closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    // 배경 클릭 시 닫기
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    this.resultSlotEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.executeCraft();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' || e.code === 'KeyC') {
        // E 키나 C 키로 조합창 토글
        if (this.isOpen) {
          this.close();
        } else {
          this.open();
        }
      } else if (e.code === 'Escape' && this.isOpen) {
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
    this.updateRecipeAvailability();
    // 기본으로 첫 번째 가능한 레시피 또는 목재 레시피 선택
    this.selectRecipe(RECIPES[0]);
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.modal.classList.add('hidden');
    if (this.onClose) {
      this.onClose();
    }
  }

  private initRecipeBook(): void {
    this.recipeListEl.innerHTML = '';
    RECIPES.forEach(recipe => {
      const itemEl = document.createElement('div');
      itemEl.className = 'recipe-card';
      itemEl.dataset.id = recipe.id;
      itemEl.innerHTML = `
        <span class="recipe-icon">${recipe.emoji}</span>
        <div class="recipe-info">
          <div class="recipe-name">${recipe.name}</div>
          <div class="recipe-cost">${this.formatCost(recipe)}</div>
        </div>
      `;

      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectRecipe(recipe);
      });

      this.recipeListEl.appendChild(itemEl);
    });
  }

  private formatCost(recipe: Recipe): string {
    const parts: string[] = [];
    if (recipe.cost.wood) parts.push(`원목 ×${recipe.cost.wood}`);
    if (recipe.cost.stone) parts.push(`돌 ×${recipe.cost.stone}`);
    if (recipe.cost.plank) parts.push(`목재 ×${recipe.cost.plank}`);
    if (recipe.cost.stick) parts.push(`막대기 ×${recipe.cost.stick}`);
    return parts.join(' | ');
  }

  public selectRecipe(recipe: Recipe): void {
    this.currentSelectedRecipe = recipe;

    // 활성 카드 하이라이트
    const cards = this.recipeListEl.querySelectorAll('.recipe-card');
    cards.forEach(card => {
      if ((card as HTMLElement).dataset.id === recipe.id) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // 3x3 그리드 시각화 렌더링
    this.renderGrid(recipe.grid);

    // 제작 가능 여부 검사 및 결과 슬롯 갱신
    this.updateResultSlot();
  }

  private renderGrid(grid: (string | null)[]): void {
    this.gridContainer.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slotEl = document.createElement('div');
      slotEl.className = 'craft-slot';
      const itemKey = grid[i];

      if (itemKey) {
        slotEl.innerHTML = `<span class="craft-slot-emoji">${this.getEmojiForKey(itemKey)}</span>`;
        slotEl.title = this.getNameForKey(itemKey);
        slotEl.classList.add('has-item');
      }

      this.gridContainer.appendChild(slotEl);
    }
  }

  private getEmojiForKey(key: string): string {
    switch (key) {
      case 'WOOD': return '🪵';
      case 'STONE': return '🪨';
      case 'PLANK': return '📦';
      case 'STICK': return '🥢';
      default: return '❓';
    }
  }

  private getNameForKey(key: string): string {
    switch (key) {
      case 'WOOD': return '참나무 원목';
      case 'STONE': return '돌 블록';
      case 'PLANK': return '가공 목재';
      case 'STICK': return '막대기';
      default: return '';
    }
  }

  private canCraft(recipe: Recipe): boolean {
    const woodHas = this.hotbar.getCount(BlockType.WOOD);
    const stoneHas = this.hotbar.getCount(BlockType.STONE);
    const plankHas = this.hotbar.getCount(BlockType.PLANK);
    const stickHas = this.hotbar.getCount('STICK');

    if (recipe.cost.wood && woodHas < recipe.cost.wood) return false;
    if (recipe.cost.stone && stoneHas < recipe.cost.stone) return false;
    if (recipe.cost.plank && plankHas < recipe.cost.plank) return false;
    if (recipe.cost.stick && stickHas < recipe.cost.stick) return false;

    return true;
  }

  private updateRecipeAvailability(): void {
    const cards = this.recipeListEl.querySelectorAll('.recipe-card');
    cards.forEach((card, idx) => {
      const recipe = RECIPES[idx];
      if (this.canCraft(recipe)) {
        card.classList.remove('disabled');
      } else {
        card.classList.add('disabled');
      }
    });
  }

  private updateResultSlot(): void {
    if (!this.currentSelectedRecipe) {
      this.resultSlotEl.innerHTML = '';
      this.resultSlotEl.classList.remove('craftable');
      return;
    }

    const available = this.canCraft(this.currentSelectedRecipe);
    const res = this.currentSelectedRecipe.result;

    this.resultSlotEl.innerHTML = `
      <div class="result-icon">${res.emoji}</div>
      <span class="result-count">${res.count > 1 ? res.count : ''}</span>
    `;
    this.resultSlotEl.title = `${res.name} (클릭하여 제작)`;

    if (available) {
      this.resultSlotEl.classList.add('craftable');
    } else {
      this.resultSlotEl.classList.remove('craftable');
    }
  }

  private executeCraft(): void {
    if (!this.currentSelectedRecipe) return;
    if (!this.canCraft(this.currentSelectedRecipe)) {
      if (this.onCraftSuccess) {
        this.onCraftSuccess('재료가 부족하여 제작할 수 없습니다! 자원을 채취해오세요.');
      }
      return;
    }

    const r = this.currentSelectedRecipe;

    // 1. 재료 차감
    if (r.cost.wood) this.hotbar.consumeResource(BlockType.WOOD, r.cost.wood);
    if (r.cost.stone) this.hotbar.consumeResource(BlockType.STONE, r.cost.stone);
    if (r.cost.plank) this.hotbar.consumeResource(BlockType.PLANK, r.cost.plank);
    if (r.cost.stick) this.hotbar.consumeItem('STICK', r.cost.stick);

    // 2. 결과물 지급
    if (r.result.type === 'tool' && r.result.toolType) {
      this.hotbar.addTool(r.result.toolType);
    } else if (r.result.type === 'block' && r.result.blockType !== undefined) {
      this.hotbar.addResource(r.result.blockType, r.result.count);
    } else if (r.result.type === 'item' && r.result.itemType) {
      this.hotbar.addItem(r.result.itemType, r.result.count);
    }

    // 3. UI 갱신
    this.updateRecipeAvailability();
    this.updateResultSlot();

    if (this.onCraftSuccess) {
      this.onCraftSuccess(`🎉 [제작 성공] ${r.result.name} (${r.result.count}개)을(를) 제작했습니다!`);
    }
  }
}
