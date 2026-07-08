# ccadb-pem

This repository contains code that fetches certificates from the [CCADB](https://www.ccadb.org/) (Common CA Database)
and outputs them as .pem files into the `output` directory.

The first part of the filename determines who trusts a given certificate:

- `apple`: Trusted by Apple
- `chrome`: Trusted by Google Chrome
- `microsoft`: Trusted by Microsoft
- `mozilla`: Trusted by Mozilla
- `all`: Trusted by all of the above
- `any`: Trusted by at least one of the above

The second part of the filename determines the types of certificates included:

- `root`: Root Certificates only
- `intermediate`: Intermediate Certificates only
- `all`: Both types

## How to use

Node.js version 26 or higher is required.

1. Install dependencies  
   `pnpm install`
2. Generate the pem files  
   `pnpm run generate`

You should end up with a bunch of `.pem` files in the `output` directory.
