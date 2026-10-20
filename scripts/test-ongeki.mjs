
import * as cheerio from "cheerio";

const url = "https://silentblue.remywiki.com/World_Vanquisher";

const response = await fetch(url);

if (!response.ok) {
  throw new Error(`Erreur HTTP : ${response.status}`);
}

const html = await response.text();
const $ = cheerio.load(html);

$("table.bluetable").each((index, table) => {
  console.log(`\n===== TABLEAU ${index + 1} =====`);
  console.log($(table).text().replace(/\s+/g, " ").trim().slice(0, 1500));
});
