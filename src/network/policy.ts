export interface AdditionalFetchPolicy {
  dispatcher?: unknown;
  redirect?: "manual";
  dispose?(): Promise<void>;
}
