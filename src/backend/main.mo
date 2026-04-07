import Map "mo:core/Map";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Blob "mo:core/Blob";
import Runtime "mo:core/Runtime";
import IC "ic:aaaaa-aa";

persistent actor {
  // ── Types ──────────────────────────────────────────────────────────────

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

  // ── HTTP Outcall types (inlined from caffeineai-http-outcalls) ─────────

  public type TransformationInput = {
    context : Blob;
    response : IC.http_request_result;
  };
  public type TransformationOutput = IC.http_request_result;

  // ── State ──────────────────────────────────────────────────────────────

  let scores = Map.empty<Text, Nat>();
  let pvpRooms = Map.empty<Text, PvPRoom>();
  var roomCounter : Nat = 0;

  // ── Room code generation ───────────────────────────────────────────────

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

  // ── Leaderboard ────────────────────────────────────────────────────────

  public shared func submitScore(playerName : Text, score : Nat) : async () {
    scores.add(playerName, score);
  };

  public shared func clearLeaderboard() : async () {
    scores.clear();
  };

  public query func getTop10Scores() : async [ScoreEntry] {
    scores.entries().toArray().map(
      func((playerName, score) : (Text, Nat)) : ScoreEntry {
        { playerName; score }
      }
    ).sort(
      func(a : ScoreEntry, b : ScoreEntry) : { #less; #equal; #greater } {
        Nat.compare(b.score, a.score)
      }
    ).sliceToArray(0, 10)
  };

  // ── HTTP Outcalls ──────────────────────────────────────────────────────

  public query func transform(input : TransformationInput) : async TransformationOutput {
    { input.response with headers = [] }
  };

  public func getTokenStatsJson() : async Text {
    let headers = [{
      name = "User-Agent";
      value = "caffeine.ai";
    }];
    let http_request : IC.http_request_args = {
      url = "https://api.odin.fun/v1/token/2ip5";
      max_response_bytes = null;
      headers;
      body = null;
      method = #get;
      transform = ?{
        function = transform;
        context = Blob.fromArray([]);
      };
      is_replicated = ?false;
    };
    let httpResponse = await (with cycles = 231_000_000_000) IC.http_request(http_request);
    switch (httpResponse.body.decodeUtf8()) {
      case (null) { Runtime.trap("empty HTTP response") };
      case (?decoded) { decoded };
    }
  };

  // ── PvP Rooms ──────────────────────────────────────────────────────────

  public query func getWaitingRoom(gameType : Text, excludePlayer : Text) : async ?PvPRoom {
    for ((code, room) in pvpRooms.entries()) {
      if (room.status == "waiting" and room.gameType == gameType and room.player1 != excludePlayer) {
        return ?room;
      };
    };
    null
  };

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

  public shared func joinPvPRoom(code : Text, player2 : Text) : async Bool {
    switch (pvpRooms.get(code)) {
      case (?room) {
        if (room.status == "waiting") {
          pvpRooms.add(code, {
            room with
            player2 = player2;
            status = "active";
            winner = "";
          });
          true
        } else {
          false
        }
      };
      case null { false };
    }
  };

  public query func getPvPRoom(code : Text) : async ?PvPRoom {
    pvpRooms.get(code)
  };

  public shared func updatePvPState(code : Text, playerAddr : Text, newState : Text, nextTurn : Text) : async Bool {
    switch (pvpRooms.get(code)) {
      case (?room) {
        if (room.status == "active" and room.currentTurn == playerAddr) {
          pvpRooms.add(code, {
            room with
            gameState = newState;
            currentTurn = nextTurn;
          });
          true
        } else {
          false
        }
      };
      case null { false };
    }
  };

  public shared func finishPvPGame(code : Text, winner : Text) : async Bool {
    switch (pvpRooms.get(code)) {
      case (?room) {
        pvpRooms.add(code, {
          room with
          currentTurn = "";
          status = "finished";
          winner = winner;
        });
        true
      };
      case null { false };
    }
  };
};
