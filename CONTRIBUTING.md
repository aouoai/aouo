# Contributing to aouo

Thank you for your interest in contributing to aouo! This guide will help you get started.

## Development Setup

### Prerequisites

- **Node.js ≥ 22** — Required for `node:sqlite` support
- **pnpm** — Package manager
- **Git** — Version control

### Getting Started

```bash
# Clone the repository
git clone https://github.com/aouoai/aouo.git
cd aouo

# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test
```

### Development Workflow

```bash
pnpm dev          # Watch mode (auto-rebuild on changes)
pnpm test:watch   # Watch mode for tests
pnpm typecheck    # TypeScript type checking
pnpm lint         # ESLint
pnpm lint:fix     # ESLint with auto-fix
pnpm format       # Prettier formatting
```

## Code Style

### TypeScript

- **Strict mode** is enabled — no implicit `any`, no unchecked index access
- Use `unknown` + type guards instead of `any`
- Prefer `interface` over `type` for object shapes
- Use `readonly` for immutable properties

### Documentation

- All public APIs must have JSDoc with `@param`, `@returns`, and `@example`
- Each file must have a `@module` and `@description` header comment
- Write comments explaining **why**, not **what**

### File Organization

- One module per file, max ~300 lines
- Group imports: node builtins → external deps → internal modules
- Use `.js` extension in all relative imports (ESM requirement)

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add pack manifest Zod validation
fix: handle missing USER.md template gracefully
refactor: extract prompt assembly into dedicated module
docs: add pack development guide
test: add coverage for context compressor
chore: update dependencies
```

### Scope (optional)

```
feat(packs): add depends_on dependency resolution
fix(agent): prevent infinite compression loop
test(persist): add schema validation edge cases
```

## Pull Request Process

1. **Fork & Branch** — Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Implement** — Write code following the style guide above

3. **Test** — Ensure all checks pass:
   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```

4. **Commit** — Use conventional commit messages

5. **PR** — Open a pull request against `main` with:
   - Clear description of what and why
   - Link to any related issues
   - Screenshots/recordings for UI changes

### PR Checklist

- [ ] Tests pass (`pnpm test`)
- [ ] Types pass (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Build succeeds (`pnpm build`)
- [ ] New code has JSDoc documentation
- [ ] CHANGELOG.md updated (for user-facing changes)

## Architecture Overview

```
src/
├── agent/          ← ReAct loop, context compression, prompt assembly
├── adapters/       ← Platform adapters (Telegram, CLI)
├── providers/      ← LLM provider abstraction (OpenAI, Gemini)
├── tools/          ← Built-in tool implementations
├── packs/          ← Pack system (loader, manifest, schema, fast-path)
├── storage/        ← SQLite database layer
├── config/         ← Configuration types and loading
├── lib/            ← Shared utilities (logger, paths, scheduler)
├── commands/       ← CLI command handlers
└── index.ts        ← Public API exports
```

### Key Design Principles

1. **Zero Domain Knowledge** — Core must never reference any specific domain (english, fitness, etc.)
2. **Pack-Scoped Isolation** — Each pack's data, memory, and skills are isolated by default
3. **Fast-path First** — Deterministic operations (menus, i18n) bypass the LLM entirely
4. **Schema-Aware Persistence** — The persist API validates data against pack manifests

## Reporting Issues

- Use [GitHub Issues](https://github.com/aouoai/aouo/issues)
- Include Node.js version, OS, and reproduction steps
- For security issues, email security@aouo.ai instead

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
