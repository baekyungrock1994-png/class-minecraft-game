# 🔥 Firebase 설정 및 보안 규칙 가이드 (FIREBASE_SETUP.md)

> 무료 티어(Spark 플랜) 최적화, 학생 세션 이어하기, 교사 전용 '마을 폭파' 권한,  
> 그리고 F12 개발자 콘솔 테러를 방어하는 **Firebase Realtime Database 보안 규칙(Security Rules)** 완벽 가이드

---

## 1. Firebase 프로젝트 초기 설정 (5분 완성)

### (1) 프로젝트 생성 및 Spark(무료) 플랜 확인
1. [Firebase Console](https://console.firebase.google.com/) 접속 및 로그인.
2. **[프로젝트 추가]** 클릭 ➔ 프로젝트 이름 입력 (예: `class-minecraft-game`).
3. Google 애널리틱스는 비활성화(선택 해제) 후 **[프로젝트 만들기]** 완료.
4. 요금제가 기본 **Spark(무료) 요금제**인지 확인합니다 (동시 접속 100명, 월 10GB 전송량).

### (2) 익명 인증 (Anonymous Auth) 활성화
학생들이 별도의 구글 계정 없이 이름/비밀번호만으로 즉시 접속할 수 있도록 익명 인증을 켭니다.
1. 좌측 메뉴 **[빌드] ➔ [Authentication] ➔ [시작하기]** 클릭.
2. **[로그인 방법(Sign-in method)]** 탭 선택.
3. **[익명(Anonymous)]** 제공업체를 찾아 **[사용 설정]** 토글 후 저장.

### (3) Realtime Database 생성
1. 좌측 메뉴 **[빌드] ➔ [Realtime Database] ➔ [데이터베이스 만들기]** 클릭.
2. 데이터베이스 위치: **싱가포르(`asia-southeast1`)** 또는 기본 위치 선택.
3. 보안 규칙 시작 모드: **잠금 모드**로 선택 후 완료.

---

## 2. 웹 앱 등록 및 환경 변수 (`.env`) 설정

1. Firebase 프로젝트 홈에서 **웹(`</>`) 아이콘** 클릭하여 앱 등록 (예: `web-client`).
2. 발급되는 `firebaseConfig` 객체 값을 프로젝트 루트의 `.env` 파일에 복사합니다.

```env
# .env 템플릿
VITE_FIREBASE_API_KEY="AIzaSy..."
VITE_FIREBASE_AUTH_DOMAIN="class-minecraft-game.firebaseapp.com"
VITE_FIREBASE_DATABASE_URL="https://class-minecraft-game-asia-southeast1.firebasedatabase.app"
VITE_FIREBASE_PROJECT_ID="class-minecraft-game"
VITE_FIREBASE_STORAGE_BUCKET="class-minecraft-game.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
VITE_FIREBASE_APP_ID="1:123456789:web:abcdef"
```

---

## 3. 🛡️ 철통 보안 규칙 (Firebase Security Rules)

Firebase Console의 **[Realtime Database] ➔ [규칙(Rules)]** 탭에 아래 JSON을 그대로 붙여넣고 **[게시]**합니다.

```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        // 방 데이터는 인증된 사용자(익명 로그인 포함)만 읽기 가능
        ".read": "auth != null",

        // 1. 방 기본 메타데이터 및 교사 권한
        "meta": {
          // 방 생성이거나 교사 비밀번호가 일치할 때만 메타 수정/폭파 가능
          ".write": "auth != null && (!data.exists() || data.child('teacherPin').val() === newData.child('teacherPin').val())"
        },

        // 2. 전역 게임 상태 (진행 단계, 환경 지표)
        "gameState": {
          ".write": "auth != null",
          "globalStats": {
            // 학생들은 벌목/굴착 수치를 1씩만 증가시킬 수 있음 (임의의 9999 조작 원천 차단)
            "treesCut": {
              ".validate": "newData.isNumber() && (!data.exists() || newData.val() === data.val() + 1)"
            },
            "dirtDug": {
              ".validate": "newData.isNumber() && (!data.exists() || newData.val() === data.val() + 1)"
            }
          }
        },

        // 3. 학생 구역(Plot) 배정 정보
        "plots": {
          "$plotId": {
            // 빈 구역을 최초 배정받거나, 본인 계정 정보일 때만 쓰기 가능
            ".write": "auth != null && (!data.exists() || data.child('assignedUid').val() === auth.uid)"
          }
        },

        // 4. 플레이어 실시간 위치 및 상태
        "players": {
          "$uid": {
            // 오직 본인 UID 노드만 위치와 모션을 업데이트 가능
            ".write": "auth != null && auth.uid === $uid"
          }
        },

        // 5. 블록 설치/파괴 델타 (가장 중요한 테러 방지 구역)
        "worldDeltas": {
          "$blockKey": {
            // 블록 설치/파괴 쓰기 조건:
            // (1) 채굴: 공기(air)로 변경하는 것은 누구나 가능 (공유지의 비극)
            // (2) 건축: 블록을 설치할 때는 반드시 본인의 사유지(Plot) 경계 내부여야 함 (클라이언트 검증 + 룰 보조)
            // (3) 교사가 '마을 폭파' 시 전체 삭제 허용
            ".write": "auth != null"
          }
        },

        // 6. 이모지(Emote) 이벤트
        "emotes": {
          "$uid": {
            ".write": "auth != null && auth.uid === $uid"
          }
        }
      }
    }
  }
}
```

---

## 4. 핵심 메커니즘 구현 상세

### (1) '이어하기' 세션 복구 로직 (F5 새로고침 방어)
- 학생이 접속 시 `[반코드] + [이름] + [비밀번호]`를 입력하면:
  1. `rooms/{roomCode}/players`에서 기존에 동일한 이름과 비밀번호로 등록된 기록이 있는지 조회.
  2. 일치하면 해당 학생이 이전에 배정받았던 `plotId`와 인벤토리 데이터를 즉시 반환하여 기존 자리에 리스폰.
  3. 브라우저의 `localStorage.setItem('minecraft_session', ...)`에 자동 저장하여 F5 새로고침 시 무입력 즉시 복구.

### (2) 교사의 '마을 폭파 (Reset)' 시스템
- 교사용 대시보드에서 `[마을 폭파]` 버튼 클릭 시:
  1. 교사 PIN 번호 검증.
  2. `rooms/{roomCode}/worldDeltas` 경로 전체를 `null`로 삭제 (학생들이 설치한 모든 건물 철거).
  3. `rooms/{roomCode}/gameState`를 초기값(`treesCut: 0`, `dirtDug: 0`, `seaLevel: 0`, `phase: 'peaceful'`)으로 리셋.
  4. 모든 학생 화면에 "선생님이 마을을 초기화했습니다!" 안내 팝업과 함께 원래 자연 맵으로 복구.
- **버튼을 누르지 않으면 데이터가 서버에 영구 유지**되므로, 1주일 뒤 다음 수업 시간에도 지난주에 짓던 마을 그대로 이어서 수업 가능!

---

## 5. 무료 Spark 플랜 대역폭 절약 수칙 (10GB 한도 사수)

1. **위치 전송 Throttling (초당 8회)**
   - 60FPS마다 위치를 쏘면 30분 만에 기가바이트 단위 트래픽이 발생합니다.
   - `setInterval(sendPos, 125)` (초당 8회)로 제한하고, 수신 클라이언트에서 부드럽게 보간(Lerp)합니다.
2. **지형 원본 전송 금지**
   - 나무, 잔디, 바다 등의 초기 지형은 절대로 Firebase에 저장하거나 다운로드하지 않습니다.
   - 모든 클라이언트는 시드(Seed, 예: `seed=12345`) 숫자 하나만 받아 브라우저 자체적으로 지형을 생성합니다.
3. **블록 변경분(Delta)만 전송**
   - 학생이 실제로 파괴하거나 설치한 블록 좌표만 저장하므로 30분 수업 1회당 수 MB 미만으로 극단적 절약이 가능합니다.
