import * as cheerio from "cheerio";

const url = "https://silentblue.remywiki.com/-OutsideR%3ARequieM-";

const response = await fetch(url, {
  headers: { "User-Agent": "WikiMasterRG/1.0" }
});

const $ = cheerio.load(await response.text());

console.log("Titre :", $("h1").first().text().trim());

$("#mw-content-text p").each((_, paragraph) => {
  const html = $(paragraph).html() || "";

  if (!/Artist:|Composition\/Arrangement:|BPM:|Length:/i.test(html)) {
    return;
  }

  console.log("\n=== CRÉDITS BRUTS ===");

  for (const part of html.split(/<br\s*\/?>/i)) {
    const text = cheerio.load(part).text().replace(/\s+/g, " ").trim();

    if (text) console.log(text);
  }
});
