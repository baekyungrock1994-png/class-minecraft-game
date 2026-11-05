import { Database, ref, set, onValue, get, remove, update, onDisconnect, Unsubscribe } from 'firebase/database';
import { BlockType } from '../core/Constants.ts';

export type RpsChoice = 'ROCK' | 'PAPER' | 'SCISSORS';

export interface CardBet {
  type: 'block' | 'item';
  blockType?: BlockType;
  itemType?: string;
  count: number;
  name: string;
  emoji: string;
}

export interface CardParticipant {
  uid: string;
  name: string;
  ready: boolean;
  bet?: CardBet | null;
  choice?: RpsChoice | null;
  submitted: boolean;
}

export interface CardArenaState {
  id: number;
  p1?: CardParticipant | null;
  p2?: CardParticipant | null;
  phase: 'LOBBY' | 'BETTING' | 'RESULT';
  winnerUid?: string | 'DRAW' | null;
  roundId: number;
}

export class BattleManager {
  private db?: Database;
  private roomCode?: string;
  private currentUser?: { uid: string };
  private playerName: string = '';

  public currentRoomId: number | null = null;
  public mySlot: 'p1' | 'p2' | null = null;

  private roomUnsubscribe?: Unsubscribe;
  private listUnsubscribe?: Unsubscribe;

  public onArenaStateChange?: (state: CardArenaState) => void;
  public onArenaRoomsUpdate?: (rooms: Record<number, { count: number; names: string[] }>) => void;
  public onGameResult?: (winnerSlot: 'p1' | 'p2' | 'DRAW', p1Bet: CardBet | null, p2Bet: CardBet | null) => void;

  private lastRoomsSummary: Record<number, { count: number; names: string[] }> = {};

  constructor(db?: Database, roomCode?: string, user?: { uid: string }, playerName?: string) {
    this.db = db;
    this.roomCode = roomCode;
    this.currentUser = user;
    this.playerName = playerName || '도전자';
  }

  public setNetwork(db: Database, roomCode: string, user: { uid: string }, playerName: string): void {
    this.db = db;
    this.roomCode = roomCode;
    this.currentUser = user;
    this.playerName = playerName;
    this.listenToArenaList();
  }

  public listenToArenaList(): void {
    if (!this.db || !this.roomCode) return;
    if (this.listUnsubscribe) this.listUnsubscribe();

    const arenasRef = ref(this.db, `rooms/${this.roomCode}/arenas`);
    this.listUnsubscribe = onValue(arenasRef, (snap) => {
      const summary: Record<number, { count: number; names: string[] }> = {};
      for (let i = 1; i <= 10; i++) {
        summary[i] = { count: 0, names: [] };
      }

      if (snap.exists()) {
        const val = snap.val();
        for (let i = 1; i <= 10; i++) {
          const room = val[`room_${i}`] as CardArenaState;
          if (room) {
            let cnt = 0;
            const names: string[] = [];
            if (room.p1 && room.p1.uid) {
              cnt++;
              names.push(room.p1.name);
            }
            if (room.p2 && room.p2.uid) {
              cnt++;
              names.push(room.p2.name);
            }
            summary[i] = { count: cnt, names };
          }
        }
      }

      this.lastRoomsSummary = summary;
      if (this.onArenaRoomsUpdate) {
        this.onArenaRoomsUpdate(summary);
      }
    });
  }

  /** 비어있는(참여 0명) 카드 투기장 번호 중 가장 빠른 번호를 반환 (없으면 null) */
  public getFirstAvailableRoomId(): number | null {
    for (let i = 1; i <= 10; i++) {
      const info = this.lastRoomsSummary[i];
      if (!info || info.count === 0) return i;
    }
    return null;
  }

  public async joinRoom(roomId: number): Promise<{ success: boolean; message?: string }> {
    if (!this.db || !this.roomCode || !this.currentUser) {
      return { success: false, message: '서버에 연결되어 있지 않습니다.' };
    }

    if (this.currentRoomId) {
      await this.leaveRoom();
    }

    const roomRef = ref(this.db, `rooms/${this.roomCode}/arenas/room_${roomId}`);
    const snap = await get(roomRef);
    const room = (snap.exists() ? snap.val() : { id: roomId, phase: 'LOBBY', roundId: 1 }) as CardArenaState;

    let slot: 'p1' | 'p2' | null = null;
    if (!room.p1 || !room.p1.uid || room.p1.uid === this.currentUser.uid) {
      slot = 'p1';
    } else if (!room.p2 || !room.p2.uid || room.p2.uid === this.currentUser.uid) {
      slot = 'p2';
    } else {
      return { success: false, message: '해당 투기장은 이미 2명이 가득 찼습니다!' };
    }

    this.currentRoomId = roomId;
    this.mySlot = slot;

    const myParticipant: CardParticipant = {
      uid: this.currentUser.uid,
      name: this.playerName,
      ready: false,
      bet: null,
      choice: null,
      submitted: false
    };

    await update(roomRef, {
      [slot]: myParticipant,
      phase: room.phase || 'LOBBY',
      roundId: room.roundId || 1
    });

    onDisconnect(ref(this.db, `rooms/${this.roomCode}/arenas/room_${roomId}/${slot}`)).remove();

    this.listenToCurrentArena();
    return { success: true };
  }

  private listenToCurrentArena(): void {
    if (!this.db || !this.roomCode || !this.currentRoomId) return;
    if (this.roomUnsubscribe) this.roomUnsubscribe();

    const roomRef = ref(this.db, `rooms/${this.roomCode}/arenas/room_${this.currentRoomId}`);
    let processedRound = 0;

    this.roomUnsubscribe = onValue(roomRef, async (snap) => {
      if (!snap.exists()) return;
      const room = snap.val() as CardArenaState;

      if (this.onArenaStateChange) {
        this.onArenaStateChange(room);
      }

      // 1. 둘 다 '카드게임 시작'을 눌렀을 때 배팅 단계로 전이
      if (room.phase === 'LOBBY' && room.p1 && room.p2 && room.p1.ready && room.p2.ready) {
        if (this.mySlot === 'p1') {
          await update(roomRef, {
            phase: 'BETTING'
          });
        }
      }

      // 2. 둘 다 배팅 및 가위바위보 선택 후 '배틀!' 제출 완료 시 판정!
      if (room.phase === 'BETTING' && room.p1 && room.p2 && room.p1.submitted && room.p2.submitted) {
        if (this.mySlot === 'p1') {
          const p1Choice = room.p1.choice;
          const p2Choice = room.p2.choice;

          let winner: 'p1' | 'p2' | 'DRAW' = 'DRAW';
          if (p1Choice === p2Choice) {
            winner = 'DRAW';
          } else if (
            (p1Choice === 'ROCK' && p2Choice === 'SCISSORS') ||
            (p1Choice === 'SCISSORS' && p2Choice === 'PAPER') ||
            (p1Choice === 'PAPER' && p2Choice === 'ROCK')
          ) {
            winner = 'p1';
          } else {
            winner = 'p2';
          }

          const winnerUid = winner === 'DRAW' ? 'DRAW' : (winner === 'p1' ? room.p1.uid : room.p2.uid);

          await update(roomRef, {
            phase: 'RESULT',
            winnerUid: winnerUid
          });
        }
      }

      // 3. 결과 상태 감지 및 보상 정산
      if (room.phase === 'RESULT' && room.winnerUid && room.roundId !== processedRound) {
        processedRound = room.roundId;
        const winnerSlot = room.winnerUid === 'DRAW' ? 'DRAW' : (room.p1 && room.winnerUid === room.p1.uid ? 'p1' : 'p2');

        if (this.onGameResult) {
          this.onGameResult(winnerSlot, room.p1?.bet || null, room.p2?.bet || null);
        }
      }
    });
  }

  public async setReady(ready: boolean): Promise<void> {
    if (!this.db || !this.roomCode || !this.currentRoomId || !this.mySlot) return;
    const roomRef = ref(this.db, `rooms/${this.roomCode}/arenas/room_${this.currentRoomId}`);
    await update(roomRef, {
      [`${this.mySlot}/ready`]: ready
    });
  }

  public async submitBattle(bet: CardBet, choice: RpsChoice): Promise<void> {
    if (!this.db || !this.roomCode || !this.currentRoomId || !this.mySlot) return;
    const roomRef = ref(this.db, `rooms/${this.roomCode}/arenas/room_${this.currentRoomId}`);
    await update(roomRef, {
      [`${this.mySlot}/bet`]: bet,
      [`${this.mySlot}/choice`]: choice,
      [`${this.mySlot}/submitted`]: true
    });
  }

  public async restartGame(): Promise<void> {
    if (!this.db || !this.roomCode || !this.currentRoomId) return;
    const roomRef = ref(this.db, `rooms/${this.roomCode}/arenas/room_${this.currentRoomId}`);
    const snap = await get(roomRef);
    if (!snap.exists()) return;
    const room = snap.val() as CardArenaState;

    await update(roomRef, {
      phase: 'LOBBY',
      winnerUid: null,
      roundId: (room.roundId || 1) + 1,
      'p1/ready': false,
      'p1/bet': null,
      'p1/choice': null,
      'p1/submitted': false,
      'p2/ready': false,
      'p2/bet': null,
      'p2/choice': null,
      'p2/submitted': false
    });
  }

  public async leaveRoom(): Promise<void> {
    if (!this.db || !this.roomCode || !this.currentRoomId || !this.mySlot) return;

    if (this.roomUnsubscribe) {
      this.roomUnsubscribe();
      this.roomUnsubscribe = undefined;
    }

    const slotRef = ref(this.db, `rooms/${this.roomCode}/arenas/room_${this.currentRoomId}/${this.mySlot}`);
    await remove(slotRef);

    this.currentRoomId = null;
    this.mySlot = null;
  }
}
