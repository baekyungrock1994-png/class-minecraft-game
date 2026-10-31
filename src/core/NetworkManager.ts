import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  Auth,
  User
} from 'firebase/auth';
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  remove,
  push,
  onValue,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onDisconnect,
  Database,
  DataSnapshot
} from 'firebase/database';
import * as THREE from 'three';
import { BlockType, WorldType, PlotInfo } from './Constants.ts';

export interface PlayerNetworkData {
  uid: string;
  name: string;
  role: 'teacher' | 'student';
  plotId: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  currentWorld: WorldType;
  isFlying: boolean;
  lastActive: number;
}

export interface BlockDeltaData {
  worldType: WorldType;
  x: number;
  y: number;
  z: number;
  blockType: BlockType;
  placedBy: string;
}

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderName: string;
  role: 'teacher' | 'student';
  message: string;
  timestamp: number;
}

export interface JoinRequestData {
  uid: string;
  name: string;
  requestedAt: number;
  status: 'pending' | 'approved' | 'rejected';
  plotId?: number;
}

export class NetworkManager {
  private app: FirebaseApp;
  private auth: Auth;
  private db: Database;

  public currentUser: User | null = null;
  public roomCode: string = '';
  public role: 'teacher' | 'student' = 'student';
  public playerName: string = '';
  public myPlotId: number = 1;
  public isHost: boolean = false;

  // 원격 플레이어 관리
  private remotePlayers: Map<string, {
    data: PlayerNetworkData;
    mesh: THREE.Group;
    targetPos: THREE.Vector3;
    targetRotY: number;
    speechBubble?: THREE.Sprite;
    bubbleTimeout?: any;
  }> = new Map();

  private scene: THREE.Scene;
  private lastSendTime: number = 0;
  private sendIntervalMs: number = 100; // 초당 10회 위치 전송

  // 콜백들
  public onBlockUpdate?: (delta: BlockDeltaData) => void;
  public onRoomReset?: () => void;
  public onPlotReset?: (plotId: number) => void;
  public onPlayerListUpdate?: (players: PlayerNetworkData[]) => void;
  public onChatMessage?: (chat: ChatMessage) => void;
  public onMyNameChanged?: (newName: string) => void;
  public onMyPlotChanged?: (newPlotId: number) => void;
  public onDisasterChange?: (isActive: boolean) => void;
  public onWaterLevelChange?: (level: number) => void;
  public onPendingRequestsUpdate?: (requests: JoinRequestData[]) => void;
  public onJoinApproved?: (plotId: number) => void;
  public onJoinRejected?: () => void;
  public onKicked?: () => void;
  public joinTimestamp: number = Date.now();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const env = (import.meta as any).env || {};
    const firebaseConfig = {
      apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyD7ZY_zQgtX8kzGrfMj5Cp4XuKY05LSSHY",
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "class-minecraft-game.firebaseapp.com",
      projectId: env.VITE_FIREBASE_PROJECT_ID || "class-minecraft-game",
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "class-minecraft-game.firebasestorage.app",
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "469718606463",
      appId: env.VITE_FIREBASE_APP_ID || "1:469718606463:web:dd2ef1351fb3357eded54a",
      databaseURL: env.VITE_FIREBASE_DATABASE_URL || "https://class-minecraft-game-default-rtdb.firebaseio.com"
    };

    this.app = initializeApp(firebaseConfig);
    this.auth = getAuth(this.app);
    this.db = getDatabase(this.app);
  }

  /**
   * 익명 로그인 수행
   */
  public async loginAnonymously(): Promise<User> {
    if (this.currentUser) return this.currentUser;
    const cred = await signInAnonymously(this.auth);
    this.currentUser = cred.user;
    return cred.user;
  }

  public getDb(): Database {
    return this.db;
  }

  public getRemotePlayer(uid: string) {
    return this.remotePlayers.get(uid) || null;
  }

  public getRemotePlayersList(): PlayerNetworkData[] {
    const list: PlayerNetworkData[] = [];
    for (const [, remote] of this.remotePlayers.entries()) {
      list.push(remote.data);
    }
    return list;
  }

  /**
   * 1. [교사용] 5자리 랜덤 코드로 새로운 방 생성
   */
  public async createRoom(roomName: string, teacherName: string, teacherPin: string = ''): Promise<string> {
    const user = await this.loginAnonymously();
    this.role = 'teacher';
    this.playerName = teacherName.trim() || '선생님';
    this.isHost = true;
    this.myPlotId = 0; // 교사는 전용 관리자 (구획 무제한)

    // 5자리 랜덤 숫자 코드 생성 (예: 10000 ~ 99999)
    let generatedCode = '';
    let isUnique = false;

    for (let attempts = 0; attempts < 10; attempts++) {
      generatedCode = Math.floor(10000 + Math.random() * 90000).toString();
      const checkSnap = await get(ref(this.db, `rooms/${generatedCode}/meta`));
      if (!checkSnap.exists()) {
        isUnique = true;
        break;
      }
    }

    if (!isUnique) {
      generatedCode = Math.floor(10000 + Math.random() * 90000).toString();
    }

    this.roomCode = generatedCode;
    const finalRoomTitle = roomName.trim() || `${this.playerName}의 교실 마을`;

    // 방 메타데이터 생성
    await set(ref(this.db, `rooms/${this.roomCode}/meta`), {
      roomCode: this.roomCode,
      roomName: finalRoomTitle,
      hostUid: user.uid,
      teacherName: this.playerName,
      teacherPin: teacherPin.trim(),
      maxPlayers: 16,
      createdAt: Date.now()
    });

    // 교사 보관함에 방 기록 저장
    await this.saveTeacherRoomRecord(this.roomCode, finalRoomTitle, this.playerName, teacherPin.trim());

    // 교사 플레이어 등록
    await this.registerPlayerInDb(0);
    this.setupListeners();

    return this.roomCode;
  }

  /**
   * [교사용] 이전에 생성했던 마을 이어하기 (방 재개)
   */
  public async resumeRoom(roomCode: string, teacherName: string, teacherPin: string = ''): Promise<{ success: boolean; message?: string }> {
    const code = roomCode.trim();
    if (!code) return { success: false, message: '방 코드를 입력해주세요.' };

    const user = await this.loginAnonymously();
    const metaSnap = await get(ref(this.db, `rooms/${code}/meta`));

    if (!metaSnap.exists()) {
      return { success: false, message: `코드 [${code}]에 해당하는 마을을 찾을 수 없습니다.` };
    }

    const meta = metaSnap.val();
    if (meta.teacherPin && teacherPin.trim() && meta.teacherPin !== teacherPin.trim()) {
      return { success: false, message: '마을 관리 비밀번호가 일치하지 않습니다.' };
    }

    this.roomCode = code;
    this.role = 'teacher';
    this.playerName = teacherName.trim() || meta.teacherName || '선생님';
    this.isHost = true;
    this.myPlotId = 0;

    // 호스트 UID 갱신
    await update(ref(this.db, `rooms/${this.roomCode}/meta`), {
      hostUid: user.uid,
      teacherName: this.playerName
    });

    // 교사 플레이어 등록 및 동기화 시작
    await this.registerPlayerInDb(0);
    this.setupListeners();

    // 보관함 갱신
    await this.saveTeacherRoomRecord(code, meta.roomName || `${this.playerName}의 마을`, this.playerName, teacherPin.trim());

    return { success: true };
  }

  /**
   * [교사용] 교사가 생성했던 마을 목록 불러오기
   */
  public async getTeacherRooms(teacherName: string, teacherPin: string = ''): Promise<Array<{ roomCode: string; roomName: string; createdAt: number }>> {
    const cleanTeacher = (teacherName.trim() || '선생님').replace(/[.#$\[\]\/]/g, '_');
    const cleanPin = (teacherPin.trim() || 'default').replace(/[.#$\[\]\/]/g, '_');
    const teacherKey = `${cleanTeacher}_${cleanPin}`;

    const roomsMap = new Map<string, { roomCode: string; roomName: string; createdAt: number }>();

    // 1. Firebase 조회
    try {
      const snap = await get(ref(this.db, `teachers/${teacherKey}/rooms`));
      if (snap.exists()) {
        const val = snap.val();
        for (const code in val) {
          roomsMap.set(code, val[code]);
        }
      }
    } catch (e) {
      console.warn('Firebase teacher rooms read error:', e);
    }

    // 2. 로컬스토리지 백업 데이터 조회 및 병합
    try {
      const localData = localStorage.getItem(`teacher_rooms_${teacherKey}`);
      if (localData) {
        const parsed = JSON.parse(localData);
        for (const item of parsed) {
          if (!roomsMap.has(item.roomCode)) {
            roomsMap.set(item.roomCode, item);
          }
        }
      }
    } catch (e) {}

    return Array.from(roomsMap.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * [교사용] 마을 영구 삭제
   */
  public async deleteTeacherRoom(roomCode: string, teacherName: string, teacherPin: string = ''): Promise<boolean> {
    const cleanTeacher = (teacherName.trim() || '선생님').replace(/[.#$\[\]\/]/g, '_');
    const cleanPin = (teacherPin.trim() || 'default').replace(/[.#$\[\]\/]/g, '_');
    const teacherKey = `${cleanTeacher}_${cleanPin}`;

    try {
      // 1. 방 전체 데이터 삭제
      await remove(ref(this.db, `rooms/${roomCode}`));
      // 2. 교사 목록에서 삭제
      await remove(ref(this.db, `teachers/${teacherKey}/rooms/${roomCode}`));

      // 3. 로컬스토리지에서도 삭제
      const localKey = `teacher_rooms_${teacherKey}`;
      const localData = localStorage.getItem(localKey);
      if (localData) {
        const parsed = JSON.parse(localData) as Array<any>;
        const filtered = parsed.filter(r => r.roomCode !== roomCode);
        localStorage.setItem(localKey, JSON.stringify(filtered));
      }
      return true;
    } catch (e) {
      console.error('Failed to delete room:', e);
      return false;
    }
  }

  /**
   * 교사 보관함에 방 정보 저장 (Firebase & LocalStorage)
   */
  private async saveTeacherRoomRecord(roomCode: string, roomName: string, teacherName: string, teacherPin: string): Promise<void> {
    const cleanTeacher = (teacherName.trim() || '선생님').replace(/[.#$\[\]\/]/g, '_');
    const cleanPin = (teacherPin.trim() || 'default').replace(/[.#$\[\]\/]/g, '_');
    const teacherKey = `${cleanTeacher}_${cleanPin}`;

    const record = {
      roomCode,
      roomName,
      createdAt: Date.now()
    };

    try {
      await update(ref(this.db, `teachers/${teacherKey}/rooms/${roomCode}`), record);
    } catch (e) {
      console.warn('Failed to save to teachers node in Firebase:', e);
    }

    try {
      const localKey = `teacher_rooms_${teacherKey}`;
      const existing = localStorage.getItem(localKey);
      let list: Array<any> = existing ? JSON.parse(existing) : [];
      list = list.filter(r => r.roomCode !== roomCode);
      list.unshift(record);
      localStorage.setItem(localKey, JSON.stringify(list));
    } catch (e) {}
  }

  /**
   * 2. [학생용] 5자리 코드로 교사 승인 요청 (대기실 진입)
   */
  public async requestJoinRoom(roomCode: string, studentName: string): Promise<{ success: boolean; message?: string }> {
    const code = roomCode.trim();
    if (!/^\d{5}$/.test(code)) {
      return { success: false, message: '방 코드는 5자리 숫자여야 합니다.' };
    }

    const user = await this.loginAnonymously();
    const metaSnap = await get(ref(this.db, `rooms/${code}/meta`));

    if (!metaSnap.exists()) {
      return { success: false, message: `코드 [${code}]에 해당하는 교실 방을 찾을 수 없습니다.` };
    }

    // 1. 강제 추방된 계정인지 검사
    const kickedSnap = await get(ref(this.db, `rooms/${code}/kicked/${user.uid}`));
    if (kickedSnap.exists() && kickedSnap.val() === true) {
      return { success: false, message: '선생님에 의해 이 교실 마을에서 추방된 계정입니다.' };
    }

    // 2. 정원 검사 (16명)
    const playersSnap = await get(ref(this.db, `rooms/${code}/players`));
    let studentCount = 0;

    if (playersSnap.exists()) {
      const players = playersSnap.val();
      for (const uid in players) {
        if (players[uid].role === 'student') {
          studentCount++;
        }
      }
    }

    if (studentCount >= 16) {
      return { success: false, message: '해당 교실 마을은 정원(16명)이 모두 찼습니다!' };
    }

    this.roomCode = code;
    this.role = 'student';
    this.playerName = studentName.trim() || `학생_${Math.floor(Math.random() * 900) + 100}`;
    this.isHost = false;

    // 3. 교사 승인 대기열(joinRequests)에 등록
    const reqRef = ref(this.db, `rooms/${code}/joinRequests/${user.uid}`);
    const reqData: JoinRequestData = {
      uid: user.uid,
      name: this.playerName,
      requestedAt: Date.now(),
      status: 'pending'
    };
    await set(reqRef, reqData);

    // 탭을 닫거나 나갈 시 요청 자동 제거
    onDisconnect(reqRef).remove();

    // 4. 교사의 승인/거절 여부 실시간 구독
    const unsubscribe = onValue(reqRef, async (snap) => {
      if (!snap.exists()) return;
      const data = snap.val() as JoinRequestData;

      if (data.status === 'approved') {
        unsubscribe();
        const assignedPlot = data.plotId || 1;
        this.myPlotId = assignedPlot;

        // 승인 완료: 실제 플레이어로 DB 등록 및 동기화 시작
        await this.registerPlayerInDb(assignedPlot);
        this.setupListeners();

        if (this.onJoinApproved) {
          this.onJoinApproved(assignedPlot);
        }
      } else if (data.status === 'rejected') {
        unsubscribe();
        await remove(reqRef);
        if (this.onJoinRejected) {
          this.onJoinRejected();
        }
      }
    });

    return { success: true };
  }

  /**
   * [학생용] 승인 대기 취소
   */
  public async cancelJoinRequest(): Promise<void> {
    if (!this.roomCode || !this.currentUser) return;
    const reqRef = ref(this.db, `rooms/${this.roomCode}/joinRequests/${this.currentUser.uid}`);
    await remove(reqRef);
  }

  /**
   * [교사용] 학생의 마을 입장 승인 및 대지 배정 (기존 대지 영구 유지 및 동시 접속 충돌 방지)
   */
  public async approveStudent(applicantUid: string): Promise<number> {
    if (!this.roomCode || this.role !== 'teacher') return 1;

    // 1. 기존 영구 배정 기록(assignedPlots) 확인 (권한 오류 시에도 승인이 멈추지 않도록 안전 보호)
    let assignedPlotsMap: Record<string, number> = {};
    const assignedPlotsRef = ref(this.db, `rooms/${this.roomCode}/assignedPlots`);
    try {
      const assignedPlotsSnap = await get(assignedPlotsRef);
      if (assignedPlotsSnap.exists()) {
        assignedPlotsMap = assignedPlotsSnap.val() || {};
      }
    } catch (e) {
      console.warn('assignedPlots read skipped (rules not updated):', e);
    }

    // 신청자의 이름 확인
    let applicantName = '';
    try {
      const reqSnap = await get(ref(this.db, `rooms/${this.roomCode}/joinRequests/${applicantUid}`));
      applicantName = reqSnap.exists() ? (reqSnap.val().name || '') : '';
    } catch (e) {
      console.warn('joinRequests read error:', e);
    }

    // 기존에 배정받은 적이 있는 학생(이름 또는 UID 기준)이면 기존 대지 복원
    let assignedPlot: number | null = null;
    if (assignedPlotsMap[applicantUid]) {
      assignedPlot = assignedPlotsMap[applicantUid];
    } else if (applicantName && assignedPlotsMap[applicantName]) {
      assignedPlot = assignedPlotsMap[applicantName];
    }

    // 2. 신규 배정 필요한 경우 (사용 중인 대지 종합 수집)
    if (!assignedPlot || assignedPlot < 1 || assignedPlot > 16) {
      const occupiedPlots = new Set<number>();

      // 1) 현재 접속 중인 플레이어들
      try {
        const playersSnap = await get(ref(this.db, `rooms/${this.roomCode}/players`));
        if (playersSnap.exists()) {
          const players = playersSnap.val();
          for (const uid in players) {
            if (players[uid].plotId) occupiedPlots.add(players[uid].plotId);
          }
        }
      } catch (e) {}

      // 2) 이전에 배정된 기록들
      for (const key in assignedPlotsMap) {
        if (typeof assignedPlotsMap[key] === 'number') {
          occupiedPlots.add(assignedPlotsMap[key]);
        }
      }

      // 1~16번 중 가장 빠른 빈 대지 배정
      assignedPlot = 1;
      for (let i = 1; i <= 16; i++) {
        if (!occupiedPlots.has(i)) {
          assignedPlot = i;
          break;
        }
      }
    }

    // 영구 배정 기록 저장 시도 (보안 규칙 미적용 상태여도 승인 자체는 반드시 성공하도록 try-catch)
    try {
      const updates: Record<string, any> = {
        [applicantUid]: assignedPlot
      };
      if (applicantName) {
        updates[applicantName] = assignedPlot;
      }
      await update(assignedPlotsRef, updates);
    } catch (e) {
      console.warn('assignedPlots update skipped (rules not updated):', e);
    }

    // 승인 상태 전송 (가장 핵심: 학생 화면이 바로 입장되도록 전송)
    const reqRef = ref(this.db, `rooms/${this.roomCode}/joinRequests/${applicantUid}`);
    await update(reqRef, {
      status: 'approved',
      plotId: assignedPlot
    });

    return assignedPlot;
  }

  /**
   * [교사용] 특정 학생의 할당 구역(대지 번호)을 일방적으로 즉시 변경/재배치
   */
  public async reassignStudentPlot(targetUid: string, targetName: string, newPlotId: number): Promise<void> {
    if (!this.roomCode || this.role !== 'teacher') return;
    const clampedPlot = Math.max(1, Math.min(16, Math.floor(newPlotId)));

    // 1. 플레이어 노드 갱신
    const playerRef = ref(this.db, `rooms/${this.roomCode}/players/${targetUid}`);
    await update(playerRef, {
      plotId: clampedPlot
    });

    // 2. 영구 대지 매핑 갱신 (보안 규칙 미적용 시에도 플레이어 설정은 완료되도록 안전 보호)
    try {
      const assignedPlotsRef = ref(this.db, `rooms/${this.roomCode}/assignedPlots`);
      const updates: Record<string, any> = {
        [targetUid]: clampedPlot
      };
      if (targetName) {
        updates[targetName] = clampedPlot;
      }
      await update(assignedPlotsRef, updates);
    } catch (e) {
      console.warn('assignedPlots reassign skipped (rules not updated):', e);
    }
  }

  /**
   * [교사용] 학생의 마을 입장 거절
   */
  public async rejectStudent(applicantUid: string): Promise<void> {
    if (!this.roomCode || this.role !== 'teacher') return;
    const reqRef = ref(this.db, `rooms/${this.roomCode}/joinRequests/${applicantUid}`);
    await update(reqRef, {
      status: 'rejected'
    });
  }

  /**
   * [교사용] 특정 학생을 교실 마을에서 강제 추방 (즉시 퇴장 및 재입장 차단)
   */
  public async kickPlayer(targetUid: string): Promise<void> {
    if (!this.roomCode || this.role !== 'teacher') return;

    // 1) 추방 목록 등록 (재입장 차단)
    const kickedRef = ref(this.db, `rooms/${this.roomCode}/kicked/${targetUid}`);
    await set(kickedRef, true);

    // 2) 플레이어 DB에서 즉시 제거
    const playerRef = ref(this.db, `rooms/${this.roomCode}/players/${targetUid}`);
    await remove(playerRef);

    // 3) 대기열에서도 제거
    const reqRef = ref(this.db, `rooms/${this.roomCode}/joinRequests/${targetUid}`);
    await remove(reqRef);
  }

  /**
   * 하위 호환용 즉시 입장 (필요 시)
   */
  public async joinRoom(roomCode: string, studentName: string): Promise<{ success: boolean; plotId?: number; message?: string }> {
    return this.requestJoinRoom(roomCode, studentName);
  }

  /**
   * DB에 플레이어 등록 및 연결 끊김 처리
   */
  private async registerPlayerInDb(plotId: number): Promise<void> {
    if (!this.currentUser || !this.roomCode) return;

    const playerRef = ref(this.db, `rooms/${this.roomCode}/players/${this.currentUser.uid}`);
    const playerData: PlayerNetworkData = {
      uid: this.currentUser.uid,
      name: this.playerName,
      role: this.role,
      plotId: plotId,
      x: 0,
      y: 10,
      z: 0,
      rotY: 0,
      currentWorld: 'town',
      isFlying: false,
      lastActive: Date.now()
    };

    await set(playerRef, playerData);

    // 사용자가 창을 닫거나 나갈 때 실시간 제거
    onDisconnect(playerRef).remove();
  }

  /**
   * 실시간 이벤트 리스너 등록
   */
  private setupListeners(): void {
    if (!this.roomCode) return;

    // 1. 다른 플레이어 상태 동기화
    const playersRef = ref(this.db, `rooms/${this.roomCode}/players`);
    onValue(playersRef, (snapshot) => {
      const playersList: PlayerNetworkData[] = [];
      const currentUids = new Set<string>();

      if (snapshot.exists()) {
        const val = snapshot.val();
        for (const uid in val) {
          const p: PlayerNetworkData = val[uid];
          playersList.push(p);
          currentUids.add(uid);

          if (uid === this.currentUser?.uid) {
            // 관리자(교사)에 의해 본인 닉네임이 변경된 경우 감지
            if (p.name && this.playerName !== p.name) {
              this.playerName = p.name;
              if (this.onMyNameChanged) {
                this.onMyNameChanged(p.name);
              }
            }
            // 관리자(교사)에 의해 본인 대지가 재할당된 경우 감지
            if (p.plotId && p.plotId !== this.myPlotId && this.role === 'student') {
              this.myPlotId = p.plotId;
              if (this.onMyPlotChanged) {
                this.onMyPlotChanged(p.plotId);
              }
            }
          } else {
            this.handleRemotePlayerData(p);
          }
        }
      }

      // 나간 플레이어 제거
      for (const [uid, remote] of this.remotePlayers.entries()) {
        if (!currentUids.has(uid)) {
          if (remote.bubbleTimeout) clearTimeout(remote.bubbleTimeout);
          this.scene.remove(remote.mesh);
          this.remotePlayers.delete(uid);
        }
      }

      if (this.onPlayerListUpdate) {
        this.onPlayerListUpdate(playersList);
      }
    });

    // 2. 블록 변경 델타 동기화 (새 블록 설치/파괴 감지)
    const deltasRef = ref(this.db, `rooms/${this.roomCode}/worldDeltas`);
    onChildAdded(deltasRef, (snap) => {
      this.handleIncomingBlockDelta(snap);
    });
    onChildChanged(deltasRef, (snap) => {
      this.handleIncomingBlockDelta(snap);
    });

    // 3. 교사의 마을 리셋 감지
    onChildRemoved(deltasRef, () => {
      if (this.onRoomReset) {
        this.onRoomReset();
      }
    });

    // 4. 교사의 특정 대지(구역) 초기화 감지
    const plotResetRef = ref(this.db, `rooms/${this.roomCode}/plotResetEvent`);
    onValue(plotResetRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.val();
      if (data && data.plotId && data.timestamp >= this.joinTimestamp) {
        if (this.onPlotReset) {
          this.onPlotReset(data.plotId);
        }
      }
    });

    // 5. 긍정적 언어 실시간 채팅 동기화
    const chatsRef = ref(this.db, `rooms/${this.roomCode}/chats`);
    onChildAdded(chatsRef, (snap) => {
      if (!snap.exists()) return;
      const val = snap.val() as ChatMessage;
      val.id = snap.key || '';
      if (val && val.timestamp >= this.joinTimestamp - 4000) {
        if (this.onChatMessage) {
          this.onChatMessage(val);
        }
        this.showAvatarSpeechBubble(val.senderUid, val.message);
      }
    });

    // 6. [교사용] 학생 입장 승인 대기열 실시간 감지
    if (this.role === 'teacher') {
      const joinReqRef = ref(this.db, `rooms/${this.roomCode}/joinRequests`);
      onValue(joinReqRef, (snap) => {
        const pendingList: JoinRequestData[] = [];
        if (snap.exists()) {
          const val = snap.val();
          for (const uid in val) {
            if (val[uid].status === 'pending') {
              pendingList.push(val[uid]);
            }
          }
        }
        if (this.onPendingRequestsUpdate) {
          this.onPendingRequestsUpdate(pendingList);
        }
      });
    }

    // 7. [모든 플레이어] 교사에 의한 강제 추방 실시간 감지
    if (this.currentUser) {
      const kickedRef = ref(this.db, `rooms/${this.roomCode}/kicked/${this.currentUser.uid}`);
      onValue(kickedRef, (snap) => {
        if (snap.exists() && snap.val() === true) {
          if (this.onKicked) {
            this.onKicked();
          }
        }
      });
    }

    // 8. [모든 플레이어] 환경 대재앙 상태 실시간 동기화 (홍수 & 마그마 분출)
    const disasterRef = ref(this.db, `rooms/${this.roomCode}/gameState/disaster`);
    onValue(disasterRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.val();
      if (data && typeof data.isActive === 'boolean') {
        if (this.onDisasterChange) {
          this.onDisasterChange(data.isActive);
        }
      }
    });

    // 9. [모든 플레이어] 교사가 수동 조절한 해수면 수위 실시간 동기화
    const waterLevelRef = ref(this.db, `rooms/${this.roomCode}/gameState/waterLevel`);
    onValue(waterLevelRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.val();
      if (data && typeof data.level === 'number') {
        if (this.onWaterLevelChange) {
          this.onWaterLevelChange(data.level);
        }
      }
    });
  }

  private handleIncomingBlockDelta(snap: DataSnapshot): void {
    if (!snap.exists()) return;
    const delta = snap.val() as BlockDeltaData;
    // 내가 놓은 것이 아니거나 최신 동기화 시 콜백 호출
    if (this.onBlockUpdate) {
      this.onBlockUpdate(delta);
    }
  }

  /**
   * 블록 설치 / 파괴 실시간 전송
   */
  public async sendBlockDelta(worldType: WorldType, x: number, y: number, z: number, blockType: BlockType): Promise<void> {
    if (!this.roomCode || !this.currentUser) return;

    const blockKey = `${worldType}_${Math.floor(x)}_${Math.floor(y)}_${Math.floor(z)}`;
    const blockRef = ref(this.db, `rooms/${this.roomCode}/worldDeltas/${blockKey}`);

    const delta: BlockDeltaData = {
      worldType,
      x: Math.floor(x),
      y: Math.floor(y),
      z: Math.floor(z),
      blockType,
      placedBy: this.playerName
    };

    await set(blockRef, delta);
  }

  /**
   * 교사 전용: 특정 10x10 구획(대지)의 건축물 초기화 (장난/훼손 복구)
   */
  public async sendPlotReset(plotId: number, plot: PlotInfo): Promise<void> {
    if (!this.roomCode || this.role !== 'teacher') return;

    // 1) plotResetEvent 브로드캐스트
    await set(ref(this.db, `rooms/${this.roomCode}/plotResetEvent`), {
      plotId,
      timestamp: Date.now()
    });

    // 2) Firebase DB 상의 해당 구역 내 worldDeltas 일괄 삭제
    try {
      const deltasSnap = await get(ref(this.db, `rooms/${this.roomCode}/worldDeltas`));
      if (deltasSnap.exists()) {
        const deltas = deltasSnap.val();
        const updates: Record<string, null> = {};

        for (const key in deltas) {
          const d = deltas[key] as BlockDeltaData;
          if (
            d.worldType === 'town' &&
            d.x >= plot.minX && d.x <= plot.maxX &&
            d.z >= plot.minZ && d.z <= plot.maxZ
          ) {
            updates[`rooms/${this.roomCode}/worldDeltas/${key}`] = null;
          }
        }

        if (Object.keys(updates).length > 0) {
          await update(ref(this.db), updates);
        }
      }
    } catch (err) {
      console.warn('Failed to clean up plot deltas from Firebase:', err);
    }
  }

  /**
   * 교사 전용: 마을 건축물 전체 초기화 (월드 델타 삭제)
   */
  public async resetVillage(): Promise<void> {
    if (!this.roomCode || this.role !== 'teacher') return;
    const deltasRef = ref(this.db, `rooms/${this.roomCode}/worldDeltas`);
    await remove(deltasRef);
  }

  /**
   * 내 위치와 회전각 실시간 전송 (100ms 쓰로틀링)
   */
  public updateMyPosition(x: number, y: number, z: number, rotY: number, currentWorld: WorldType, isFlying: boolean): void {
    if (!this.roomCode || !this.currentUser) return;

    const now = performance.now();
    if (now - this.lastSendTime < this.sendIntervalMs) return;
    this.lastSendTime = now;

    const playerRef = ref(this.db, `rooms/${this.roomCode}/players/${this.currentUser.uid}`);
    update(playerRef, {
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      z: Number(z.toFixed(2)),
      rotY: Number(rotY.toFixed(2)),
      currentWorld,
      isFlying,
      lastActive: Date.now()
    }).catch(() => {});
  }

  /**
   * 원격 플레이어 데이터 수신 처리 (아바타 생성 및 위치 갱신)
   */
  private handleRemotePlayerData(data: PlayerNetworkData): void {
    let remote = this.remotePlayers.get(data.uid);

    if (!remote) {
      const mesh = this.createPlayerAvatar(data.name, data.role, data.plotId);
      this.scene.add(mesh);
      remote = {
        data,
        mesh,
        // [지시사항 1]: data.y(시선/카메라 높이)에서 playerHeight(1.8)를 빼서 발이 지면(y=0)에 딱 닿도록 보정
        targetPos: new THREE.Vector3(data.x, data.y - 1.8, data.z),
        targetRotY: data.rotY
      };
      this.remotePlayers.set(data.uid, remote);
    } else {
      // 닉네임 또는 대지 번호가 관리자에 의해 변경되었으면 3D 명찰 즉시 교체
      if (remote.data.name !== data.name || remote.data.plotId !== data.plotId) {
        const oldSprite = remote.mesh.getObjectByName('nameSprite');
        if (oldSprite) remote.mesh.remove(oldSprite);
        const labelText = data.role === 'teacher' ? `👑 ${data.name} (선생님)` : `🧑‍🎓 ${data.name} (#${data.plotId} 대지)`;
        const newSprite = this.createNameSprite(labelText, data.role === 'teacher');
        newSprite.name = 'nameSprite';
        newSprite.position.y = 2.15;
        remote.mesh.add(newSprite);
      }
    }

    remote.data = data;
    // [지시사항 1]: 실시간 위치 보간 시에도 발바닥이 블록 표면에 완벽 밀착되도록 y - 1.8 적용
    remote.targetPos.set(data.x, data.y - 1.8, data.z);
    remote.targetRotY = data.rotY;

    // 다른 월드에 있으면 보이지 않게 처리
    remote.mesh.visible = true;
  }

  /**
   * 귀여운 3D 복셀 아바타 & 3D 닉네임 라벨 생성
   * 발바닥이 y=0(지면)에 완벽하게 일치하도록 정밀 좌표 정렬
   */
  private createPlayerAvatar(name: string, role: string, plotId: number): THREE.Group {
    const group = new THREE.Group();

    // 역할별 색상 (교사: 골드/보라, 학생: 시원한 청록/파랑)
    const bodyColor = role === 'teacher' ? 0x8b5cf6 : 0x0ea5e9;
    const pantsColor = role === 'teacher' ? 0x4c1d95 : 0x0369a1;

    // 1. 다리 (양쪽) - 높이 0.65, 중심 Y=0.325 -> 발바닥 밑창이 정확히 Y=0.00에 닿음!
    const legGeo = new THREE.BoxGeometry(0.22, 0.65, 0.25);
    const legMat = new THREE.MeshLambertMaterial({ color: pantsColor });

    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.13, 0.325, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.13, 0.325, 0);
    group.add(rightLeg);

    // 2. 몸통 - 높이 0.7, Y=0.65(다리 위) + 0.35 = 1.00
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.7, 0.3);
    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.00;
    group.add(body);

    // 3. 팔 (양쪽)
    const armGeo = new THREE.BoxGeometry(0.2, 0.65, 0.25);
    const armMat = new THREE.MeshLambertMaterial({ color: bodyColor });

    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.35, 1.00, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.35, 1.00, 0);
    group.add(rightArm);

    // 4. 머리 (Box) - 높이 0.5, Y=1.35(몸통 위) + 0.25 = 1.60
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.60;
    group.add(head);

    // 모자/머리카락
    const hatGeo = new THREE.BoxGeometry(0.54, 0.2, 0.54);
    const hatMat = new THREE.MeshLambertMaterial({ color: role === 'teacher' ? 0xf59e0b : 0x334155 });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 1.80;
    group.add(hat);

    // 5. 머리 위 3D 닉네임 라벨 (Canvas 기반 스프라이트)
    const labelText = role === 'teacher' ? `👑 ${name} (선생님)` : `🧑‍🎓 ${name} (#${plotId} 대지)`;
    const nameSprite = this.createNameSprite(labelText, role === 'teacher');
    nameSprite.name = 'nameSprite';
    nameSprite.position.y = 2.15;
    group.add(nameSprite);

    return group;
  }

  /**
   * 머리 위에 띄울 3D 말풍선 생성 및 4.5초 뒤 자동 제거
   */
  public showAvatarSpeechBubble(senderUid: string, message: string): void {
    const remote = this.remotePlayers.get(senderUid);
    if (!remote) return;

    if (remote.speechBubble) {
      remote.mesh.remove(remote.speechBubble);
      if (remote.bubbleTimeout) clearTimeout(remote.bubbleTimeout);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 440;
    canvas.height = 120;
    const ctx = canvas.getContext('2d')!;

    // 말풍선 배경
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 5;

    ctx.beginPath();
    ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 35, 18);
    ctx.fill();
    ctx.stroke();

    // 말풍선 꼬리표
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 15, canvas.height - 25);
    ctx.lineTo(canvas.width / 2, canvas.height - 5);
    ctx.lineTo(canvas.width / 2 + 15, canvas.height - 25);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fill();
    ctx.stroke();

    // 텍스트 출력
    ctx.font = 'bold 24px "Pretendard", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(message, canvas.width / 2, (canvas.height - 35) / 2 + 10);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const bubble = new THREE.Sprite(spriteMat);
    bubble.scale.set(2.0, 0.55, 1.0);
    bubble.position.y = 2.65;

    remote.speechBubble = bubble;
    remote.mesh.add(bubble);

    remote.bubbleTimeout = setTimeout(() => {
      if (remote.speechBubble) {
        remote.mesh.remove(remote.speechBubble);
        remote.speechBubble = undefined;
      }
    }, 4500);
  }

  /**
   * 관리자(교사) 전용: 학생 닉네임 강제 변경
   */
  public async changePlayerName(targetUid: string, newName: string): Promise<void> {
    if (!this.roomCode || this.role !== 'teacher') return;
    const cleanName = newName.trim();
    if (!cleanName) return;

    // 1. players 노드 업데이트
    const playerRef = ref(this.db, `rooms/${this.roomCode}/players/${targetUid}`);
    await update(playerRef, { name: cleanName });

    // 2. joinRequests 노드 갱신
    try {
      const reqRef = ref(this.db, `rooms/${this.roomCode}/joinRequests/${targetUid}`);
      await update(reqRef, { name: cleanName });
    } catch (e) {}

    if (this.currentUser?.uid === targetUid) {
      this.playerName = cleanName;
    }
  }

  /**
   * [교사용] 환경 대재앙 상태 실시간 전송 (학생 화면에도 즉시 동기화)
   */
  public async sendDisasterState(isActive: boolean): Promise<void> {
    if (!this.roomCode || this.role !== 'teacher') return;
    const disasterRef = ref(this.db, `rooms/${this.roomCode}/gameState/disaster`);
    await set(disasterRef, {
      isActive,
      timestamp: Date.now()
    });
  }

  /**
   * [지시사항 2]: 교사용 수동 조절 해수면 수위 실시간 전송 (학생 화면에도 즉시 동기화)
   */
  public async sendWaterLevel(level: number): Promise<void> {
    if (!this.roomCode || this.role !== 'teacher') return;
    const waterLevelRef = ref(this.db, `rooms/${this.roomCode}/gameState/waterLevel`);
    await set(waterLevelRef, {
      level: Number(level.toFixed(1)),
      timestamp: Date.now()
    });
  }

  /**
   * 긍정적인 언어로 된 멘트 채팅 전송
   */
  public async sendChatMessage(message: string): Promise<void> {
    if (!this.roomCode || !this.currentUser) return;
    const cleanMsg = message.trim();
    if (!cleanMsg) return;

    const chatsRef = ref(this.db, `rooms/${this.roomCode}/chats`);
    const newChatRef = push(chatsRef);
    const chatData: Omit<ChatMessage, 'id'> = {
      senderUid: this.currentUser.uid,
      senderName: this.playerName,
      role: this.role,
      message: cleanMsg,
      timestamp: Date.now()
    };
    await set(newChatRef, chatData);
  }

  /**
   * 머리 위에 띄울 고해상도 텍스트 스프라이트
   */
  private createNameSprite(text: string, isTeacher: boolean): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;

    // 둥근 사각형 배경
    ctx.fillStyle = isTeacher ? 'rgba(124, 58, 237, 0.85)' : 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = isTeacher ? '#f59e0b' : '#38bdf8';
    ctx.lineWidth = 4;

    const r = 20;
    ctx.beginPath();
    ctx.roundRect(10, 10, canvas.width - 20, canvas.height - 20, r);
    ctx.fill();
    ctx.stroke();

    // 텍스트
    ctx.font = 'bold 30px "Pretendard", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.6, 0.4, 1.0);

    return sprite;
  }

  /**
   * 매 프레임 원격 플레이어 부드러운 이동 (Lerp 보간)
   */
  public update(delta: number, localWorldType: WorldType): void {
    const lerpFactor = Math.min(1.0, delta * 12);

    for (const [, remote] of this.remotePlayers.entries()) {
      // 같은 월드에 있을 때만 아바타 표시
      if (remote.data.currentWorld !== localWorldType) {
        remote.mesh.visible = false;
        continue;
      }
      remote.mesh.visible = true;

      // 위치 선형 보간 (부드러운 움직임)
      remote.mesh.position.lerp(remote.targetPos, lerpFactor);

      // 회전각 보간
      remote.mesh.rotation.y = THREE.MathUtils.lerp(
        remote.mesh.rotation.y,
        remote.targetRotY,
        lerpFactor
      );
    }
  }

  /**
   * 방 나가기 및 자원 정리
   */
  public async leaveRoom(): Promise<void> {
    if (this.roomCode && this.currentUser) {
      await remove(ref(this.db, `rooms/${this.roomCode}/players/${this.currentUser.uid}`));
    }
    for (const [, remote] of this.remotePlayers.entries()) {
      this.scene.remove(remote.mesh);
    }
    this.remotePlayers.clear();
    this.roomCode = '';
  }
}
