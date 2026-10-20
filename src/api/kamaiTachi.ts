
const KAMAI_API = "https://kamai.tachi.ac/api/v1/search";

export interface KamaiChartResult {
  game: string;
  songTitle: string;
  artist: string;
  difficulty: string;
  level: string;
  chartId: string;
  songId: string;
  playcount: number;
}

export interface KamaiSearchResult {
  query: string;
  charts: KamaiChartResult[];
  totalPlaycount: number;
  totalsByGame: Record<string, number>;
}

/**
 * Convertit le titre d'une page RemyWiki en texte de recherche.
 * Exemple : Kamui_(NAOKI_x_ZPP_MIX)
 * devient : Kamui (NAOKI × ZPP MIX)
 */
export function getTitleFromRemyWikiUrl(url: string): string {
  const parsedUrl = new URL(url);

  if (
    parsedUrl.hostname !== "silentblue.remywiki.com" &&
    parsedUrl.hostname !== "remywiki.com" &&
    !parsedUrl.hostname.endsWith(".remywiki.com")
  ) {
    throw new Error("L'URL doit pointer vers RemyWiki.");
  }

  const slug = decodeURIComponent(
    parsedUrl.pathname.split("/").filter(Boolean).pop() ?? ""
  );

  if (!slug) {
    throw new Error("Impossible de trouver le titre dans cette URL.");
  }

  return slug
    .replace(/_/g, " ")
    .replace(/\s+x\s+/gi, " × ")
    .trim();
}

/**
 * Recherche une chanson et récupère les playcounts des charts
 * retournées par KamaiTachi, tous jeux confondus.
 */
export async function searchKamaiTachi(
  remyWikiUrl: string
): Promise<KamaiSearchResult> {
  const title = getTitleFromRemyWikiUrl(remyWikiUrl);

  const url = new URL(KAMAI_API);
  url.searchParams.set("search", title);
  url.searchParams.set("hasPlayedGame", "true");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `KamaiTachi a répondu avec le statut HTTP ${response.status}.`
    );
  }

  const data = await response.json();

  if (!data.success || !data.body?.charts) {
    throw new Error("La réponse de KamaiTachi est invalide.");
  }

  const charts: KamaiChartResult[] = [];

  for (const [game, results] of Object.entries(data.body.charts) as [
    string,
    any[]
  ][]) {
        for (const result of results ?? []) {
        const song = result.song;
        const chart = result.chart;

        if (!song || !chart) continue;

        // On récupère le titre réellement associé au résultat.
        const songTitle = song.title ?? chart.song?.title ?? "";

        // Normalise le titre pour ignorer la casse et les différences d'espacement.
        const normalizeTitle = (value: string) =>
        value
            .normalize("NFKC")
            .trim()
            .replace(/\s+/g, " ")
            .toLocaleLowerCase();

        // Extrait le suffixe entre parenthèses, souvent utilisé pour identifier
        // un remix, par exemple "(NAOKI × ZPP MIX)".
        const getSuffix = (value: string) => {
        const match = value.match(/\(([^()]*)\)\s*$/);
        return match ? normalizeTitle(match[1]) : "";
        };

        const requestedSuffix = getSuffix(title);
        const resultSuffix = getSuffix(songTitle);

        // Si la page demandée indique un remix, le résultat doit avoir le même suffixe.
        // Si la page demandée ne précise aucun remix, on exclut les titres avec suffixe.
        if (requestedSuffix !== resultSuffix) {
        continue;
        }

      charts.push({
        game,
        songTitle: song.title ?? chart.song?.title ?? "Titre inconnu",
        artist: song.artist ?? chart.song?.artist ?? "Artiste inconnu",
        difficulty: chart.difficulty ?? "Inconnue",
        level: String(chart.level ?? "?"),
        chartId: chart.chartID ?? "",
        songId: song.id ?? chart.song?.id ?? "",
        playcount: Number(result.playcount ?? 0),
      });
    }
  }

  const totalsByGame: Record<string, number> = {};

  for (const chart of charts) {
    totalsByGame[chart.game] =
      (totalsByGame[chart.game] ?? 0) + chart.playcount;
  }

  return {
    query: title,
    charts,
    totalPlaycount: charts.reduce(
      (total, chart) => total + chart.playcount,
      0
    ),
    totalsByGame,
  };
}
