/**
 * @module packs/types
 * @description Type definitions for the aouo pack system.
 *
 * A Pack is a "Skill Bundle + Plugin" hybrid — it bundles user-facing
 * skills with runtime extensions (tools, DB schema, cron, memory state).
 */

/**
 * Pack manifest parsed from `pack.yml`.
 *
 * Every domain pack must provide a valid manifest declaring its identity,
 * dependencies, skills, tools, schema, and fast-path routes.
 */
export interface PackManifest {
  /** Unique pack identifier (e.g., 'english'). */
  name: string;
  /** Semantic version string. */
  version: string;
  /** Human-readable display name. */
  display_name: string;
  /** Brief description of what this pack does. */
  description: string;

  /** Packs this pack depends on. */
  depends_on: PackDependency[];

  /** Skill directory names provided by this pack. */
  provided_skills: string[];

  /** Fast-path route declarations (menu, i18n). */
  fast_paths: {
    /** Relative path to menu.json. */
    menu?: string;
    /** Relative path to the default i18n JSON. */
    i18n?: string;
  };

  /** Database schema declarations. */
  schema: {
    /** Relative path to the schema.sql file. */
    file: string;
    /** Tables exclusively owned by this pack. */
    owned_tables: string[];
    /** Tables shared with core or other packs. */
    shared_tables: string[];
    /** Columns this pack adds to shared tables. */
    extends_columns: Record<string, Record<string, string>>;
  };

  /** Persist data contract for samples written by this pack. */
  persist_contract: {
    /** Required prefix for skill_type values (e.g., 'english.'). */
    skill_type_prefix: string;
    /** Fields that must be present in every sample. */
    required_fields: string[];
    /** Fields that may be present. */
    optional_fields: string[];
    /** Allowed subcap score keys. */
    subcap_keys: string[];
  };

  /** Default cron jobs this pack registers. */
  cron_defaults: CronDefault[];

  /** Domain-specific tools provided by this pack. */
  custom_tools: CustomToolDeclaration[];
}

/** A dependency on another pack. */
export interface PackDependency {
  /** Name of the required pack. */
  name: string;
  /** Inheritance mode: 'extends' merges data, 'parallel' isolates. */
  inheritance: 'extends' | 'parallel';
}

/** A cron job registered by a pack at install time. */
export interface CronDefault {
  /** Unique job identifier. */
  id: string;
  /** Cron expression or interval. */
  schedule: string;
  /** Skill to invoke when triggered. */
  skill: string;
  /** Whether this job is enabled by default. */
  enabled_by_default: boolean;
}

/** Declaration of a custom tool provided by a pack. */
export interface CustomToolDeclaration {
  /** Tool name (must be unique across all packs). */
  name: string;
  /** Relative path to the tool implementation. */
  path: string;
}

/**
 * A fully loaded pack instance at runtime.
 *
 * Created by the pack loader after parsing, validating,
 * and initializing all pack resources.
 */
export interface LoadedPack {
  /** The parsed manifest. */
  manifest: PackManifest;
  /** Absolute path to the pack's source directory. */
  sourcePath: string;
  /** Absolute path to the pack's runtime data directory (~/.aouo/packs/<name>/). */
  dataPath: string;
  /** Whether this pack has completed its onboarding flow. */
  onboarded: boolean;
}
