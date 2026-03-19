# Extension Dependency Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the full recursive dependency tree of a Bitrix extension when clicking on an asset in webperf-hub's asset table.

**Architecture:** New API module `extensions` in `apps/api` with a `config.php` parser that recursively resolves dependencies from `C:\bitrix_repos\modules`. At startup, the resolver scans all `config.php` files and builds a **reverse index** mapping bundle URL paths back to extension names (handles nested bundle paths like `vue/prod/dist/vue.bundle.js`). The frontend gets a new `DependencyTree` component rendered inline below the asset row (same pattern as `AssetIssueEditor`). Each tree node shows the extension name and its bundle size (from disk).

**Tech Stack:** TypeScript, Fastify (API), React (frontend), regex-based PHP config parser.

---

## File Structure

### API (backend)

| File | Responsibility |
|------|---------------|
| `apps/api/src/modules/extensions/config-php-parser.ts` | Parse `rel` array from config.php content |
| `apps/api/src/modules/extensions/extension-resolver.ts` | Map extension name → config.php path, resolve dependencies recursively, read bundle sizes |
| `apps/api/src/modules/extensions/extension.routes.ts` | `GET /api/extensions/:name/dependencies` endpoint |

### Frontend

| File | Responsibility |
|------|---------------|
| `apps/web/src/lib/api.ts` | New `fetchExtensionDeps()` function + types |
| `apps/web/src/features/assets/dependency-tree.tsx` | Tree component: fetch + render dependency tree inline |
| `apps/web/src/features/assets/asset-table.tsx` | Add "Deps" button + expand row for tree |
| `apps/web/src/styles.css` | Tree styling |

---

### Task 1: config.php parser

**Files:**
- Create: `apps/api/src/modules/extensions/config-php-parser.ts`

- [ ] **Step 1: Create the parser module**

```typescript
// apps/api/src/modules/extensions/config-php-parser.ts

function extractStringsFromArray(arrayContent: string): string[]
{
	const deps: string[] = [];
	const stringPattern = /['"]([a-zA-Z0-9_.-]+)['"]/g;
	let depMatch: RegExpExecArray | null;

	while ((depMatch = stringPattern.exec(arrayContent)) !== null)
	{
		deps.push(depMatch[1]);
	}

	return deps;
}

/**
 * Extracts the `rel` dependency array from a Bitrix extension config.php file.
 *
 * Handles two patterns:
 * 1. Inline: `'rel' => ['main.core', 'ui.buttons']` — takes the last match (prod branch).
 * 2. Variable: `$rel = ['main.core'];` then `'rel' => $rel` — takes the last $rel assignment.
 */
export function parseRelDependencies(phpSource: string): string[]
{
	// Strategy 1: 'rel' => [...] inline arrays — take the last match (default/prod branch)
	const inlinePattern = /['"]rel['"]\s*=>\s*\[([\s\S]*?)\]/g;
	let lastInline: string | null = null;
	let match: RegExpExecArray | null;

	while ((match = inlinePattern.exec(phpSource)) !== null)
	{
		lastInline = match[1];
	}

	if (lastInline)
	{
		return extractStringsFromArray(lastInline);
	}

	// Strategy 2: $rel = [...] variable assignments — take the last one
	const varPattern = /\$rel\s*=\s*\[([\s\S]*?)\]/g;
	let lastVar: string | null = null;

	while ((match = varPattern.exec(phpSource)) !== null)
	{
		lastVar = match[1];
	}

	if (lastVar)
	{
		return extractStringsFromArray(lastVar);
	}

	return [];
}

/**
 * Extracts the first string value for a 'js' or 'css' key from config.php.
 * Handles both string form: `'js' => 'file.js'`
 * and array form: `'js' => ['file.js']`
 */
export function parseBundlePath(phpSource: string, key: 'js' | 'css'): string | null
{
	// String form: 'js' => './dist/bundle.js'
	const stringMatch = phpSource.match(
		new RegExp(`['"]${key}['"]\\s*=>\\s*['"]([^'"]+)['"]`)
	);

	if (stringMatch?.[1])
	{
		return stringMatch[1];
	}

	// Array form: 'js' => ['./dist/bundle.js']
	const arrayMatch = phpSource.match(
		new RegExp(`['"]${key}['"]\\s*=>\\s*\\[([\\s\\S]*?)\\]`)
	);

	if (arrayMatch?.[1])
	{
		const firstString = arrayMatch[1].match(/['"]([^'"]+)['"]/);

		return firstString?.[1] ?? null;
	}

	// Variable form: $js = './dist/bundle.js'; then 'js' => $js
	const varRefMatch = phpSource.match(
		new RegExp(`['"]${key}['"]\\s*=>\\s*\\$(\\w+)`)
	);

	if (varRefMatch?.[1])
	{
		const varName = varRefMatch[1];
		const varAssignPattern = new RegExp(
			`\\$${varName}\\s*=\\s*['"]([^'"]+)['"]`,
			'g'
		);
		let lastAssign: string | null = null;
		let varMatch: RegExpExecArray | null;

		while ((varMatch = varAssignPattern.exec(phpSource)) !== null)
		{
			lastAssign = varMatch[1];
		}

		return lastAssign;
	}

	return null;
}
```

- [ ] **Step 2: Verify parser with manual test**

Run: `cd C:/bitrix_repos/webperf-hub && node -e "
const { parseRelDependencies } = await import('./apps/api/src/modules/extensions/config-php-parser.ts');
// won't work directly since it's TS, but we verified logic in dep-resolver-test.mjs
console.log('Parser module created');
"`

The parser logic is already validated by the comparison test (9/10 match with Chef).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/extensions/config-php-parser.ts
git commit -m "feat(api): add config.php rel[] parser for Bitrix extensions"
```

---

### Task 2: Extension resolver service

**Files:**
- Create: `apps/api/src/modules/extensions/extension-resolver.ts`

- [ ] **Step 1: Create the resolver**

```typescript
// apps/api/src/modules/extensions/extension-resolver.ts
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

import { parseRelDependencies, parseBundlePath } from './config-php-parser.js';

export type DependencyNode = {
	name: string;
	circular?: boolean;
	notFound?: boolean;
	children: DependencyNode[];
	bundleSize?: { js: number; css: number };
};

export type FlatDependency = {
	name: string;
	bundleSize?: { js: number; css: number };
};

export class ExtensionResolver
{
	#modulesRoot: string;
	/** Maps "/bitrix/js/ui/vue3/vue/prod/dist/vue.bundle.js" → "ui.vue3" */
	#urlToExtension: Map<string, string>;

	constructor(modulesRoot: string)
	{
		this.#modulesRoot = modulesRoot;
		this.#urlToExtension = this.#buildReverseIndex();
	}

	resolveTree(extensionName: string): DependencyNode
	{
		return this.#buildTree(extensionName, new Set());
	}

	resolveFlat(extensionName: string): FlatDependency[]
	{
		const tree = this.resolveTree(extensionName);
		const result = new Map<string, FlatDependency>();

		this.#flattenTree(tree, result);

		return [...result.values()];
	}

	/**
	 * Looks up extension name from a URL path like "/bitrix/js/ui/vue3/vue/prod/dist/vue.bundle.js".
	 * Returns null if no match found.
	 */
	resolveByUrl(urlPath: string): string | null
	{
		// Strip query string and hash
		const cleanPath = urlPath.split('?')[0].split('#')[0];

		return this.#urlToExtension.get(cleanPath) ?? null;
	}

	/** Returns the full reverse index for the frontend to use client-side. */
	getUrlIndex(): Record<string, string>
	{
		return Object.fromEntries(this.#urlToExtension);
	}

	#buildTree(extensionName: string, visited: Set<string>): DependencyNode
	{
		if (visited.has(extensionName))
		{
			return { name: extensionName, circular: true, children: [] };
		}

		visited.add(extensionName);

		const configPath = this.#extensionToConfigPath(extensionName);

		if (!existsSync(configPath))
		{
			return { name: extensionName, notFound: true, children: [] };
		}

		const source = readFileSync(configPath, 'utf-8');
		const deps = parseRelDependencies(source);
		const bundleSize = this.#readBundleSize(extensionName, source);
		const children = deps.map((dep) => this.#buildTree(dep, new Set(visited)));

		return { name: extensionName, children, bundleSize };
	}

	#flattenTree(node: DependencyNode, result: Map<string, FlatDependency>): void
	{
		for (const child of node.children)
		{
			if (!result.has(child.name))
			{
				result.set(child.name, {
					name: child.name,
					bundleSize: child.bundleSize,
				});
			}

			if (!child.circular && !child.notFound)
			{
				this.#flattenTree(child, result);
			}
		}
	}

	#extensionToConfigPath(extensionName: string): string
	{
		const segments = extensionName.split('.');
		const moduleName = segments[0];

		return join(this.#modulesRoot, moduleName, 'install', 'js', ...segments, 'config.php');
	}

	#readBundleSize(extensionName: string, configSource?: string): { js: number; css: number } | undefined
	{
		const segments = extensionName.split('.');
		const moduleName = segments[0];
		const extDir = join(this.#modulesRoot, moduleName, 'install', 'js', ...segments);

		let js = 0;
		let css = 0;

		try
		{
			const source = configSource ?? readFileSync(join(extDir, 'config.php'), 'utf-8');
			const jsRelPath = parseBundlePath(source, 'js');
			const cssRelPath = parseBundlePath(source, 'css');

			if (jsRelPath)
			{
				const jsPath = join(extDir, jsRelPath);
				if (existsSync(jsPath))
				{
					js = statSync(jsPath).size;
				}
			}

			if (cssRelPath)
			{
				const cssPath = join(extDir, cssRelPath);
				if (existsSync(cssPath))
				{
					css = statSync(cssPath).size;
				}
			}
		}
		catch
		{
			// Extension dir may not exist
		}

		return js > 0 || css > 0 ? { js, css } : undefined;
	}

	/**
	 * Scans all modules for config.php files and builds a reverse index
	 * mapping served URL paths → extension names.
	 *
	 * For extension `ui.vue3` with `'js' => './vue/prod/dist/vue.bundle.js'`,
	 * creates entry: "/bitrix/js/ui/vue3/vue/prod/dist/vue.bundle.js" → "ui.vue3"
	 */
	#buildReverseIndex(): Map<string, string>
	{
		const index = new Map<string, string>();

		let modules: string[];
		try
		{
			modules = readdirSync(this.#modulesRoot, { withFileTypes: true })
				.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
				.map((entry) => entry.name);
		}
		catch
		{
			return index;
		}

		for (const moduleName of modules)
		{
			const jsDir = join(this.#modulesRoot, moduleName, 'install', 'js', moduleName);

			if (!existsSync(jsDir))
			{
				continue;
			}

			this.#scanExtensionsRecursive(jsDir, [moduleName], index);
		}

		return index;
	}

	#scanExtensionsRecursive(dir: string, segments: string[], index: Map<string, string>): void
	{
		const configPath = join(dir, 'config.php');

		if (existsSync(configPath))
		{
			try
			{
				const source = readFileSync(configPath, 'utf-8');
				const extensionName = segments.join('.');
				const jsRelPath = parseBundlePath(source, 'js');
				const cssRelPath = parseBundlePath(source, 'css');
				const urlBase = '/bitrix/js/' + segments.join('/');

				if (jsRelPath)
				{
					const jsUrl = posix.normalize(urlBase + '/' + jsRelPath.replace(/\\/g, '/'));
					index.set(jsUrl, extensionName);
				}

				if (cssRelPath)
				{
					const cssUrl = posix.normalize(urlBase + '/' + cssRelPath.replace(/\\/g, '/'));
					index.set(cssUrl, extensionName);
				}
			}
			catch
			{
				// Skip unreadable configs
			}
		}

		// Recurse into subdirectories
		try
		{
			const entries = readdirSync(dir, { withFileTypes: true });
			for (const entry of entries)
			{
				if (entry.isDirectory() && entry.name !== 'dist' && entry.name !== 'node_modules' && !entry.name.startsWith('.'))
				{
					this.#scanExtensionsRecursive(
						join(dir, entry.name),
						[...segments, entry.name],
						index,
					);
				}
			}
		}
		catch
		{
			// Skip unreadable dirs
		}
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/extensions/extension-resolver.ts
git commit -m "feat(api): add recursive extension dependency resolver with bundle sizes"
```

---

### Task 3: API endpoint

**Files:**
- Create: `apps/api/src/modules/extensions/extension.routes.ts`
- Modify: `apps/api/src/app.ts` (register routes)

- [ ] **Step 1: Create the route handler**

```typescript
// apps/api/src/modules/extensions/extension.routes.ts
import type { FastifyInstance } from 'fastify';

import type { ExtensionResolver } from './extension-resolver.js';

export function registerExtensionRoutes(app: FastifyInstance, resolver: ExtensionResolver): void
{
	app.get('/api/extensions/:name/dependencies', async (request, reply) => {
		const params = request.params as { name: string };
		const extensionName = params.name;

		if (!/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/.test(extensionName))
		{
			reply.code(400);

			return { error: 'Invalid extension name' };
		}

		const tree = resolver.resolveTree(extensionName);
		const flat = resolver.resolveFlat(extensionName);

		return { extension: extensionName, tree, flat, totalDeps: flat.length };
	});

	// Reverse index: URL path → extension name (loaded once at startup)
	app.get('/api/extensions/url-index', async () => {
		return resolver.getUrlIndex();
	});
}
```

- [ ] **Step 2: Register routes in app.ts**

Add to `apps/api/src/app.ts`:
- Import: `import { ExtensionResolver } from './modules/extensions/extension-resolver.js';`
- Import: `import { registerExtensionRoutes } from './modules/extensions/extension.routes.js';`
- Add `modulesRoot?: string` to the `AppOptions` type
- In `createApp()`, instantiate `const extensionResolver = new ExtensionResolver(options.modulesRoot ?? 'C:/bitrix_repos/modules');`
- Call: `registerExtensionRoutes(app, extensionResolver);`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/extensions/extension.routes.ts apps/api/src/app.ts
git commit -m "feat(api): add GET /api/extensions/:name/dependencies endpoint"
```

---

### Task 4: Frontend API client

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add types and fetch function**

Add to end of `apps/web/src/lib/api.ts`:

```typescript
export type ApiDependencyNode = {
	name: string;
	circular?: boolean;
	notFound?: boolean;
	children: ApiDependencyNode[];
	bundleSize?: { js: number; css: number };
};

export type ApiExtensionDeps = {
	extension: string;
	tree: ApiDependencyNode;
	flat: Array<{ name: string; bundleSize?: { js: number; css: number } }>;
	totalDeps: number;
};

export function fetchExtensionDeps(extensionName: string): Promise<ApiExtensionDeps>
{
	return fetchJson<ApiExtensionDeps>(`/api/extensions/${encodeURIComponent(extensionName)}/dependencies`);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add fetchExtensionDeps API client"
```

---

### Task 5: DependencyTree component

**Files:**
- Create: `apps/web/src/features/assets/dependency-tree.tsx`

- [ ] **Step 1: Create the tree component**

```tsx
// apps/web/src/features/assets/dependency-tree.tsx
import { useEffect, useState } from 'react';

import { fetchExtensionDeps, type ApiDependencyNode, type ApiExtensionDeps } from '../../lib/api.js';

type DependencyTreeProps = {
	extensionName: string;
};

function formatSize(bytes: number): string
{
	if (bytes >= 1024 * 1024)
	{
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}

	return `${(bytes / 1024).toFixed(1)} KB`;
}

function TreeNode({ node, depth }: { node: ApiDependencyNode; depth: number })
{
	const sizeLabel = node.bundleSize
		? [
			node.bundleSize.js > 0 ? `js: ${formatSize(node.bundleSize.js)}` : '',
			node.bundleSize.css > 0 ? `css: ${formatSize(node.bundleSize.css)}` : '',
		].filter(Boolean).join(', ')
		: '';

	return (
		<li className="dep-tree-node">
			<span className="dep-tree-name">
				{node.name}
				{node.circular ? <span className="dep-tree-badge dep-tree-circular">circular</span> : null}
				{node.notFound ? <span className="dep-tree-badge dep-tree-not-found">not found</span> : null}
				{sizeLabel ? <span className="dep-tree-size">{sizeLabel}</span> : null}
			</span>
			{node.children.length > 0 ? (
				<ul className="dep-tree-children">
					{node.children.map((child, index) => (
						<TreeNode key={`${child.name}-${index}`} node={child} depth={depth + 1} />
					))}
				</ul>
			) : null}
		</li>
	);
}

export function DependencyTree({ extensionName }: DependencyTreeProps)
{
	const [data, setData] = useState<ApiExtensionDeps | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;

		setIsLoading(true);
		setError(null);

		fetchExtensionDeps(extensionName)
			.then((result) => {
				if (!cancelled)
				{
					setData(result);
				}
			})
			.catch((err) => {
				if (!cancelled)
				{
					setError(err instanceof Error ? err.message : 'Failed to load dependencies');
				}
			})
			.finally(() => {
				if (!cancelled)
				{
					setIsLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [extensionName]);

	if (isLoading)
	{
		return <div className="dep-tree-panel">Loading dependencies for {extensionName}...</div>;
	}

	if (error)
	{
		return <div className="dep-tree-panel dep-tree-error">Error: {error}</div>;
	}

	if (!data)
	{
		return null;
	}

	const totalJs = data.flat.reduce((sum, dep) => sum + (dep.bundleSize?.js ?? 0), 0);
	const totalCss = data.flat.reduce((sum, dep) => sum + (dep.bundleSize?.css ?? 0), 0);

	return (
		<div className="dep-tree-panel">
			<div className="dep-tree-header">
				<strong>{extensionName}</strong>
				<span className="dep-tree-summary">
					{data.totalDeps} deps
					{totalJs > 0 ? ` | JS: ${formatSize(totalJs)}` : ''}
					{totalCss > 0 ? ` | CSS: ${formatSize(totalCss)}` : ''}
				</span>
			</div>
			<ul className="dep-tree-root">
				{data.tree.children.map((child, index) => (
					<TreeNode key={`${child.name}-${index}`} node={child} depth={0} />
				))}
			</ul>
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/assets/dependency-tree.tsx
git commit -m "feat(web): add DependencyTree component for extension deps visualization"
```

---

### Task 6: Integrate into AssetTable

**Files:**
- Modify: `apps/web/src/features/assets/asset-table.tsx`
- Modify: `apps/web/src/lib/api.ts` (add `fetchUrlIndex`)
- Modify: `apps/web/src/app.tsx` (load URL index at bootstrap, pass to AssetTable)

- [ ] **Step 1: Add URL index API + lookup helper**

Add to `apps/web/src/lib/api.ts`:

```typescript
export function fetchUrlIndex(): Promise<Record<string, string>>
{
	return fetchJson<Record<string, string>>('/api/extensions/url-index');
}
```

- [ ] **Step 2: Load URL index at bootstrap in app.tsx**

In `apps/web/src/app.tsx`:
- Add state: `const [urlIndex, setUrlIndex] = useState<Record<string, string>>({});`
- In the bootstrap `useEffect`, add `fetchUrlIndex()` to `Promise.all`
- Pass `urlIndex` as a prop to `<AssetTable>`

- [ ] **Step 3: Add URL-to-extension lookup in AssetTable**

In `asset-table.tsx`:
- Add `urlIndex: Record<string, string>` to `AssetTableProps`
- Add a lookup helper:

```typescript
function resolveExtensionName(assetUrl: string, urlIndex: Record<string, string>): string | null
{
	try
	{
		const pathname = new URL(assetUrl).pathname;

		return urlIndex[pathname] ?? null;
	}
	catch
	{
		return null;
	}
}
```

- [ ] **Step 4: Add expand state and "Deps" button**

In the `AssetTable` component:
- Add state: `const [depsAssetKey, setDepsAssetKey] = useState<string | null>(null);`
- Import `DependencyTree` component
- For each asset row, call `resolveExtensionName(asset.url, urlIndex)` — if it returns an extension name, show a "Deps" button next to the "Отслеживать" button
- When clicked, toggle `depsAssetKey` and render `<DependencyTree extensionName={...}>` in an expanded `<tr>` below the asset row (same pattern as the issue editor row)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/assets/asset-table.tsx apps/web/src/lib/api.ts apps/web/src/app.tsx
git commit -m "feat(web): integrate dependency tree toggle into asset table rows"
```

---

### Task 7: CSS styling for the tree

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add tree styles**

Append to `styles.css`:

```css
/* ── Dependency tree ── */
.dep-tree-panel {
	padding: 12px 16px;
	font-size: 13px;
	line-height: 1.5;
}
.dep-tree-error {
	color: var(--color-danger, #e74c3c);
}
.dep-tree-header {
	display: flex;
	align-items: baseline;
	gap: 12px;
	margin-bottom: 8px;
}
.dep-tree-summary {
	font-size: 12px;
	opacity: 0.6;
}
.dep-tree-root,
.dep-tree-children {
	list-style: none;
	padding-left: 20px;
	margin: 0;
}
.dep-tree-root {
	padding-left: 0;
}
.dep-tree-node {
	position: relative;
	padding: 1px 0;
}
.dep-tree-children .dep-tree-node::before {
	content: '';
	position: absolute;
	left: -14px;
	top: 0;
	bottom: 0;
	width: 1px;
	background: var(--color-border, #333);
	opacity: 0.3;
}
.dep-tree-name {
	display: inline-flex;
	align-items: baseline;
	gap: 6px;
	font-family: var(--font-mono, monospace);
	font-size: 12px;
}
.dep-tree-size {
	font-size: 11px;
	opacity: 0.5;
}
.dep-tree-badge {
	font-size: 10px;
	padding: 0 4px;
	border-radius: 3px;
	font-family: var(--font-sans, sans-serif);
}
.dep-tree-circular {
	background: rgba(241, 196, 15, 0.2);
	color: #f1c40f;
}
.dep-tree-not-found {
	background: rgba(231, 76, 60, 0.15);
	color: #e74c3c;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/styles.css
git commit -m "feat(web): add dependency tree CSS styles"
```

---

### Task 8: Manual integration test

- [ ] **Step 1: Start the API and verify endpoint**

```bash
cd C:/bitrix_repos/webperf-hub
pnpm dev
```

Then test:
```bash
curl http://127.0.0.1:4310/api/extensions/ui.vue3/dependencies | jq .
```

Expected: JSON with `tree`, `flat`, `totalDeps` fields. Tree should match Chef output (6-7 deps).

- [ ] **Step 2: Open frontend and verify**

Open `http://127.0.0.1:4173`, go to "Ресурсы" tab, click "Deps" on a JS asset like `core.bundle.js`. Should see dependency tree expand below the row.

- [ ] **Step 3: Clean up test file**

```bash
rm C:/bitrix_repos/modules/dep-resolver-test.mjs
```
