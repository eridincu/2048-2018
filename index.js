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
  const client = redis.createClient(6379, "10.177.180.195");

  client.on("connect", function () {
    console.log("Redis client connected.");
  });

  client.on("error", function (err) {
    console.log("Redis client error: " + err);
  });

  console.log("after connect");
  const sockets = {};
  await client.connect();

  const app = express();
  const server = http.Server(app);
  const io = socketio(server); // Attach socket.io to our server

  app.use(express.static("public")); // Serve our static assets from /public

  server.listen(3000, () => console.log("server started"));

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
    console.log("socket created");
    var client_length = await client.lLen("lobbies");
    console.log("client_length:", client_length);
    if (client_length === 0) {
      console.log("no games available.");
      id = uid();
      lobbyId = id;
      playerIndex = 1;
      console.log("Player ${playerIndex} has connected");
      console.log("socket id:", socket.id);
      sockets[socket.id] = socket;
      await client.hSet(
        "lobbies",
        lobbyId,
        JSON.stringify({
          player1: 1,
          player2: -1,
          socket1: socket.id,
          socket2: null,
        })
      );

      sockets[socket.id].emit("lobby-id", id);
      sockets[socket.id].emit("player-number", 1);
    } else {
      console.log("there are lobbies available.");
      lobbies = JSON.parse(await client.hGetAll("lobbies"));

      for (const [lobbyId, lobby] of Object.entries(lobbies)) {
        if (lobby.player2 === -1) {
          console.log("second player is empty.");
          playerIndex = 0;
          console.log(`Player ${playerIndex} has connected`);
          lobby.player2 = 0;
          sockets[socket.id] = socket;
          lobby.socket2 = socket.id;
          // Tell everyone else what player number just connected
          sockets[lobby.socket2].emit("lobby-id", lobbyId);
          sockets[lobby.socket2].emit("player-number", 0);
          sockets[lobby.socket1].emit("player-connect", 0);
          sockets[lobby.socket2].emit("player-connect", 0);
        }
      }
      if (playerIndex === -1) {
        console.log("all games are full.");
        id = uid();
        lobbyId = id;
        playerIndex = 1;
        console.log(`Player ${playerIndex} has connected`);
        sockets[socket.id] = socket;
        await client.hSet(
          "lobbies",
          lobbyId,
          JSON.stringify({
            player1: 1,
            player2: -1,
            socket1: socket.id,
            socket2: null,
          })
        );

        sockets[socket.id].emit("lobby-id", id);
        sockets[socket.id].emit("player-number", 1);
      }
    }

    socket.on("actuate", async function (data) {
      console.log(`Actuation from ${playerIndex}`);
      console.log(data);
      const { grid, metadata, lobbyId } = data; // Get grid and metadata properties from client
      console.log("lobbyId: ", lobbyId);
      const move = {
        playerIndex,
        grid,
        metadata,
      };
      const lobby = JSON.parse(await client.hGet("lobbies", lobbyId));
      if (lobby.player1 == playerIndex) {
        sockets[lobby.socket2].emit("move", move);
      } else {
        sockets[lobby.socket1].emit("move", move);
      }
    });

    socket.on("disconnect", async function () {
      console.log(`Player ${playerIndex} Disconnected`);
      lobby = JSON.parse(await client.hGet("lobbies", lobbyId));
      if (lobby) {
        if (lobby.player1 == playerIndex) {
          delete sockets[lobby.socket1];
          sockets[lobby.socket2].emit("end");
        } else {
          delete sockets[lobby.socket2];
          sockets[lobby.socket1].emit("end");
        }
      }
      await client.hDel("lobbies", lobbyId);
      console.log("lobbies: ", lobbies);
    });
  });
})();
