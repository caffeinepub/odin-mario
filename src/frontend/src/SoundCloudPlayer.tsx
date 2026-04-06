import { useEffect, useRef, useState } from "react";

interface JamendoTrack {
  id: string;
  name: string;
  artist_name: string;
  audio: string;
  duration: number;
}

const GENRES = [
  "gaming",
  "lofi",
  "epic",
  "chillout",
  "electronic",
  "ambient",
  "rock",
  "jazz",
];

const FALLBACK_TRACKS: JamendoTrack[] = [
  {
    id: "f1",
    name: "Epic Adventure",
    artist_name: "Jamendo Artist",
    audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    duration: 180,
  },
  {
    id: "f2",
    name: "Chill Lofi Beat",
    artist_name: "Lofi Studio",
    audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    duration: 240,
  },
  {
    id: "f3",
    name: "Gaming Theme",
    artist_name: "Pixel Music",
    audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    duration: 200,
  },
  {
    id: "f4",
    name: "Battle Theme",
    artist_name: "Epic Sounds",
    audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    duration: 220,
  },
  {
    id: "f5",
    name: "Chill Vibes",
    artist_name: "Ambient Studio",
    audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    duration: 195,
  },
];

async function fetchGenreTracks(tag: string): Promise<JamendoTrack[]> {
  try {
    const url = `https://api.jamendo.com/v3.0/tracks/?client_id=b6747d04&format=json&limit=10&tags=${tag}&orderby=popularity_total`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (
      data.results &&
      Array.isArray(data.results) &&
      data.results.length > 0
    ) {
      return data.results as JamendoTrack[];
    }
  } catch {
    /* network/cors */
  }
  return [];
}

async function fetchAllTracks(): Promise<JamendoTrack[]> {
  const results = await Promise.allSettled(GENRES.map(fetchGenreTracks));
  const all: JamendoTrack[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const t of r.value) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          all.push(t);
        }
      }
    }
  }
  return all;
}

const GENRE_LABELS: Record<string, string> = {
  gaming: "🎮 Gaming",
  lofi: "🎧 Lofi",
  epic: "⚡ Epic",
  chillout: "😎 Chillout",
  electronic: "🔊 Electronic",
  ambient: "🌌 Ambient",
  rock: "🎸 Rock",
  jazz: "🎷 Jazz",
};

function formatDuration(s: number) {
  if (!s || s < 0) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function SoundCloudPlayer() {
  const [open, setOpen] = useState(false);
  const [tracks, setTracks] = useState<JamendoTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<JamendoTrack | null>(null);
  const [activeGenre, setActiveGenre] = useState<string>("all");
  const [genreTracks, setGenreTracks] = useState<
    Record<string, JamendoTrack[]>
  >({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (open && !fetchedRef.current) {
      fetchedRef.current = true;
      setLoading(true);
      Promise.allSettled(
        GENRES.map(async (g) => {
          const t = await fetchGenreTracks(g);
          return { genre: g, tracks: t };
        }),
      ).then((results) => {
        const byGenre: Record<string, JamendoTrack[]> = {};
        const all: JamendoTrack[] = [];
        const seen = new Set<string>();
        for (const r of results) {
          if (r.status === "fulfilled") {
            byGenre[r.value.genre] = r.value.tracks;
            for (const t of r.value.tracks) {
              if (!seen.has(t.id)) {
                seen.add(t.id);
                all.push(t);
              }
            }
          }
        }
        if (all.length === 0) {
          setTracks(FALLBACK_TRACKS);
        } else {
          setGenreTracks(byGenre);
          setTracks(all);
        }
        setLoading(false);
      });
    }
  }, [open]);

  function handlePlay(track: JamendoTrack) {
    setSelected(track);
    if (audioRef.current) {
      audioRef.current.src = track.audio;
      audioRef.current.play().catch(() => {});
    }
  }

  function handleStop() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setSelected(null);
  }

  function handleRefresh() {
    fetchedRef.current = false;
    setTracks([]);
    setGenreTracks({});
    setLoading(true);
    fetchAllTracks().then((all) => {
      setTracks(all.length > 0 ? all : FALLBACK_TRACKS);
      setLoading(false);
    });
  }

  const displayTracks =
    activeGenre === "all" ? tracks : (genreTracks[activeGenre] ?? []);

  const isActive = !!selected;

  const btnStyle: React.CSSProperties = {
    position: "fixed",
    bottom: 80,
    right: 16,
    zIndex: 9997,
    width: 52,
    height: 52,
    borderRadius: "50%",
    background:
      "linear-gradient(180deg, #1a6fd4 0%, #2485e8 60%, #1e5fa8 100%)",
    border: "3px solid #fff",
    boxShadow: isActive
      ? "0 0 0 2px #1a3a8a, 0 0 18px 4px rgba(36,133,232,0.7)"
      : "0 0 0 2px #1a3a8a, 0 4px 12px rgba(0,0,0,0.5)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    transition: "box-shadow 0.4s",
    animation: isActive ? "scPulse 2s ease-in-out infinite" : "none",
  };

  return (
    <>
      <style>{`
        @keyframes scPulse {
          0%, 100% { box-shadow: 0 0 0 2px #1a3a8a, 0 0 10px 2px rgba(36,133,232,0.5); }
          50% { box-shadow: 0 0 0 2px #1a3a8a, 0 0 24px 8px rgba(36,133,232,0.9); }
        }
        .music-result-item:hover { background: rgba(255,255,255,0.15) !important; }
        .music-result-item { width: 100%; text-align: left; font-family: inherit; }
        .genre-tab:hover { background: rgba(255,255,255,0.2) !important; }
        .music-scroll::-webkit-scrollbar { width: 4px; }
        .music-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 2px; }
        .music-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 2px; }
      `}</style>

      <audio ref={audioRef} style={{ display: "none" }}>
        <track kind="captions" />
      </audio>

      {/* Floating toggle button */}
      <button
        type="button"
        data-ocid="music.open_modal_button"
        style={btnStyle}
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close music player" : "Open music player"}
      >
        🎵
      </button>

      {/* Expanded panel */}
      {open && (
        <div
          data-ocid="music.panel"
          style={{
            position: "fixed",
            bottom: 140,
            right: 16,
            zIndex: 9997,
            width: 320,
            borderRadius: 10,
            border: "4px solid #fff",
            boxShadow: "0 0 0 3px #1a3a8a, 0 8px 32px rgba(0,0,0,0.7)",
            background:
              "linear-gradient(180deg, #1a6fd4 0%, #2485e8 60%, #1e5fa8 100%)",
            overflow: "hidden",
            fontFamily: "'Press Start 2P', 'Courier New', monospace",
          }}
        >
          {/* Cloud decorations */}
          <div style={{ position: "relative", height: 0, overflow: "visible" }}>
            <div
              style={{
                position: "absolute",
                top: 8,
                left: 10,
                width: 32,
                height: 16,
                background: "#fff",
                borderRadius: 8,
                opacity: 0.5,
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 4,
                left: 18,
                width: 24,
                height: 16,
                background: "#fff",
                borderRadius: 8,
                opacity: 0.5,
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 8,
                right: 40,
                width: 26,
                height: 13,
                background: "#fff",
                borderRadius: 7,
                opacity: 0.4,
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 4,
                right: 46,
                width: 20,
                height: 13,
                background: "#fff",
                borderRadius: 7,
                opacity: 0.4,
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px 14px 10px",
              position: "relative",
            }}
          >
            <span
              style={{
                color: "#fff",
                fontSize: 12,
                fontWeight: 900,
                textShadow: "2px 2px 0 #c43a00, 3px 3px 0 #7a1d00",
                letterSpacing: 1,
              }}
            >
              🎵 MUSIC
            </span>
            <button
              type="button"
              data-ocid="music.close_button"
              onClick={() => setOpen(false)}
              style={{
                position: "absolute",
                right: 10,
                top: 12,
                background: "rgba(0,0,0,0.4)",
                border: "2px solid rgba(255,255,255,0.4)",
                borderRadius: 5,
                color: "#ffe066",
                fontSize: 10,
                cursor: "pointer",
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'Press Start 2P', monospace",
              }}
            >
              ✕
            </button>
          </div>

          {/* Genre filter tabs */}
          <div
            style={{
              padding: "0 12px 8px",
              overflowX: "auto",
              display: "flex",
              gap: 4,
              scrollbarWidth: "none",
            }}
          >
            {["all", ...GENRES].map((g) => (
              <button
                key={g}
                type="button"
                className="genre-tab"
                onClick={() => setActiveGenre(g)}
                style={{
                  background:
                    activeGenre === g
                      ? "rgba(249,115,22,0.8)"
                      : "rgba(0,0,0,0.35)",
                  border:
                    activeGenre === g
                      ? "2px solid #fff"
                      : "2px solid rgba(255,255,255,0.3)",
                  borderRadius: 5,
                  color: activeGenre === g ? "#fff" : "rgba(255,255,255,0.7)",
                  fontSize: 6,
                  fontFamily: "'Press Start 2P', monospace",
                  padding: "4px 7px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  fontWeight: activeGenre === g ? 900 : 400,
                }}
              >
                {g === "all" ? "🎵 All" : GENRE_LABELS[g]}
              </button>
            ))}
          </div>

          {/* Track list */}
          <div style={{ padding: "0 12px", paddingBottom: selected ? 0 : 12 }}>
            {/* Section label + refresh */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  color: "#ffe066",
                  fontSize: 7,
                  fontFamily: "'Press Start 2P', monospace",
                  textShadow: "1px 1px 0 #7a4a00",
                  letterSpacing: 0.5,
                }}
              >
                🔥 TOP PICKS
              </span>
              <button
                type="button"
                onClick={handleRefresh}
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: 4,
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 6,
                  fontFamily: "'Press Start 2P', monospace",
                  cursor: "pointer",
                  padding: "2px 6px",
                  marginLeft: "auto",
                }}
                title="Refresh music list"
              >
                ↻ refresh
              </button>
            </div>

            {loading && (
              <div
                style={{
                  textAlign: "center",
                  color: "#ffe066",
                  fontSize: 8,
                  padding: "20px 0",
                  fontFamily: "'Press Start 2P', monospace",
                }}
              >
                ⏳ Loading music...
              </div>
            )}

            {!loading && displayTracks.length > 0 && (
              <div
                className="music-scroll"
                style={{
                  maxHeight: 260,
                  overflowY: "auto",
                  background: "rgba(0,0,0,0.35)",
                  borderRadius: 8,
                  border: "2px solid rgba(255,255,255,0.2)",
                }}
              >
                {displayTracks.map((track) => {
                  const isPlaying = selected?.id === track.id;
                  return (
                    <button
                      key={track.id}
                      type="button"
                      className="music-result-item"
                      onClick={() => handlePlay(track)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 10px",
                        cursor: "pointer",
                        background: isPlaying
                          ? "rgba(249,115,22,0.35)"
                          : "transparent",
                        border: "none",
                        borderBottom: "1px solid rgba(255,255,255,0.1)",
                        transition: "background 0.15s",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            color: isPlaying ? "#ffe066" : "#fff",
                            fontSize: 7,
                            fontFamily: "'Press Start 2P', monospace",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            fontWeight: isPlaying ? 900 : 400,
                            marginBottom: 4,
                          }}
                        >
                          {isPlaying ? "▶ " : ""}
                          {track.name}
                        </div>
                        <div
                          style={{
                            color: "rgba(255,255,255,0.6)",
                            fontSize: 6,
                            fontFamily: "'Press Start 2P', monospace",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {track.artist_name}
                          {track.duration > 0
                            ? ` • ${formatDuration(track.duration)}`
                            : ""}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {!loading && displayTracks.length === 0 && (
              <div
                style={{
                  height: 80,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.25)",
                  borderRadius: 8,
                  border: "2px dashed rgba(255,255,255,0.3)",
                  color: "rgba(255,255,255,0.6)",
                  fontSize: 8,
                  fontFamily: "'Press Start 2P', monospace",
                }}
              >
                No tracks available
              </div>
            )}
          </div>

          {/* Now Playing bar */}
          {selected && (
            <div
              style={{
                margin: "8px 12px 12px",
                background: "rgba(0,0,0,0.45)",
                border: "2px solid #f97316",
                borderRadius: 8,
                padding: "8px 10px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 14, flexShrink: 0 }}>🎵</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: "#ffe066",
                    fontSize: 6,
                    fontFamily: "'Press Start 2P', monospace",
                    marginBottom: 2,
                  }}
                >
                  NOW PLAYING
                </div>
                <div
                  style={{
                    color: "#fff",
                    fontSize: 7,
                    fontFamily: "'Press Start 2P', monospace",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {selected.name}
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.6)",
                    fontSize: 6,
                    fontFamily: "'Press Start 2P', monospace",
                    marginTop: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {selected.artist_name}
                </div>
              </div>
              <button
                type="button"
                data-ocid="music.cancel_button"
                onClick={handleStop}
                style={{
                  background: "rgba(200,30,30,0.7)",
                  border: "2px solid #fff",
                  borderRadius: 4,
                  color: "#fff",
                  fontSize: 8,
                  cursor: "pointer",
                  padding: "4px 6px",
                  fontFamily: "'Press Start 2P', monospace",
                  flexShrink: 0,
                }}
              >
                ■
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
