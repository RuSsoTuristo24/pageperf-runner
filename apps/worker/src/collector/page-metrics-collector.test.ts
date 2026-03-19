import { describe, expect, it } from 'vitest';

import { normalizePageMetrics } from './page-metrics-collector.js';

describe('page metrics collector', () => {
	it('normalizes extended visual and UX metrics', () => {
		const metrics = normalizePageMetrics({
			navigationEntry: {
				responseStart: 180,
				domContentLoadedEventEnd: 1200,
				loadEventEnd: 2400,
			},
			paintEntries: [
				{ name: 'first-paint', startTime: 420 },
				{ name: 'first-contentful-paint', startTime: 610 },
			],
			largestContentfulPaint: 980,
			cumulativeLayoutShift: 0.03,
		});

		expect(metrics).toEqual([
			{ name: 'ttfb', value: 180 },
			{ name: 'fp', value: 420 },
			{ name: 'fcp', value: 610 },
			{ name: 'lcp', value: 980 },
			{ name: 'cls', value: 0.03 },
			{ name: 'dcl', value: 1200 },
			{ name: 'load', value: 2400 },
		]);
	});
});
