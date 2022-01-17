/**                                                              +-->
 *                                                               |
 *             Share this URL with friends **after forking** ----+
 *
 * README:
 *
 * Make sure to **fork this project** and play on your own fork,
 * as each server only supports 1 game at a time!
 *
 * To share with your friend, copy over the URL to the right
 * (ex. https://competitive-2048-demo--mikeshi42.repl.co) and
 * send it to them to connect!
 *
 * Alternatively to test with yourself, just click on the
 * "Open in New Tab" button right of the URL bar on the
 * window to the right.
 */

const express = require("express");
const socketio = require("socket.io");
const http = require("http");
const redis = require("redis");

(async () => {
  const REDISHOST = process.env.REDISHOST || '10.88.41.68';
  const REDISPORT = process.env.REDISPORT || 6379;
  console.log(REDISHOST)
  console.log(REDISPORT)
  const client = redis.createClient(REDISPORT, REDISHOST);

  client.on("connect", function () {
    console.log("Redis client connected.");
    client.select(0)
  });

  client.on("error", function (err) {
    console.log("Redis client error: " + err);
  });

  const sockets = {};
  const playerLobbies = {};
  await client.connect();
  await client.flushDb()
  const app = express();
  const server = http.Server(app);
  const io = socketio(server); // Attach socket.io to our server
  const port = process.env.PORT || 8080
  server.listen(port, () => console.log("Server started"));

  var OBJECT = Object.prototype;
  OBJECT.rhash = {};
  OBJECT.rset = function (id, object) {
    OBJECT.rhash[id] = object;
    return id;
  };
  OBJECT.rget = function (id) {
    return OBJECT.rhash[id];
  };

  const uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };
  // Handle a socket connection request from web client
  io.on("connection", async function (socket) {
    // Find an available player number
    let playerIndex = -1;
    let lobbyId = -1;
    console.log("Created socket id:", socket.id,  "\n");

    const all_clients = await client.hGetAll("lobbies");
    const client_length = Object.keys(all_clients).length;
    if (client_length === 0) {
      console.log("no games available.");
      id = uid();
      lobbyId = id;
      playerIndex = 1;
      console.log("Player", playerIndex, "has connected");
      sockets[socket.id] = socket;
      const success = await client.hSet(
        "lobbies",
        lobbyId,
        JSON.stringify({
          player1: 1,
          player2: -1,
          socket1: socket.id,
          socket2: null,
        })
      );
      if (success) {
        console.log("Game", lobbyId, "is created.\n")
      } else {
        console.log("Failed to create the game.\n")
        return
      }
      sockets[socket.id].emit("player-number", { "number": 1, "lobby_id": lobbyId});
    } else {
      const lobbies = await client.hGetAll("lobbies")

      for (const [id, lobby_s] of Object.entries(lobbies)) {
        lobbyId = id
        const lobby = JSON.parse(lobby_s)
        if (lobby.player2 === -1) {
          console.log("Found an empty lobby for", socket.id);
          playerIndex = 0;
          console.log(`Player ${playerIndex} has connected.\n`);
          lobby.player2 = 0;
          sockets[socket.id] = socket;
          lobby.socket2 = socket.id;
          const success = await client.hSet("lobbies", id, JSON.stringify(lobby))
          // Tell everyone else what player number just connected
          sockets[lobby.socket2].emit("lobby-id", id);
          sockets[lobby.socket2].emit("player-number", { "number": 0, "lobby_id": id});
          sockets[lobby.socket1].emit("player-connect", 0);
          sockets[lobby.socket2].emit("player-connect", 0);
          break
        }
      }
      if (playerIndex === -1) {
        console.log("All games are full.");
        id = uid();
        lobbyId = id;
        playerIndex = 1;
        console.log(`Player ${playerIndex} has connected`);
        sockets[socket.id] = socket;
        const success = await client.hSet(
          "lobbies",
          lobbyId,
          JSON.stringify({
            player1: 1,
            player2: -1,
            socket1: socket.id,
            socket2: null,
          })
        );
        if (success) {
          console.log("Game", lobbyId, "is created.\n")
        } else {
          console.log("Failed to create the game.\n")
          return
        }

        sockets[socket.id].emit("lobby-id", id);
        sockets[socket.id].emit("player-number", { "number": 1, "lobby_id": lobbyId});
      }
    }

    socket.on("actuate", async function (data) {
      const { grid, metadata, id } = data; // Get grid and metadata properties from client
      console.log(`Actuation from ${playerIndex} in lobby ${lobbyId}`);
      const move = {
        playerIndex,
        grid,
        metadata,
      };
      let lobby = await client.hGet("lobbies", lobbyId);
      lobby = JSON.parse(lobby)

      if (lobby.player1 == playerIndex) {
        if (sockets[lobby.socket2]) {
          sockets[lobby.socket2].emit("move", move);
        } else {
          sockets[lobby.socket1].disconnect()
        }
      } else {
        if (sockets[lobby.socket1]) {
          sockets[lobby.socket1].emit("move", move);
        } else {
          sockets[lobby.socket2].disconnect()
        }
      }
    });
    
    socket.on("disconnect", async function () {
      console.log(`Player ${playerIndex} Disconnected from ${lobbyId}`);
      let lobby = await client.hGet("lobbies", lobbyId);
      lobby = JSON.parse(lobby)
      if (lobby) {
        if (lobby.player1 == playerIndex) {
          delete sockets[lobby.socket1];
          if (!sockets[lobby.socket2]) {
            await client.hDel("lobbies", lobbyId)
          }
        } else {
          delete sockets[lobby.socket2];
          if (!sockets[lobby.socket1]) {
            await client.hDel("lobbies", lobbyId)
          }
        }
      }
    });
  });
})();
