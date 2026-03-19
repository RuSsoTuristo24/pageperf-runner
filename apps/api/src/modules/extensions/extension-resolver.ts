import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

import { parseRelDependencies, parseBundlePath } from './config-php-parser.js';

export type DependencyNode = {
	name: string;
	circular?: boolean;
	notFound?: boolean;
	/** Extension has bundle.config but no config.php — built into parent bundle */
	builtIn?: boolean;
	/** Alternative dep branches from conditional config.php (non-empty = has alternatives) */
	altBranches?: string[][];
	children: DependencyNode[];
	bundleSize?: { js: number; css: number };
	/** Cumulative size: own + all children (non-circular, non-notFound) */
	totalSize?: { js: number; css: number };
};

export type FlatDependency = {
	name: string;
	bundleSize?: { js: number; css: number };
};

export class ExtensionResolver
{
	private modulesRoot: string;
	private wwwJsRoot: string | null;
	private urlIndex: Record<string, string> | null = null;

	constructor(modulesRoot: string, wwwJsRoot?: string)
	{
		this.modulesRoot = modulesRoot;
		// Try to find www/bitrix/js relative to modules root
		const defaultWww = join(modulesRoot, '..', 'www', 'bitrix', 'js');
		this.wwwJsRoot = existsSync(wwwJsRoot ?? defaultWww) ? (wwwJsRoot ?? defaultWww) : null;
	}

	private ensureUrlIndex(): Record<string, string>
	{
		if (this.urlIndex === null)
		{
			this.urlIndex = this.buildUrlIndex();
		}

		return this.urlIndex;
	}

	/**
	 * Resolves a full dependency tree for the given extension.
	 * Detects circular dependencies via a visited set.
	 */
	resolveTree(extensionName: string): DependencyNode
	{
		return this.resolveTreeRecursive(extensionName, new Set<string>());
	}

	/**
	 * Returns a unique flat list of all dependencies (depth-first).
	 */
	resolveFlat(extensionName: string): FlatDependency[]
	{
		const tree = this.resolveTree(extensionName);
		const seen = new Set<string>();
		const result: FlatDependency[] = [];

		this.collectFlat(tree, seen, result);

		return result;
	}

	/**
	 * Looks up an extension name by its bundle URL path.
	 */
	resolveByUrl(urlPath: string): string | null
	{
		const normalized = posix.normalize(urlPath);

		return this.ensureUrlIndex()[normalized] ?? null;
	}

	/**
	 * Returns the full reverse URL index (bundle URL → extension name).
	 */
	getUrlIndex(): Record<string, string>
	{
		return this.ensureUrlIndex();
	}

	private resolveTreeRecursive(extensionName: string, visited: Set<string>): DependencyNode
	{
		if (visited.has(extensionName))
		{
			return {
				name: extensionName,
				circular: true,
				children: [],
			};
		}

		const configPath = this.getConfigPath(extensionName);
		if (!configPath || !existsSync(configPath))
		{
			// Check if it has bundle.config but no config.php (built into parent)
			const extDir = configPath ? join(configPath, '..') : null;
			const hasBundle = extDir && (
				existsSync(join(extDir, 'bundle.config.js'))
				|| existsSync(join(extDir, 'bundle.config.ts'))
			);

			return {
				name: extensionName,
				...(hasBundle ? { builtIn: true } : { notFound: true }),
				children: [],
			};
		}

		visited.add(extensionName);

		const source = readFileSync(configPath, 'utf-8');
		const parsed = parseRelDependencies(source);
		const bundleSize = this.readBundleSize(source, configPath, extensionName);

		const children = parsed.deps.map((dep) => this.resolveTreeRecursive(dep, visited));

		const ownJs = bundleSize?.js ?? 0;
		const ownCss = bundleSize?.css ?? 0;
		let totalJs = ownJs;
		let totalCss = ownCss;

		for (const child of children)
		{
			if (!child.circular && !child.notFound && child.totalSize)
			{
				totalJs += child.totalSize.js;
				totalCss += child.totalSize.css;
			}
		}

		const node: DependencyNode = {
			name: extensionName,
			children,
			bundleSize,
			totalSize: { js: totalJs, css: totalCss },
		};

		if (parsed.altBranches.length > 0)
		{
			node.altBranches = parsed.altBranches;
		}

		return node;
	}

	private collectFlat(node: DependencyNode, seen: Set<string>, result: FlatDependency[]): void
	{
		for (const child of node.children)
		{
			if (seen.has(child.name))
			{
				continue;
			}

			seen.add(child.name);
			result.push({
				name: child.name,
				bundleSize: child.bundleSize,
			});

			if (!child.circular && !child.notFound)
			{
				this.collectFlat(child, seen, result);
			}
		}
	}

	/**
	 * Maps extension name to its config.php filesystem path.
	 * Example: 'ui.vue3' → '<modulesRoot>/ui/install/js/ui/vue3/config.php'
	 */
	private getConfigPath(extensionName: string): string | null
	{
		const segments = extensionName.split('.');
		if (segments.length < 2)
		{
			return null;
		}

		const moduleName = segments[0];
		const extensionPath = segments.join('/');

		return join(this.modulesRoot, moduleName, 'install', 'js', extensionPath, 'config.php');
	}

	/**
	 * Reads js/css bundle file sizes for an extension config.
	 * Prefers .min files from the www production directory when available.
	 */
	private readBundleSize(source: string, configPath: string, extensionName: string): { js: number; css: number }
	{
		const extDir = join(configPath, '..');
		const segments = extensionName.split('.');
		const wwwExtDir = this.wwwJsRoot
			? join(this.wwwJsRoot, ...segments)
			: null;

		let jsSize = 0;
		let cssSize = 0;

		const jsPath = parseBundlePath(source, 'js');
		if (jsPath)
		{
			jsSize = this.readFileSize(jsPath, extDir, wwwExtDir);
		}

		const cssPath = parseBundlePath(source, 'css');
		if (cssPath)
		{
			cssSize = this.readFileSize(cssPath, extDir, wwwExtDir);
		}

		return { js: jsSize, css: cssSize };
	}

	/**
	 * Resolves file size: first tries .min variant in www, then .min in source,
	 * then original in source.
	 */
	private readFileSize(relPath: string, sourceDir: string, wwwDir: string | null): number
	{
		const minPath = relPath.replace(/\.(js|css)$/, '.min.$1');

		// 1. Try .min in www (production)
		if (wwwDir)
		{
			try
			{
				return statSync(join(wwwDir, minPath)).size;
			}
			catch
			{
				// not found
			}
		}

		// 2. Try .min in source
		try
		{
			return statSync(join(sourceDir, minPath)).size;
		}
		catch
		{
			// not found
		}

		// 3. Fall back to original in source
		try
		{
			return statSync(join(sourceDir, relPath)).size;
		}
		catch
		{
			return 0;
		}
	}

	/**
	 * Builds a reverse index: bundle URL path → extension name.
	 * Scans all modules at construction time.
	 */
	private buildUrlIndex(): Record<string, string>
	{
		const index: Record<string, string> = {};

		let modules: string[];
		try
		{
			modules = readdirSync(this.modulesRoot);
		}
		catch
		{
			return index;
		}

		for (const moduleName of modules)
		{
			const jsRoot = join(this.modulesRoot, moduleName, 'install', 'js', moduleName);
			if (!existsSync(jsRoot))
			{
				continue;
			}

			try
			{
				const stat = statSync(jsRoot);
				if (!stat.isDirectory())
				{
					continue;
				}
			}
			catch
			{
				continue;
			}

			this.scanDirectory(jsRoot, [moduleName], index);
		}

		return index;
	}

	/**
	 * Recursively scans a directory for config.php files and indexes bundle URLs.
	 */
	private scanDirectory(dir: string, segments: string[], index: Record<string, string>): void
	{
		const configPath = join(dir, 'config.php');
		if (existsSync(configPath))
		{
			try
			{
				const source = readFileSync(configPath, 'utf-8');
				const extensionName = segments.join('.');

				const jsPath = parseBundlePath(source, 'js');
				if (jsPath)
				{
					const urlPath = posix.normalize(
						'/bitrix/js/' + segments.join('/') + '/' + jsPath,
					);
					index[urlPath] = extensionName;
					// Also index .min variant for production URLs
					const minUrl = urlPath.replace(/\.js$/, '.min.js');
					if (minUrl !== urlPath)
					{
						index[minUrl] = extensionName;
					}
				}

				const cssPath = parseBundlePath(source, 'css');
				if (cssPath)
				{
					const urlPath = posix.normalize(
						'/bitrix/js/' + segments.join('/') + '/' + cssPath,
					);
					index[urlPath] = extensionName;
					const minUrl = urlPath.replace(/\.css$/, '.min.css');
					if (minUrl !== urlPath)
					{
						index[minUrl] = extensionName;
					}
				}
			}
			catch
			{
				// Skip unreadable config files
			}
		}

		let entries: string[];
		try
		{
			entries = readdirSync(dir);
		}
		catch
		{
			return;
		}

		for (const entry of entries)
		{
			if (entry === 'dist' || entry === 'node_modules' || entry.startsWith('.'))
			{
				continue;
			}

			const entryPath = join(dir, entry);
			try
			{
				const stat = statSync(entryPath);
				if (stat.isDirectory())
				{
					this.scanDirectory(entryPath, [...segments, entry], index);
				}
			}
			catch
			{
				// Skip inaccessible entries
			}
		}
	}
}
