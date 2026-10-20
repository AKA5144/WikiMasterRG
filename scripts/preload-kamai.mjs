
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "src", "data");
const PUBLIC_DIR = path.join(ROOT, "public", "data");

const CACHE_FILE = path.join(PUBLIC_DIR, "kamai-playcounts.json");
const REPORT_FILE = path.join(PUBLIC_DIR, "kamai-tag-report.json");
const NO_RESULTS_FILE = path.join(PUBLIC_DIR, "kamai-no-results.json");

const DELAY_MS = 250;
const SAVE_EVERY = 25;

const TARGET_SONG_URL =
  "https://silentblue.remywiki.com/-OutsideR%3ARequieM-";

const TARGET_QUERY = "OutsideR:RequieM";

const SPECIAL_UNTITLED_URL =
  "https://silentblue.remywiki.com/(no_title)";

function normalizeTitle(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[_\s]+/g, " ")
    .replace(/["'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStrict(value) {
  return normalizeTitle(value)
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function titleFromWikiUrl(wikiUrl) {
  try {
    const parsed = new URL(wikiUrl);

    if (
      parsed.hostname !== "silentblue.remywiki.com" &&
      parsed.hostname !== "remywiki.com" &&
      !parsed.hostname.endsWith(".remywiki.com")
    ) {
      return null;
    }

    const slug = parsed.pathname.split("/").filter(Boolean).pop() ?? "";

    return decodeURIComponent(slug)
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return null;
  }
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });

  const tempFile = `${file}.tmp`;

  await fs.writeFile(
    tempFile,
    JSON.stringify(value, null, 2),
    "utf8"
  );

  await fs.rename(tempFile, file);
}

async function findJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await findJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectSongs(value, output) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSongs(item, output);
    }
    return;
  }

  if (!value || typeof value !== "object") return;

  if (
    typeof value.wikiUrl === "string" &&
    typeof value.title === "string"
  ) {
    output.push(value);
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      collectSongs(child, output);
    }
  }
}

async function loadSongs() {
  const files = await findJsonFiles(DATA_DIR);
  const songs = [];

  for (const file of files) {
    const json = await readJson(file);
    collectSongs(json, songs);
  }

  const unique = new Map();

  for (const song of songs) {
    if (!unique.has(song.wikiUrl)) {
      unique.set(song.wikiUrl, song);
    }
  }

  return [...unique.values()];
}

function getQueries(song) {
  // Exception uniquement pour -OutsideR:RequieM-.
  if (song.wikiUrl === TARGET_SONG_URL) {
    return [TARGET_QUERY];
  }

  const wikiTitle = titleFromWikiUrl(song.wikiUrl);

  const isUntitled =
    song.id === "(no title)" ||
    song.wikiUrl === SPECIAL_UNTITLED_URL;

  if (isUntitled) {
    return ["x0o0x_"];
  }

  const catalogTitle = String(song.title ?? "").trim();
  const queries = [catalogTitle, wikiTitle];

  if (normalizeTitle(catalogTitle).includes("411ψ892")) {
    queries.push('"411Ψ892"', "411Ψ892");
  }

  return [...new Set(queries.filter(Boolean))];
}

async function searchKamai(query) {
  const url = new URL("https://kamai.tachi.ac/api/v1/search");

  url.searchParams.set("search", query);
  url.searchParams.set("hasPlayedGame", "true");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data.success || !data.body?.charts) {
    throw new Error("Réponse KamaiTachi invalide");
  }

  return data.body.charts;
}

function extractCharts(rawCharts, song) {
  const isUntitled =
    song.id === "(no title)" ||
    song.wikiUrl === SPECIAL_UNTITLED_URL;

  const isTarget = song.wikiUrl === TARGET_SONG_URL;
  const catalogTitle = String(song.title ?? "").trim();

  const accepted = [];
  const seen = new Set();

  for (const [game, results] of Object.entries(rawCharts)) {
    for (const result of results ?? []) {
      const songData = result.song ?? result.chart?.song;
      const chart = result.chart;

      if (!songData || !chart) continue;

      const resultTitle = String(
        songData.title ?? chart.song?.title ?? ""
      ).trim();

      const artist = String(
        songData.artist ?? chart.song?.artist ?? ""
      ).trim();

      if (isUntitled) {
        if (
          normalizeTitle(artist) !== normalizeTitle("x0o0x_")
        ) {
          continue;
        }
      } else if (isTarget) {
        // Ignore les tirets et autres séparateurs pour cette chanson.
        if (
          normalizeStrict(resultTitle) !==
          normalizeStrict(TARGET_QUERY)
        ) {
          continue;
        }
      } else {
        if (
          normalizeStrict(resultTitle) !==
          normalizeStrict(catalogTitle)
        ) {
          continue;
        }
      }

      const chartId = String(chart.chartID ?? "");
      const songId = String(songData.id ?? chart.song?.id ?? "");

      const uniqueKey =
        `${game}:${chartId || songId}:${chart.difficulty}`;

      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);

      accepted.push({
        game,
        songTitle: resultTitle,
        artist,
        difficulty: chart.difficulty ?? "Unknown",
        level: String(chart.level ?? "?"),
        chartId,
        songId,
        playcount: Number(result.playcount ?? 0),
      });
    }
  }

  return accepted;
}

async function searchSong(song) {
  const queries = getQueries(song);
  let lastError = null;

  for (const query of queries) {
    try {
      console.log(`  Requête KamaiTachi : ${query}`);

      const rawCharts = await searchKamai(query);
      const charts = extractCharts(rawCharts, song);

      if (charts.length > 0) {
        const totalsByGame = {};

        for (const chart of charts) {
          totalsByGame[chart.game] =
            (totalsByGame[chart.game] ?? 0) + chart.playcount;
        }

        return {
          status: "matched",
          query,
          charts,
          totalPlaycount: charts.reduce(
            (total, chart) => total + chart.playcount,
            0
          ),
          totalsByGame,
        };
      }
    } catch (error) {
      lastError = error;

      console.error(
        `  Erreur pour "${query}" : ${error.message}`
      );
    }

    await sleep(DELAY_MS);
  }

  if (lastError) {
    return {
      status: "error",
      query: queries[0] ?? "",
      charts: [],
      error: lastError.message,
    };
  }

  return {
    status: "no-match",
    query: queries[0] ?? "",
    charts: [],
    totalPlaycount: 0,
    totalsByGame: {},
  };
}

function makeTagReport(cache) {
  const report = {
    generatedAt: new Date().toISOString(),
    totalSongs: Object.keys(cache.entries).length,
    matched: 0,
    noMatch: 0,
    errors: 0,
    chartsByGame: {},
    songs: [],
  };

  for (const [wikiUrl, entry] of Object.entries(cache.entries)) {
    if (entry.status === "matched") {
      report.matched++;
    } else if (entry.status === "no-match") {
      report.noMatch++;
    } else if (entry.status === "error") {
      report.errors++;
    }

    for (const chart of entry.charts ?? []) {
      report.chartsByGame[chart.game] =
        (report.chartsByGame[chart.game] ?? 0) + 1;
    }

    report.songs.push({
      wikiUrl,
      title: entry.title,
      status: entry.status,
      charts: entry.charts?.length ?? 0,
    });
  }

  return report;
}

async function saveOutputs(cache) {
  cache.generatedAt = new Date().toISOString();

  await writeJson(CACHE_FILE, cache);
  await writeJson(REPORT_FILE, makeTagReport(cache));

  const noResults = Object.entries(cache.entries)
    .filter(([, entry]) =>
      entry.status === "no-match" || entry.status === "error"
    )
    .map(([wikiUrl, entry]) => ({
      id: entry.songId,
      title: entry.title,
      wikiUrl,
      query: entry.query,
      status: entry.status,
      error: entry.error,
    }));

  await writeJson(NO_RESULTS_FILE, noResults);
}

async function main() {
  console.log("Chargement du catalogue...");

  const songs = await loadSongs();

  console.log(`Chansons du catalogue : ${songs.length}`);

  await fs.mkdir(PUBLIC_DIR, { recursive: true });

  // Charge le cache existant pour préserver les autres entrées.
  const cache = await readJson(CACHE_FILE, {
    generatedAt: new Date().toISOString(),
    entries: {},
  });

  if (!cache.entries || typeof cache.entries !== "object") {
    cache.entries = {};
  }

  let matched = 0;
  let noMatch = 0;
  let errors = 0;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];

    console.log(
      `\n[${i + 1}/${songs.length}] Recherche : ${song.title || "(sans titre)"}`
    );

    if (song.wikiUrl === TARGET_SONG_URL) {
      console.log(
        `  Exception activée : recherche "${TARGET_QUERY}"`
      );
    }

    const result = await searchSong(song);

    if (result.status === "matched") {
      matched++;
    } else if (result.status === "no-match") {
      noMatch++;
    } else {
      errors++;
    }

    cache.entries[song.wikiUrl] = {
      songId: song.id ?? song.title,
      title: song.title,
      wikiUrl: song.wikiUrl,
      updatedAt: new Date().toISOString(),
      ...result,
    };

    if (
      (i + 1) % SAVE_EVERY === 0 ||
      i === songs.length - 1
    ) {
      await saveOutputs(cache);

      console.log(
        `Sauvegarde : ${i + 1}/${songs.length} chansons traitées`
      );
    }

    await sleep(DELAY_MS);
  }

  // Sauvegarde aussi si le catalogue est vide.
  if (songs.length === 0) {
    await saveOutputs(cache);
  }

  console.log("\nAnalyse complète terminée.");
  console.log(`Correspondances : ${matched}`);
  console.log(`Sans résultat : ${noMatch}`);
  console.log(`Erreurs : ${errors}`);
  console.log(`Cache : ${CACHE_FILE}`);
  console.log(`Rapport : ${REPORT_FILE}`);
  console.log(`Sans résultat : ${NO_RESULTS_FILE}`);
}

main().catch((error) => {
  console.error("Échec du scan :", error);
  process.exitCode = 1;
});
