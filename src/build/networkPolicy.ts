import type { AdditionalFetchPolicy } from "../network/policy.js";
/** Default editions authorize only the model endpoint. */
export const additionalPolicy: ((endpoint: URL, target: URL, capability?: boolean | "webpage", signal?: AbortSignal) => Promise<AdditionalFetchPolicy | void>) | undefined = undefined;
