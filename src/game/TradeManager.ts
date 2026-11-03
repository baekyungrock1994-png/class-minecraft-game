import { Database, ref, set, onValue, get, remove, update, onDisconnect, Unsubscribe } from 'firebase/database';
import { BlockType, ToolType } from '../core/Constants.ts';

export interface TradeOffer {
  type: 'block' | 'item' | 'tool';
  blockType?: BlockType;
  itemType?: string;
  toolType?: ToolType;
  count: number;
  name: string;
  emoji: string;
}

export interface TradeParticipant {
  uid: string;
  name: string;
  offer?: TradeOffer | null;
  confirmed?: boolean;
}

export interface TradeRoomState {
  id: number;
  p1?: TradeParticipant | null;
  p2?: TradeParticipant | null;
  lastTradeTimestamp?: number;
}

export class TradeManager {
  private db?: Database;
  private roomCode?: string;
  private currentUser?: { uid: string; displayName?: string | null };
  private playerName: string = '';

  public currentRoomId: number | null = null;
  public mySlot: 'p1' | 'p2' | null = null;

  private roomUnsubscribe?: Unsubscribe;
  private listUnsubscribe?: Unsubscribe;

  public onRoomStateChange?: (state: TradeRoomState) => void;
  public onRoomsListUpdate?: (rooms: Record<number, { count: number; names: string[] }>) => void;
  public onTradeExecute?: (myOffer: TradeOffer | null, partnerOffer: TradeOffer | null) => void;

  constructor(db?: Database, roomCode?: string, user?: { uid: string; displayName?: string | null }, playerName?: string) {
    this.db = db;
    this.roomCode = roomCode;
    this.currentUser = user;
    this.playerName = playerName || '플레이어';
  }

  public setNetwork(db: Database, roomCode: string, user: { uid: string; displayName?: string | null }, playerName: string): void {
    this.db = db;
    this.roomCode = roomCode;
    this.currentUser = user;
    this.playerName = playerName;
    this.listenToRoomsList();
  }

  public listenToRoomsList(): void {
    if (!this.db || !this.roomCode) return;
    if (this.listUnsubscribe) this.listUnsubscribe();

    const tradesRef = ref(this.db, `rooms/${this.roomCode}/trades`);
    this.listUnsubscribe = onValue(tradesRef, (snap) => {
      const summary: Record<number, { count: number; names: string[] }> = {};
      for (let i = 1; i <= 10; i++) {
        summary[i] = { count: 0, names: [] };
      }

      if (snap.exists()) {
        const val = snap.val();
        for (let i = 1; i <= 10; i++) {
          const room = val[`room_${i}`] as TradeRoomState;
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

      if (this.onRoomsListUpdate) {
        this.onRoomsListUpdate(summary);
      }
    });
  }

  public async joinRoom(roomId: number): Promise<{ success: boolean; message?: string }> {
    if (!this.db || !this.roomCode || !this.currentUser) {
      return { success: false, message: '서버에 연결되어 있지 않습니다.' };
    }

    if (this.currentRoomId) {
      await this.leaveRoom();
    }

    const roomRef = ref(this.db, `rooms/${this.roomCode}/trades/room_${roomId}`);
    const snap = await get(roomRef);
    const room = (snap.exists() ? snap.val() : { id: roomId }) as TradeRoomState;

    let slot: 'p1' | 'p2' | null = null;
    if (!room.p1 || !room.p1.uid || room.p1.uid === this.currentUser.uid) {
      slot = 'p1';
    } else if (!room.p2 || !room.p2.uid || room.p2.uid === this.currentUser.uid) {
      slot = 'p2';
    } else {
      return { success: false, message: '해당 거래 부스는 이미 2명이 가득 찼습니다!' };
    }

    this.currentRoomId = roomId;
    this.mySlot = slot;

    const myParticipant: TradeParticipant = {
      uid: this.currentUser.uid,
      name: this.playerName,
      offer: null,
      confirmed: false
    };

    await update(roomRef, {
      [slot]: myParticipant
    });

    onDisconnect(ref(this.db, `rooms/${this.roomCode}/trades/room_${roomId}/${slot}`)).remove();

    this.listenToCurrentRoom();
    return { success: true };
  }

  private listenToCurrentRoom(): void {
    if (!this.db || !this.roomCode || !this.currentRoomId) return;
    if (this.roomUnsubscribe) this.roomUnsubscribe();

    const roomRef = ref(this.db, `rooms/${this.roomCode}/trades/room_${this.currentRoomId}`);
    let lastTradeTimestamp = 0;

    this.roomUnsubscribe = onValue(roomRef, async (snap) => {
      if (!snap.exists()) return;
      const room = snap.val() as TradeRoomState;

      if (this.onRoomStateChange) {
        this.onRoomStateChange(room);
      }

      // 양쪽 플레이어 모두 승인 완료 감지
      if (room.p1 && room.p2 && room.p1.confirmed && room.p2.confirmed) {
        if (!room.lastTradeTimestamp || room.lastTradeTimestamp !== lastTradeTimestamp) {
          lastTradeTimestamp = Date.now();

          // 거래 실행! (내가 p1이면 p1 입장에서, p2면 p2 입장에서 처리)
          if (this.onTradeExecute) {
            const myOffer = this.mySlot === 'p1' ? room.p1.offer || null : room.p2.offer || null;
            const partnerOffer = this.mySlot === 'p1' ? room.p2.offer || null : room.p1.offer || null;
            this.onTradeExecute(myOffer, partnerOffer);
          }

          // 방 상태 초기화 (다음 거래를 위해 승인 및 제시 품목 리셋)
          if (this.mySlot === 'p1') {
            await update(roomRef, {
              'p1/confirmed': false,
              'p1/offer': null,
              'p2/confirmed': false,
              'p2/offer': null,
              lastTradeTimestamp: lastTradeTimestamp
            });
          }
        }
      }
    });
  }

  public async setOffer(offer: TradeOffer | null): Promise<void> {
    if (!this.db || !this.roomCode || !this.currentRoomId || !this.mySlot) return;
    const roomRef = ref(this.db, `rooms/${this.roomCode}/trades/room_${this.currentRoomId}`);

    // 아이템 제시가 바뀌면 승인 상태는 자동으로 해제됨 (보안 원칙)
    await update(roomRef, {
      [`${this.mySlot}/offer`]: offer,
      'p1/confirmed': false,
      'p2/confirmed': false
    });
  }

  public async setConfirmed(confirmed: boolean): Promise<void> {
    if (!this.db || !this.roomCode || !this.currentRoomId || !this.mySlot) return;
    const roomRef = ref(this.db, `rooms/${this.roomCode}/trades/room_${this.currentRoomId}`);
    await update(roomRef, {
      [`${this.mySlot}/confirmed`]: confirmed
    });
  }

  public async leaveRoom(): Promise<void> {
    if (!this.db || !this.roomCode || !this.currentRoomId || !this.mySlot) return;

    if (this.roomUnsubscribe) {
      this.roomUnsubscribe();
      this.roomUnsubscribe = undefined;
    }

    const slotRef = ref(this.db, `rooms/${this.roomCode}/trades/room_${this.currentRoomId}/${this.mySlot}`);
    await remove(slotRef);

    this.currentRoomId = null;
    this.mySlot = null;
  }
}

