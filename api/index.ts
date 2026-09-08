import { buildApp } from '../backend/src/app.js';

export default async function handler(req: any, res: any) {
  const app = await buildApp();
  await app.ready();
  app.server.emit('request', req, res);
}
