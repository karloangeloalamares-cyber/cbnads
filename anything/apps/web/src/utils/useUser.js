import { useSession } from '@auth/create/react';
import React from 'react';

const LOCAL_USER_STORAGE_KEY = 'cbn_local_user';

function readLocalUser() {
	if (typeof window === 'undefined') {
		return null;
	}

	try {
		const raw = window.localStorage.getItem(LOCAL_USER_STORAGE_KEY);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export const useUser = () => {
	const { data: session, status } = useSession();
	const sessionUser = session?.user ?? null;

	const [user, setUser] = React.useState(sessionUser ?? readLocalUser());
	const [localLoading, setLocalLoading] = React.useState(false);

	const refetchUser = React.useCallback(() => {
		if (sessionUser) {
			setUser(sessionUser);
			return;
		}

		if (status === 'loading') {
			return;
		}

		setLocalLoading(true);
		setUser(readLocalUser());
		setLocalLoading(false);
	}, [sessionUser, status]);

	React.useEffect(refetchUser, [refetchUser]);

	return {
		user,
		data: user,
		loading:
			status === 'loading' ||
			localLoading ||
			(status === 'authenticated' && !user),
		refetch: refetchUser,
	};
};

export default useUser;
