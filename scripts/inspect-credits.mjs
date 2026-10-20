import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";

const songs = JSON.parse(
  await readFile("./src/data/songs.enriched-test.json", "utf8")
);

const samples = songs.filter(song =>
  song.compositionArrangement &&
  /Lyrics:|Vocals:|Movie:|Guitars:|Bass:|Drums:|Piano:/i.test(
    song.compositionArrangement
  )
);

console.log("Chansons avec crédits mélangés :", samples.length);

for (const song of samples.slice(0, 15)) {
  console.log("\nTitre :", song.title);
  console.log("Artiste :", song.artist);
  console.log("Crédits actuels :", song.compositionArrangement);
  console.log("Page :", song.wikiUrl);
}
