export function getTargetOrigin(targetUrl?: string): string | undefined
{
	if (!targetUrl)
	{
		return undefined;
	}

	try
	{
		return new URL(targetUrl).origin;
	}
	catch
	{
		return undefined;
	}
}

export function getDisplayUrl(url: string, targetOrigin?: string): string
{
	try
	{
		const parsedUrl = new URL(url);

		if (targetOrigin && parsedUrl.origin === targetOrigin)
		{
			return parsedUrl.pathname;
		}

		return `${parsedUrl.origin}${parsedUrl.pathname}`;
	}
	catch
	{
		return url.split('?')[0] ?? url;
	}
}

export function getResourceLabel(url: string): string
{
	const cleanUrl = url.split('?')[0] ?? url;
	const segments = cleanUrl.split('/').filter(Boolean);

	return segments.at(-1) ?? cleanUrl;
}

export function getResourceTypeLabel(resourceType: string): string
{
	if (resourceType === 'script')
	{
		return 'js';
	}

	if (resourceType === 'stylesheet')
	{
		return 'css';
	}

	return resourceType;
}
