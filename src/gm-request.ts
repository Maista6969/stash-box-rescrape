export type GraphQLError = { message: string };

export type GMResponse<T> = { status: number; response: T };

// Thin Promise wrapper around GM_xmlhttpRequest, shared by every module that
// talks to a Stash-like GraphQL/HTTP endpoint. Resolves with the raw
// status/response on load (callers still do their own status/body
// inspection) and always rejects with an Error, never a bare string.
export function gmRequest<T = unknown>(
  init: Omit<Tampermonkey.Request<unknown>, "onload" | "onerror" | "ontimeout">,
): Promise<GMResponse<T>> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      ...init,
      onload: (res) =>
        resolve({ status: res.status, response: res.response as T }),
      onerror: (err) =>
        reject(new Error(`Request error for ${init.url}: ${err.error}`)),
      ontimeout: () => reject(new Error(`Request to ${init.url} timed out`)),
    });
  });
}
