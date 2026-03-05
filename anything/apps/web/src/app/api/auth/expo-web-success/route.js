import { getToken } from '@auth/core/jwt';

const readAuthSecret = () =>
	String(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '').trim();

const getAuthOrigin = () => {
	try {
		const authUrl = String(process.env.AUTH_URL || process.env.APP_URL || '').trim();
		return authUrl ? new URL(authUrl).origin : '';
	} catch {
		return '';
	}
};

export async function GET(request) {
	const authUrl = String(process.env.AUTH_URL || process.env.APP_URL || '').trim();
	const secureCookie = authUrl.startsWith('https');
	const targetOrigin = getAuthOrigin();
	const authSecret = readAuthSecret();

	if (!targetOrigin) {
		return new Response(
			JSON.stringify({
				error: 'Server auth configuration is invalid: AUTH_URL or APP_URL must be set to a valid URL.',
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	}

	if (!authSecret) {
		return new Response(
			JSON.stringify({
				error: 'Server auth configuration is invalid: AUTH_SECRET or NEXTAUTH_SECRET must be set.',
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
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
		return new Response(
			`
			<html>
					<body>
						<script>
							window.parent.postMessage({ type: 'AUTH_ERROR', error: 'Unauthorized' }, ${JSON.stringify(targetOrigin)});
						</script>
					</body>
				</html>
			`,
			{
				status: 401,
				headers: {
					'Content-Type': 'text/html',
				},
			}
		);
	}

	const message = {
		type: 'AUTH_SUCCESS',
		jwt: token,
		user: {
			id: jwt.sub,
			email: jwt.email,
			name: jwt.name,
		},
	};

	return new Response(
		`
			<html>
				<body>
					<script>
						window.parent.postMessage(${JSON.stringify(message)}, ${JSON.stringify(targetOrigin)});
					</script>
				</body>
			</html>
		`,
		{
			headers: {
				'Content-Type': 'text/html',
			},
		}
	);
}
