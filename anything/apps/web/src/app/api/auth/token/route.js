import { getToken } from '@auth/core/jwt';

export async function GET(request) {
	const authSecret = process.env.AUTH_SECRET;
	if (!authSecret) {
		return new Response(JSON.stringify({ error: 'Auth is not configured' }), {
			status: 503,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}

	const secureCookie = (process.env.AUTH_URL ?? '').startsWith('https');
	const [token, jwt] = await Promise.all([
		getToken({
			req: request,
			secret: authSecret,
			secureCookie,
			raw: true,
		}),
		getToken({
			req: request,
			secret: authSecret,
			secureCookie,
		}),
	]);

	if (!jwt) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}

	return new Response(
		JSON.stringify({
			jwt: token,
			user: {
				id: jwt.sub,
				email: jwt.email,
				name: jwt.name,
			},
		}),
		{
			headers: {
				'Content-Type': 'application/json',
			},
		}
	);
}
