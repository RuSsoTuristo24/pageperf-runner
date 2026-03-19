function formatDuration(ms: number): string
{
	if (ms >= 60000)
	{
		const minutes = Math.floor(ms / 60000);
		const seconds = ((ms % 60000) / 1000).toFixed(1);

		return `${minutes} мин ${seconds} с`;
	}

	if (ms >= 1000)
	{
		return `${(ms / 1000).toFixed(2)} с`;
	}

	return `${ms.toFixed(1)} мс`;
}

export function formatMetricValue(name: string, value: number): string
{
	const normalizedName = name.toLowerCase();

	if (normalizedName === 'cls')
	{
		return value.toFixed(3);
	}

	if (normalizedName.endsWith('ratio'))
	{
		return `${value.toFixed(1)}%`;
	}

	return formatDuration(value);
}

export function formatMetricOrPlaceholder(name: string, value?: number | null): string
{
	if (value === undefined || value === null)
	{
		return 'Ожидание';
	}

	return formatMetricValue(name, value);
}

export function formatBytes(bytes: number): string
{
	if (bytes >= 1000 * 1000)
	{
		return `${(bytes / (1000 * 1000)).toFixed(2)} МБ`;
	}

	if (bytes >= 1000)
	{
		return `${(bytes / 1000).toFixed(2)} КБ`;
	}

	return `${bytes} Б`;
}

export function titleizeMetric(name: string): string
{
	return name.toUpperCase();
}

export function formatCount(value: number): string
{
	return Intl.NumberFormat('en-US').format(value);
}

export function formatRatio(value: number): string
{
	return `${value.toFixed(2)}x`;
}
