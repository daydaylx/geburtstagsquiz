function getTargetPath(args) {
  if (typeof args?.filePath === "string") return args.filePath;
  if (typeof args?.path === "string") return args.path;
  return null;
}

function isProtectedEnvPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  const fileName = normalized.split("/").pop() ?? "";
  return fileName.startsWith(".env") && !fileName.endsWith(".example");
}

export const EnvProtection = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      const targetPath = getTargetPath(output.args);
      if (!targetPath || !isProtectedEnvPath(targetPath)) {
        return;
      }

      if (input.tool === "read") {
        throw new Error("Lesen von .env-Dateien ist untersagt. Enthaelt Secrets.");
      }

      if (input.tool === "edit" || input.tool === "write") {
        throw new Error("Schreiben von .env-Dateien ist untersagt. Enthaelt Secrets.");
      }
    },
  };
};

export const server = EnvProtection;
export default EnvProtection;
