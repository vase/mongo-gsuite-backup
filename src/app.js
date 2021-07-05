import axios from "axios";
import Bree from "bree";
import later from "@breejs/later"
import prettyCron from "prettycron"
import { processEnvs, gdrive, DateTime, mod } from "./util.js";

// Get Shared Drive Id
const driveId = (await gdrive.drives.list()).data.drives.filter(e => e.name === processEnvs.SHARED_DRIVE_NAME).map(e => e.id)[0]

// Get Mongo Backup Folder ID
const folderId = (await gdrive.files.list({
    driveId,
    corpora: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `name = '${processEnvs.TARGET_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder'`
  })).data.files[0].id

// Get hosts to backup (we don't update periodically, we assume if we add a new host, we restart instead)
const hosts = (await axios.get(processEnvs.MONGO_HOST_API)).data

console.log("Jobs scheduled:")

// Get offset between where this script is running and time in sheet defined as KL time
const minuteOffset = DateTime.now().offset - ( 8 * 60 )

const bree = new Bree({
  root: false,
  jobs: Object.keys(hosts).map(key => {
    const { schedule, mongouri } = hosts[key]
    const { schedules } = later.parse.text(schedule)
    let days = new Set()
    for (let time of schedules) {
        if (time.d) {
            for (let t of time.d) {
                days.add(t-1)
            }
        }
    }
    const cronHourPart = schedules.map(e => mod(Math.floor(((e.t/60) + minuteOffset)/60), 24)).join(",")
    const cronMinutePart = mod((schedules[0].t/60) + minuteOffset, 60)
    const cronDayPart = [...days].join(",") || "*"
    const cron = `${cronMinutePart} ${cronHourPart} * * ${cronDayPart}`

    console.log(`${key} dump scheduled for ${prettyCron.toString(cron)}`)

    return {
      name: `Dump ${key} job`,
      cron,
      worker: {
        workerData: {
          key,
          mongouri,
          folderId
        }
      },
      path: async () => {
        const { spawn } = await import("child_process");
        const { parentPort, workerData } = await import("worker_threads");
        const { gdrive, DateTime } = await import("./src/utils.js");
        const { key, mongouri, folderId } = workerData
      
        if (parentPort) parentPort.once('message', message => { if (message === 'cancel') process.exit(0)})
        
        console.time(key)
        console.log(`${key} mongodump started...`)
        const dump = spawn("bin/mongodump", [`--uri="${mongouri}"`, "--archive", "--gzip", "--oplog"])
        dump.stderr.on("data", data => (process.env.NODE_ENV !== "production") ? console.log(`${key} mongodump Output: ${data}`) : null)
        
        const currentDateTimeString = DateTime.now().setZone("Asia/Kuala_Lumpur").toISO()

        // Pipe dump
        const driveResponse = await gdrive.files.create({
          supportsAllDrives: true,
          requestBody: {
            name: `${currentDateTimeString.split(":")[0]}-${mongouri.split("@")[1].split("/?")[0]}.mongoarchive.gz`,
            parents: [folderId],
            properties: {
              "vase.backupTimestamp": currentDateTimeString,
              "vase.hostMongo": mongouri.split("@")[1].split("/?")[0],
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
    }})
})

bree.start()
console.log("====== BOOT COMPLETE ======")