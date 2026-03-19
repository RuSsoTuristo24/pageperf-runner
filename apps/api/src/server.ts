import { createApp } from './app.js';

const app = createApp();
const port = Number(process.env.PORT ?? 4310);

app.listen({ host: '127.0.0.1', port }).catch((error) => {
	app.log.error(error);
	process.exitCode = 1;
});
