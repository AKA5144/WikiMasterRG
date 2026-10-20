import { useEffect, useMemo, useState } from "react";
import songs from "./data/songs.json";
import { getGameVersions, type WikiVersion } from "./api/silentBlue";
import { DROP_RATES } from "./dropRates";
import "./App.css";

type Song = (typeof songs)[number];
type Game = "All" | "maimai" | "CHUNITHM" | "ONGEKI";
type Tab = "songs" | "versions" | "packs" | "collection";
type Collection = Record<string, number>;

type KamaiEntry = {
  songId?: string | number;
  title?: string;
  wikiUrl?: string;
  status?: string;
  totalPlaycount?: number | null;
  totalsByGame?: Record<string, number>;
  charts?: Array<{
    game?: string;
    playcount?: number;
  }>;
};

type KamaiCache = {
  entries?: Record<string, KamaiEntry>;
};

type Rarity = {
  name: string;
  className: string;
};

const PACK_SIZE = 10;
const COLLECTION_KEY = "wikimasterrg-collection-v1";
const PACK_KEY = "wikimasterrg-pack-state-v1";
const KAMAI_CACHE_URL = `${import.meta.env.BASE_URL}data/kamai-playcounts.json`;

const MAX_PACKS = 10;
const PACK_RECHARGE_TIME = 5 * 60 * 1000; // 5 minutes

// Passe à true pour avoir des packs illimités.
const INFINITE_PACKS = false;

const PAGE_SIZES = [10, 25, 50, 100, 1000] as const;
const DEFAULT_PAGE_SIZE = 50;

type SongGame = Exclude<Game, "All">;
type SortKey = "title" | "artist" | "playcount" | "copies";
type SortDir = "asc" | "desc";

const GAME_FILTERS: SongGame[] = ["maimai", "CHUNITHM", "ONGEKI"];

const RARITY_FILTERS = [
  { className: "rarity-common", name: "Commune" },
  { className: "rarity-rare", name: "Rare" },
  { className: "rarity-super-rare", name: "Super rare" },
  { className: "rarity-ultra-rare", name: "Ultra rare" },
  { className: "rarity-legendary", name: "Légendaire" },
  { className: "rarity-mythical", name: "Mythical" },
  { className: "rarity-unknown", name: "Unknown" },
];

type SortOption = { key: SortKey; label: string };

const SONG_SORT_OPTIONS: SortOption[] = [
  { key: "title", label: "Title" },
  { key: "artist", label: "Artist" },
  { key: "playcount", label: "Playcount" },
];

const COLLECTION_SORT_OPTIONS: SortOption[] = [
  ...SONG_SORT_OPTIONS,
  { key: "copies", label: "Copies owned" },
];

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

type RarityKey = keyof typeof DROP_RATES;

// Display order + labels for the drop rate popup (same names as getRarity).
const RARITY_DISPLAY: Array<{ key: RarityKey; name: string }> = [
  { key: "common", name: "Commune" },
  { key: "rare", name: "Rare" },
  { key: "superRare", name: "Super rare" },
  { key: "ultraRare", name: "Ultra rare" },
  { key: "legendary", name: "Légendaire" },
  { key: "mythical", name: "Mythical" },
];

// Maps the CSS class returned by getRarity to a drop-rate key.
// Songs without a known playcount ("Unknown") are drawn as commons.
const RARITY_KEY_BY_CLASS: Record<string, RarityKey> = {
  "rarity-unknown": "common",
  "rarity-common": "common",
  "rarity-rare": "rare",
  "rarity-super-rare": "superRare",
  "rarity-ultra-rare": "ultraRare",
  "rarity-legendary": "legendary",
  "rarity-mythical": "mythical",
};

function rollRarity(): RarityKey {
  const entries = Object.entries(DROP_RATES) as Array<[RarityKey, number]>;
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;

  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }

  return entries[entries.length - 1][0];
}

function keyOf(song: Song) {
  return String(song.id);
}

function norm(value: string) {
  return value.toLowerCase().normalize("NFC").trim();
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname)
      .replace(/\/+$/, "")
      .toLowerCase();
  } catch {
    return value.toLowerCase().replace(/\/+$/, "");
  }
}

function romanized(song: Song) {
  if (!song.wikiUrl) return "";

  try {
    return decodeURIComponent(
      new URL(song.wikiUrl).pathname.split("/").filter(Boolean).pop() ?? ""
    )
      .replace(/_/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function getRarity(playcount: number | null | undefined): Rarity {
  if (playcount == null || !Number.isFinite(playcount) || playcount < 0) {
    return { name: "Unknown", className: "rarity-unknown" };
  }

  if (playcount < 900) {
    return { name: "Commune", className: "rarity-common" };
  }

  if (playcount <= 2300) {
    return { name: "Rare", className: "rarity-rare" };
  }

  if (playcount <= 4800) {
    return { name: "Super rare", className: "rarity-super-rare" };
  }

  if (playcount <= 9000) {
    return { name: "Ultra rare", className: "rarity-ultra-rare" };
  }

  if (playcount <= 17000) {
    return { name: "Légendaire", className: "rarity-legendary" };
  }

  return { name: "Mythical", className: "rarity-mythical" };
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
      packs:
        typeof value.packs === "number"
          ? Math.min(MAX_PACKS, Math.max(0, Math.floor(value.packs)))
          : MAX_PACKS,
      lastRechargeAt:
        typeof value.lastRechargeAt === "number"
          ? value.lastRechargeAt
          : Date.now(),
      opened: typeof value.opened === "number" ? value.opened : 0,
    };
  } catch {
    return {
      packs: MAX_PACKS,
      lastRechargeAt: Date.now(),
      opened: 0,
    };
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

function pageItems(current: number, total: number): Array<number | "…"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const items: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) items.push("…");

  for (let page = start; page <= end; page++) {
    items.push(page);
  }

  if (end < total - 1) items.push("…");

  items.push(total);

  return items;
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        className="page-button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        ‹
      </button>

      {pageItems(page, totalPages).map((item, index) =>
        item === "…" ? (
          <span className="page-ellipsis" key={`gap-${index}`}>
            …
          </span>
        ) : (
          <button
            type="button"
            key={item}
            className={
              item === page ? "page-button active" : "page-button"
            }
            onClick={() => onChange(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? "page" : undefined}
          >
            {item}
          </button>
        )
      )}

      <button
        type="button"
        className="page-button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        ›
      </button>
    </nav>
  );
}

function SortFilterPanel({
  games,
  rarities,
  sortKey,
  sortDir,
  sortOptions,
  onToggleGame,
  onToggleRarity,
  onSortKey,
  onSortDir,
  onClear,
}: {
  games: SongGame[];
  rarities: string[];
  sortKey: SortKey;
  sortDir: SortDir;
  sortOptions: SortOption[];
  onToggleGame: (game: SongGame) => void;
  onToggleRarity: (className: string) => void;
  onSortKey: (key: SortKey) => void;
  onSortDir: () => void;
  onClear: () => void;
}) {
  const hasFilters = games.length > 0 || rarities.length > 0;

  return (
    <section className="filter-panel" aria-label="Filters and sorting">
      <div className="filter-group">
        <span className="filter-label">Game</span>

        {GAME_FILTERS.map((game) => {
          const active = games.includes(game);

          return (
            <button
              type="button"
              key={game}
              className={`filter-chip chip-game-${game}${
                active ? " active" : ""
              }`}
              aria-pressed={active}
              onClick={() => onToggleGame(game)}
            >
              {game}
            </button>
          );
        })}
      </div>

      <div className="filter-group">
        <span className="filter-label">Rarity</span>

        {RARITY_FILTERS.map(({ className, name }) => {
          const active = rarities.includes(className);

          return (
            <button
              type="button"
              key={className}
              className={`filter-chip chip-${className}${
                active ? " active" : ""
              }`}
              aria-pressed={active}
              onClick={() => onToggleRarity(className)}
            >
              {name}
            </button>
          );
        })}
      </div>

      <div className="filter-group">
        <span className="filter-label">Sort</span>

        <select
          className="sort-select"
          value={sortKey}
          onChange={(event) => onSortKey(event.target.value as SortKey)}
          aria-label="Sort by"
        >
          {sortOptions.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="sort-direction"
          onClick={onSortDir}
          title={
            sortDir === "asc"
              ? "Ascending — click for descending"
              : "Descending — click for ascending"
          }
          aria-label={
            sortDir === "asc" ? "Sort ascending" : "Sort descending"
          }
        >
          {sortDir === "asc" ? "↑ Ascending" : "↓ Descending"}
        </button>
      </div>

      {hasFilters && (
        <button
          type="button"
          className="text-button clear-filters"
          onClick={onClear}
        >
          Clear filters ×
        </button>
      )}
    </section>
  );
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

function RarityBadge({ rarity }: { rarity: Rarity }) {
  return (
    <span className={`rarity-badge ${rarity.className}`}>
      {rarity.name}
    </span>
  );
}

function SongCard({
  song,
  count,
  rarity,
  playcount,
  onPreview,
}: {
  song: Song;
  count?: number;
  rarity: Rarity;
  playcount?: number;
  onPreview?: () => void;
}) {
  const roman = romanized(song);

  const content = (
    <>
      <SongJacket song={song} className="pack-card-jacket" />

      <div className="pack-card-info">
        <RarityBadge rarity={rarity} />

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

        {playcount !== undefined && (
          <p className="song-playcount">
            {playcount.toLocaleString("en-US")} plays
          </p>
        )}

        {count !== undefined && (
          <span className="owned-count">Owned ×{count}</span>
        )}
      </div>
    </>
  );

  // In the collection, the card opens a preview instead of navigating away.
  if (onPreview) {
    return (
      <button
        type="button"
        className="pack-card pack-card-preview"
        onClick={onPreview}
        title={`Preview ${song.title}`}
        aria-label={`Preview ${song.title}`}
      >
        {content}
      </button>
    );
  }

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

  const [kamaiEntries, setKamaiEntries] = useState<
    Record<string, KamaiEntry>
  >({});
  const [kamaiLoading, setKamaiLoading] = useState(true);
  const [kamaiError, setKamaiError] = useState("");

  const [collection, setCollection] =
    useState<Collection>(readCollection);
  const [packState, setPackState] = useState(readPackState);

  const [lastPack, setLastPack] = useState<Song[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [opened, setOpened] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [now, setNow] = useState(Date.now());
  const [showDropRates, setShowDropRates] = useState(false);
  const [page, setPage] = useState(1);
  const [songGames, setSongGames] = useState<SongGame[]>([]);
  const [songRarities, setSongRarities] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [colGames, setColGames] = useState<SongGame[]>([]);
  const [colRarities, setColRarities] = useState<string[]>([]);
  const [colSortKey, setColSortKey] = useState<SortKey>("title");
  const [colSortDir, setColSortDir] = useState<SortDir>("asc");
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

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

  async function loadKamaiCache() {
    setKamaiLoading(true);
    setKamaiError("");

    try {
      const response = await fetch(KAMAI_CACHE_URL, {
        cache: "no-cache",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as KamaiCache;
      setKamaiEntries(data.entries ?? {});
    } catch (error) {
      setKamaiError(
        error instanceof Error
          ? error.message
          : "Unable to load KamaiTachi playcounts."
      );
    } finally {
      setKamaiLoading(false);
    }
  }

  
  useEffect(() => {
    if (INFINITE_PACKS) return;

    const interval = window.setInterval(() => {
      setPackState((old) => {
        if (old.packs >= MAX_PACKS) {
          return old;
        }

        const currentTime = Date.now();
        const elapsed = currentTime - old.lastRechargeAt;
        const packsToRestore = Math.floor(
          elapsed / PACK_RECHARGE_TIME
        );

        if (packsToRestore <= 0) {
          return old;
        }

        const packs = Math.min(
          MAX_PACKS,
          old.packs + packsToRestore
        );

        return {
          ...old,
          packs,
          lastRechargeAt:
            old.lastRechargeAt + packsToRestore * PACK_RECHARGE_TIME,
        };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);


  useEffect(() => {
    void loadVersions();
    void loadKamaiCache();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
    } catch (error) {
      console.error(error);
    }
  }, [collection]);

  useEffect(() => {
    try {
      localStorage.setItem(PACK_KEY, JSON.stringify(packState));
    } catch (error) {
      console.error(error);
    }
  }, [packState]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Close the song preview with Escape and prevent background scrolling.
  useEffect(() => {
    if (!selectedSong) return;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedSong(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedSong]);

  // Close the drop rates popup with Escape.
  useEffect(() => {
    if (!showDropRates) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowDropRates(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showDropRates]);

  const entriesByUrl = useMemo(() => {
    const result = new Map<string, KamaiEntry>();

    for (const [url, entry] of Object.entries(kamaiEntries)) {
      const key = normalizeUrl(entry.wikiUrl || url);
      result.set(key, entry);
    }

    return result;
  }, [kamaiEntries]);

  function getSongPlaycount(song: Song): number | undefined {
    if (!song.wikiUrl) return undefined;

    const entry = entriesByUrl.get(normalizeUrl(song.wikiUrl));

    if (!entry || entry.status !== "matched") return undefined;

    if (
      typeof entry.totalPlaycount === "number" &&
      Number.isFinite(entry.totalPlaycount)
    ) {
      return entry.totalPlaycount;
    }

    if (entry.charts?.length) {
      return entry.charts.reduce(
        (sum, chart) =>
          sum +
          (typeof chart.playcount === "number" ? chart.playcount : 0),
        0
      );
    }

    return undefined;
  }

  function getSongRarity(song: Song): Rarity {
    return getRarity(getSongPlaycount(song));
  }

  // Filters are cumulative: no chip lit = no filter for that group,
  // several chips lit = any of them (OR) inside a group, groups combine (AND).
  function filterAndSortSongs(
    list: Song[],
    options: {
      games: SongGame[];
      rarities: string[];
      sortKey: SortKey;
      sortDir: SortDir;
    }
  ): Song[] {
    const { games, rarities, sortKey, sortDir } = options;
    const direction = sortDir === "asc" ? 1 : -1;

    const filtered = list.filter((song) => {
      if (games.length && !games.some((game) => song.games.includes(game))) {
        return false;
      }

      if (
        rarities.length &&
        !rarities.includes(getSongRarity(song).className)
      ) {
        return false;
      }

      return true;
    });

    const byTitle = (a: Song, b: Song) =>
      a.title.localeCompare(b.title, undefined, {
        numeric: true,
        sensitivity: "base",
      });

    return filtered.sort((a, b) => {
      if (sortKey === "playcount") {
        const pa = getSongPlaycount(a);
        const pb = getSongPlaycount(b);

        // Songs without a playcount always go last.
        if (pa === undefined && pb === undefined) return byTitle(a, b);
        if (pa === undefined) return 1;
        if (pb === undefined) return -1;

        return pa === pb ? byTitle(a, b) : (pa - pb) * direction;
      }

      if (sortKey === "copies") {
        const ca = collection[keyOf(a)] ?? 0;
        const cb = collection[keyOf(b)] ?? 0;

        return ca === cb ? byTitle(a, b) : (ca - cb) * direction;
      }

      if (sortKey === "artist") {
        const result = (a.artist ?? "").localeCompare(
          b.artist ?? "",
          undefined,
          { numeric: true, sensitivity: "base" }
        );

        return result === 0 ? byTitle(a, b) : result * direction;
      }

      return byTitle(a, b) * direction;
    });
  }

  const filteredSongs = useMemo(() => {
    const q = norm(search);

    const searched = q
      ? songs.filter(
          (song) =>
            norm(song.title).includes(q) ||
            norm(song.artist ?? "").includes(q) ||
            norm(romanized(song)).includes(q)
        )
      : songs;

    return filterAndSortSongs(searched, {
      games: songGames,
      rarities: songRarities,
      sortKey,
      sortDir,
    });
    // The helper reads the playcount cache (entriesByUrl).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, songGames, songRarities, sortKey, sortDir, entriesByUrl]);

  const totalPages = Math.max(1, Math.ceil(filteredSongs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedSongs = filteredSongs.slice(pageStart, pageStart + pageSize);

  function goToPage(next: number) {
    setPage(Math.min(Math.max(1, next), totalPages));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const filteredVersions = useMemo(() => {
    const q = norm(search);

    return versions.filter(
      (version) =>
        norm(version.title).includes(q) &&
        (selectedGame === "All" || version.game === selectedGame) &&
        (selectedRegion === "All" || version.region === selectedRegion)
    );
  }, [versions, search, selectedGame, selectedRegion]);

  // All owned songs (unfiltered): used for the counters.
  const collectionSongs = useMemo(
    () => songs.filter((song) => (collection[keyOf(song)] ?? 0) > 0),
    [collection]
  );

  // Owned songs after the collection filters and sorting.
  const visibleCollection = useMemo(
    () =>
      filterAndSortSongs(collectionSongs, {
        games: colGames,
        rarities: colRarities,
        sortKey: colSortKey,
        sortDir: colSortDir,
      }),
    // The helper reads the playcount cache (entriesByUrl) and the collection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collectionSongs, colGames, colRarities, colSortKey, colSortDir, entriesByUrl]
  );

  const hasCollectionFilters = colGames.length > 0 || colRarities.length > 0;

  const totalOwned = Object.values(collection).reduce(
    (sum, count) => sum + count,
    0
  );

  const uniqueOwned = collectionSongs.length;
  const completion = songs.length
    ? (uniqueOwned / songs.length) * 100
    : 0;


  const packsAvailable = INFINITE_PACKS
    ? Infinity
    : packState.packs;

  const remaining =
    INFINITE_PACKS || packsAvailable >= MAX_PACKS
      ? 0
      : Math.max(
          0,
          PACK_RECHARGE_TIME - (now - packState.lastRechargeAt)
        );

  const canOpen =
    INFINITE_PACKS || (packsAvailable > 0 && songs.length > 0);

  const currentSong = lastPack[cardIndex];

  function openPack() {
    if (!canOpen) return;

    // Group the catalogue by rarity, then roll a rarity (DROP_RATES) for
    // each card and pick a random song of that rarity.
    // If playcounts failed to load, fall back to a uniform draw.
    const pools: Record<RarityKey, Song[]> = {
      common: [],
      rare: [],
      superRare: [],
      ultraRare: [],
      legendary: [],
      mythical: [],
    };

    for (const song of songs) {
      const key = RARITY_KEY_BY_CLASS[getSongRarity(song).className] ?? "common";
      pools[key].push(song);
    }

    const drawn = Array.from({ length: PACK_SIZE }, () => {
      const pool = kamaiError ? songs : pools[rollRarity()];
      const source = pool.length ? pool : songs;

      return source[Math.floor(Math.random() * source.length)];
    }).filter((song): song is Song => Boolean(song));

    setCollection((old) => {
      const updated = { ...old };

      drawn.forEach((song) => {
        const key = keyOf(song);
        updated[key] = (updated[key] ?? 0) + 1;
      });

      return updated;
    });

    setLastPack(drawn);
    setCardIndex(0);
    setOpened(true);


    setPackState((old) => ({
      ...old,
      packs: INFINITE_PACKS
        ? old.packs
        : Math.max(0, old.packs - 1),
      lastRechargeAt:
        old.packs >= MAX_PACKS
          ? Date.now()
          : old.lastRechargeAt,
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
    setPackState({
        packs: MAX_PACKS,
        lastRechargeAt: Date.now(),
        opened: 0,
      });
    setSelectedSong(null);
  }


  const previous = () =>
    setCardIndex((index) =>
      index <= 0 ? lastPack.length - 1 : index - 1
    );

  const next = () => {
    if (cardIndex >= lastPack.length - 1) {
      setCardIndex(0);
      setOpened(false);
      return;
    }

    setCardIndex((index) => index + 1);
  };


  return (
    <main className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-logo">W</span>

          <div>
            <h1>WikiMasterRG</h1>
            <p>Music database for maimai, CHUNITHM and ONGEKI</p>
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
          className={tab === "versions" ? "main-tab active" : "main-tab"}
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
        </button>

        <button
          className={
            tab === "collection" ? "main-tab active" : "main-tab"
          }
          onClick={() => setTab("collection")}
        >
          My collection
          <span className="tab-count">{uniqueOwned}</span>
        </button>
      </nav>

      {(tab === "songs" || tab === "versions") && (
        <section className="search-panel">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={
              tab === "songs"
                ? "Search by title, romanized title or artist..."
                : "Search for a version..."
            }
            aria-label="Search catalogue"
          />

          {tab === "versions" && (
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
          )}

          {tab === "versions" && (
            <select
              value={selectedRegion}
              onChange={(event) => setSelectedRegion(event.target.value)}
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
          <SortFilterPanel
            games={songGames}
            rarities={songRarities}
            sortKey={sortKey}
            sortDir={sortDir}
            sortOptions={SONG_SORT_OPTIONS}
            onToggleGame={(game) => {
              setSongGames((list) => toggleIn(list, game));
              setPage(1);
            }}
            onToggleRarity={(className) => {
              setSongRarities((list) => toggleIn(list, className));
              setPage(1);
            }}
            onSortKey={(key) => {
              setSortKey(key);
              setPage(1);
            }}
            onSortDir={() => {
              setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
              setPage(1);
            }}
            onClear={() => {
              setSongGames([]);
              setSongRarities([]);
              setPage(1);
            }}
          />

          <p className="results-count">
            {filteredSongs.length.toLocaleString("en-US")} result(s)
            {" · "}
            {kamaiLoading
              ? "Loading rarities..."
              : kamaiError
                ? "Rarities unavailable"
                : "Rarities loaded from KamaiTachi"}
          </p>

          {kamaiError && (
            <div className="error-panel">
              <p>
                Could not load playcounts. Check that{" "}
                <code>public/data/kamai-playcounts.json</code> exists.
              </p>

              <button
                className="retry-button"
                onClick={() => void loadKamaiCache()}
                disabled={kamaiLoading}
              >
                Retry playcounts
              </button>
            </div>
          )}

          <div className="page-toolbar">
            <label className="page-size">
              <span>Per page</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                aria-label="Songs per page"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            {filteredSongs.length > 0 && (
              <span className="page-range">
                {(pageStart + 1).toLocaleString("en-US")}–
                {(pageStart + pagedSongs.length).toLocaleString("en-US")} of{" "}
                {filteredSongs.length.toLocaleString("en-US")}
              </span>
            )}

            <Pagination
              page={currentPage}
              totalPages={totalPages}
              onChange={goToPage}
            />
          </div>

          <section className="song-list">
            {pagedSongs.map((song, index) => {
              const roman = romanized(song);
              const playcount = getSongPlaycount(song);
              const rarity = getSongRarity(song);

              return (
                <article
                  className="song-card"
                  key={`${song.id}-${index}`}
                >
                  <SongJacket song={song} />

                  <div className="song-info">
                    <RarityBadge rarity={rarity} />
                    <h2>{song.title}</h2>

                    {roman && norm(roman) !== norm(song.title) && (
                      <p className="romanized-title">{roman}</p>
                    )}

                    <p>{song.artist || "Unknown artist"}</p>

                    <div className="song-meta">
                      {song.bpm && <span>BPM: {song.bpm}</span>}
                      {song.length && <span>Length: {song.length}</span>}
                      {playcount !== undefined && (
                        <span>
                          Plays: {playcount.toLocaleString("en-US")}
                        </span>
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

          <div className="page-toolbar page-toolbar-bottom">
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              onChange={goToPage}
            />
          </div>

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
                    <span className="version-game">{version.game}</span>

                    <h2>
                      {version.title.split(":").slice(1).join(":") ||
                        version.title}
                    </h2>

                    <p className="version-full-title">{version.title}</p>

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
      ) : tab === "packs" ? (
        <section className="packs-page">
          <div className="packs-heading">
            <div>
              <p className="packs-eyebrow">WIKIMASTERRG COLLECTION</p>
              <h2>Open a card pack</h2>
              <p>
                Discover songs from maimai, CHUNITHM and ONGEKI and build
                your collection.
              </p>
            </div>

            <div className="packs-heading-actions">
              <button
                className="how-button"
                onClick={() => setShowDropRates(true)}
              >
                % Drop rates
              </button>

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
                  {INFINITE_PACKS ? "INFINITE PACKS" : `${packsAvailable} PACKS AVAILABLE`}
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
                  {canOpen ? "Open pack" : "No packs available"}
                  <span className="button-count">×10</span>
                </button>


                <p className="pack-cooldown">
                  {INFINITE_PACKS
                    ? "Unlimited packs enabled"
                    : packsAvailable >= MAX_PACKS
                      ? "Your pack reserve is full"
                      : packsAvailable > 0
                        ? `${packsAvailable} pack(s) available · Next pack in ${countdown(remaining)}`
                        : `No packs available · Next pack in ${countdown(remaining)}`}
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
                          CARD {String(cardIndex + 1).padStart(2, "0")} /{" "}
                          {String(lastPack.length).padStart(2, "0")}
                        </span>

                        <SongCard
                          song={currentSong}
                          rarity={getSongRarity(currentSong)}
                          playcount={getSongPlaycount(currentSong)}
                        />

                        <span className="drawn-card-label">
                          Copies owned: {collection[keyOf(currentSong)] ?? 0}
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
                    onClick={() => setTab("collection")}
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
                onClick={() => setTab("collection")}
              >
                View all cards →
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
          </section>

          <p className="collection-note">
            Your collection is saved in this browser. Clearing browser
            storage may erase it. The pack timer is local to this browser
            and is not server-enforced.
          </p>
        </section>
      ) : (
        <section className="packs-page">
          <div className="packs-heading">
            <div>
              <p className="packs-eyebrow">WIKIMASTERRG COLLECTION</p>
              <h2>My collection</h2>
              <p>Track your progress and manage your collected songs.</p>
            </div>

            {uniqueOwned > 0 && (
              <button
                className="reset-collection-button"
                onClick={resetCollection}
              >
                Reset collection
              </button>
            )}
          </div>

          <section className="pack-dashboard">
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

            <div className="collection-expanded">
              <div className="collection-toolbar">
                <p>
                  {hasCollectionFilters
                    ? `${visibleCollection.length} of ${uniqueOwned}`
                    : uniqueOwned}{" "}
                  unique songs in your collection
                </p>
              </div>

              {uniqueOwned > 0 && (
                <SortFilterPanel
                  games={colGames}
                  rarities={colRarities}
                  sortKey={colSortKey}
                  sortDir={colSortDir}
                  sortOptions={COLLECTION_SORT_OPTIONS}
                  onToggleGame={(game) =>
                    setColGames((list) => toggleIn(list, game))
                  }
                  onToggleRarity={(className) =>
                    setColRarities((list) => toggleIn(list, className))
                  }
                  onSortKey={setColSortKey}
                  onSortDir={() =>
                    setColSortDir((dir) => (dir === "asc" ? "desc" : "asc"))
                  }
                  onClear={() => {
                    setColGames([]);
                    setColRarities([]);
                  }}
                />
              )}

              {visibleCollection.length ? (
                <div className="pack-card-grid">
                  {visibleCollection.map((song) => (
                    <SongCard
                      key={keyOf(song)}
                      song={song}
                      count={collection[keyOf(song)]}
                      rarity={getSongRarity(song)}
                      playcount={getSongPlaycount(song)}
                      onPreview={() => setSelectedSong(song)}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-pack">
                  <div className="empty-pack-icon">♫</div>
                  <h3>
                    {uniqueOwned > 0
                      ? "No cards match your filters"
                      : "Your collection is empty"}
                  </h3>
                  <p>
                    {uniqueOwned > 0
                      ? "Try clearing a filter."
                      : "Open a pack to start collecting songs."}
                  </p>
                </div>
              )}
            </div>
          </section>

          <p className="collection-note">
            Your collection is saved in this browser. Clearing browser
            storage may erase it.
          </p>
        </section>
      )}

      {/* Collection card backdrop */}
      {selectedSong && (
        <div
          className="song-preview-backdrop"
          onClick={() => setSelectedSong(null)}
          aria-label="Close card preview"
        />
      )}

      {/* Drop rates popup */}
      {showDropRates && (
        <div
          className="drop-rates-backdrop"
          onClick={() => setShowDropRates(false)}
        >
          <section
            className="drop-rates-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drop-rates-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drop-rates-header">
              <h3 id="drop-rates-title">Drop rates</h3>

              <button
                type="button"
                className="drop-rates-close"
                onClick={() => setShowDropRates(false)}
                aria-label="Close drop rates"
              >
                ×
              </button>
            </div>

            <ul className="drop-rates-list">
              {RARITY_DISPLAY.map(({ key, name }) => (
                <li className={`drop-rate-row drop-rate-${key}`} key={key}>
                  <div className="drop-rate-line">
                    <span className="drop-rate-name">{name}</span>
                    <strong>{DROP_RATES[key]}%</strong>
                  </div>

                  <div className="drop-rate-bar">
                    <div
                      className="drop-rate-bar-fill"
                      style={{ width: `${Math.max(DROP_RATES[key], 1.5)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <p className="drop-rates-note">
              Each card rolls a rarity first, then a random song of that
              rarity is drawn.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}