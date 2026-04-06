import Map "mo:core/Map";
import Text "mo:core/Text";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Nat "mo:core/Nat";
import Outcall "./http-outcalls/outcall";

persistent actor {
  type ScoreEntry = {
    playerName : Text;
    score : Nat;
  };

  type PvPRoom = {
    roomCode : Text;
    player1 : Text;
    player2 : Text;
    gameType : Text;
    gameState : Text;
    currentTurn : Text;
    status : Text;
    winner : Text;
  };

  let scores = Map.empty<Text, Nat>();
  let pvpRooms = Map.empty<Text, PvPRoom>();
  var roomCounter : Nat = 0;

  let ROOM_CHARS : [Char] = [
    'A','B','C','D','E','F','G','H',
    'J','K','L','M','N','P','Q','R',
    'S','T','U','V','W','X','Y','Z',
    '2','3','4','5','6','7','8','9'
  ];

  func natToRoomChar(n : Nat) : Char {
    ROOM_CHARS[n % 32]
  };

  func generateRoomCode() : Text {
    roomCounter += 1;
    let n = roomCounter;
    Text.fromChar(natToRoomChar(n)) #
    Text.fromChar(natToRoomChar(n * 7 + 3)) #
    Text.fromChar(natToRoomChar(n * 13 + 7)) #
    Text.fromChar(natToRoomChar(n * 17 + 11)) #
    Text.fromChar(natToRoomChar(n * 23 + 5)) #
    Text.fromChar(natToRoomChar(n * 29 + 19))
  };

  public shared func submitScore(playerName : Text, score : Nat) : async () {
    scores.add(playerName, score);
  };

  public shared func clearLeaderboard() : async () {
    let keys = scores.keys().toArray();
    for (key in keys.vals()) {
      ignore scores.remove(key);
    };
  };

  public query func getTop10Scores() : async [ScoreEntry] {
    scores.entries().toArray().map(
      func((playerName, score)) {
        {
          playerName;
          score;
        };
      }
    ).sort(
      func(a, b) {
        Nat.compare(b.score, a.score);
      }
    ).sliceToArray(0, 10);
  };

  public query func transform(input : Outcall.TransformationInput) : async Outcall.TransformationOutput {
    Outcall.transform(input);
  };

  public func getTokenStatsJson() : async Text {
    await Outcall.httpGetRequest(
      "https://api.odin.fun/v1/token/2ip5",
      [],
      transform,
    );
  };

  // Find a waiting room for the given game type (not created by this player)
  public query func getWaitingRoom(gameType : Text, excludePlayer : Text) : async ?PvPRoom {
    for ((code, room) in pvpRooms.entries()) {
      if (room.status == "waiting" and room.gameType == gameType and room.player1 != excludePlayer) {
        return ?room;
      };
    };
    null
  };

  // Create a new PvP room, returns the room code
  public shared func createPvPRoom(player1 : Text, gameType : Text, initialState : Text) : async Text {
    let code = generateRoomCode();
    let room : PvPRoom = {
      roomCode = code;
      player1 = player1;
      player2 = "";
      gameType = gameType;
      gameState = initialState;
      currentTurn = player1;
      status = "waiting";
      winner = "";
    };
    pvpRooms.add(code, room);
    code
  };

  // Join an existing room as player2
  public shared func joinPvPRoom(code : Text, player2 : Text) : async Bool {
    switch (pvpRooms.get(code)) {
      case (?room) {
        if (room.status == "waiting") {
          let updated : PvPRoom = {
            roomCode = room.roomCode;
            player1 = room.player1;
            player2 = player2;
            gameType = room.gameType;
            gameState = room.gameState;
            currentTurn = room.player1;
            status = "active";
            winner = "";
          };
          pvpRooms.add(code, updated);
          true
        } else {
          false
        }
      };
      case null { false };
    }
  };

  // Get room state (query - no fee)
  public query func getPvPRoom(code : Text) : async ?PvPRoom {
    pvpRooms.get(code)
  };

  // Update game state after a move
  public shared func updatePvPState(code : Text, playerAddr : Text, newState : Text, nextTurn : Text) : async Bool {
    switch (pvpRooms.get(code)) {
      case (?room) {
        if (room.status == "active" and room.currentTurn == playerAddr) {
          let updated : PvPRoom = {
            roomCode = room.roomCode;
            player1 = room.player1;
            player2 = room.player2;
            gameType = room.gameType;
            gameState = newState;
            currentTurn = nextTurn;
            status = room.status;
            winner = room.winner;
          };
          pvpRooms.add(code, updated);
          true
        } else {
          false
        }
      };
      case null { false };
    }
  };

  // Finish the game with a winner
  public shared func finishPvPGame(code : Text, winner : Text) : async Bool {
    switch (pvpRooms.get(code)) {
      case (?room) {
        let updated : PvPRoom = {
          roomCode = room.roomCode;
          player1 = room.player1;
          player2 = room.player2;
          gameType = room.gameType;
          gameState = room.gameState;
          currentTurn = "";
          status = "finished";
          winner = winner;
        };
        pvpRooms.add(code, updated);
        true
      };
      case null { false };
    }
  };
};
