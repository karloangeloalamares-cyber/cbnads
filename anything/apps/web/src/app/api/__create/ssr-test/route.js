import { serializeError } from 'serialize-error';
import cleanStack from 'clean-stack';
import { requireAdmin } from '../../utils/auth-check.js';

function serializeClean(err) {
	// if we want to clean this more, maybe we should look at the file where it
	// is imported and above.
	err.stack = cleanStack(err.stack, {
		pathFilter: (path) => {
			// Filter out paths that are not relevant to the error
			return (
				!path.includes('node_modules') &&
				!path.includes('dist') &&
				!path.includes('__create')
			);
		},
	});

	return serializeError(err);
}
const getHTMLOrError = (React, renderToString, component) => {
	try {
		const html = renderToString(React.createElement(component, {}));
		return { html, error: null };
	} catch (error) {
		return { html: null, error: serializeClean(error) };
	}
};
export async function GET(request) {
	const admin = await requireAdmin();
	if (!admin.authorized) {
		return Response.json({ error: admin.error }, { status: admin.status || 401 });
	}

	if (process.env.NODE_ENV === 'production') {
		return Response.json({ error: 'Not Found' }, { status: 404 });
	}

	const [
		{ default: React },
		{ renderToString },
		path,
		{ default: routes },
	] = await Promise.all([
		import('react'),
		import('react-dom/server'),
		import('node:path'),
		import('../../../routes'),
	]);

	const results = await Promise.allSettled(
		routes.map(async (route) => {
			let component = null;
			try {
				const response = await import(
					/* @vite-ignore */ path.join('../../../', route.file)
				);
				component = response.default;
			} catch (error) {
				console.debug('Error importing component:', route.file, error);
			}
			if (!component) {
				return null;
			}
			return {
				route: route.file,
				path: route.path,
				...getHTMLOrError(React, renderToString, component),
			};
		})
	);
	const cleanedResults = results
		.filter((result) => result.status === 'fulfilled')
		.map((result) => {
			if (result.status === 'fulfilled') {
				return result.value;
			}
			return null;
		})
		.filter((result) => result !== null);
	return Response.json({ results: cleanedResults });
}
