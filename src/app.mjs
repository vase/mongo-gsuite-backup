import { google } from "googleapis";
import { spawn } from "child_process";
import axios from "axios";
if (process.env.NODE_ENV !== "production") (await import("dotenv")).config()
const credentials = (process.env.NODE_ENV !== "production") ? (await import("../creds/index.mjs")).default : JSON.parse(process.env.SERVICE_ACCOUNT_CREDENTIALS)
google.options({ http2: true })
const gdrive = google.drive({ version: "v3", auth: await google.auth.getClient({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] })})

// Create local Date function
function toIsoString(date) {
  var tzo = -date.getTimezoneOffset(),
      dif = tzo >= 0 ? '+' : '-',
      pad = function(num) {
          var norm = Math.floor(Math.abs(num));
          return (norm < 10 ? '0' : '') + norm;
      };

  return date.getFullYear() +
      '-' + pad(date.getMonth() + 1) +
      '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) +
      ':' + pad(date.getMinutes()) +
      ':' + pad(date.getSeconds()) +
      dif + pad(tzo / 60) +
      ':' + pad(tzo % 60);
}

// Get Shared Drive Id
const driveId = (await gdrive.drives.list()).data.drives.filter(e => e.name === process.env.SHARED_DRIVE_NAME).map(e => e.id)[0]

// Get Mongo Backup Folder ID
const folderId = (await gdrive.files.list({
  driveId,
  corpora: "drive",
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
  q: `name = '${process.env.TARGET_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder'`
})).data.files[0].id

const hosts = (await axios.get(process.env.MONGO_HOST_API)).data

for (let key of Object.keys(hosts)) {
  console.log(`Dumping ${key}`)
  const dump = spawn("bin/mongodump", [`--uri="${hosts[key]}"`, "--archive", "--gzip", "--oplog"])
  dump.stderr.on("data", data => console.log(`Mongo Output: ${data}`))

  // Pipe dump
  await gdrive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: `${toIsoString(new Date()).split("T")[0]}-${hosts[key].split("@")[1].split("/?")[0]}.mongoarchive.gz`,
      parents: [folderId],
      properties: {
        "vase.backupTime": (new Date()).toISOString(),
        "vase.hostMongo": hosts[key].split("@")[1].split("/?")[0]
      },
    },
    media: {
      mimeType: "application/gzip",
      body: dump.stdout
    }
  }, {
    onUploadProgress: evt => console.log(`Upload Progress: ${evt.bytesRead / 1048576}MB`)
  })
}