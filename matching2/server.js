const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const users = {}; // socket.id → user profile

io.on("connection", (socket) => {
  console.log("🔌 연결됨:", socket.id);

  // 사용자 등록
  socket.on("register", (profile) => {
    const isGroup = profile.isGroup === true;
    const groupMembers = isGroup && Array.isArray(profile.groupMembers)
      ? profile.groupMembers.slice(0, 3)
      : [];

    users[socket.id] = {
      ...profile,
      isGroup,
      groupMembers,
      socketId: socket.id,
      matched: new Set(),   // 매칭 성공한 상대
      rejected: new Set()   // 거절된 상대
    };

    console.log("✅ 프로필 등록됨:", users[socket.id]);

    // 사용자에게 맞춤형 목록 전송
    sendFilteredProfiles();
  });

  // 매칭 요청
  socket.on("send_match", (targetSocketId) => {
    const sender = users[socket.id];
    const receiver = users[targetSocketId];

    if (!sender || !receiver) return;

    // 단체-단체 또는 개인-개인만 허용
    if (sender.isGroup !== receiver.isGroup) {
      console.log("❌ 매칭 실패: 단체-개인 매칭 불가");
      return;
    }

    // 이미 매칭 또는 거절된 상대일 경우
    if (
      sender.matched.has(targetSocketId) ||
      sender.rejected.has(targetSocketId)
    ) {
      console.log("⚠️ 이미 매칭되었거나 거절된 상대입니다. 요청 차단");
      return;
    }

    io.to(targetSocketId).emit("receive_match", {
      from: sender,
      fromId: socket.id
    });

    console.log(`📨 ${sender.name} → ${receiver.name} 매칭 요청 전송됨`);
  });

  // 수락
  socket.on("accept_match", (targetId) => {
    const me = users[socket.id];
    const target = users[targetId];

    if (!me || !target) return;

    me.matched.add(targetId);
    target.matched.add(socket.id);

    io.to(targetId).emit("match_result", {
      status: "수락",
      fromId: socket.id
    });

    io.to(socket.id).emit("match_result", {
      status: "수락",
      fromId: targetId
    });

    console.log(`🤝 매칭 완료: ${me.name} ↔ ${target.name}`);

    sendFilteredProfiles();
  });

  // 거절
  socket.on("decline_match", (targetId) => {
    const me = users[socket.id];
    const target = users[targetId];

    if (!me || !target) return;

    me.rejected.add(targetId);
    target.rejected.add(socket.id);

    io.to(targetId).emit("match_result", {
      status: "거절"
    });

    console.log(`🚫 매칭 거절: ${me.name} ↔ ${target.name}`);

    sendFilteredProfiles();
  });

  // 연결 해제
  socket.on("disconnect", () => {
    console.log("❌ 연결 해제됨:", socket.id);
    delete users[socket.id];
    sendFilteredProfiles();
  });

  // 사용자별 필터링된 목록 전송 함수
  function sendFilteredProfiles() {
    Object.keys(users).forEach((id) => {
      const me = users[id];

      const filtered = Object.values(users).filter((other) => {
        return (
          other.socketId !== id &&
          other.isGroup === me.isGroup &&
          !me.matched.has(other.socketId) &&
          !me.rejected.has(other.socketId)
        );
      });

      io.to(id).emit("update_profiles", filtered);
    });
  }
});

server.listen(3000, () => {
  console.log("🚀 서버 실행 중: http://localhost:3000");
});
