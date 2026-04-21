import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 4310);

createApp().then((app) => {
	app.listen({ host: '127.0.0.1', port }).catch((error) => {
		app.log.error(error);
		process.exitCode = 1;
	});
}).catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
