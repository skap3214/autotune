export default {
  name: "autotune-session-env",
  hooks: {
    "shell.env": async (input) => {
      const sessionId = input?.sessionID ?? input?.sessionId ?? null;
      if (!sessionId) {
        return {};
      }

      return {
        env: {
          OPENCODE_SESSION_ID: String(sessionId),
        },
      };
    },
  },
};
