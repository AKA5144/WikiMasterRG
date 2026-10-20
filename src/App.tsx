
import { useEffect, useMemo, useState } from "react";
import songs from "./data/songs.json";
import { getGameVersions, type WikiVersion } from "./api/silentBlue";
import "./App.css";

type Song = (typeof songs)[number];
type Game = "All" | "maimai" | "CHUNITHM" | "ONGEKI";
type Tab = "songs" | "versions" | "packs";
type Collection = Record<string, number>;

const PACK_SIZE = 10;
const COLLECTION_KEY = "wikimasterrg-collection-v1";
const PACK_KEY = "wikimasterrg-pack-state-v1";
const COOLDOWN = 0; // Mode test : packs illimités

function keyOf(song: Song) {
  return String(song.id);
}

function romanized(song: Song) {
  if (!song.wikiUrl) return "";
  try {
    return decodeURIComponent(
      new URL(song.wikiUrl).pathname.split("/").filter(Boolean).pop() ?? ""
    ).replace(/_/g, " ").trim();
  } catch {
    return "";
  }
}

function norm(value: string) {
  return value.toLowerCase().normalize("NFC").trim();
}

function readCollection(): Collection {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(COLLECTION_KEY) ?? "{}"
    );

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" &&
          Number.isInteger(entry[1]) &&
          entry[1] > 0
      )
    );
  } catch {
    return {};
  }
}

function readPackState() {
  try {
    const value = JSON.parse(localStorage.getItem(PACK_KEY) ?? "{}");

    return {
      availableAt:
        typeof value.availableAt === "number" ? value.availableAt : 0,
      opened: typeof value.opened === "number" ? value.opened : 0,
    };
  } catch {
    return { availableAt: 0, opened: 0 };
  }
}

function countdown(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));

  return [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function VersionJacket({ version }: { version: WikiVersion }) {
  const [failed, setFailed] = useState(false);

  if (!version.jacket || failed) {
    return <div className="version-jacket missing-jacket">♫</div>;
  }

  return (
    <img
      className="version-jacket"
      src={version.jacket}
      alt={`Jacket for ${version.title}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function SongJacket({
  song,
  className = "",
}: {
  song: Song;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!song.jacketUrl || failed) {
    return (
      <div className={`song-jacket missing-jacket ${className}`}>
        ♫
      </div>
    );
  }

  return (
    <img
      className={`song-jacket ${className}`}
      src={song.jacketUrl}
      alt={`Jacket artwork for ${song.title}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function SongCard({
  song,
  count,
}: {
  song: Song;
  count?: number;
}) {
  const roman = romanized(song);

  const content = (
    <>
      <SongJacket song={song} className="pack-card-jacket" />

      <div className="pack-card-info">
        <h3>{song.title || "Unknown song"}</h3>

        {roman && norm(roman) !== norm(song.title) && (
          <p className="romanized-title">{roman}</p>
        )}

        <p className="pack-card-artist">
          {song.artist || "Unknown artist"}
        </p>

        <div className="game-tags">
          {song.games.map((game) => (
            <span className="game-tag" key={game}>
              {game}
            </span>
          ))}
        </div>

        {count !== undefined && (
          <span className="owned-count">Owned ×{count}</span>
        )}
      </div>
    </>
  );

  return song.wikiUrl ? (
    <a
      className="pack-card"
      href={song.wikiUrl}
      target="_blank"
      rel="noreferrer"
      title={`Open ${song.title} on RemyWiki`}
    >
      {content}
    </a>
  ) : (
    <article className="pack-card">{content}</article>
  );
}

function PackArt() {
  return (
    <div className="pack-art">
      <div className="pack-art-top">
        <span>WIKIMASTERRG</span>
        <span>COLLECTOR SERIES</span>
      </div>

      <div className="pack-art-emblem">
        <span className="pack-art-note">♫</span>
        <span className="pack-art-w">W</span>
      </div>

      <div className="pack-art-title">
        MUSIC
        <br />
        COLLECTION
      </div>

      <div className="pack-art-bottom">
        <span>10 CARDS</span>
        <span>VOL. 01</span>
      </div>

      <span className="pack-art-shine" />
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("songs");
  const [search, setSearch] = useState("");
  const [selectedGame, setSelectedGame] = useState<Game>("All");
  const [selectedRegion, setSelectedRegion] = useState("All");

  const [versions, setVersions] = useState<WikiVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState("");

  const [collection, setCollection] =
    useState<Collection>(readCollection);
  const [packState, setPackState] = useState(readPackState);

  const [lastPack, setLastPack] = useState<Song[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [opened, setOpened] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [now, setNow] = useState(Date.now());

  async function loadVersions() {
    setVersionsLoading(true);
    setVersionsError("");

    try {
      setVersions(await getGameVersions());
    } catch (error) {
      setVersionsError(
        error instanceof Error
          ? error.message
          : "Unable to load versions from RemyWiki."
      );
    } finally {
      setVersionsLoading(false);
    }
  }

  useEffect(() => {
    void loadVersions();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        COLLECTION_KEY,
        JSON.stringify(collection)
      );
    } catch (error) {
      console.error(error);
    }
  }, [collection]);

  useEffect(() => {
    try {
      localStorage.setItem(
        PACK_KEY,
        JSON.stringify(packState)
      );
    } catch (error) {
      console.error(error);
    }
  }, [packState]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const filteredSongs = useMemo(() => {
    const q = norm(search);

    return songs.filter(
      (song) =>
        (!q ||
          norm(song.title).includes(q) ||
          norm(song.artist ?? "").includes(q) ||
          norm(romanized(song)).includes(q)) &&
        (selectedGame === "All" ||
          song.games.includes(selectedGame))
    );
  }, [search, selectedGame]);

  const filteredVersions = useMemo(() => {
    const q = norm(search);

    return versions.filter(
      (version) =>
        norm(version.title).includes(q) &&
        (selectedGame === "All" ||
          version.game === selectedGame) &&
        (selectedRegion === "All" ||
          version.region === selectedRegion)
    );
  }, [versions, search, selectedGame, selectedRegion]);

  const collectionSongs = useMemo(
    () =>
      songs
        .filter((song) => (collection[keyOf(song)] ?? 0) > 0)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [collection]
  );

  const totalOwned = Object.values(collection).reduce(
    (sum, count) => sum + count,
    0
  );

  const uniqueOwned = collectionSongs.length;

  const completion = songs.length
    ? (uniqueOwned / songs.length) * 100
    : 0;

    const remaining = COOLDOWN === 0
      ? 0
      : Math.max(0, packState.availableAt - now);

    const canOpen = remaining === 0 && songs.length > 0;
  const currentSong = lastPack[cardIndex];

  function openPack() {
    if (!canOpen) return;

    const drawn = Array.from({ length: PACK_SIZE }, () => {
      return songs[Math.floor(Math.random() * songs.length)];
    }).filter((song): song is Song => Boolean(song));

    setCollection((old) => {
      const next = { ...old };

      drawn.forEach((song) => {
        const key = keyOf(song);
        next[key] = (next[key] ?? 0) + 1;
      });

      return next;
    });

    setLastPack(drawn);
    setCardIndex(0);
    setOpened(true);
    setShowCollection(false);

    setPackState((old) => ({
      availableAt: Date.now() + COOLDOWN,
      opened: old.opened + 1,
    }));

    setSearch("");
    setSelectedGame("All");
  }

  function resetCollection() {
    if (
      !window.confirm(
        "Are you sure you want to reset your entire collection? This cannot be undone."
      )
    ) {
      return;
    }

    setCollection({});
    setLastPack([]);
    setCardIndex(0);
    setOpened(false);
    setShowCollection(false);
    setPackState({ availableAt: 0, opened: 0 });
  }

  const previous = () =>
    setCardIndex((index) =>
      index <= 0 ? lastPack.length - 1 : index - 1
    );

  const next = () =>
    setCardIndex((index) =>
      index >= lastPack.length - 1 ? 0 : index + 1
    );

  return (
    <main className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-logo">W</span>

          <div>
            <h1>WikiMasterRG</h1>
            <p>
              Music database for maimai, CHUNITHM and ONGEKI
            </p>
          </div>
        </div>

        <p className="song-count">
          {songs.length.toLocaleString("en-US")} songs in the local
          catalogue
        </p>
      </header>

      <nav className="main-tabs" aria-label="Catalogue">
        <button
          className={tab === "songs" ? "main-tab active" : "main-tab"}
          onClick={() => setTab("songs")}
        >
          Songs
        </button>

        <button
          className={
            tab === "versions" ? "main-tab active" : "main-tab"
          }
          onClick={() => setTab("versions")}
        >
          Versions
          {versions.length > 0 && (
            <span className="tab-count">{versions.length}</span>
          )}
        </button>

        <button
          className={tab === "packs" ? "main-tab active" : "main-tab"}
          onClick={() => setTab("packs")}
        >
          Packs
          <span className="tab-count">{uniqueOwned}</span>
        </button>
      </nav>

      {tab !== "packs" && (
        <section className="search-panel">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              tab === "songs"
                ? "Search by title, romanized title or artist..."
                : "Search for a version..."
            }
            aria-label="Search catalogue"
          />

          <select
            value={selectedGame}
            onChange={(event) =>
              setSelectedGame(event.target.value as Game)
            }
            aria-label="Filter by game"
          >
            <option value="All">All games</option>
            <option value="maimai">maimai</option>
            <option value="CHUNITHM">CHUNITHM</option>
            <option value="ONGEKI">ONGEKI</option>
          </select>

          {tab === "versions" && (
            <select
              value={selectedRegion}
              onChange={(event) =>
                setSelectedRegion(event.target.value)
              }
              aria-label="Filter by region"
            >
              <option value="All">All regions</option>
              <option value="Japan">Japan</option>
              <option value="Asia">Asia</option>
              <option value="China">China</option>
            </select>
          )}
        </section>
      )}

      {tab === "songs" ? (
        <>
          <p className="results-count">
            {filteredSongs.length.toLocaleString("en-US")} result(s)
          </p>

          <section className="song-list">
            {filteredSongs.slice(0, 100).map((song, index) => {
              const roman = romanized(song);

              return (
                <article
                  className="song-card"
                  key={`${song.id}-${index}`}
                >
                  <SongJacket song={song} />

                  <div className="song-info">
                    <h2>{song.title}</h2>

                    {roman && norm(roman) !== norm(song.title) && (
                      <p className="romanized-title">{roman}</p>
                    )}

                    <p>{song.artist || "Unknown artist"}</p>

                    <div className="song-meta">
                      {song.bpm && <span>BPM: {song.bpm}</span>}
                      {song.length && (
                        <span>Length: {song.length}</span>
                      )}
                    </div>

                    <div className="game-tags">
                      {song.games.map((game) => (
                        <span className="game-tag" key={game}>
                          {game}
                        </span>
                      ))}
                    </div>

                    {song.wikiUrl && (
                      <a
                        href={song.wikiUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View on RemyWiki ↗
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          {filteredSongs.length > 100 && (
            <p className="list-limit">
              Showing the first 100 results. Refine your search to
              find a specific song.
            </p>
          )}

          {!filteredSongs.length && (
            <p className="empty-results">No songs found.</p>
          )}
        </>
      ) : tab === "versions" ? (
        <>
          <p className="results-count">
            {versionsLoading
              ? "Loading versions from RemyWiki..."
              : `${filteredVersions.length} version(s)`}
          </p>

          {versionsLoading && (
            <div className="loading-panel">
              <span className="loading-spinner" />
              <p>Loading versions and jackets from RemyWiki...</p>
            </div>
          )}

          {versionsError && (
            <div className="error-panel">
              <h2>Unable to load versions</h2>
              <p>{versionsError}</p>
              <button
                className="retry-button"
                onClick={() => void loadVersions()}
                disabled={versionsLoading}
              >
                Retry
              </button>
            </div>
          )}

          {!versionsLoading && !versionsError && (
            <section className="version-list">
              {filteredVersions.map((version) => (
                <article
                  className="version-card"
                  key={`${version.game}:${version.title}`}
                >
                  <VersionJacket version={version} />

                  <div className="version-info">
                    <span className="version-game">
                      {version.game}
                    </span>

                    <h2>
                      {version.title.split(":").slice(1).join(":") ||
                        version.title}
                    </h2>

                    <p className="version-full-title">
                      {version.title}
                    </p>

                    <div className="version-meta">
                      <span>{version.region}</span>
                    </div>

                    <a
                      className="version-link"
                      href={version.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on RemyWiki ↗
                    </a>
                  </div>
                </article>
              ))}

              {!filteredVersions.length && (
                <p className="empty-results">No versions found.</p>
              )}
            </section>
          )}
        </>
      ) : (
        <section className="packs-page">
          <div className="packs-heading">
            <div>
              <p className="packs-eyebrow">
                WIKIMASTERRG COLLECTION
              </p>
              <h2>Open a card pack</h2>
              <p>
                Discover songs from maimai, CHUNITHM and ONGEKI and
                build your collection.
              </p>
            </div>

            <button
              className="how-button"
              onClick={() =>
                window.alert(
                  "Each free pack contains 10 random songs. Duplicates are possible. Your collection is saved in this browser. A new pack is available every 24 hours."
                )
              }
            >
              ⓘ How it works
            </button>
          </div>

          <section
            className={`pack-opening-panel ${
              opened ? "pack-opening-panel-opened" : ""
            }`}
          >
            {!opened ? (
              <>
                <div className="pack-scene-label">
                  <span className="status-dot" />
                  DAILY PACK
                  <span className="scene-label-divider">/</span>
                  10 RANDOM CARDS
                </div>

                <button
                  className="pack-art-button"
                  onClick={openPack}
                  disabled={!canOpen}
                  aria-label="Open your daily pack"
                >
                  <PackArt />
                </button>

                <h3 className="pack-prompt-title">
                  {canOpen
                    ? "Your next collection starts here"
                    : "Your next pack is on its way"}
                </h3>

                <p className="pack-prompt-copy">
                  {canOpen
                    ? "Ready to discover your next favourite?"
                    : "Come back when the timer reaches zero."}
                </p>

                <button
                  className="open-pack-button"
                  onClick={openPack}
                  disabled={!canOpen}
                >
                  <span>✦</span>
                  {canOpen ? "Open pack" : "Pack unavailable"}
                  <span className="button-count">×10</span>
                </button>

                <p className="pack-cooldown">
                  {canOpen
                    ? "1 free pack available"
                    : `Next free pack in ${countdown(remaining)}`}
                </p>
              </>
            ) : (
              <div className="pack-reveal">
                <div className="reveal-heading">
                  <p className="packs-eyebrow">PACK OPENED</p>
                  <h3>Your new cards</h3>
                  <p>
                    Pack #{packState.opened} · {lastPack.length} cards
                    added to your collection
                  </p>
                </div>

                {currentSong ? (
                  <div className="pack-carousel">
                    <div className="pack-carousel-stage">
                      <button
                        className="carousel-arrow"
                        onClick={previous}
                        aria-label="Previous card"
                      >
                        ‹
                      </button>

                      <div
                        className="carousel-card"
                        key={`${cardIndex}-${currentSong.id}`}
                      >
                        <span className="carousel-counter">
                          CARD {String(cardIndex + 1).padStart(2, "0")}{" "}
                          / {String(lastPack.length).padStart(2, "0")}
                        </span>

                        <SongCard song={currentSong} />

                        <span className="drawn-card-label">
                          Copies owned:{" "}
                          {collection[keyOf(currentSong)] ?? 0}
                        </span>
                      </div>

                      <button
                        className="carousel-arrow"
                        onClick={next}
                        aria-label="Next card"
                      >
                        ›
                      </button>
                    </div>

                    <div className="carousel-dots">
                      {lastPack.map((song, index) => (
                        <button
                          key={`${keyOf(song)}-${index}`}
                          className={
                            index === cardIndex
                              ? "carousel-dot active"
                              : "carousel-dot"
                          }
                          onClick={() => setCardIndex(index)}
                          aria-label={`Show card ${index + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p>No songs available.</p>
                )}

                <div className="reveal-actions">
                  <button
                    className="open-pack-button"
                    onClick={() => setOpened(false)}
                  >
                    Back to pack
                  </button>

                  <button
                    className="secondary-pack-button"
                    onClick={() => {
                      setShowCollection(true);
                      setOpened(false);
                    }}
                  >
                    View my collection
                  </button>
                </div>

                <p className="pack-cooldown">
                  {remaining
                    ? `Next free pack in ${countdown(remaining)}`
                    : "A new pack is available."}
                </p>
              </div>
            )}
          </section>

          <section className="pack-dashboard">
            <div className="dashboard-heading">
              <div>
                <p className="packs-eyebrow">YOUR PROGRESS</p>
                <h3>Your collection</h3>
              </div>

              <button
                className="text-button"
                onClick={() => setShowCollection((value) => !value)}
              >
                {showCollection
                  ? "Hide collection ↑"
                  : "View all cards →"}
              </button>
            </div>

            <div className="collection-stats">
              <article className="collection-stat">
                <span>Total cards</span>
                <strong>{totalOwned.toLocaleString("en-US")}</strong>
                <small>Including duplicates</small>
              </article>

              <article className="collection-stat">
                <span>Unique songs</span>
                <strong>
                  {uniqueOwned.toLocaleString("en-US")}{" "}
                  <i>/ {songs.length.toLocaleString("en-US")}</i>
                </strong>
                <small>Different songs collected</small>
              </article>

              <article className="collection-stat">
                <span>Collection complete</span>
                <strong>{completion.toFixed(1)}%</strong>
                <small>Catalogue discovered</small>
              </article>
            </div>

            <div
              className="collection-progress"
              role="progressbar"
              aria-label="Collection completion"
              aria-valuenow={Math.round(completion)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="collection-progress-fill"
                style={{ width: `${completion}%` }}
              />
            </div>

            {showCollection && (
              <div className="collection-expanded">
                <div className="collection-toolbar">
                  <p>
                    {uniqueOwned} unique songs in your collection
                  </p>

                  {uniqueOwned > 0 && (
                    <button
                      className="reset-collection-button"
                      onClick={resetCollection}
                    >
                      Reset collection
                    </button>
                  )}
                </div>

                {collectionSongs.length ? (
                  <div className="pack-card-grid">
                    {collectionSongs.map((song) => (
                      <SongCard
                        key={keyOf(song)}
                        song={song}
                        count={collection[keyOf(song)]}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-pack">
                    <div className="empty-pack-icon">♫</div>
                    <h3>Your collection is empty</h3>
                    <p>
                      Open your first pack to start collecting songs.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="pack-perks">
            <article className="perk-card perk-recharge">
              <div className="perk-icon">↻</div>

              <div className="perk-copy">
                <p className="perk-kicker">KEEP COLLECTING</p>
                <h3>Need another pack?</h3>
                <p>
                  Your free pack refreshes every 24 hours. More ways
                  to collect can be added later.
                </p>
                <span className="perk-footnote">
                  FREE DAILY PACK <b>•</b> 10 CARDS
                </span>
              </div>

              <div className="perk-decoration">＋</div>
            </article>

            <article className="perk-card perk-pro">
              <div className="perk-icon">✦</div>

              <div className="perk-copy">
                <p className="perk-kicker">COMING LATER</p>
                <h3>
                  WikiMasters <span>PRO</span>
                </h3>
                <p>
                  A future premium tier could add extra packs and
                  collection features. No purchases are enabled yet.
                </p>
                <span className="perk-footnote">
                  MORE WAYS TO COLLECT
                </span>
              </div>

              <div className="perk-decoration">✧</div>
            </article>
          </section>

          <p className="collection-note">
            Your collection is saved in this browser. Clearing browser
            storage may erase it. The 24-hour pack timer is local to
            this browser and is not server-enforced.
          </p>
        </section>
      )}
    </main>
  );
}
