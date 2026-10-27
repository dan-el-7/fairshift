// Vercel entry. The server is pre-bundled into _handler.mjs by `npm run build:api` (see vercel.json).
import { handler } from './_handler.mjs';

// Web-standard method exports: Vercel passes a Request and expects a Response.
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
export const OPTIONS = handler;
