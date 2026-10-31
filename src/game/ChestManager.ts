import { InventorySlot, HotbarUI } from '../ui/Hotbar.ts';
import { BlockType, ToolType, BLOCK_METAS, TOOL_METAS } from '../core/Constants.ts';
import { Database, ref, set, onValue, get } from 'firebase/database';

export class ChestManager {
  private db?: Database;
  private roomCode?: string;
  private chests: Map<string, InventorySlot[]> = new Map();
  public currentOpenChestKey: string | null = null;
  public onChestDataChanged?: (chestKey: string, slots: InventorySlot[]) => void;

  constructor(db?: Database, roomCode?: string) {
    this.db = db;
    this.roomCode = roomCode;
  }

  public setNetwork(db: Database, roomCode: string): void {
    this.db = db;
    this.roomCode = roomCode;
    this.setupFirebaseListener();
  }

  private setupFirebaseListener(): void {
    if (!this.db || !this.roomCode) return;
    const chestsRef = ref(this.db, `rooms/${this.roomCode}/chests`);
    onValue(chestsRef, (snap) => {
      if (!snap.exists()) return;
      const val = snap.val();
      for (const key in val) {
        const rawSlots = val[key] || [];
        const slots: InventorySlot[] = [];
        for (let i = 0; i < 10; i++) {
          slots.push(rawSlots[i] || { count: 0 });
        }
        this.chests.set(key, slots);
        if (this.currentOpenChestKey === key && this.onChestDataChanged) {
          this.onChestDataChanged(key, slots);
        }
      }
    });
  }

  public getOrCreateChest(key: string): InventorySlot[] {
    let slots = this.chests.get(key);
    if (!slots) {
      slots = [];
      for (let i = 0; i < 10; i++) {
        slots.push({ count: 0 });
      }
      this.chests.set(key, slots);
      this.saveChest(key, slots);
    }
    return slots;
  }

  public async saveChest(key: string, slots: InventorySlot[]): Promise<void> {
    this.chests.set(key, slots);
    if (this.db && this.roomCode) {
      try {
        const chestRef = ref(this.db, `rooms/${this.roomCode}/chests/${key}`);
        await set(chestRef, slots);
      } catch (err) {
        console.warn('Failed to save chest to Firebase:', err);
      }
    }
  }

  /**
   * 핫바에서 상자로 아이템 보관 (Hotbar -> Chest)
   */
  public depositFromHotbar(chestKey: string, hotbarSlotIndex: number, hotbar: HotbarUI): boolean {
    const chestSlots = this.getOrCreateChest(chestKey);
    const sourceSlot = hotbar.slots[hotbarSlotIndex];
    if (!sourceSlot || sourceSlot.count <= 0) return false;

    // 1) 같은 블록/아이템이 있는 슬롯 먼저 합치기 (최대 64개)
    if (!sourceSlot.isTool) {
      for (let i = 0; i < 10; i++) {
        const target = chestSlots[i];
        if (target.count > 0 && !target.isTool &&
            target.blockType === sourceSlot.blockType &&
            target.itemType === sourceSlot.itemType &&
            target.count < 64) {
          const moveAmount = Math.min(sourceSlot.count, 64 - target.count);
          target.count += moveAmount;
          sourceSlot.count -= moveAmount;
          if (sourceSlot.count <= 0) {
            sourceSlot.blockType = undefined;
            sourceSlot.itemType = undefined;
            sourceSlot.isItem = false;
          }
          this.saveChest(chestKey, chestSlots);
          hotbar.render();
          return true;
        }
      }
    }

    // 2) 빈 슬롯으로 이동
    const emptyIndex = chestSlots.findIndex(s => s.count === 0 && !s.isTool && !s.isItem);
    if (emptyIndex !== -1) {
      chestSlots[emptyIndex] = { ...sourceSlot };
      sourceSlot.count = 0;
      sourceSlot.blockType = undefined;
      sourceSlot.itemType = undefined;
      sourceSlot.isTool = false;
      sourceSlot.isItem = false;
      sourceSlot.toolType = undefined;

      this.saveChest(chestKey, chestSlots);
      hotbar.render();
      return true;
    }

    return false; // 상자가 가득 참
  }

  /**
   * 상자에서 핫바로 아이템 인출 (Chest -> Hotbar)
   */
  public withdrawToHotbar(chestKey: string, chestSlotIndex: number, hotbar: HotbarUI): boolean {
    const chestSlots = this.getOrCreateChest(chestKey);
    const sourceSlot = chestSlots[chestSlotIndex];
    if (!sourceSlot || sourceSlot.count <= 0) return false;

    // 1) 도구 인출
    if (sourceSlot.isTool && sourceSlot.toolType) {
      const added = hotbar.addTool(sourceSlot.toolType);
      if (added) {
        chestSlots[chestSlotIndex] = { count: 0 };
        this.saveChest(chestKey, chestSlots);
        return true;
      }
      return false;
    }

    // 2) 블록 또는 막대기 인출
    let success = false;
    if (sourceSlot.blockType !== undefined) {
      success = hotbar.addResource(sourceSlot.blockType, sourceSlot.count);
    } else if (sourceSlot.itemType === 'STICK') {
      success = hotbar.addItem('STICK', sourceSlot.count);
    }

    if (success) {
      chestSlots[chestSlotIndex] = { count: 0 };
      this.saveChest(chestKey, chestSlots);
      return true;
    }

    return false; // 핫바가 가득 참
  }

  /**
   * 상자 블록 파괴 시 상자 데이터 제거 및 내부 아이템 반환
   */
  public async deleteChest(key: string): Promise<InventorySlot[] | null> {
    const slots = this.chests.get(key) || null;
    this.chests.delete(key);
    if (this.db && this.roomCode) {
      try {
        const chestRef = ref(this.db, `rooms/${this.roomCode}/chests/${key}`);
        await set(chestRef, null);
      } catch (err) {
        console.warn('Failed to delete chest in Firebase:', err);
      }
    }
    return slots;
  }
}
