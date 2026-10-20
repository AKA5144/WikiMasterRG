const url = "https://silentblue.remywiki.com/World_Vanquisher";
const response = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0" }
});
const html = await response.text();

console.log("HTTP :", response.status);

for (const term of [
  "Artist",
  "Composer",
  "Composition",
  "Arrangement",
  "void (Mournfinale)",
  "void"
]) {
  const index = html.toLowerCase().indexOf(term.toLowerCase());

  console.log(`\n--- ${term} : ${index} ---`);

  if (index !== -1) {
    console.log(html.slice(Math.max(0, index - 250), index + 500));
  }
}
