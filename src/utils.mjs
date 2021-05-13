import { google } from "googleapis";
const credentials = (process.env.NODE_ENV === "development") ? (await import("../creds/index.mjs")).default : JSON.parse(process.env.SERVICE_ACCOUNT_CREDENTIALS)
export const gdrive = google.drive({ version: "v3", auth: await google.auth.getClient({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] })})
export { DateTime } from "luxon"