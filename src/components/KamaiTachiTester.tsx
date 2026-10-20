
import { useState } from "react";
import { searchKamaiTachi } from "../api/kamaiTachi";
import type { KamaiSearchResult } from "../api/kamaiTachi";

export default function KamaiTachiTester() {
  const [remyWikiUrl, setRemyWikiUrl] = useState(
    "https://silentblue.remywiki.com/Kamui_(NAOKI_x_ZPP_MIX)"
  );
  const [result, setResult] = useState<KamaiSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await searchKamaiTachi(remyWikiUrl.trim());
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur inconnue est survenue."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="kamai-tester">
      <h2>KamaiTachi — Site Playcount</h2>

      <p>
        Colle l'URL d'une chanson sur RemyWiki pour récupérer les charts
        trouvés par KamaiTachi et leurs playcounts.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSearch();
        }}
      >
        <label htmlFor="remywiki-url">URL RemyWiki</label>

        <input
          id="remywiki-url"
          type="url"
          value={remyWikiUrl}
          onChange={(event) => setRemyWikiUrl(event.target.value)}
          placeholder="https://silentblue.remywiki.com/..."
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? "Recherche en cours..." : "Rechercher"}
        </button>
      </form>

      {error && (
        <p className="kamai-error" role="alert">
          Erreur : {error}
        </p>
      )}

      {result && (
        <div className="kamai-results">
          <h3>Résultats pour : {result.query}</h3>

          <p>
            <strong>Total des playcounts trouvés :</strong>{" "}
            {result.totalPlaycount.toLocaleString("fr-FR")}
          </p>

          <h4>Totaux par jeu</h4>

          {Object.keys(result.totalsByGame).length === 0 ? (
            <p>Aucun playcount trouvé.</p>
          ) : (
            <ul>
              {Object.entries(result.totalsByGame).map(([game, total]) => (
                <li key={game}>
                  <strong>{game}</strong> :{" "}
                  {total.toLocaleString("fr-FR")}
                </li>
              ))}
            </ul>
          )}

          <h4>Charts trouvés</h4>

          {result.charts.length === 0 ? (
            <p>Aucun chart trouvé pour cette recherche.</p>
          ) : (
            <div className="kamai-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Jeu</th>
                    <th>Chanson</th>
                    <th>Artiste</th>
                    <th>Difficulté</th>
                    <th>Niveau</th>
                    <th>Playcount</th>
                  </tr>
                </thead>

                <tbody>
                  {result.charts.map((chart, index) => (
                    <tr
                      key={`${chart.game}-${chart.chartId}-${index}`}
                    >
                      <td>{chart.game}</td>
                      <td>{chart.songTitle}</td>
                      <td>{chart.artist}</td>
                      <td>{chart.difficulty}</td>
                      <td>{chart.level}</td>
                      <td>{chart.playcount.toLocaleString("fr-FR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
