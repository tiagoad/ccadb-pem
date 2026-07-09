import * as fs from "node:fs";
import path from "node:path";
import { type CARecord } from "./types.ts";
import { parseZonedDate } from "./parse.ts";
import { fetchMetadata, fetchPEMs } from "./fetch.ts";
import { Eta } from "eta";

const OUTPUT_DIR = "output";

type Filter = (r: CARecord) => boolean;

const now = Temporal.Now.zonedDateTimeISO("GMT");
const isExpired: Filter = (r) => {
  const date = parseZonedDate(r["Valid To (GMT)"], "GMT");
  return Temporal.ZonedDateTime.compare(date, now) === -1;
};

const isRevoked: Filter = (r) => {
  return (
    r["Certificate Record Type"] == "Intermediate Certificate" &&
    r["Revocation Status"] !== "Not Revoked"
  );
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
    name: "notrust",
    filter: (r) => true,
  },
];

const OUTPUT_FILTERS: Array<{
  name: string;
  filter: (r: CARecord) => boolean;
}> = TRUST_FILTERS.flatMap((f) => {
  return [
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
    {
      name: `${f.name}-both`,
      filter: (r) => f.filter(r),
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
      OUTPUT_FILTERS.map(async (f) => {
        const filename = `${f.name}.pem`;
        const fullPath = path.join(OUTPUT_DIR, filename);

        return [
          f.name,
          {
            filename,
            counts: {
              root: 0,
              intermediate: 0,
            },
            fh: await fs.promises.open(fullPath, "ax"),
          },
        ] as [
          string,
          {
            filename: string;
            counts: {
              root: number;
              intermediate: number;
            };
            fh: fs.promises.FileHandle;
          },
        ];
      }),
    ),
  );

  console.log("Starting output");
  for await (const record of fetchMetadata()) {
    if (isRevoked(record) || isExpired(record)) {
      continue;
    }

    for (const filter of OUTPUT_FILTERS) {
      if (filter.filter(record)) {
        const file = files[filter.name]!;
        const fingerprint = record["SHA-256 Fingerprint"];
        const pem = fingerprints[fingerprint];

        if (!pem) {
          console.warn(`[WARNING] Certificate not found: ${fingerprint}`);
          console.debug(
            `Certificate not found: ${fingerprint}. ${JSON.stringify(record, null, 2)}`,
          );
          continue;
        }

        await file.fh.write(`${record["Certificate Name"]} (${fingerprint})\n`);
        await file.fh.write(`${pem}\n`);

        if (record["Certificate Record Type"] === "Root Certificate") {
          file.counts.root += 1;
        } else {
          file.counts.intermediate += 1;
        }
      }
    }
  }

  console.log("Generating index.html");
  const now = Temporal.Now.zonedDateTimeISO("UTC");

  const eta = new Eta({
    views: path.join(import.meta.dirname, "..", "templates"),
  });

  const indexHTML = await eta.renderAsync("./index", {
    now: {
      datetime: now.toString({
        timeZoneName: "never",
        fractionalSecondDigits: 3,
      }),
      label: `${now.toPlainDate().toString()} ${now.toPlainTime().toString({
        smallestUnit: "seconds",
      })} ${now.timeZoneId}`,
    },
    files: Object.entries(files).map(([name, { counts, filename }]) => ({
      name,
      filename,
      counts,
    })),
  });

  await fs.promises.writeFile(path.join(OUTPUT_DIR, "index.html"), indexHTML);
}

main();
