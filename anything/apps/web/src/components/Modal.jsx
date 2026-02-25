export function AlertModal({ isOpen }) {
    if (!isOpen) return null;
    return <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
        <div className="bg-white p-6 rounded text-black font-bold">Alert</div>
    </div>;
}

export function ConfirmModal({ isOpen }) {
    if (!isOpen) return null;
    return <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
        <div className="bg-white p-6 rounded text-black font-bold">Confirm</div>
    </div>;
}
