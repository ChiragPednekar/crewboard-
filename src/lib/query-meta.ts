import '@tanstack/react-query';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Every caller passes its own onError (e.g. maps errors onto form fields), so skip the global toast. */
      handlesErrors?: boolean;
    };
  }
}

/** Spread into useMutation options for hooks whose call sites always handle errors. */
export const CALLER_HANDLES_ERRORS = { meta: { handlesErrors: true } } as const;
