import { useState } from 'react';

export function useModal() {
    const [modalState, setModalState] = useState({
        type: null,
        isOpen: false,
        props: {}
    });

    return {
        modalState,
        showAlert: () => { },
        showConfirm: () => { },
    };
}
