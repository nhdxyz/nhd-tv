import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 2;

function nullableInteger(value) {
  return Number.isInteger(value) ? value : null;
}

function nullableText(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function normalizeQueryKey(query) {
  return query.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function openGoogleWatchCache(databasePath) {
  mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS schema_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT INTO schema_metadata (key, value)
      VALUES ('schema_version', '${SCHEMA_VERSION}')
      ON CONFLICT (key) DO UPDATE SET value = excluded.value;

    CREATE TABLE IF NOT EXISTS discovery_results (
      id INTEGER PRIMARY KEY,
      query_key TEXT NOT NULL,
      query_text TEXT NOT NULL,
      resolved_title TEXT,
      resolved_subtitle TEXT,
      media_type TEXT,
      season_number INTEGER,
      episode_number INTEGER,
      country_code TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      retrieval_mode TEXT NOT NULL,
      request_before_render_has_data INTEGER NOT NULL DEFAULT 0,
      request_after_render_has_data INTEGER NOT NULL DEFAULT 0,
      offers_complete INTEGER NOT NULL DEFAULT 0,
      warm_ms INTEGER,
      render_ms INTEGER,
      fetched_at TEXT NOT NULL,
      expires_at TEXT,
      UNIQUE (query_key, country_code, source)
    );

    CREATE TABLE IF NOT EXISTS discovery_offers (
      id INTEGER PRIMARY KEY,
      result_id INTEGER NOT NULL REFERENCES discovery_results(id) ON DELETE CASCADE,
      provider_name TEXT NOT NULL,
      provider_host TEXT NOT NULL,
      provider_content_id TEXT,
      monetization_type TEXT,
      price_text TEXT,
      watch_url TEXT NOT NULL,
      raw_label TEXT,
      position INTEGER NOT NULL,
      UNIQUE (result_id, watch_url)
    );

    CREATE INDEX IF NOT EXISTS discovery_offers_provider_idx
      ON discovery_offers (provider_name, result_id);

  `);

  const resultColumns = database.prepare("PRAGMA table_info(discovery_results)").all();
  if (!resultColumns.some((column) => column.name === "offers_complete")) {
    database.exec(
      "ALTER TABLE discovery_results ADD COLUMN offers_complete INTEGER NOT NULL DEFAULT 0"
    );
  }

  database.exec(`
    DROP VIEW IF EXISTS discovery_export;
    CREATE VIEW discovery_export AS
      SELECT
        results.query_text,
        results.resolved_title,
        results.resolved_subtitle,
        results.media_type,
        results.season_number,
        results.episode_number,
        results.country_code,
        results.source,
        results.retrieval_mode,
        results.offers_complete,
        results.fetched_at,
        results.expires_at,
        offers.provider_name,
        offers.provider_host,
        offers.provider_content_id,
        offers.monetization_type,
        offers.price_text,
        offers.watch_url,
        offers.position
      FROM discovery_results AS results
      JOIN discovery_offers AS offers ON offers.result_id = results.id;
  `);

  const upsertResult = database.prepare(`
    INSERT INTO discovery_results (
      query_key,
      query_text,
      resolved_title,
      resolved_subtitle,
      media_type,
      season_number,
      episode_number,
      country_code,
      source,
      source_url,
      retrieval_mode,
      request_before_render_has_data,
      request_after_render_has_data,
      offers_complete,
      warm_ms,
      render_ms,
      fetched_at,
      expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (query_key, country_code, source) DO UPDATE SET
      query_text = excluded.query_text,
      resolved_title = excluded.resolved_title,
      resolved_subtitle = excluded.resolved_subtitle,
      media_type = excluded.media_type,
      season_number = excluded.season_number,
      episode_number = excluded.episode_number,
      source_url = excluded.source_url,
      retrieval_mode = excluded.retrieval_mode,
      request_before_render_has_data = excluded.request_before_render_has_data,
      request_after_render_has_data = excluded.request_after_render_has_data,
      offers_complete = excluded.offers_complete,
      warm_ms = excluded.warm_ms,
      render_ms = excluded.render_ms,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
    RETURNING id
  `);
  const deleteOffers = database.prepare("DELETE FROM discovery_offers WHERE result_id = ?");
  const insertOffer = database.prepare(`
    INSERT INTO discovery_offers (
      result_id,
      provider_name,
      provider_host,
      provider_content_id,
      monetization_type,
      price_text,
      watch_url,
      raw_label,
      position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const exportRows = database.prepare(`
    SELECT *
    FROM discovery_export
    ORDER BY fetched_at DESC, query_text, position
  `);

  function save(result) {
    const queryKey = normalizeQueryKey(result.queryText);
    database.exec("BEGIN IMMEDIATE");
    try {
      const row = upsertResult.get(
        queryKey,
        result.queryText.trim(),
        nullableText(result.resolvedTitle),
        nullableText(result.resolvedSubtitle),
        nullableText(result.mediaType),
        nullableInteger(result.seasonNumber),
        nullableInteger(result.episodeNumber),
        result.countryCode,
        result.source,
        result.sourceUrl,
        result.retrievalMode,
        result.requestBeforeRenderHasData ? 1 : 0,
        result.requestAfterRenderHasData ? 1 : 0,
        result.offersComplete ? 1 : 0,
        nullableInteger(result.warmMs),
        nullableInteger(result.renderMs),
        result.fetchedAt,
        nullableText(result.expiresAt)
      );
      const resultId = Number(row.id);
      deleteOffers.run(resultId);
      for (const [position, offer] of result.offers.entries()) {
        insertOffer.run(
          resultId,
          offer.providerName,
          offer.providerHost,
          nullableText(offer.providerContentId),
          nullableText(offer.monetizationType),
          nullableText(offer.priceText),
          offer.watchUrl,
          nullableText(offer.rawLabel),
          position
        );
      }
      database.exec("COMMIT");
      return resultId;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    close: () => database.close(),
    exportRows: () => exportRows.all(),
    save
  };
}
