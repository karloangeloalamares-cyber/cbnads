import { getToken } from '@auth/core/jwt';
import { getContext } from 'hono/context-storage';

export default function CreateAuth() {
	const auth = async () => {
		const authSecret = process.env.AUTH_SECRET;
		if (!authSecret) {
			return;
		}

		const c = getContext();
		const token = await getToken({
			req: c.req.raw,
			secret: authSecret,
			secureCookie: (process.env.AUTH_URL ?? '').startsWith('https'),
		});
		if (token) {
			return {
				user: {
					id: token.sub,
					email: token.email,
					name: token.name,
					image: token.picture,
				},
				expires: token.exp.toString(),
			};
		}
	};
	return {
		auth,
	};
}
