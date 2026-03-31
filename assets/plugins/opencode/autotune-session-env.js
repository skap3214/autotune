export const AutotuneSessionEnv = async () => {
  return {
    "shell.env": async (input, output) => {
      const sessionId = input?.sessionID ?? input?.sessionId ?? null;
      if (sessionId) {
        output.env.OPENCODE_SESSION_ID = String(sessionId);
      }
    },
  };
};
