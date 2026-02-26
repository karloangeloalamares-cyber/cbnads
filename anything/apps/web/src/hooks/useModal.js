import { useState, useCallback } from "react";

export function useModal() {
  const [modalState, setModalState] = useState({
    isOpen: false,
    type: null,
    props: {},
  });

  const showAlert = useCallback((props) => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        type: "alert",
        props: {
          ...props,
          onClose: () => {
            setModalState({ isOpen: false, type: null, props: {} });
            resolve(true);
          },
        },
      });
    });
  }, []);

  const showConfirm = useCallback((props) => {
    return new Promise((resolve) => {
      setModalState({
        isOpen: true,
        type: "confirm",
        props: {
          ...props,
          onConfirm: () => {
            setModalState({ isOpen: false, type: null, props: {} });
            resolve(true);
          },
          onClose: () => {
            setModalState({ isOpen: false, type: null, props: {} });
            resolve(false);
          },
        },
      });
    });
  }, []);

  const closeModal = useCallback(() => {
    setModalState({ isOpen: false, type: null, props: {} });
  }, []);

  return {
    modalState,
    showAlert,
    showConfirm,
    closeModal,
  };
}
