import axios from "axios";
import Bree from "bree";
import { gdrive, DateTime } from "./utils.mjs";
if (process.env.NODE_ENV !== "production") (await import("dotenv")).config()

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

// Get hosts to backup (we don't update periodically, we assume if we add a new host, we restart instead)
const hosts = (await axios.get(process.env.MONGO_HOST_API)).data

// Space out dumps to prevent over-hitting API (Hard-coding 10 minute space between)
const minutePoint = {}
let currentMinute = 0

console.log("Jobs scheduled:")
for (let key of Object.keys(hosts)) {
  minutePoint[key] = currentMinute
  console.log(`${key}: at ${currentMinute} past the hour`)
  currentMinute += 10
}

// Get current timezone offset
const hourOffset = DateTime.now().offset / 60

const bree = new Bree({
  root: false,
  jobs: Object.keys(hosts).map(key => ({
    name: `Dump ${key} job`,
    cron: `${minutePoint[key]} ${(10 + hourOffset)%24},${(22 + hourOffset)%24} * * *`,
    worker: {
      workerData: {
        key,
        host: hosts[key],
        folderId
      }
    },
    path: async () => {
      const { spawn } = await import("child_process");
      const { parentPort, workerData } = await import("worker_threads");
      const { gdrive, DateTime } = await import("./src/utils.mjs");
      const { key, host, folderId } = workerData
    
      if (parentPort) parentPort.once('message', message => { if (message === 'cancel') process.exit(0)})
      
      console.time(key)
      console.log(`${key} mongodump started...`)
      const dump = spawn("bin/mongodump", [`--uri="${host}"`, "--archive", "--gzip", "--oplog"])
      dump.stderr.on("data", data => (process.env.NODE_ENV !== "production") ? console.log(`${key} mongodump Output: ${data}`) : null)
      
      const currentDateTimeString = DateTime.now().setZone("Asia/Kuala_Lumpur").toISO()

      // Pipe dump
      const driveResponse = await gdrive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: `${currentDateTimeString.split(":")[0]}-${host.split("@")[1].split("/?")[0]}.mongoarchive.gz`,
          parents: [folderId],
          properties: {
            "vase.backupTimestamp": currentDateTimeString,
            "vase.hostMongo": host.split("@")[1].split("/?")[0],
            "vase.env": process.env.NODE_ENV
          },
        },
        media: {
          mimeType: "application/gzip",
          body: dump.stdout
        }
      }, {
        maxRedirects: 0,
        // onUploadProgress: evt => console.log(`Upload Progress: ${evt.bytesRead / 1048576}MB`)
      })
      console.timeEnd(key)
      process.exit(0)
    }
  }))
})

bree.start()
console.log("====== BOOT COMPLETE ======")