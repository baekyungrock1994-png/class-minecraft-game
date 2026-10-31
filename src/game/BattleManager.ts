import { Database, ref, set, onValue } from 'firebase/database';
import { BlockType, ToolType } from '../core/Constants.ts';
import { HotbarUI } from '../ui/Hotbar.ts';

export interface BattleBetItem {
  type: 'block' | 'item' | 'tool';
  blockType?: BlockType;
  itemType?: 'STICK';
  toolType?: ToolType;
  count: number;
  name: string;
  emoji: string;
}

export interface BattleSession {
  id: string;
  challengerUid: string;
  challengerName: string;
  challengerPlot: number;
  targetUid: string;
  targetName: string;
  targetPlot: number;
  betItem: BattleBetItem;
  status: 'requested' | 'accepted_by_target' | 'in_progress' | 'ended';
  challengerHp: number;
  targetHp: number;
  winnerUid?: string;
  winnerName?: string;
  startedAt?: number;
}

export class BattleManager {
  private db?: Database;
  private roomCode?: string;
  public myUid: string = '';
  public myName: string = '';
  public myRole: 'teacher' | 'student' = 'student';

  public currentSession: BattleSession | null = null;

  // 콜백들
  public onBattleRequestedToMe?: (session: BattleSession) => void;
  public onTeacherApprovalRequired?: (session: BattleSession) => void;
  public onBattleStarted?: (session: BattleSession) => void;
  public onBattleEnded?: (session: BattleSession, isWinner: boolean) => void;
  public onHpUpdate?: (challengerHp: number, targetHp: number) => void;

  constructor() {}

  public setNetwork(db: Database, roomCode: string, myUid: string, myName: string, role: 'teacher' | 'student'): void {
    this.db = db;
    this.roomCode = roomCode;
    this.myUid = myUid;
    this.myName = myName;
    this.myRole = role;
    this.setupFirebaseListener();
  }

  private setupFirebaseListener(): void {
    if (!this.db || !this.roomCode) return;
    const battleRef = ref(this.db, `rooms/${this.roomCode}/battle`);
    onValue(battleRef, (snap) => {
      const data: BattleSession | null = snap.val() || null;
      const prevStatus = this.currentSession?.status;
      this.currentSession = data;

      if (!data) return;

      // 1. 상대방에게 배틀 신청이 들어온 경우
      if (data.status === 'requested' && data.targetUid === this.myUid && prevStatus !== 'requested') {
        if (this.onBattleRequestedToMe) {
          this.onBattleRequestedToMe(data);
        }
      }

      // 2. 상대방이 수락하여 교사의 승인이 필요한 경우 (교사 화면에 알림)
      if (data.status === 'accepted_by_target' && this.myRole === 'teacher' && prevStatus !== 'accepted_by_target') {
        if (this.onTeacherApprovalRequired) {
          this.onTeacherApprovalRequired(data);
        }
      }

      // 3. 교사가 승인하여 배틀이 시작된 경우 (참여자 모두 투기장으로 이동 및 배틀 시작)
      if (data.status === 'in_progress' && prevStatus !== 'in_progress') {
        if (this.onBattleStarted) {
          this.onBattleStarted(data);
        }
      }

      // 4. HP 실시간 동기화
      if (data.status === 'in_progress') {
        if (this.onHpUpdate) {
          this.onHpUpdate(data.challengerHp, data.targetHp);
        }
      }

      // 5. 배틀 종료 및 승패 결정
      if (data.status === 'ended' && prevStatus !== 'ended') {
        const isWinner = data.winnerUid === this.myUid;
        if (this.onBattleEnded) {
          this.onBattleEnded(data, isWinner);
        }
      }
    });
  }

  /**
   * 1단계: 배틀 신청하기
   */
  public async requestBattle(
    targetUid: string,
    targetName: string,
    targetPlot: number,
    myPlot: number,
    betItem: BattleBetItem,
    hotbar: HotbarUI
  ): Promise<boolean> {
    if (!this.db || !this.roomCode) return false;

    // 베팅할 아이템 소지 여부 검사 및 차감
    const consumed = this.consumeBetItem(betItem, hotbar);
    if (!consumed) return false;

    const session: BattleSession = {
      id: `battle_${Date.now()}`,
      challengerUid: this.myUid,
      challengerName: this.myName,
      challengerPlot: myPlot,
      targetUid,
      targetName,
      targetPlot,
      betItem,
      status: 'requested',
      challengerHp: 100,
      targetHp: 100,
    };

    const battleRef = ref(this.db, `rooms/${this.roomCode}/battle`);
    await set(battleRef, session);
    return true;
  }

  /**
   * 2단계: 상대방의 배틀 신청 수락하기 (동일 아이템 보유 필수)
   */
  public async acceptBattle(hotbar: HotbarUI): Promise<boolean> {
    if (!this.db || !this.roomCode || !this.currentSession) return false;

    // 상대방과 동일한 베팅 아이템 소지 여부 검사 및 차감
    const consumed = this.consumeBetItem(this.currentSession.betItem, hotbar);
    if (!consumed) return false;

    const battleRef = ref(this.db, `rooms/${this.roomCode}/battle/status`);
    await set(battleRef, 'accepted_by_target');
    return true;
  }

  /**
   * 상대방의 배틀 거절 또는 취소
   */
  public async rejectOrCancelBattle(refundHotbar?: HotbarUI): Promise<void> {
    if (!this.db || !this.roomCode) return;
    if (this.currentSession && refundHotbar) {
      // 신청자였으면 베팅 아이템 환불
      if (this.currentSession.challengerUid === this.myUid) {
        this.refundBetItem(this.currentSession.betItem, refundHotbar);
      }
    }
    const battleRef = ref(this.db, `rooms/${this.roomCode}/battle`);
    await set(battleRef, null);
  }

  /**
   * 3단계: 교사(관리자)의 최종 배틀 승인
   */
  public async approveBattleByTeacher(): Promise<void> {
    if (!this.db || !this.roomCode || !this.currentSession) return;
    const battleRef = ref(this.db, `rooms/${this.roomCode}/battle`);
    await set(battleRef, {
      ...this.currentSession,
      status: 'in_progress',
      startedAt: Date.now(),
      challengerHp: 100,
      targetHp: 100,
    });
  }

  /**
   * 투기장 내 공격 시 데미지 적용
   */
  public async applyAttackDamage(victimUid: string, damage: number, hotbar?: HotbarUI): Promise<void> {
    if (!this.db || !this.roomCode || !this.currentSession || this.currentSession.status !== 'in_progress') return;

    let newChallengerHp = this.currentSession.challengerHp;
    let newTargetHp = this.currentSession.targetHp;

    if (victimUid === this.currentSession.challengerUid) {
      newChallengerHp = Math.max(0, newChallengerHp - damage);
    } else if (victimUid === this.currentSession.targetUid) {
      newTargetHp = Math.max(0, newTargetHp - damage);
    }

    if (newChallengerHp <= 0 || newTargetHp <= 0) {
      // 배틀 종료! 승자 결정
      const winnerUid = newChallengerHp <= 0 ? this.currentSession.targetUid : this.currentSession.challengerUid;
      const winnerName = newChallengerHp <= 0 ? this.currentSession.targetName : this.currentSession.challengerName;

      const battleRef = ref(this.db, `rooms/${this.roomCode}/battle`);
      await set(battleRef, {
        ...this.currentSession,
        status: 'ended',
        challengerHp: newChallengerHp,
        targetHp: newTargetHp,
        winnerUid,
        winnerName,
      });
    } else {
      // HP 갱신
      const hpRef = ref(this.db, `rooms/${this.roomCode}/battle`);
      await set(hpRef, {
        ...this.currentSession,
        challengerHp: newChallengerHp,
        targetHp: newTargetHp,
      });
    }
  }

  /**
   * 베팅 아이템 소지 여부 검사
   */
  public hasBetItem(item: BattleBetItem, hotbar: HotbarUI): boolean {
    if (item.type === 'block' && item.blockType !== undefined) {
      return hotbar.getCount(item.blockType) >= item.count;
    }
    if (item.type === 'item' && item.itemType === 'STICK') {
      return hotbar.getCount('STICK') >= item.count;
    }
    if (item.type === 'tool' && item.toolType) {
      return hotbar.slots.some(s => s.isTool && s.toolType === item.toolType);
    }
    return false;
  }

  /**
   * 베팅 아이템 차감
   */
  private consumeBetItem(item: BattleBetItem, hotbar: HotbarUI): boolean {
    if (!this.hasBetItem(item, hotbar)) return false;

    if (item.type === 'block' && item.blockType !== undefined) {
      return hotbar.consumeResource(item.blockType, item.count);
    }
    if (item.type === 'item' && item.itemType === 'STICK') {
      return hotbar.consumeItem('STICK', item.count);
    }
    if (item.type === 'tool' && item.toolType) {
      const idx = hotbar.slots.findIndex(s => s.isTool && s.toolType === item.toolType);
      if (idx !== -1) {
        hotbar.slots[idx] = { count: 0 };
        hotbar.render();
        return true;
      }
    }
    return false;
  }

  /**
   * 베팅 아이템 환불 또는 승리 보상 지급
   */
  public refundBetItem(item: BattleBetItem, hotbar: HotbarUI): void {
    if (item.type === 'block' && item.blockType !== undefined) {
      hotbar.addResource(item.blockType, item.count);
    } else if (item.type === 'item' && item.itemType === 'STICK') {
      hotbar.addItem('STICK', item.count);
    } else if (item.type === 'tool' && item.toolType) {
      hotbar.addTool(item.toolType);
    }
    hotbar.render();
  }
}
