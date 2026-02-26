import { getToken } from '@auth/core/jwt';

export async function GET(request) {
	const authSecret = process.env.AUTH_SECRET;
	if (!authSecret) {
		return new Response(
			`
			<html>
				<body>
					<script>
						window.parent.postMessage({ type: 'AUTH_ERROR', error: 'Auth is not configured' }, '*');
					</script>
				</body>
			</html>
			`,
			{
				status: 503,
				headers: {
					'Content-Type': 'text/html',
				},
			}
		);
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
		return new Response(
			`
			<html>
				<body>
					<script>
						window.parent.postMessage({ type: 'AUTH_ERROR', error: 'Unauthorized' }, '*');
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
					window.parent.postMessage(${JSON.stringify(message)}, '*');
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
