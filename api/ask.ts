import type { AskRequest, AskResponse } from '../adventure_planner/askHandler';

export default async function handler(request: AskRequest, response: AskResponse) {
	const { handleAsk } = await import('../adventure_planner/askHandler.js');
	return handleAsk(request, response);
}