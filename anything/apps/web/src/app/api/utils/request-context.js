import { AsyncLocalStorage } from "node:async_hooks";

const requestContext = new AsyncLocalStorage();

export const runWithRequestContext = async (request, fn) =>
  requestContext.run({ request }, fn);

export const getCurrentRequest = () => requestContext.getStore()?.request || null;

