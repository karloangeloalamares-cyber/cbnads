import { getToken } from '@auth/core/jwt';

const readAuthSecret = () =>
	String(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '').trim();

export async function GET(request) {
	const authUrl = String(process.env.AUTH_URL || process.env.APP_URL || '').trim();
	const secureCookie = authUrl.startsWith('https');
	const authSecret = readAuthSecret();

	if (!authSecret) {
		return new Response(
			JSON.stringify({ error: 'Server auth configuration is invalid: AUTH_SECRET or NEXTAUTH_SECRET must be set.' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}

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
