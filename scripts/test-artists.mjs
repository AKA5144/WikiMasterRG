import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";

const songs = JSON.parse(
  await readFile("./src/data/songs.json", "utf8")
);

const missing = songs.filter(song => !song.artist?.trim());

function extractArtist($) {
  let artist = null;

  $("#mw-content-text p").each((_, paragraph) => {
    const html = $(paragraph).html() ?? "";

    // Découpe le paragraphe au niveau des <br>
    const parts = html.split(/<br\s*\/?>/i);

    for (const part of parts) {
      const text = cheerio.load(part).text()
        .replace(/\s+/g, " ")
        .trim();

      const match = text.match(/^Artist:\s*(.+)$/i);

      if (match) {
        artist = match[1].trim();
        return false;
      }
    }
  });

  return artist;
}

console.log("Test d'extraction des artistes :");

for (const song of missing.slice(0, 5)) {
  try {
    const response = await fetch(song.wikiUrl, {
      headers: { "User-Agent": "WikiMasterRG/1.0" }
    });

    if (!response.ok) {
      console.log(song.title, "HTTP", response.status);
      continue;
    }

    const $ = cheerio.load(await response.text());

    console.log({
      title: song.title,
      artistFound: extractArtist($),
      url: song.wikiUrl
    });
  } catch (error) {
    console.log("Erreur pour", song.title, error.message);
  }
}
