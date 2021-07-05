import { google } from "googleapis";
export { DateTime } from "luxon"
import { readFile } from "fs/promises"

// Create base env var object
export const processEnvs = {
  SHARED_DRIVE_NAME: null,
  MONGO_HOST_API: null,
  SERVICE_ACCOUNT_CREDENTIALS: null,
  TARGET_FOLDER_NAME: null
}

// populate with either docker secrets or envs
if (process.env.INFRA === "swarm") {
  for (let env of Object.keys(processEnvs)) {
    processEnvs[env] = await readFile(`/run/secrets/${env}`, "utf-8")
  }
} else if (process.env.INFRA === "fly") {
  for (let env of Object.keys(processEnvs)) {
    processEnvs[env] = process.env[env]
  }
}

const credentials = JSON.parse(processEnvs.SERVICE_ACCOUNT_CREDENTIALS)
export const gdrive = google.drive({ version: "v3", auth: await google.auth.getClient({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] })})
export function mod(n, m) {
  return ((n % m) + m) % m;
}