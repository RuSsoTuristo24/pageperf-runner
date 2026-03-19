import { useEffect, useState } from 'react';

import { fetchExtensionDeps, type ApiDependencyNode, type ApiExtensionDeps } from '../../lib/api.js';
import { formatBytes } from '../../lib/format.js';

type DependencyTreeProps = {
	extensionName: string;
};

function formatNodeSize(bundleSize?: { js: number; css: number }): string | null
{
	if (!bundleSize)
	{
		return null;
	}

	const parts: string[] = [];

	if (bundleSize.js > 0)
	{
		parts.push(formatBytes(bundleSize.js));
	}

	if (bundleSize.css > 0)
	{
		parts.push(formatBytes(bundleSize.css) + ' css');
	}

	return parts.length > 0 ? parts.join(' + ') : null;
}

function TreeNode({ node, isLast }: { node: ApiDependencyNode; isLast: boolean })
{
	const sizeLabel = formatNodeSize(node.bundleSize);
	const hasChildren = node.children.length > 0;

	return (
		<li className={`dep-tree-node ${isLast ? 'dep-tree-node-last' : ''}`}>
			<span className="dep-tree-connector">{isLast ? '\u2514' : '\u251C'}</span>
			<span className="dep-tree-label">
				<span className="dep-tree-name">{node.name}</span>
				{sizeLabel ? <span className="dep-tree-size">{sizeLabel}</span> : null}
				{node.branches && node.branches > 1 ? (
					<span
						className="dep-tree-badge dep-tree-conditional"
						title={`В config.php ${node.branches} условных ветки с разными зависимостями. Показан union всех веток. Реальный набор зависит от PHP-условий на сервере.`}
					>
						{node.branches} ветки
					</span>
				) : null}
				{node.circular ? <span className="dep-tree-badge dep-tree-circular" title="Циклическая зависимость: этот экстеншен уже есть выше в дереве. Bitrix загрузит его один раз.">circular</span> : null}
				{node.notFound ? <span className="dep-tree-badge dep-tree-not-found" title="Экстеншен объявлен как зависимость, но его config.php не найден в исходниках. Возможно, он регистрируется динамически или через другой модуль.">not in source</span> : null}
			</span>
			{hasChildren ? (
				<ul className="dep-tree-children">
					{node.children.map((child, index) => (
						<TreeNode
							key={`${child.name}-${index}`}
							node={child}
							isLast={index === node.children.length - 1}
						/>
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

		async function load(): Promise<void>
		{
			try
			{
				setIsLoading(true);
				setError(null);

				const result = await fetchExtensionDeps(extensionName);

				if (!cancelled)
				{
					setData(result);
				}
			}
			catch (loadError)
			{
				if (!cancelled)
				{
					setError(
						loadError instanceof Error
							? loadError.message
							: 'Failed to load dependencies',
					);
				}
			}
			finally
			{
				if (!cancelled)
				{
					setIsLoading(false);
				}
			}
		}

		void load();

		return () => {
			cancelled = true;
		};
	}, [extensionName]);

	if (isLoading)
	{
		return <div className="dep-tree-panel dep-tree-loading">Loading dependencies...</div>;
	}

	if (error)
	{
		return <div className="dep-tree-panel dep-tree-error">{error}</div>;
	}

	if (!data || data.tree.children.length === 0)
	{
		return <div className="dep-tree-panel dep-tree-empty">No dependencies</div>;
	}

	const totalJs = data.flat.reduce((sum, dep) => sum + (dep.bundleSize?.js ?? 0), 0);
	const totalCss = data.flat.reduce((sum, dep) => sum + (dep.bundleSize?.css ?? 0), 0);

	return (
		<div className="dep-tree-panel">
			<div className="dep-tree-header">
				<span className="dep-tree-header-name">{data.extension}</span>
				<span className="dep-tree-header-stats">
					{data.totalDeps} dep{data.totalDeps !== 1 ? 's' : ''}
					{totalJs > 0 ? <span className="dep-tree-header-size">JS {formatBytes(totalJs)}</span> : null}
					{totalCss > 0 ? <span className="dep-tree-header-size">CSS {formatBytes(totalCss)}</span> : null}
				</span>
			</div>
			<ul className="dep-tree-root">
				{data.tree.children.map((child, index) => (
					<TreeNode
						key={`${child.name}-${index}`}
						node={child}
						isLast={index === data.tree.children.length - 1}
					/>
				))}
			</ul>
		</div>
	);
}
