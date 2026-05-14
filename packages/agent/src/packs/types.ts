/**
 * @module packs/types
 * @description Type definitions for the aouo pack system.
 *
 * A Pack is a vertical agent app: it bundles user-facing workflows
 * with runtime extensions, data schema, cron jobs, and memory state.
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

  /** Capabilities this pack asks the runtime to grant. */
  permissions: PackPermissions;

  /** Runtime requirements for pack tools and external integrations. */
  runtime: PackRuntime;
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

/** Capability declarations for pack review and future install prompts. */
export interface PackPermissions {
  /** File paths the pack needs to access. */
  files: string[];
  /** Network origins or services the pack needs. */
  network: string[];
  /** Platform accounts or channels the pack integrates with. */
  platforms: string[];
  /** Whether the pack wants to register scheduled jobs. */
  cron: boolean;
  /** External command names this pack may invoke through a declared protocol. */
  external_commands: string[];
}

/** Runtime declarations for first-class JS tools and future external tools. */
export interface PackRuntime {
  /** JavaScript/TypeScript runtime settings. */
  js: {
    /** Whether JS/TS tools are enabled for this pack. */
    tools: boolean;
  };
  /** Future non-JS tools invoked through explicit JSON I/O protocol. */
  external_tools: ExternalToolDeclaration[];
}

/** Declared external tool protocol for Python or other runtimes. */
export interface ExternalToolDeclaration {
  /** Tool name. */
  name: string;
  /** Command to execute when the runtime supports external tools. */
  command: string;
  /** Input protocol. */
  input: 'json';
  /** Output protocol. */
  output: 'json';
  /** Optional permission references this external tool consumes. */
  permissions: string[];
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
  /** Absolute path to the pack's runtime data directory (~/.aouo/data/packs/<name>/). */
  dataPath: string;
  /** Whether this pack has completed its onboarding flow. */
  onboarded: boolean;
}
