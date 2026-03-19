import { Fragment, useEffect, useState } from 'react';

import { fetchExtensionDeps, type ApiDependencyNode, type ApiExtensionDeps } from '../../lib/api.js';
import { formatBytes } from '../../lib/format.js';

type DependencyTreeProps = {
	extensionName: string;
};

function formatSizeLabel(bundleSize?: { js: number; css: number }): string | null
{
	if (!bundleSize)
	{
		return null;
	}

	const parts: string[] = [];

	if (bundleSize.js > 0)
	{
		parts.push(formatBytes(bundleSize.js) + ' js');
	}

	if (bundleSize.css > 0)
	{
		parts.push(formatBytes(bundleSize.css) + ' css');
	}

	return parts.length > 0 ? parts.join(' + ') : null;
}

function formatTotalLabel(totalSize?: { js: number; css: number }): string | null
{
	if (!totalSize)
	{
		return null;
	}

	const parts: string[] = [];

	if (totalSize.js > 0)
	{
		parts.push(formatBytes(totalSize.js) + ' js');
	}

	if (totalSize.css > 0)
	{
		parts.push(formatBytes(totalSize.css) + ' css');
	}

	return parts.length > 0 ? parts.join(' + ') : null;
}

function TreeNode({ node, isLast }: { node: ApiDependencyNode; isLast: boolean })
{
	const [showAlt, setShowAlt] = useState(false);
	const ownLabel = formatSizeLabel(node.bundleSize);
	const totalLabel = formatTotalLabel(node.totalSize);
	const hasChildren = node.children.length > 0;
	const hasAlt = node.altBranches && node.altBranches.length > 0;

	// Show total only if it differs from own (i.e. has deps with size)
	const showTotal = totalLabel && totalLabel !== ownLabel;

	return (
		<li className={`dep-tree-node ${isLast ? 'dep-tree-node-last' : ''}`}>
			<span className="dep-tree-connector">{isLast ? '\u2514' : '\u251C'}</span>
			<span className="dep-tree-label">
				<span className="dep-tree-name">{node.name}</span>
				{ownLabel ? <span className="dep-tree-size">{ownLabel}</span> : null}
				{showTotal ? <span className="dep-tree-total" title="Суммарный размер со всеми зависимостями">({totalLabel})</span> : null}
				{hasAlt ? (
					<button
						type="button"
						className="dep-tree-badge dep-tree-conditional"
						title={`В config.php есть ${node.altBranches!.length + 1} условных ветки. Показана основная (prod). Нажмите чтобы увидеть альтернативные.`}
						onClick={() => setShowAlt((v) => !v)}
					>
						{node.altBranches!.length + 1} ветки
					</button>
				) : null}
				{node.circular ? <span className="dep-tree-badge dep-tree-circular" title="Циклическая зависимость: этот экстеншен уже есть выше в дереве. Bitrix загрузит его один раз.">circular</span> : null}
				{node.builtIn ? <span className="dep-tree-badge dep-tree-built-in" title="Нет собственного config.php — код встроен в родительский бандл (bundle.config с protected: true). Отдельного файла на продакшене нет.">built into parent</span> : null}
				{node.notFound ? <span className="dep-tree-badge dep-tree-not-found" title="Экстеншен объявлен как зависимость, но не найден ни config.php, ни bundle.config в исходниках. Возможно, регистрируется динамически.">not in source</span> : null}
			</span>
			{hasAlt && showAlt ? (
				<div className="dep-tree-alt-panel">
					{node.altBranches!.map((branch, branchIndex) => (
						<div key={branchIndex} className="dep-tree-alt-branch">
							<span className="dep-tree-alt-label">Ветка {branchIndex + 1}:</span>
							{branch.map((dep, depIndex) => (
								<Fragment key={dep}>
									{depIndex > 0 ? <span className="dep-tree-alt-sep">,</span> : null}
									<code className="dep-tree-alt-dep">{dep}</code>
								</Fragment>
							))}
						</div>
					))}
				</div>
			) : null}
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

	const totalLabel = formatTotalLabel(data.tree.totalSize);

	return (
		<div className="dep-tree-panel">
			<div className="dep-tree-header">
				<span className="dep-tree-header-name">{data.extension}</span>
				<span className="dep-tree-header-stats">
					{data.totalDeps} dep{data.totalDeps !== 1 ? 's' : ''}
					{totalLabel ? <span className="dep-tree-header-size">{totalLabel}</span> : null}
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
