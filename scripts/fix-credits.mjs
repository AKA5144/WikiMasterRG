import * as cheerio from "cheerio";
import { readFile, writeFile } from "node:fs/promises";

const INPUT = "./src/data/songs.enriched-test.json";
const OUTPUT = "./src/data/songs.credits-test.json";
const DELAY_MS = 150;

const songs = JSON.parse(await readFile(INPUT, "utf8"));

function clean(value) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function extractComposition($) {
  let composition = null;

  $("#mw-content-text p").each((_, paragraph) => {
    const html = $(paragraph).html() || "";

    for (const part of html.split(/<br\s*\/?>/i)) {
      const text = clean(cheerio.load(part).text());
      const match = text?.match(/^Composition\/Arrangement:\s*(.+)$/i);

      if (match) {
        composition = clean(match[1]);
        return false;
      }
    }
  });

  return composition;
}

const candidates = songs
  .map((song, index) => ({ song, index }))
  .filter(({ song }) =>
    song.compositionArrangement &&
    /Lyrics:|Vocals:|Movie:|Guitars?:|Bass:|Drums:|Piano:|Other Instruments|Programming:/i
      .test(song.compositionArrangement)
  );

console.log("Fiches à vérifier :", candidates.length);

let corrected = 0;
let unchanged = 0;
let errors = 0;

for (let i = 0; i < candidates.length; i++) {
  const { song } = candidates[i];

  try {
    const response = await fetch(song.wikiUrl, {
      headers: { "User-Agent": "WikiMasterRG/1.0 (metadata correction)" }
    });

    if (!response.ok) {
      errors++;
      console.log(`[HTTP ${response.status}] ${song.title}`);
      continue;
    }

    const $ = cheerio.load(await response.text());
    const composition = extractComposition($);

    if (composition) {
      song.compositionArrangement = composition;
      corrected++;
    } else {
      unchanged++;
    }
  } catch (error) {
    errors++;
    console.log(`[ERREUR] ${song.title}: ${error.message}`);
  }

  if ((i + 1) % 25 === 0 || i + 1 === candidates.length) {
    console.log(`Progression : ${i + 1}/${candidates.length}`);
  }

  await new Promise(resolve => setTimeout(resolve, DELAY_MS));
}

await writeFile(OUTPUT, JSON.stringify(songs, null, 2), "utf8");

console.log("\n=== RÉSULTAT ===");
console.log("Chansons conservées :", songs.length);
console.log("Crédits corrigés :", corrected);
console.log("Sans crédit exploitable :", unchanged);
console.log("Erreurs :", errors);
console.log("Fichier de test :", OUTPUT);
console.log("Le fichier songs.json original reste intact.");
