import { getToken } from '@auth/core/jwt';

const getAuthOrigin = () => {
	try {
		const authUrl = String(process.env.AUTH_URL || '').trim();
		return authUrl ? new URL(authUrl).origin : '';
	} catch {
		return '';
	}
};

export async function GET(request) {
	const authUrl = String(process.env.AUTH_URL || '').trim();
	const secureCookie = authUrl.startsWith('https');
	const targetOrigin = getAuthOrigin();

	if (!targetOrigin) {
		return new Response(
			JSON.stringify({
				error: 'Server auth configuration is invalid: AUTH_URL must be set to a valid URL.',
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
			secret: process.env.AUTH_SECRET,
			secureCookie,
			raw: true,
		}),
		getToken({
			req: request,
			secret: process.env.AUTH_SECRET,
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
