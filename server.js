const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

const rooms = new Map();

function getRoomKey(region, mapId) {
  return `${region}:${mapId}`;
}

function send(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(roomKey, data, exceptWs = null) {
  const room = rooms.get(roomKey);
  if (!room) return;

  for (const client of room) {
    if (client !== exceptWs && client.readyState === client.OPEN) {
      client.send(JSON.stringify(data));
    }
  }
}

app.get("/", (req, res) => {
  res.send("Web3Lounge Europe WebSocket server is running.");
});

app.get("/health", (req, res) => {
  res.json({ ok: true, region: "europe" });
});

wss.on("connection", (ws) => {
  ws.player = null;
  ws.roomKey = null;

  ws.on("message", (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: "error", message: "Invalid JSON" });
    }

    if (msg.type === "ping") {
      return send(ws, {
        type: "pong",
        clientTime: msg.clientTime,
        serverTime: Date.now(),
      });
    }

    if (msg.type === "join") {
      const region = "europe";
      const mapId = msg.mapId || "town";
      const roomKey = getRoomKey(region, mapId);

      if (ws.roomKey && rooms.has(ws.roomKey)) {
        rooms.get(ws.roomKey).delete(ws);
      }

      ws.roomKey = roomKey;
      ws.player = {
        characterId: msg.characterId,
        playerName: msg.playerName,
        x: msg.x || 0,
        y: msg.y || 0,
        mapId,
        region,
      };

      if (!rooms.has(roomKey)) rooms.set(roomKey, new Set());
      rooms.get(roomKey).add(ws);

      send(ws, {
        type: "joined",
        region,
        mapId,
        roomKey,
      });

      broadcast(roomKey, {
        type: "player_joined",
        player: ws.player,
      }, ws);

      return;
    }

    if (!ws.roomKey || !ws.player) {
      return send(ws, { type: "error", message: "Join a room first" });
    }

    if (msg.type === "move") {
      ws.player.x = msg.x;
      ws.player.y = msg.y;
      ws.player.direction = msg.direction;

      return broadcast(ws.roomKey, {
        type: "player_moved",
        characterId: ws.player.characterId,
        x: msg.x,
        y: msg.y,
        direction: msg.direction,
      }, ws);
    }

    if (msg.type === "chat") {
      return broadcast(ws.roomKey, {
        type: "chat",
        characterId: ws.player.characterId,
        playerName: ws.player.playerName,
        message: msg.message,
      });
    }

    if (msg.type === "projectile") {
      return broadcast(ws.roomKey, {
        type: "projectile",
        characterId: ws.player.characterId,
        projectile: msg.projectile,
      }, ws);
    }

    if (msg.type === "pvp_hit") {
      return broadcast(ws.roomKey, {
        type: "pvp_hit",
        attackerId: ws.player.characterId,
        targetId: msg.targetId,
        damage: msg.damage,
        castId: msg.castId,
      });
    }
  });

  ws.on("close", () => {
    if (ws.roomKey && rooms.has(ws.roomKey)) {
      rooms.get(ws.roomKey).delete(ws);

      if (ws.player) {
        broadcast(ws.roomKey, {
          type: "player_left",
          characterId: ws.player.characterId,
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Europe WebSocket server running on port ${PORT}`);
});