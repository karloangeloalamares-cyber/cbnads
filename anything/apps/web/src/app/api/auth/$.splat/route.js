import { auth } from "../../../../auth";

export const loader = async ({ request }) => {
    return typeof auth.handler === "function"
        ? auth.handler({ request })
        : auth({ request });
};

export const action = async ({ request }) => {
    return typeof auth.handler === "function"
        ? auth.handler({ request })
        : auth({ request });
};
