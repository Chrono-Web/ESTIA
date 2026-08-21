import type { DatabaseSync } from "node:sqlite";

import {
  DEFAULT_UI_PREFERENCES,
  type Aspetto,
  type Contrasto,
  type Palette,
  type UiPreferences,
} from "@estia/contracts";

export interface UiPreferencesRepository {
  get(userId: string): UiPreferences;
  upsert(userId: string, preferences: UiPreferences, updatedAt: string): void;
}

interface UiPreferencesRow {
  aspetto: string;
  contrasto: string;
  palette: string;
}

function toPreferences(row: UiPreferencesRow | undefined): UiPreferences {
  if (row === undefined) {
    return { ...DEFAULT_UI_PREFERENCES };
  }

  return {
    aspetto: row.aspetto as Aspetto,
    contrasto: row.contrasto as Contrasto,
    palette: row.palette as Palette,
  };
}

export class SqliteUiPreferencesRepository implements UiPreferencesRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public get(userId: string): UiPreferences {
    const row = this.database
      .prepare(`SELECT aspetto, contrasto, palette FROM ui_preferences WHERE user_id = ?`)
      .get(userId) as UiPreferencesRow | undefined;

    return toPreferences(row);
  }

  public upsert(userId: string, preferences: UiPreferences, updatedAt: string): void {
    this.database
      .prepare(
        `INSERT INTO ui_preferences (user_id, aspetto, contrasto, palette, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           aspetto = excluded.aspetto,
           contrasto = excluded.contrasto,
           palette = excluded.palette,
           updated_at = excluded.updated_at`,
      )
      .run(userId, preferences.aspetto, preferences.contrasto, preferences.palette, updatedAt);
  }
}
