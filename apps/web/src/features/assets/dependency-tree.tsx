import { useEffect, useState } from 'react';

import { fetchExtensionDeps, type ApiDependencyNode, type ApiExtensionDeps } from '../../lib/api.js';
import { formatBytes } from '../../lib/format.js';

type DependencyTreeProps = {
	extensionName: string;
};

function TreeNode({ node }: { node: ApiDependencyNode })
{
	return (
		<li className="dep-tree-node">
			<span className="dep-tree-name">
				{node.name}
				{node.bundleSize ? (
					<span className="dep-tree-size">
						{formatBytes(node.bundleSize.js)} JS / {formatBytes(node.bundleSize.css)} CSS
					</span>
				) : null}
				{node.circular ? (
					<span className="dep-tree-badge dep-tree-circular">circular</span>
				) : null}
				{node.notFound ? (
					<span className="dep-tree-badge dep-tree-not-found">not found</span>
				) : null}
			</span>
			{node.children.length > 0 ? (
				<ul className="dep-tree-children">
					{node.children.map((child, index) => (
						<TreeNode key={`${child.name}-${index}`} node={child} />
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
		return <div className="dep-tree-panel">Loading dependencies...</div>;
	}

	if (error)
	{
		return <div className="dep-tree-panel dep-tree-error">{error}</div>;
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
				<strong>{data.extension}</strong>
				<span className="dep-tree-summary">
					{data.totalDeps} deps / {formatBytes(totalJs)} JS / {formatBytes(totalCss)} CSS
				</span>
			</div>
			<ul className="dep-tree-root">
				<TreeNode node={data.tree} />
			</ul>
		</div>
	);
}
