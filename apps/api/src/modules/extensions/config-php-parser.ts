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

/**
 * Extracts the `rel` dependency array from config.php source.
 *
 * Handles two patterns:
 * 1. Inline: `'rel' => ['main.core', 'ui.buttons']`
 * 2. Variable: `$rel = ['main.core'];` then `'rel' => $rel`
 *
 * Always tries inline first; falls back to variable pattern.
 */
export function parseRelDependencies(phpSource: string): string[]
{
	// Pattern 1: inline 'rel' => [...]
	const inlineRegex = /'rel'\s*=>\s*\[([\s\S]*?)\]/g;
	let lastInlineMatch: string | null = null;
	let match: RegExpExecArray | null;

	while ((match = inlineRegex.exec(phpSource)) !== null)
	{
		lastInlineMatch = match[1];
	}

	if (lastInlineMatch !== null)
	{
		return extractNames(lastInlineMatch);
	}

	// Pattern 2: $rel = [...] then 'rel' => $rel
	const varUsageRegex = /'rel'\s*=>\s*\$rel\b/;
	if (varUsageRegex.test(phpSource))
	{
		const varDefRegex = /\$rel\s*=\s*\[([\s\S]*?)\]/g;
		let lastVarMatch: string | null = null;

		while ((match = varDefRegex.exec(phpSource)) !== null)
		{
			lastVarMatch = match[1];
		}

		if (lastVarMatch !== null)
		{
			return extractNames(lastVarMatch);
		}
	}

	return [];
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
	const stringRegex = new RegExp(`'${key}'\\s*=>\\s*['"]([^'"]+)['"]`);
	const stringMatch = phpSource.match(stringRegex);
	if (stringMatch)
	{
		return stringMatch[1];
	}

	// Pattern 2: array value  'key' => ['./path']
	const arrayRegex = new RegExp(`'${key}'\\s*=>\\s*\\[\\s*['"]([^'"]+)['"]`);
	const arrayMatch = phpSource.match(arrayRegex);
	if (arrayMatch)
	{
		return arrayMatch[1];
	}

	// Pattern 3: variable  'key' => $key  with  $key = './path';
	const varUsageRegex = new RegExp(`'${key}'\\s*=>\\s*\\$(${key})\\b`);
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
