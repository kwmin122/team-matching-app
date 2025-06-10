const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.static(path.join(__dirname, "public"))); // public 폴더에 클라이언트 HTML이 있어야 함

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const users = {}; // socket.id → profile

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
      socketId: socket.id
    };

    console.log("✅ 프로필 등록됨:", users[socket.id]);

    // 모든 사용자에게 본인을 제외한 같은 그룹 유형의 프로필 목록 전달
    Object.keys(users).forEach((id) => {
      const user = users[id];
      const otherProfiles = Object.values(users).filter(
        (p) => p.socketId !== id && p.isGroup === user.isGroup
      );
      io.to(id).emit("update_profiles", otherProfiles);
    });
  });

  // 매칭 요청
  socket.on("send_match", (targetSocketId) => {
    const sender = users[socket.id];
    const receiver = users[targetSocketId];

    if (sender && receiver) {
      // 단체-단체 또는 개인-개인만 허용
      if (sender.isGroup === receiver.isGroup) {
        io.to(targetSocketId).emit("receive_match", {
          from: sender,
          fromId: socket.id
        });
        console.log(`📨 ${sender.name} → ${receiver.name} 매칭 요청 전송됨`);
      } else {
        console.log("⚠️ 개인과 단체 간 매칭은 허용되지 않습니다.");
      }
    }
  });

  // 매칭 수락
  socket.on("accept_match", (targetSocketId) => {
    io.to(targetSocketId).emit("match_result", {
      status: "수락",
      fromId: socket.id
    });
    io.to(socket.id).emit("match_result", {
      status: "수락",
      fromId: targetSocketId
    });
  });

  // 매칭 거절
  socket.on("decline_match", (targetSocketId) => {
    io.to(targetSocketId).emit("match_result", {
      status: "거절"
    });
  });

  // 연결 해제
  socket.on("disconnect", () => {
    console.log("❌ 연결 해제됨:", socket.id);
    delete users[socket.id];

    // 남은 사용자들에게 새 목록 전달
    Object.keys(users).forEach((id) => {
      const user = users[id];
      const otherProfiles = Object.values(users).filter(
        (p) => p.socketId !== id && p.isGroup === user.isGroup
      );
      io.to(id).emit("update_profiles", otherProfiles);
    });
  });
});

server.listen(3000, () => {
  console.log("🚀 서버 실행 중: http://localhost:3000");
});