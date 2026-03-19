/**
 * Parses Bitrix extension config.php files to extract dependency
 * and bundle information without executing PHP.
 */

/**
 * Extracts extension names from a PHP array literal body
 * (the content between square brackets).
 */
function extractNames(arrayContent: string): string[]
{
	const nameRegex = /['"]([a-zA-Z0-9_.-]+)['"]/g;
	const names: string[] = [];
	let match: RegExpExecArray | null;

	while ((match = nameRegex.exec(arrayContent)) !== null)
	{
		names.push(match[1]);
	}

	return names;
}

export type RelParseResult = {
	/** Primary (default/prod) branch — the last rel in the file */
	deps: string[];
	/** Alternative branches (all except the last), empty if only one branch */
	altBranches: string[][];
};

/**
 * Extracts the `rel` dependency array from config.php source.
 *
 * Handles two patterns:
 * 1. Inline: `'rel' => ['main.core', 'ui.buttons']`
 * 2. Variable: `$rel = ['main.core'];` then `'rel' => $rel`
 *
 * When multiple branches exist (conditional PHP), returns the union
 * of all branches and sets `branches` to the count.
 */
export function parseRelDependencies(phpSource: string): RelParseResult
{
	const allBranches: string[][] = [];

	// Pattern 1: inline 'rel' => [...]
	const inlineRegex = /['"]rel['"]\s*=>\s*\[([\s\S]*?)\]/g;
	let match: RegExpExecArray | null;

	while ((match = inlineRegex.exec(phpSource)) !== null)
	{
		allBranches.push(extractNames(match[1]));
	}

	// Pattern 2: $rel = [...] then 'rel' => $rel
	if (allBranches.length === 0)
	{
		const varUsageRegex = /['"]rel['"]\s*=>\s*\$rel\b/;
		if (varUsageRegex.test(phpSource))
		{
			const varDefRegex = /\$rel\s*=\s*\[([\s\S]*?)\]/g;

			while ((match = varDefRegex.exec(phpSource)) !== null)
			{
				allBranches.push(extractNames(match[1]));
			}
		}
	}

	if (allBranches.length === 0)
	{
		return { deps: [], altBranches: [] };
	}

	// Last branch is primary (default/prod — the else branch in PHP conditionals)
	const primary = allBranches[allBranches.length - 1];
	const altBranches = allBranches.slice(0, -1);

	return { deps: primary, altBranches };
}

/**
 * Extracts the bundle file path for a given key ('js' or 'css')
 * from config.php source.
 *
 * Handles three forms:
 * 1. String:   `'js' => './dist/bundle.js'`
 * 2. Array:    `'js' => ['./dist/bundle.js']` — takes first element
 * 3. Variable: `'js' => $js` then `$js = './path.js';` — takes last assignment
 */
export function parseBundlePath(phpSource: string, key: 'js' | 'css'): string | null
{
	// Pattern 1: string value  'key' => './path'
	const stringRegex = new RegExp(`['"]${key}['"]\\s*=>\\s*['"]([^'"]+)['"]`);
	const stringMatch = phpSource.match(stringRegex);
	if (stringMatch)
	{
		return stringMatch[1];
	}

	// Pattern 2: array value  'key' => ['./path']
	const arrayRegex = new RegExp(`['"]${key}['"]\\s*=>\\s*\\[\\s*['"]([^'"]+)['"]`);
	const arrayMatch = phpSource.match(arrayRegex);
	if (arrayMatch)
	{
		return arrayMatch[1];
	}

	// Pattern 3: variable  'key' => $key  with  $key = './path';
	const varUsageRegex = new RegExp(`['"]${key}['"]\\s*=>\\s*\\$(\\w+)\\b`);
	const varUsageMatch = phpSource.match(varUsageRegex);
	if (varUsageMatch)
	{
		const varName = varUsageMatch[1];
		const varDefRegex = new RegExp(`\\$${varName}\\s*=\\s*['"]([^'"]+)['"]`, 'g');
		let lastVarMatch: string | null = null;
		let m: RegExpExecArray | null;

		while ((m = varDefRegex.exec(phpSource)) !== null)
		{
			lastVarMatch = m[1];
		}

		return lastVarMatch;
	}

	return null;
}
