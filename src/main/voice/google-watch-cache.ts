import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

const SCHEMA_VERSION = 1;

export interface GoogleWatchOffer {
  monetizationType: string | null;
  priceText: string | null;
  providerContentId: string | null;
  providerHost: string;
  providerName: string;
  rawLabel: string | null;
  watchUrl: string;
}

export interface GoogleWatchResult {
  countryCode: string;
  episodeNumber: number | null;
  expiresAt: string;
  fetchedAt: string;
  mediaType: string | null;
  offers: GoogleWatchOffer[];
  offersComplete: boolean;
  queryText: string;
  renderMs: number | null;
  requestAfterRenderHasData: boolean;
  requestBeforeRenderHasData: boolean;
  resolvedSubtitle: string | null;
  resolvedTitle: string | null;
  retrievalMode: string;
  seasonNumber: number | null;
  source: "google-search";
  sourceUrl: string;
  warmMs: number | null;
}

interface ResultRow {
  country_code: string;
  episode_number: number | null;
  expires_at: string;
  fetched_at: string;
  id: number;
  media_type: string | null;
  offers_complete: number;
  query_text: string;
  render_ms: number | null;
  request_after_render_has_data: number;
  request_before_render_has_data: number;
  resolved_subtitle: string | null;
  resolved_title: string | null;
  retrieval_mode: string;
  season_number: number | null;
  source: "google-search";
  source_url: string;
  warm_ms: number | null;
}

interface OfferRow {
  monetization_type: string | null;
  price_text: string | null;
  provider_content_id: string | null;
  provider_host: string;
  provider_name: string;
  raw_label: string | null;
  watch_url: string;
}

function normalizedCountryCode(value: string): string {
  const countryCode = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new TypeError("The watch-provider region must be a two-letter country code.");
  }
  return countryCode;
}

export function normalizeGoogleWatchQuery(value: string): string {
  const query = value.replace(/\s+/g, " ").trim();
  if (query.length === 0 || query.length > 200) {
    throw new TypeError("The watch-provider query must be between 1 and 200 characters.");
  }
  return query.toLocaleLowerCase("en-US");
}

function rowResult(row: ResultRow, offerRows: OfferRow[]): GoogleWatchResult {
  return {
    countryCode: row.country_code,
    episodeNumber: row.episode_number,
    expiresAt: row.expires_at,
    fetchedAt: row.fetched_at,
    mediaType: row.media_type,
    offers: offerRows.map((offer) => ({
      monetizationType: offer.monetization_type,
      priceText: offer.price_text,
      providerContentId: offer.provider_content_id,
      providerHost: offer.provider_host,
      providerName: offer.provider_name,
      rawLabel: offer.raw_label,
      watchUrl: offer.watch_url
    })),
    offersComplete: row.offers_complete === 1,
    queryText: row.query_text,
    renderMs: row.render_ms,
    requestAfterRenderHasData: row.request_after_render_has_data === 1,
    requestBeforeRenderHasData: row.request_before_render_has_data === 1,
    resolvedSubtitle: row.resolved_subtitle,
    resolvedTitle: row.resolved_title,
    retrievalMode: row.retrieval_mode,
    seasonNumber: row.season_number,
    source: row.source,
    sourceUrl: row.source_url,
    warmMs: row.warm_ms
  };
}

export class GoogleWatchCache {
  readonly #database: DatabaseSync;
  readonly #deleteOffers: StatementSync;
  readonly #deleteResult: StatementSync;
  readonly #findFresh: StatementSync;
  readonly #insertOffer: StatementSync;
  readonly #offers: StatementSync;
  readonly #upsertResult: StatementSync;

  constructor(databasePath: string) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath);
    try {
      chmodSync(databasePath, 0o600);
    } catch {
      // The containing user-data directory remains the access boundary if the
      // filesystem does not support POSIX modes.
    }
    this.#database.exec(`
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
        expires_at TEXT NOT NULL,
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

    this.#upsertResult = this.#database.prepare(`
      INSERT INTO discovery_results (
        query_key, query_text, resolved_title, resolved_subtitle, media_type,
        season_number, episode_number, country_code, source, source_url,
        retrieval_mode, request_before_render_has_data, request_after_render_has_data,
        offers_complete, warm_ms, render_ms, fetched_at, expires_at
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
    this.#deleteOffers = this.#database.prepare(
      "DELETE FROM discovery_offers WHERE result_id = ?"
    );
    this.#deleteResult = this.#database.prepare(`
      DELETE FROM discovery_results
      WHERE query_key = ? AND country_code = ? AND source = 'google-search'
    `);
    this.#insertOffer = this.#database.prepare(`
      INSERT INTO discovery_offers (
        result_id, provider_name, provider_host, provider_content_id,
        monetization_type, price_text, watch_url, raw_label, position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.#findFresh = this.#database.prepare(`
      SELECT * FROM discovery_results
      WHERE query_key = ? AND country_code = ? AND source = 'google-search'
        AND expires_at > ?
      LIMIT 1
    `);
    this.#offers = this.#database.prepare(`
      SELECT monetization_type, price_text, provider_content_id, provider_host,
        provider_name, raw_label, watch_url
      FROM discovery_offers
      WHERE result_id = ?
      ORDER BY position
    `);
  }

  close(): void {
    this.#database.close();
  }

  exportRows(): Record<string, unknown>[] {
    return this.#database.prepare(`
      SELECT * FROM discovery_export ORDER BY fetched_at DESC, query_text, position
    `).all() as Record<string, unknown>[];
  }

  getFresh(
    queryText: string,
    countryCodeValue: string,
    now = new Date()
  ): GoogleWatchResult | null {
    const queryKey = normalizeGoogleWatchQuery(queryText);
    const countryCode = normalizedCountryCode(countryCodeValue);
    const row = this.#findFresh.get(
      queryKey,
      countryCode,
      now.toISOString()
    ) as unknown as ResultRow | undefined;
    if (row === undefined) return null;
    const offers = this.#offers.all(row.id) as unknown as OfferRow[];
    return rowResult(row, offers);
  }

  invalidate(queryText: string, countryCodeValue: string): boolean {
    const result = this.#deleteResult.run(
      normalizeGoogleWatchQuery(queryText),
      normalizedCountryCode(countryCodeValue)
    );
    return result.changes > 0;
  }

  save(result: GoogleWatchResult): void {
    const queryKey = normalizeGoogleWatchQuery(result.queryText);
    const countryCode = normalizedCountryCode(result.countryCode);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.#upsertResult.get(
        queryKey,
        result.queryText.replace(/\s+/g, " ").trim(),
        result.resolvedTitle,
        result.resolvedSubtitle,
        result.mediaType,
        result.seasonNumber,
        result.episodeNumber,
        countryCode,
        result.source,
        result.sourceUrl,
        result.retrievalMode,
        result.requestBeforeRenderHasData ? 1 : 0,
        result.requestAfterRenderHasData ? 1 : 0,
        result.offersComplete ? 1 : 0,
        result.warmMs,
        result.renderMs,
        result.fetchedAt,
        result.expiresAt
      ) as { id: number };
      this.#deleteOffers.run(row.id);
      for (const [position, offer] of result.offers.entries()) {
        this.#insertOffer.run(
          row.id,
          offer.providerName,
          offer.providerHost,
          offer.providerContentId,
          offer.monetizationType,
          offer.priceText,
          offer.watchUrl,
          offer.rawLabel,
          position
        );
      }
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}
