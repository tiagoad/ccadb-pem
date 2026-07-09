import { parse } from "csv-parse/stream";
import type { CARecord, PEMRecord } from "./types.ts";

const RECORDS_URL =
  "https://ccadb.my.salesforce-sites.com/ccadb/AllCertificateRecordsCSVFormatV5";
const PEM_URL = (year: number) =>
  `https://ccadb.my.salesforce-sites.com/ccadb/AllCertificatePEMsCSVFormat?NotBeforeDecade=${year}`;

export async function fetchPEMs() {
  let certs: Record<string, string> = {};
  let decades: number[] = [];

  const now = Temporal.Now.zonedDateTimeISO("GMT");
  let decade = 1990;
  while (decade < now.year) {
    decades.push(decade);
    decade += 10;
  }

  await Promise.all(
    decades.map(async (decade) => {
      console.log(`Fetching certificates for decade "${decade}"`);

      const res = await fetch(PEM_URL(decade));
      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status} for PEM URL '${res.url}': ${await res.text()}`,
        );
      }

      const stream = res.body!.pipeThrough<PEMRecord>(
        parse({
          columns: true,
        }),
      );

      for await (const record of stream) {
        const fingerprint = record["SHA-256 Fingerprint"];
        const certificate = record["X.509 Certificate (PEM)"]
          .replaceAll("\n", "")
          .replace(
            "-----BEGIN CERTIFICATE-----",
            "-----BEGIN CERTIFICATE-----\n",
          )
          .replace("-----END CERTIFICATE-----", "\n-----END CERTIFICATE-----");

        certs[fingerprint] = certificate;
      }
    }),
  );

  return certs;
}

export async function* fetchMetadata() {
  console.log("Fetching metadata");
  const res = await fetch(RECORDS_URL);
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} for Metadata URL '${res.url}': ${await res.text()}`,
    );
  }

  console.log(`Received first byte`);
  const stream = res.body!.pipeThrough<CARecord>(
    parse({
      columns: true,
    }),
  );

  for await (const record of stream) {
    yield record;
  }
}
