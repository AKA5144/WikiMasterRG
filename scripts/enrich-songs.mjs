import * as cheerio from "cheerio";
import { readFile, writeFile } from "node:fs/promises";

const INPUT = "./src/data/songs.json";
const OUTPUT = "./src/data/songs.enriched-test.json";
const DELAY_MS = 150;

const songs = JSON.parse(await readFile(INPUT, "utf8"));

function clean(value) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function extractMetadata($) {
  const result = {
    artist: null,
    compositionArrangement: null,
    bpm: null,
    length: null,
    jacketUrl: null,
  };

  const labels = {
    artist: /^Artist:\s*(.*)$/i,
    compositionArrangement: /^Composition\/Arrangement:\s*(.*)$/i,
    bpm: /^BPM:\s*(.*)$/i,
    length: /^Length:\s*(.*)$/i,
  };

  $("#mw-content-text p").each((_, paragraph) => {
    const html = $(paragraph).html() || "";
    const parts = html.split(/<br\s*\/?>/i);

    for (const part of parts) {
      const text = clean(cheerio.load(part).text());
      if (!text) continue;

      for (const [key, regex] of Object.entries(labels)) {
        const match = text.match(regex);

        if (match && match[1].trim()) {
          let value = clean(match[1]);

          if (key === "length") {
            value = value.split(/\s*\(/)[0].trim();
          }

          if (!result[key]) result[key] = value;
        }
      }
    }
  });

  $("figure").each((_, figure) => {
    const caption = clean($(figure).find("figcaption").text());

    if (caption && /jacket/i.test(caption)) {
      const image = $(figure).find("img").first();
      const src = image.attr("src");

      if (src) {
        result.jacketUrl = new URL(src, "https://silentblue.remywiki.com").href;
        return false;
      }
    }
  });

  return result;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let updatedArtists = 0;
let updatedComposition = 0;
let updatedBpm = 0;
let updatedLength = 0;
let updatedJackets = 0;
let errors = 0;

const candidates = songs
  .map((song, index) => ({ song, index }))
  .filter(({ song }) =>
    !song.artist?.trim() ||
    !song.compositionArrangement?.trim() ||
    !song.bpm ||
    !song.length ||
    !song.jacketUrl
  );

console.log(`Chansons à vérifier : ${candidates.length}`);

for (let i = 0; i < candidates.length; i++) {
  const { song, index } = candidates[i];

  try {
    if (!song.wikiUrl) {
      errors++;
      continue;
    }

    const response = await fetch(song.wikiUrl, {
      headers: { "User-Agent": "WikiMasterRG/1.0 (song metadata importer)" }
    });

    if (!response.ok) {
      errors++;
      console.log(`[HTTP ${response.status}] ${song.title}`);
      await wait(DELAY_MS);
      continue;
    }

    const $ = cheerio.load(await response.text());
    const data = extractMetadata($);

    if (!song.artist?.trim() && data.artist) {
      song.artist = data.artist;
      updatedArtists++;
    }

    if (!song.compositionArrangement?.trim() && data.compositionArrangement) {
      song.compositionArrangement = data.compositionArrangement;
      updatedComposition++;
    }

    if (!song.bpm && data.bpm) {
      song.bpm = data.bpm;
      updatedBpm++;
    }

    if (!song.length && data.length) {
      song.length = data.length;
      updatedLength++;
    }

    if (!song.jacketUrl && data.jacketUrl) {
      song.jacketUrl = data.jacketUrl;
      updatedJackets++;
    }

    if ((i + 1) % 25 === 0 || i + 1 === candidates.length) {
      console.log(`Progression : ${i + 1}/${candidates.length}`);
    }
  } catch (error) {
    errors++;
    console.log(`[ERREUR] ${song.title} : ${error.message}`);
  }

  await wait(DELAY_MS);
}

await writeFile(OUTPUT, JSON.stringify(songs, null, 2), "utf8");

console.log("\n=== RÉSULTAT ===");
console.log("Chansons conservées :", songs.length);
console.log("Artistes ajoutés :", updatedArtists);
console.log("Crédits ajoutés :", updatedComposition);
console.log("BPM ajoutés :", updatedBpm);
console.log("Durées ajoutées :", updatedLength);
console.log("Jaquettes ajoutées :", updatedJackets);
console.log("Erreurs de récupération :", errors);
console.log("Fichier généré :", OUTPUT);
console.log("Le fichier songs.json original n'a pas été modifié.");
