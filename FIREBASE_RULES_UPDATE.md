# Firebase 데이터베이스 규칙 수정 방법

## 문제
교사가 방을 생성할 때 `teachers/{uid}/rooms/{roomCode}` 경로에 저장하려고 하지만 권한 오류가 발생합니다.

## 해결 방법

### 1. Firebase Console 접속
https://console.firebase.google.com 에 접속

### 2. 프로젝트 선택
"class-minecraft-game" 프로젝트 선택

### 3. Realtime Database 규칙 수정
좌측 메뉴 → "Realtime Database" → "Rules" 탭 클릭

### 4. 다음 규칙 복사 & 붙여넣기

```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": "auth != null",
        "meta": {
          ".write": "auth != null"
        },
        "joinRequests": {
          ".write": "auth != null"
        },
        "players": {
          ".write": "auth != null"
        },
        "kicked": {
          ".write": "auth != null"
        },
        "worldDeltas": {
          ".write": "auth != null"
        },
        "plotResetEvent": {
          ".write": "auth != null"
        },
        "chats": {
          ".write": "auth != null"
        },
        "gameState": {
          ".write": "auth != null"
        },
        "plots": {
          ".write": "auth != null"
        },
        "assignedPlots": {
          ".write": "auth != null"
        },
        "emotes": {
          ".write": "auth != null"
        },
        "chunks": {
          ".write": "auth != null"
        }
      }
    },
    "teachers": {
      ".read": "auth != null",
      "$teacherUid": {
        ".write": "auth != null",
        "rooms": {
          ".write": "auth != null",
          "$roomCode": {
            ".write": "auth != null"
          }
        }
      }
    }
  }
}
```

### 5. "게시" 클릭
우측 상단 "게시" 버튼을 클릭하여 규칙 업데이트

### 6. 테스트
브라우저를 새로고침하고 다시 방을 생성해봅니다.

---

**주의:** 위 규칙을 복사하기 전에 기존 규칙에 중요한 커스터마이징이 있는지 확인하세요.
