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

  /**
   * 1. [교사용] 5자리 랜덤 코드로 새로운 방 생성
   */
  public async createRoom(roomName: string, teacherName: string): Promise<string> {
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

    // 방 메타데이터 생성
    await set(ref(this.db, `rooms/${this.roomCode}/meta`), {
      roomCode: this.roomCode,
      roomName: roomName.trim() || `${teacherName} 선생님의 교실 마을`,
      hostUid: user.uid,
      teacherName: this.playerName,
      maxPlayers: 16,
      createdAt: Date.now()
    });

    // 교사 플레이어 등록
    await this.registerPlayerInDb(0);
    this.setupListeners();

    return this.roomCode;
  }

  /**
   * 2. [학생용] 5자리 코드로 방 참가 (최대 16명 정원 검사 및 1~16번 대지 자동 배정)
   */
  public async joinRoom(roomCode: string, studentName: string): Promise<{ success: boolean; plotId?: number; message?: string }> {
    const code = roomCode.trim();
    if (!/^\d{5}$/.test(code)) {
      return { success: false, message: '방 코드는 5자리 숫자여야 합니다.' };
    }

    const user = await this.loginAnonymously();
    const metaSnap = await get(ref(this.db, `rooms/${code}/meta`));

    if (!metaSnap.exists()) {
      return { success: false, message: `코드 [${code}]에 해당하는 교실 방을 찾을 수 없습니다.` };
    }

    // 현재 플레이어 목록 가져와서 인원 수 & 사용 중인 대지 번호 확인
    const playersSnap = await get(ref(this.db, `rooms/${code}/players`));
    const occupiedPlots = new Set<number>();
    let studentCount = 0;

    if (playersSnap.exists()) {
      const players = playersSnap.val();
      for (const uid in players) {
        const p = players[uid];
        if (p.role === 'student') {
          studentCount++;
          if (p.plotId) occupiedPlots.add(p.plotId);
        }
      }
    }

    // 16명 정원 제한
    if (studentCount >= 16) {
      return { success: false, message: '해당 교실 마을은 정원(16명)이 모두 찼습니다!' };
    }

    // 비어있는 대지 번호(1 ~ 16) 중 가장 작은 번호 배정
    let assignedPlot = 1;
    for (let i = 1; i <= 16; i++) {
      if (!occupiedPlots.has(i)) {
        assignedPlot = i;
        break;
      }
    }

    this.roomCode = code;
    this.role = 'student';
    this.playerName = studentName.trim() || `학생_${Math.floor(Math.random() * 900) + 100}`;
    this.myPlotId = assignedPlot;
    this.isHost = false;

    // 플레이어 등록
    await this.registerPlayerInDb(assignedPlot);
    this.setupListeners();

    return { success: true, plotId: assignedPlot };
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
        targetPos: new THREE.Vector3(data.x, data.y, data.z),
        targetRotY: data.rotY
      };
      this.remotePlayers.set(data.uid, remote);
    } else {
      // 닉네임이 관리자에 의해 변경되었으면 3D 명찰 즉시 교체
      if (remote.data.name !== data.name) {
        const oldSprite = remote.mesh.getObjectByName('nameSprite');
        if (oldSprite) remote.mesh.remove(oldSprite);
        const labelText = data.role === 'teacher' ? `👑 ${data.name} (선생님)` : `🧑‍🎓 ${data.name} (#${data.plotId} 대지)`;
        const newSprite = this.createNameSprite(labelText, data.role === 'teacher');
        newSprite.name = 'nameSprite';
        newSprite.position.y = 2.0;
        remote.mesh.add(newSprite);
      }
    }

    remote.data = data;
    remote.targetPos.set(data.x, data.y, data.z);
    remote.targetRotY = data.rotY;

    // 다른 월드에 있으면 보이지 않게 처리
    remote.mesh.visible = true;
  }

  /**
   * 귀여운 3D 복셀 아바타 & 3D 닉네임 라벨 생성
   */
  private createPlayerAvatar(name: string, role: string, plotId: number): THREE.Group {
    const group = new THREE.Group();

    // 역할별 색상 (교사: 골드/보라, 학생: 시원한 청록/파랑)
    const bodyColor = role === 'teacher' ? 0x8b5cf6 : 0x0ea5e9;
    const pantsColor = role === 'teacher' ? 0x4c1d95 : 0x0369a1;

    // 1. 머리 (Box)
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.45;
    group.add(head);

    // 모자/머리카락 (교사는 금관/학사모, 학생은 캡)
    const hatGeo = new THREE.BoxGeometry(0.54, 0.2, 0.54);
    const hatMat = new THREE.MeshLambertMaterial({ color: role === 'teacher' ? 0xf59e0b : 0x334155 });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 1.62;
    group.add(hat);

    // 2. 몸통
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.7, 0.3);
    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.85;
    group.add(body);

    // 3. 팔 (양쪽)
    const armGeo = new THREE.BoxGeometry(0.2, 0.65, 0.25);
    const armMat = new THREE.MeshLambertMaterial({ color: bodyColor });

    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.35, 0.85, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.35, 0.85, 0);
    group.add(rightArm);

    // 4. 다리 (양쪽)
    const legGeo = new THREE.BoxGeometry(0.22, 0.65, 0.25);
    const legMat = new THREE.MeshLambertMaterial({ color: pantsColor });

    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.13, 0.25, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.13, 0.25, 0);
    group.add(rightLeg);

    // 5. 머리 위 3D 닉네임 라벨 (Canvas 기반 스프라이트)
    const labelText = role === 'teacher' ? `👑 ${name} (선생님)` : `🧑‍🎓 ${name} (#${plotId} 대지)`;
    const nameSprite = this.createNameSprite(labelText, role === 'teacher');
    nameSprite.name = 'nameSprite';
    nameSprite.position.y = 2.0;
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
    if (!this.roomCode) return;
    const cleanName = newName.trim();
    if (!cleanName) return;

    const playerRef = ref(this.db, `rooms/${this.roomCode}/players/${targetUid}/name`);
    await set(playerRef, cleanName);

    if (this.currentUser?.uid === targetUid) {
      this.playerName = cleanName;
    }
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
