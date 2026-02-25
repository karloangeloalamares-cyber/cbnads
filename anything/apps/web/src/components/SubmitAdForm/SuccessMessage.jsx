export function SuccessMessage({ onReset }) {
    return (
        <div className="p-12 text-center text-green-700 font-medium">
            <h2>Success! Ad submitted.</h2>
            <button onClick={onReset} className="mt-4 px-4 py-2 bg-green-100 rounded">Submit Another</button>
        </div>
    );
}
