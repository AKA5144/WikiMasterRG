import * as cheerio from "cheerio";

const response = await fetch("https://silentblue.remywiki.com/World_Vanquisher");
const html = await response.text();
const $ = cheerio.load(html);

$("table.bluetable").each((index, table) => {
  console.log(`\n===== TABLEAU ${index + 1} =====`);
  console.log($(table).text().replace(/\s+/g, " ").trim().slice(0, 1500));
});
