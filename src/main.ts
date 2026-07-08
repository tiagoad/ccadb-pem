import { type CARecord } from "./types.ts";
import { parseZonedDate } from "./parse.ts";
import * as fs from "node:fs";
import path from "node:path";
import { fetchMetadata, fetchPEMs } from "./fetch.ts";

const OUTPUT_DIR = "output";

type Filter = (r: CARecord) => boolean;

const now = Temporal.Now.zonedDateTimeISO("GMT");
const isExpired: Filter = (r) => {
  const date = parseZonedDate(r["Valid To (GMT)"], "GMT");
  return Temporal.ZonedDateTime.compare(date, now) === -1;
};

const isTrusted = (
  s:
    | "Blocked"
    | "Included"
    | "Not Included"
    | "Removed"
    | "Trusted"
    | "Not Trusted",
) => {
  return s === "Trusted" || s === "Included";
};

const TRUST_FILTERS: Array<{
  name: string;
  filter: (r: CARecord) => boolean;
}> = [
  {
    name: "any",
    filter: (r) =>
      isTrusted(r["Apple Status"]) ||
      isTrusted(r["Chrome Status"]) ||
      isTrusted(r["Microsoft Status"]) ||
      isTrusted(r["Mozilla Status"]),
  },
  {
    name: "all",
    filter: (r) =>
      isTrusted(r["Apple Status"]) &&
      isTrusted(r["Chrome Status"]) &&
      isTrusted(r["Microsoft Status"]) &&
      isTrusted(r["Mozilla Status"]),
  },
  {
    name: "apple",
    filter: (r) => isTrusted(r["Apple Status"]),
  },
  {
    name: "chrome",
    filter: (r) => isTrusted(r["Chrome Status"]),
  },
  {
    name: "microsoft",
    filter: (r) => isTrusted(r["Microsoft Status"]),
  },
  {
    name: "mozilla",
    filter: (r) => isTrusted(r["Mozilla Status"]),
  },
];

const OUTPUT_FILTERS: Array<{
  name: string;
  filter: (r: CARecord) => boolean;
}> = TRUST_FILTERS.flatMap((f) => {
  return [
    {
      name: `${f.name}-all`,
      filter: (r) => f.filter(r),
    },
    {
      name: `${f.name}-root`,
      filter: (r) =>
        f.filter(r) && r["Certificate Record Type"] === "Root Certificate",
    },
    {
      name: `${f.name}-intermediate`,
      filter: (r) =>
        f.filter(r) &&
        r["Certificate Record Type"] === "Intermediate Certificate",
    },
  ];
});

async function main() {
  console.log("Fetching certificates");
  const fingerprints = await fetchPEMs();

  console.log("Emptying output directory");
  await fs.promises.rm(OUTPUT_DIR, {
    recursive: true,
    force: true,
  });
  await fs.promises.mkdir(OUTPUT_DIR);

  console.log("Opening output files");
  const files = Object.fromEntries(
    await Promise.all(
      OUTPUT_FILTERS.map(
        async (f) =>
          [
            f.name,
            {
              fh: await fs.promises.open(
                path.join(OUTPUT_DIR, `${f.name}.pem`),
                "ax",
              ),
              count: 0,
            },
          ] as [
            string,
            {
              fh: fs.promises.FileHandle;
              count: number;
            },
          ],
      ),
    ),
  );

  console.log("Starting output");
  for await (const record of fetchMetadata()) {
    if (isExpired(record)) {
      continue;
    }

    for (const filter of OUTPUT_FILTERS) {
      if (filter.filter(record)) {
        const file = files[filter.name]!;
        const fingerprint = record["SHA-256 Fingerprint"];
        const pem = fingerprints[fingerprint];

        if (!pem) {
          throw new Error(`Certificate not found: ${fingerprint}`);
        }

        await file.fh.write(`${record["Certificate Name"]} (${fingerprint})\n`);
        await file.fh.write(`${pem}\n`);
        file.count += 1;
      }
    }
  }

  const nameColumnLength =
    Object.keys(files).reduce((acc, name) => Math.max(acc, name.length), 0) + 1;

  console.log("--- results ---");
  for (const [name, file] of Object.entries(files)) {
    await file.fh.close();
    console.log(`${name.padEnd(nameColumnLength, " ")}${file.count}`);
  }
}

main();
