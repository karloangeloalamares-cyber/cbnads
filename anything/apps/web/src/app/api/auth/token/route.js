import { getToken } from '@auth/core/jwt';

const readAuthSecret = () =>
	String(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '').trim();

const readTokenClientSecret = () =>
	String(process.env.AUTH_TOKEN_CLIENT_SECRET || '').trim();

const json = (body, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
		},
	});

const isBrowserRequest = (request) =>
	Boolean(
		request.headers.get('sec-fetch-mode') ||
			request.headers.get('sec-fetch-dest') ||
			request.headers.get('sec-fetch-site')
	);

const hasValidClientSecret = (request, expectedSecret) => {
	if (!expectedSecret) {
		return true;
	}

	const providedSecret = String(
		request.headers.get('x-auth-token-client-secret') || ''
	).trim();
	return providedSecret.length > 0 && providedSecret === expectedSecret;
};

export async function GET(request) {
	const authUrl = String(process.env.AUTH_URL || process.env.APP_URL || '').trim();
	const secureCookie = authUrl.startsWith('https');
	const authSecret = readAuthSecret();
	const tokenClientSecret = readTokenClientSecret();

	if (!authSecret) {
		return json(
			{ error: 'Server auth configuration is invalid: AUTH_SECRET or NEXTAUTH_SECRET must be set.' },
			500
		);
	}

	// Block browser-originated calls unless a shared client secret is explicitly configured and provided.
	if (!hasValidClientSecret(request, tokenClientSecret)) {
		return json({ error: 'Forbidden' }, 403);
	}
	if (!tokenClientSecret && isBrowserRequest(request)) {
		return json({ error: 'Forbidden' }, 403);
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

	if (!jwt || !token) {
		return json({ error: 'Unauthorized' }, 401);
	}

	return json({
		jwt: token,
		user: {
			id: jwt.sub,
			email: jwt.email,
			name: jwt.name,
		},
	});
}
